#include "media-decoder.hpp"

#include <algorithm>
#include <cstring>
#include <fstream>
#include <utility>

#ifdef _WIN32
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <mferror.h>
#include <propvarutil.h>
#include <windows.h>
#endif

namespace notification_hub::audio_engine {
namespace {
MediaDecodeResult fail(std::string code, std::string message) { return {false, std::move(code), std::move(message), 0, 0, {}}; }
#ifdef _WIN32
std::wstring wide_path(const std::filesystem::path& path) {
    const auto value = path.u8string();
    const int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, reinterpret_cast<const char*>(value.data()), static_cast<int>(value.size()), nullptr, 0);
    if (count <= 0) return path.wstring();
    std::wstring result(static_cast<std::size_t>(count), L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, reinterpret_cast<const char*>(value.data()), static_cast<int>(value.size()), result.data(), count);
    return result;
}
#endif
}

MediaDecodeResult decode_media_file(const std::filesystem::path& path) {
#ifndef _WIN32
    return fail("AUDIO_MEDIA_UNSUPPORTED_PLATFORM", "Media Foundation is only available on Windows");
#else
    HRESULT hr = MFStartup(MF_VERSION, MFSTARTUP_LITE);
    if (FAILED(hr)) return fail("AUDIO_MEDIA_FOUNDATION_START_FAILED", "MFStartup failed");
    IMFSourceReader* reader = nullptr;
    IMFAttributes* attributes = nullptr;
    IMFMediaType* current = nullptr;
    MediaDecodeResult result;
    do {
        hr = MFCreateAttributes(&attributes, 4);
        if (FAILED(hr)) { result = fail("AUDIO_MEDIA_READER_FAILED", "MFCreateAttributes failed"); break; }
        hr = MFCreateSourceReaderFromURL(wide_path(path).c_str(), attributes, &reader);
        if (FAILED(hr)) { result = fail("AUDIO_MEDIA_OPEN_FAILED", "Media Foundation could not open the audio file"); break; }
        hr = MFCreateMediaType(&current);
        if (FAILED(hr)) { result = fail("AUDIO_MEDIA_FORMAT_FAILED", "MFCreateMediaType failed"); break; }
        current->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Audio);
        current->SetGUID(MF_MT_SUBTYPE, MFAudioFormat_Float);
        current->SetUINT32(MF_MT_AUDIO_BITS_PER_SAMPLE, 32);
        hr = reader->SetCurrentMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM, nullptr, current);
        if (FAILED(hr)) { result = fail("AUDIO_MEDIA_FORMAT_UNSUPPORTED", "Media Foundation could not convert audio to float PCM"); break; }
        hr = reader->GetCurrentMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM, &current);
        if (FAILED(hr)) { result = fail("AUDIO_MEDIA_FORMAT_FAILED", "Media Foundation did not return an audio format"); break; }
        UINT32 channels = 0, sample_rate = 0;
        current->GetUINT32(MF_MT_AUDIO_NUM_CHANNELS, &channels);
        current->GetUINT32(MF_MT_AUDIO_SAMPLES_PER_SECOND, &sample_rate);
        if (!channels || !sample_rate) { result = fail("AUDIO_MEDIA_FORMAT_INVALID", "Decoded audio format has no channels or sample rate"); break; }
        result.ok = true; result.channels = static_cast<std::uint16_t>(channels); result.sample_rate = sample_rate;
        for (;;) {
            DWORD stream_flags = 0, stream_index = 0;
            LONGLONG timestamp = 0;
            IMFSample* sample = nullptr;
            hr = reader->ReadSample(MF_SOURCE_READER_FIRST_AUDIO_STREAM, 0, &stream_index, &stream_flags, &timestamp, &sample);
            if (FAILED(hr)) { result = fail("AUDIO_MEDIA_DECODE_FAILED", "Media Foundation failed while decoding audio"); break; }
            if (stream_flags & MF_SOURCE_READERF_ENDOFSTREAM) { if (sample) sample->Release(); break; }
            if (!sample) continue;
            IMFMediaBuffer* buffer = nullptr;
            hr = sample->ConvertToContiguousBuffer(&buffer);
            if (SUCCEEDED(hr)) {
                BYTE* bytes = nullptr; DWORD max_len = 0, current_len = 0;
                hr = buffer->Lock(&bytes, &max_len, &current_len);
                if (SUCCEEDED(hr)) {
                    const auto count = current_len / sizeof(float);
                    const auto* values = reinterpret_cast<const float*>(bytes);
                    result.samples.insert(result.samples.end(), values, values + count);
                    buffer->Unlock();
                }
                buffer->Release();
            }
            sample->Release();
            if (FAILED(hr)) { result = fail("AUDIO_MEDIA_DECODE_FAILED", "Media Foundation returned an invalid audio buffer"); break; }
        }
        if (result.ok && result.samples.empty()) result = fail("AUDIO_MEDIA_EMPTY", "Decoded audio contains no samples");
    } while (false);
    if (current) current->Release();
    if (reader) reader->Release();
    if (attributes) attributes->Release();
    MFShutdown();
    return result;
#endif
}

} // namespace notification_hub::audio_engine
