#include "audio_output.hpp"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <wrl/client.h>
#include <windows.h>
#endif

namespace notification_hub::audio {
struct WasapiOutput::Impl {
#ifdef _WIN32
    Microsoft::WRL::ComPtr<IAudioClient> client;
    Microsoft::WRL::ComPtr<IAudioRenderClient> render;
    std::uint32_t buffer_frames{};
    PcmFormat format{};
    WAVEFORMATEX mix_format{};
    bool configured{};
#endif
    bool available{};
};

namespace {
#ifdef _WIN32
std::string hresult_error(const char* operation, HRESULT hr) {
    return std::string(operation) + " failed (HRESULT=" + std::to_string(static_cast<unsigned long>(hr)) + ")";
}

bool same_format(const PcmFormat& left, const PcmFormat& right) {
    return left.channels == right.channels
        && left.sample_rate == right.sample_rate
        && left.bits_per_sample == right.bits_per_sample
        && left.block_align == right.block_align;
}
#endif
}

WasapiOutput::WasapiOutput() = default;
WasapiOutput::~WasapiOutput() { stop(); }

bool WasapiOutput::start(std::string& error) {
    impl_ = std::make_unique<Impl>();
#ifdef _WIN32
    Microsoft::WRL::ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator));
    if (FAILED(hr)) { error = hresult_error("CoCreateInstance(MMDeviceEnumerator)", hr); return false; }
    Microsoft::WRL::ComPtr<IMMDevice> device;
    hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device);
    if (FAILED(hr)) { error = hresult_error("GetDefaultAudioEndpoint", hr); return false; }
    hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, &impl_->client);
    if (FAILED(hr)) { error = hresult_error("IMMDevice::Activate(IAudioClient)", hr); return false; }
    impl_->available = true;
    return true;
#else
    error = "WASAPI is only available on Windows";
    return false;
#endif
}

void WasapiOutput::stop() {
#ifdef _WIN32
    if (impl_ && impl_->client) impl_->client->Stop();
#endif
    impl_.reset();
}

bool WasapiOutput::play(const PcmAsset& asset, float volume, std::string& error) {
    if (!available()) { error = "WASAPI output is not initialized"; return false; }
    if (asset.format.channels == 0 || asset.format.channels > 2
        || asset.format.sample_rate == 0 || asset.format.bits_per_sample != 16
        || asset.format.block_align != asset.format.channels * sizeof(std::int16_t)
        || asset.samples.empty() || asset.samples.size() % asset.format.block_align != 0) {
        error = "unsupported PCM asset format";
        return false;
    }
    const float safe_volume = std::clamp(volume, 0.0f, 1.0f);
#ifdef _WIN32
    if (!impl_->configured) {
        WAVEFORMATEX requested{};
        requested.wFormatTag = WAVE_FORMAT_PCM;
        requested.nChannels = asset.format.channels;
        requested.nSamplesPerSec = asset.format.sample_rate;
        requested.wBitsPerSample = asset.format.bits_per_sample;
        requested.nBlockAlign = asset.format.block_align;
        requested.nAvgBytesPerSec = requested.nSamplesPerSec * requested.nBlockAlign;
        WAVEFORMATEX* device_format = nullptr;
        HRESULT hr = impl_->client->GetMixFormat(&device_format);
        if (FAILED(hr) || device_format == nullptr) { error = hresult_error("IAudioClient::GetMixFormat", hr); return false; }
        impl_->mix_format = *device_format;
        CoTaskMemFree(device_format);
        // AUTOCONVERTPCM lets the shared-mode engine resample/reformat this
        // decoded PCM to the device mix format without changing the source asset.
        constexpr DWORD shared_flags = AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
        hr = impl_->client->Initialize(AUDCLNT_SHAREMODE_SHARED, shared_flags, 0, 0, &requested, nullptr);
        if (FAILED(hr)) { error = hresult_error("IAudioClient::Initialize", hr); return false; }
        hr = impl_->client->GetBufferSize(&impl_->buffer_frames);
        if (FAILED(hr)) { error = hresult_error("IAudioClient::GetBufferSize", hr); return false; }
        hr = impl_->client->GetService(IID_PPV_ARGS(&impl_->render));
        if (FAILED(hr)) { error = hresult_error("IAudioClient::GetService(IAudioRenderClient)", hr); return false; }
        impl_->format = asset.format;
        impl_->configured = true;
    } else if (!same_format(impl_->format, asset.format)) {
        error = "audio assets must use one PCM format per audio service instance";
        return false;
    }

    HRESULT hr = impl_->client->Start();
    if (FAILED(hr)) { error = hresult_error("IAudioClient::Start", hr); return false; }

    const std::size_t total_frames = asset.samples.size() / asset.format.block_align;
    const auto* source = reinterpret_cast<const std::int16_t*>(asset.samples.data());
    std::size_t frame_offset = 0;
    while (frame_offset < total_frames) {
        UINT32 padding = 0;
        hr = impl_->client->GetCurrentPadding(&padding);
        if (FAILED(hr)) { error = hresult_error("IAudioClient::GetCurrentPadding", hr); impl_->client->Stop(); return false; }
        const UINT32 available = impl_->buffer_frames > padding ? impl_->buffer_frames - padding : 0;
        if (available == 0) { Sleep(1); continue; }
        const UINT32 frames = static_cast<UINT32>(std::min<std::size_t>(available, total_frames - frame_offset));
        BYTE* destination = nullptr;
        hr = impl_->render->GetBuffer(frames, &destination);
        if (FAILED(hr)) { error = hresult_error("IAudioRenderClient::GetBuffer", hr); impl_->client->Stop(); return false; }
        auto* output = reinterpret_cast<std::int16_t*>(destination);
        const std::size_t samples = static_cast<std::size_t>(frames) * asset.format.channels;
        for (std::size_t i = 0; i < samples; ++i) {
            const float scaled = static_cast<float>(source[frame_offset * asset.format.channels + i]) * safe_volume;
            output[i] = static_cast<std::int16_t>(std::clamp(
                scaled,
                static_cast<float>(std::numeric_limits<std::int16_t>::min()),
                static_cast<float>(std::numeric_limits<std::int16_t>::max())));
        }
        hr = impl_->render->ReleaseBuffer(frames, 0);
        if (FAILED(hr)) { error = hresult_error("IAudioRenderClient::ReleaseBuffer", hr); impl_->client->Stop(); return false; }
        frame_offset += frames;
    }
    while (true) {
        UINT32 padding = 0;
        hr = impl_->client->GetCurrentPadding(&padding);
        if (FAILED(hr)) { error = hresult_error("IAudioClient::GetCurrentPadding", hr); impl_->client->Stop(); return false; }
        if (padding == 0) break;
        Sleep(1);
    }
    impl_->client->Stop();
    return true;
#else
    static_cast<void>(safe_volume);
    error = "WASAPI is only available on Windows";
    return false;
#endif
}

bool WasapiOutput::available() const noexcept { return impl_ && impl_->available; }
}  // namespace notification_hub::audio
