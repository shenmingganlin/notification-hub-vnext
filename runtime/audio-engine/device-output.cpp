#include "device-output.hpp"

#include <algorithm>
#include <cstdint>
#include <chrono>
#include <string_view>
#include <condition_variable>
#include <mutex>
#include <utility>
#include <vector>
#include <cstring>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <wrl/client.h>
#include <avrt.h>
#include <windows.h>
#endif

namespace notification_hub::audio_engine {
namespace {
#ifdef _WIN32
bool is_extensible_float(const WAVEFORMATEX* format) {
    if (!format || format->wFormatTag != WAVE_FORMAT_EXTENSIBLE || format->cbSize < 22) return false;
    const auto* extensible = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(format);
    return std::memcmp(&extensible->SubFormat, &KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, sizeof(GUID)) == 0;
}

std::string hresult_error(const char* operation, HRESULT hr) {
    return std::string(operation) + " failed (HRESULT=" + std::to_string(static_cast<unsigned long>(hr)) + ")";
}

std::string utf8_from_wide(std::wstring_view wide) {
    if (wide.empty()) return {};
    const auto chars = WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), nullptr, 0, nullptr, nullptr);
    if (chars <= 0) return {};
    std::string out(static_cast<std::size_t>(chars), '\0');
    WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), out.data(), chars, nullptr, nullptr);
    return out;
}

class DefaultDeviceWatcher final : public IMMNotificationClient {
public:
    explicit DefaultDeviceWatcher(std::atomic<bool>* reopen) : reopen_(reopen) {}

    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == __uuidof(IMMNotificationClient)) {
            *ppv = static_cast<IMMNotificationClient*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&refs_); }
    ULONG STDMETHODCALLTYPE Release() override {
        const auto refs = InterlockedDecrement(&refs_);
        if (refs == 0) delete this;
        return refs;
    }
    HRESULT STDMETHODCALLTYPE OnDeviceStateChanged(LPCWSTR, DWORD) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE OnDeviceAdded(LPCWSTR) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE OnDeviceRemoved(LPCWSTR) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE OnPropertyValueChanged(LPCWSTR, const PROPERTYKEY) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE OnDefaultDeviceChanged(EDataFlow flow, ERole role, LPCWSTR) override {
        if (flow != eRender) return S_OK;
        if (role != eConsole && role != eMultimedia) return S_OK;
        if (reopen_) reopen_->store(true);
        return S_OK;
    }

private:
    LONG refs_{1};
    std::atomic<bool>* reopen_{};
};
#endif
}

struct DeviceOutput::Impl {
    Mixer* mixer{};
    std::atomic<bool> stop_requested{false};
    std::atomic<bool> reopen_requested{false};
    std::atomic<bool> running{false};
    std::atomic<bool> available{false};
    std::size_t buffer_frames{};
    mutable std::mutex error_mutex;
    std::string error;
    mutable std::mutex device_id_mutex;
    std::string device_id;
    std::mutex startup_mutex;
    std::condition_variable startup_condition;
    bool startup_complete{false};
    bool startup_succeeded{false};
    std::thread render_thread;
#ifdef _WIN32
    Microsoft::WRL::ComPtr<IAudioClient> client;
    Microsoft::WRL::ComPtr<IAudioRenderClient> render;
    WAVEFORMATEX* mix_format{};

    void close_session();
    bool open_default(IMMDeviceEnumerator* enumerator, std::string& open_error);
    bool pump();
#endif
};

#ifdef _WIN32
void DeviceOutput::Impl::close_session() {
    if (client) client->Stop();
    if (mix_format) {
        CoTaskMemFree(mix_format);
        mix_format = nullptr;
    }
    render.Reset();
    client.Reset();
    buffer_frames = 0;
    std::lock_guard lock(device_id_mutex);
    device_id.clear();
}

bool DeviceOutput::Impl::open_default(IMMDeviceEnumerator* enumerator, std::string& open_error) {
    close_session();
    Microsoft::WRL::ComPtr<IMMDevice> device;
    HRESULT hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device);
    if (FAILED(hr)) { open_error = hresult_error("GetDefaultAudioEndpoint", hr); return false; }
    LPWSTR native_id = nullptr;
    hr = device->GetId(&native_id);
    if (SUCCEEDED(hr) && native_id) {
        std::lock_guard lock(device_id_mutex);
        device_id = utf8_from_wide(native_id);
        CoTaskMemFree(native_id);
    }
    hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, &client);
    if (FAILED(hr)) { open_error = hresult_error("IMMDevice::Activate", hr); return false; }
    hr = client->GetMixFormat(&mix_format);
    if (FAILED(hr) || !mix_format) { open_error = hresult_error("IAudioClient::GetMixFormat", hr); return false; }
    constexpr DWORD flags = AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
    hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 0, 0, mix_format, nullptr);
    if (FAILED(hr)) { open_error = hresult_error("IAudioClient::Initialize", hr); return false; }
    UINT32 frames = 0;
    hr = client->GetBufferSize(&frames);
    if (FAILED(hr)) { open_error = hresult_error("IAudioClient::GetBufferSize", hr); return false; }
    hr = client->GetService(IID_PPV_ARGS(&render));
    if (FAILED(hr)) { open_error = hresult_error("IAudioClient::GetService", hr); return false; }
    hr = client->Start();
    if (FAILED(hr)) { open_error = hresult_error("IAudioClient::Start", hr); return false; }
    buffer_frames = frames;
    return true;
}

bool DeviceOutput::Impl::pump() {
    const auto channels = mix_format->nChannels;
    std::vector<float> mix_buffer(buffer_frames * channels);
    while (!stop_requested && !reopen_requested && available) {
        UINT32 padding = 0;
        HRESULT local_hr = client->GetCurrentPadding(&padding);
        if (FAILED(local_hr)) {
            std::lock_guard lock(error_mutex);
            error = hresult_error("IAudioClient::GetCurrentPadding", local_hr);
            reopen_requested = true;
            break;
        }
        const auto available_frames = buffer_frames > padding ? buffer_frames - padding : 0;
        if (available_frames == 0) { std::this_thread::sleep_for(std::chrono::milliseconds(1)); continue; }
        const auto frames_to_mix = std::min<std::size_t>(available_frames, buffer_frames);
        const auto mixed = mixer->mix(mix_buffer.data(), frames_to_mix, channels);
        BYTE* destination = nullptr;
        local_hr = render->GetBuffer(static_cast<UINT32>(frames_to_mix), &destination);
        if (FAILED(local_hr)) {
            std::lock_guard lock(error_mutex);
            error = hresult_error("IAudioRenderClient::GetBuffer", local_hr);
            reopen_requested = true;
            break;
        }
        const auto total_samples = frames_to_mix * channels;
        const auto bits = mix_format->wBitsPerSample;
        const auto bytes_per_sample = static_cast<std::size_t>((bits + 7u) / 8u);
        const auto expected_bytes = frames_to_mix * mix_format->nBlockAlign;
        const auto expected_sample_bytes = total_samples * bytes_per_sample;
        if (bytes_per_sample == 0 || mix_format->nBlockAlign < channels * bytes_per_sample || expected_sample_bytes > expected_bytes) {
            render->ReleaseBuffer(static_cast<UINT32>(frames_to_mix), AUDCLNT_BUFFERFLAGS_SILENT);
            std::lock_guard lock(error_mutex);
            error = "Unsupported WASAPI mix format (bits=" + std::to_string(bits) + ", channels=" + std::to_string(channels) + ", blockAlign=" + std::to_string(mix_format->nBlockAlign) + ")";
            available = false;
            break;
        }
        const bool is_float = bits == 32 && (mix_format->wFormatTag == WAVE_FORMAT_IEEE_FLOAT || is_extensible_float(mix_format));
        const auto frame_stride = static_cast<std::size_t>(mix_format->nBlockAlign);
        if (frame_stride * frames_to_mix > expected_bytes) {
            render->ReleaseBuffer(static_cast<UINT32>(frames_to_mix), AUDCLNT_BUFFERFLAGS_SILENT);
            std::lock_guard lock(error_mutex);
            error = "WASAPI frame stride exceeds buffer (frames=" + std::to_string(frames_to_mix) + ", stride=" + std::to_string(frame_stride) + ", bytes=" + std::to_string(expected_bytes) + ")";
            available = false;
            break;
        }
        const auto sample_stride = bytes_per_sample;
        for (std::size_t frame = 0; frame < frames_to_mix; ++frame) {
            for (std::uint32_t channel = 0; channel < channels; ++channel) {
                const auto index = frame * channels + channel;
                const auto offset = frame * frame_stride + channel * sample_stride;
                if (is_float) {
                    reinterpret_cast<float*>(destination + offset)[0] = mix_buffer[index];
                } else if (bits == 16) {
                    reinterpret_cast<std::int16_t*>(destination + offset)[0] = static_cast<std::int16_t>(std::clamp(mix_buffer[index] * 32767.0f, -32768.0f, 32767.0f));
                } else if (bits == 24) {
                    const auto value = static_cast<std::int32_t>(std::clamp(mix_buffer[index] * 8388607.0f, -8388608.0f, 8388607.0f));
                    destination[offset] = static_cast<BYTE>(value & 0xff);
                    destination[offset + 1] = static_cast<BYTE>((value >> 8) & 0xff);
                    destination[offset + 2] = static_cast<BYTE>((value >> 16) & 0xff);
                } else if (bits == 32) {
                    const auto scaled = static_cast<double>(mix_buffer[index]) * 2147483647.0;
                    const auto bounded = std::clamp(scaled, -2147483648.0, 2147483647.0);
                    const auto value = static_cast<std::int64_t>(bounded);
                    reinterpret_cast<std::int32_t*>(destination + offset)[0] = static_cast<std::int32_t>(value);
                }
            }
        }
        if (!(is_float || bits == 16 || bits == 24 || bits == 32)) {
            render->ReleaseBuffer(static_cast<UINT32>(frames_to_mix), AUDCLNT_BUFFERFLAGS_SILENT);
            std::lock_guard lock(error_mutex);
            error = "Unsupported WASAPI sample width (bits=" + std::to_string(bits) + ")";
            available = false;
            break;
        }
        local_hr = render->ReleaseBuffer(static_cast<UINT32>(frames_to_mix), mixed == 0 ? AUDCLNT_BUFFERFLAGS_SILENT : 0);
        if (FAILED(local_hr)) {
            std::lock_guard lock(error_mutex);
            error = hresult_error("IAudioRenderClient::ReleaseBuffer", local_hr);
            reopen_requested = true;
            break;
        }
    }
    return !stop_requested && available;
}
#endif

DeviceOutput::DeviceOutput() : impl_(std::make_unique<Impl>()) {}
DeviceOutput::~DeviceOutput() { stop(); }

bool DeviceOutput::start(Mixer& mixer, std::string& error) {
    stop();
    impl_ = std::make_unique<Impl>();
    impl_->mixer = &mixer;
#ifdef _WIN32
    impl_->stop_requested = false;
    impl_->reopen_requested = false;
    impl_->render_thread = std::thread([state = impl_.get()] {
        state->running = true;
        const HRESULT com_hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        const bool com_initialized = SUCCEEDED(com_hr) || com_hr == RPC_E_CHANGED_MODE;
        if (!com_initialized) {
            {
                std::lock_guard lock(state->error_mutex);
                state->error = hresult_error("CoInitializeEx", com_hr);
            }
            {
                std::lock_guard lock(state->startup_mutex);
                state->startup_complete = true;
            }
            state->startup_condition.notify_one();
            state->running = false;
            return;
        }
        Microsoft::WRL::ComPtr<IMMDeviceEnumerator> enumerator;
        HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator));
        if (FAILED(hr)) {
            {
                std::lock_guard lock(state->error_mutex);
                state->error = hresult_error("CoCreateInstance(MMDeviceEnumerator)", hr);
            }
            {
                std::lock_guard lock(state->startup_mutex);
                state->startup_complete = true;
            }
            state->startup_condition.notify_one();
            if (com_hr != RPC_E_CHANGED_MODE) CoUninitialize();
            state->running = false;
            return;
        }
        Microsoft::WRL::ComPtr<IMMNotificationClient> watcher;
        watcher.Attach(new DefaultDeviceWatcher(&state->reopen_requested));
        const bool watching = SUCCEEDED(enumerator->RegisterEndpointNotificationCallback(watcher.Get()));
        DWORD task_index = 0;
        auto avrt_handle = AvSetMmThreadCharacteristicsW(L"Pro Audio", &task_index);
        bool announced = false;
        while (!state->stop_requested) {
            std::string open_error;
            const bool opened = state->open_default(enumerator.Get(), open_error);
            if (!opened) {
                {
                    std::lock_guard lock(state->error_mutex);
                    state->error = open_error;
                }
                state->available = false;
                if (!announced) {
                    std::lock_guard lock(state->startup_mutex);
                    state->startup_complete = true;
                    state->startup_succeeded = false;
                    state->startup_condition.notify_one();
                    announced = true;
                    break;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(250));
                state->reopen_requested = false;
                continue;
            }
            state->available = true;
            if (!announced) {
                std::lock_guard lock(state->startup_mutex);
                state->startup_succeeded = true;
                state->startup_complete = true;
                state->startup_condition.notify_one();
                announced = true;
            }
            state->reopen_requested = false;
            state->pump();
            state->close_session();
            if (state->stop_requested) break;
            state->available = false;
            state->reopen_requested = false;
        }
        if (watching) enumerator->UnregisterEndpointNotificationCallback(watcher.Get());
        if (avrt_handle) AvRevertMmThreadCharacteristics(avrt_handle);
        if (com_hr != RPC_E_CHANGED_MODE) CoUninitialize();
        state->available = false;
        state->running = false;
    });
    {
        std::unique_lock lock(impl_->startup_mutex);
        const auto started = impl_->startup_condition.wait_for(lock, std::chrono::milliseconds(1000), [this] {
            return impl_->startup_complete;
        });
        if (!started || !impl_->startup_succeeded) {
            if (error.empty()) error = last_error();
            if (error.empty()) error = "WASAPI render thread did not become ready";
            lock.unlock();
            stop();
            return false;
        }
    }
    return true;
#else
    error = "WASAPI is only available on Windows";
    return false;
#endif
}

void DeviceOutput::stop() {
    if (!impl_) return;
    impl_->stop_requested = true;
    impl_->reopen_requested = true;
    if (impl_->render_thread.joinable()) impl_->render_thread.join();
#ifdef _WIN32
    impl_->close_session();
#endif
    impl_->available = false;
    impl_->running = false;
}

bool DeviceOutput::available() const noexcept { return impl_ && impl_->available; }
bool DeviceOutput::running() const noexcept { return impl_ && impl_->running; }
std::size_t DeviceOutput::buffer_frames() const noexcept { return impl_ ? impl_->buffer_frames : 0; }
std::string DeviceOutput::last_error() const { if (!impl_) return {}; std::lock_guard lock(impl_->error_mutex); return impl_->error; }
std::string DeviceOutput::current_device_id() const {
    if (!impl_) return {};
    std::lock_guard lock(impl_->device_id_mutex);
    return impl_->device_id;
}
void DeviceOutput::request_reopen() {
    if (impl_) impl_->reopen_requested = true;
}

}  // namespace notification_hub::audio_engine
