#include "device-output.hpp"

#include <algorithm>
#include <cstdint>
#include <chrono>
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
#endif
}

struct DeviceOutput::Impl {
    Mixer* mixer{};
    std::atomic<bool> stop_requested{false};
    std::atomic<bool> running{false};
    std::atomic<bool> available{false};
    std::size_t buffer_frames{};
    mutable std::mutex error_mutex;
    std::string error;
    std::thread render_thread;
#ifdef _WIN32
    Microsoft::WRL::ComPtr<IAudioClient> client;
    Microsoft::WRL::ComPtr<IAudioRenderClient> render;
    WAVEFORMATEX* mix_format{};
#endif
};

DeviceOutput::DeviceOutput() : impl_(std::make_unique<Impl>()) {}
DeviceOutput::~DeviceOutput() { stop(); }

bool DeviceOutput::start(Mixer& mixer, std::string& error) {
    stop();
    impl_ = std::make_unique<Impl>();
    impl_->mixer = &mixer;
#ifdef _WIN32
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    const bool com_initialized = SUCCEEDED(hr) || hr == RPC_E_CHANGED_MODE;
    if (!com_initialized) { error = hresult_error("CoInitializeEx", hr); return false; }
    Microsoft::WRL::ComPtr<IMMDeviceEnumerator> enumerator;
    hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator));
    if (FAILED(hr)) { error = hresult_error("CoCreateInstance(MMDeviceEnumerator)", hr); if (hr != RPC_E_CHANGED_MODE) CoUninitialize(); return false; }
    Microsoft::WRL::ComPtr<IMMDevice> device;
    hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device);
    if (FAILED(hr)) { error = hresult_error("GetDefaultAudioEndpoint", hr); if (hr != RPC_E_CHANGED_MODE) CoUninitialize(); return false; }
    hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, &impl_->client);
    if (FAILED(hr)) { error = hresult_error("IMMDevice::Activate", hr); if (hr != RPC_E_CHANGED_MODE) CoUninitialize(); return false; }
    hr = impl_->client->GetMixFormat(&impl_->mix_format);
    if (FAILED(hr) || !impl_->mix_format) { error = hresult_error("IAudioClient::GetMixFormat", hr); if (hr != RPC_E_CHANGED_MODE) CoUninitialize(); return false; }
    constexpr DWORD flags = AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
    hr = impl_->client->Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 0, 0, impl_->mix_format, nullptr);
    if (FAILED(hr)) { error = hresult_error("IAudioClient::Initialize", hr); CoTaskMemFree(impl_->mix_format); impl_->mix_format = nullptr; if (hr != RPC_E_CHANGED_MODE) CoUninitialize(); return false; }
    UINT32 frames = 0;
    hr = impl_->client->GetBufferSize(&frames);
    if (FAILED(hr)) { error = hresult_error("IAudioClient::GetBufferSize", hr); return false; }
    hr = impl_->client->GetService(IID_PPV_ARGS(&impl_->render));
    if (FAILED(hr)) { error = hresult_error("IAudioClient::GetService", hr); return false; }
    impl_->buffer_frames = frames;
    impl_->available = true;
    impl_->stop_requested = false;
    impl_->render_thread = std::thread([state = impl_.get()] {
        state->running = true;
        DWORD task_index = 0;
        auto avrt_handle = AvSetMmThreadCharacteristicsW(L"Pro Audio", &task_index);
        const auto channels = state->mix_format->nChannels;
        std::vector<float> mix_buffer(state->buffer_frames * channels);
        HRESULT local_hr = state->client->Start();
        if (FAILED(local_hr)) {
            std::lock_guard lock(state->error_mutex);
            state->error = hresult_error("IAudioClient::Start", local_hr);
            state->available = false;
        }
        while (!state->stop_requested && state->available) {
            UINT32 padding = 0;
            local_hr = state->client->GetCurrentPadding(&padding);
            if (FAILED(local_hr)) {
                std::lock_guard lock(state->error_mutex);
                state->error = hresult_error("IAudioClient::GetCurrentPadding", local_hr);
                state->available = false;
                break;
            }
            const auto available_frames = state->buffer_frames > padding ? state->buffer_frames - padding : 0;
            if (available_frames == 0) { std::this_thread::sleep_for(std::chrono::milliseconds(1)); continue; }
            const auto frames_to_mix = std::min<std::size_t>(available_frames, state->buffer_frames);
            const auto mixed = state->mixer->mix(mix_buffer.data(), frames_to_mix, channels);
            BYTE* destination = nullptr;
            local_hr = state->render->GetBuffer(static_cast<UINT32>(frames_to_mix), &destination);
            if (FAILED(local_hr)) { std::lock_guard lock(state->error_mutex); state->error = hresult_error("IAudioRenderClient::GetBuffer", local_hr); state->available = false; break; }
            const auto total_samples = frames_to_mix * channels;
            const auto bits = state->mix_format->wBitsPerSample;
            const auto bytes_per_sample = static_cast<std::size_t>((bits + 7u) / 8u);
            const auto expected_bytes = frames_to_mix * state->mix_format->nBlockAlign;
            const auto expected_sample_bytes = total_samples * bytes_per_sample;
            if (bytes_per_sample == 0 || state->mix_format->nBlockAlign < channels * bytes_per_sample || expected_sample_bytes > expected_bytes) {
                state->render->ReleaseBuffer(static_cast<UINT32>(frames_to_mix), AUDCLNT_BUFFERFLAGS_SILENT);
                std::lock_guard lock(state->error_mutex);
                state->error = "Unsupported WASAPI mix format (bits=" + std::to_string(bits) + ", channels=" + std::to_string(channels) + ", blockAlign=" + std::to_string(state->mix_format->nBlockAlign) + ")";
                state->available = false;
                break;
            }
            const bool is_float = bits == 32 && (state->mix_format->wFormatTag == WAVE_FORMAT_IEEE_FLOAT || is_extensible_float(state->mix_format));
            const auto frame_stride = static_cast<std::size_t>(state->mix_format->nBlockAlign);
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
                        reinterpret_cast<std::int32_t*>(destination + offset)[0] = static_cast<std::int32_t>(std::clamp(mix_buffer[index] * 2147483647.0f, -2147483648.0f, 2147483647.0f));
                    }
                }
            }
            if (!(is_float || bits == 16 || bits == 24 || bits == 32)) {
                state->render->ReleaseBuffer(static_cast<UINT32>(frames_to_mix), AUDCLNT_BUFFERFLAGS_SILENT);
                std::lock_guard lock(state->error_mutex);
                state->error = "Unsupported WASAPI sample width (bits=" + std::to_string(bits) + ")";
                state->available = false;
                break;
            }
            local_hr = state->render->ReleaseBuffer(static_cast<UINT32>(frames_to_mix), mixed == 0 ? AUDCLNT_BUFFERFLAGS_SILENT : 0);
            if (FAILED(local_hr)) { std::lock_guard lock(state->error_mutex); state->error = hresult_error("IAudioRenderClient::ReleaseBuffer", local_hr); state->available = false; break; }
        }
        state->client->Stop();
        if (avrt_handle) AvRevertMmThreadCharacteristics(avrt_handle);
        state->running = false;
    });
    return true;
#else
    error = "WASAPI is only available on Windows";
    return false;
#endif
}

void DeviceOutput::stop() {
    if (!impl_) return;
    impl_->stop_requested = true;
    if (impl_->render_thread.joinable()) impl_->render_thread.join();
#ifdef _WIN32
    if (impl_->mix_format) CoTaskMemFree(impl_->mix_format);
    impl_->mix_format = nullptr;
    impl_->render.Reset();
    impl_->client.Reset();
#endif
    impl_->available = false;
    impl_->running = false;
}

bool DeviceOutput::available() const noexcept { return impl_ && impl_->available; }
bool DeviceOutput::running() const noexcept { return impl_ && impl_->running; }
std::size_t DeviceOutput::buffer_frames() const noexcept { return impl_ ? impl_->buffer_frames : 0; }
std::string DeviceOutput::last_error() const { if (!impl_) return {}; std::lock_guard lock(impl_->error_mutex); return impl_->error; }

}  // namespace notification_hub::audio_engine
