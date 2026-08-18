#include "service.hpp"
#include "audio_output.hpp"
#include "wav_pcm.hpp"
#include "../protocol/message.hpp"
#include "../transport/frame.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iostream>
#include <iterator>
#include <mutex>
#include <optional>
#include <unordered_map>
#ifdef _WIN32
#include <objbase.h>
#include <windows.h>
#endif

namespace notification_hub::audio {
namespace {
std::string response(const protocol::Message& request, std::string_view result) { return protocol::serialize_ack(request, result); }
std::string error_response(const protocol::Message& request, std::string_view code, std::string_view message) { return protocol::serialize_error({std::string(code), std::string(message), request.request_id, request.trace_id}); }
std::string field(std::string_view json, std::string_view name) {
    const auto needle = std::string("\"") + std::string(name) + "\":\""; const auto start = json.find(needle); if (start == std::string_view::npos) return {};
    const auto begin = start + needle.size(); const auto end = json.find('"', begin); return end == std::string_view::npos ? std::string{} : std::string(json.substr(begin, end - begin));
}
PcmAsset make_cue(std::string_view cue, float volume) {
    const std::uint32_t sample_rate = 48000;
    const std::size_t frames = static_cast<std::size_t>(sample_rate * 0.12);
    float frequency = 660.0f;
    if (cue == "success" || cue == "tool-complete") frequency = 880.0f;
    else if (cue == "error" || cue == "tool-failed" || cue == "warning") frequency = 220.0f;
    else if (cue == "critical" || cue == "critical-error") frequency = 180.0f;
    PcmAsset asset{{1, sample_rate, 16, 2}, std::vector<std::uint8_t>(frames * 2)};
    const float gain = std::clamp(volume, 0.0f, 1.0f);
    for (std::size_t i = 0; i < frames; ++i) {
        const float envelope = i < sample_rate * 0.01f ? static_cast<float>(i) / (sample_rate * 0.01f) : 1.0f;
        const auto sample = static_cast<std::int16_t>(std::sin(2.0 * 3.141592653589793 * frequency * i / sample_rate) * 28000.0f * gain * envelope);
        std::memcpy(asset.samples.data() + i * 2, &sample, 2);
    }
    return asset;
}
std::optional<float> number_field(std::string_view json, std::string_view name) {
    const auto needle = std::string("\"") + std::string(name) + "\":";
    const auto start = json.find(needle);
    if (start == std::string_view::npos) return std::nullopt;
    const auto begin = start + needle.size();
    const auto end = json.find_first_of(",}", begin);
    if (end == std::string_view::npos) return std::nullopt;
    try {
        const auto value = std::stof(std::string(json.substr(begin, end - begin)));
        return value >= 0.0f && value <= 1.0f ? std::optional<float>(value) : std::nullopt;
    } catch (...) { return std::nullopt; }
}
}

bool audio_self_test() {
    const std::uint8_t wav[] = {'R','I','F','F',36,0,0,0,'W','A','V','E','f','m','t',' ',16,0,0,0,1,0,1,0,0x44,0xac,0,0,0x88,0x58,1,0,2,0,16,0,'d','a','t','a',2,0,0,0,0,0};
    const auto parsed = parse_wav_pcm(wav); if (!parsed.ok || parsed.asset.format.sample_rate != 44100 || parsed.asset.samples.size() != 2) return false;
    const auto bad = parse_wav_pcm(std::span<const std::uint8_t>(wav, 10)); if (bad.ok) return false;
    const auto message = protocol::parse_message(R"({"protocolVersion":1,"requestId":"r","traceId":"t","type":"audio.health","timestamp":"x","payload":{}})");
    return message.ok && message.message.type == "audio.health";
}

#ifdef _WIN32
int run_audio_service(std::string_view pipe_name) {
    const HRESULT com_result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(com_result) && com_result != RPC_E_CHANGED_MODE) return 4;
    const auto name = std::wstring(pipe_name.begin(), pipe_name.end());
    HANDLE pipe = CreateNamedPipeW(name.c_str(), PIPE_ACCESS_DUPLEX, PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT, 1, 1 << 20, 1 << 20, 0, nullptr);
    if (pipe == INVALID_HANDLE_VALUE) { if (SUCCEEDED(com_result)) CoUninitialize(); return 2; }
    if (!ConnectNamedPipe(pipe, nullptr) && GetLastError() != ERROR_PIPE_CONNECTED) { CloseHandle(pipe); if (SUCCEEDED(com_result)) CoUninitialize(); return 3; }
    transport::FrameDecoder decoder; std::unordered_map<std::string, PcmAsset> cache; WasapiOutput output; std::string output_error;
    const bool output_ready = output.start(output_error);
    std::uint8_t buffer[4096]; DWORD read = 0;
    while (ReadFile(pipe, buffer, sizeof(buffer), &read, nullptr) && read) {
        decoder.append(std::string_view(reinterpret_cast<char*>(buffer), read));
        for (;;) { const auto frame = decoder.next(); if (frame.status == transport::FrameStatus::NeedMoreData) break; if (frame.status == transport::FrameStatus::Rejected) break;
            const auto parsed = protocol::parse_message(frame.payload); std::string reply;
            if (!parsed.ok) reply = protocol::serialize_error(parsed.error); else if (parsed.message.type == "audio.cue") {
                std::string play_error;
                const auto cue = field(parsed.message.payload_json, "cue");
                const float volume = number_field(parsed.message.payload_json, "volume").value_or(1.0f);
                const bool played = !cue.empty() && output.play(make_cue(cue, volume), 1.0f, play_error);
                reply = played
                    ? response(parsed.message, "{\"accepted\":true,\"rendered\":true}")
                    : error_response(parsed.message, "AUDIO_PLAYBACK_FAILED", play_error.empty() ? "cue is invalid" : play_error);
            } else if (parsed.message.type == "audio.load") {
                const auto id = field(parsed.message.payload_json, "soundId"); const auto path = field(parsed.message.payload_json, "path"); std::ifstream input(path, std::ios::binary); std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(input)), {}); const auto wav = parse_wav_pcm(bytes);
                if (id.empty() || !wav.ok) reply = error_response(parsed.message, wav.code.empty() ? "AUDIO_INVALID_REQUEST" : wav.code, wav.message.empty() ? "soundId/path required" : wav.message); else { cache[id] = wav.asset; reply = response(parsed.message, "{\"loaded\":true}"); }
            } else if (parsed.message.type == "audio.unload") { cache.erase(field(parsed.message.payload_json, "soundId")); reply = response(parsed.message, "{\"unloaded\":true}");
            } else if (parsed.message.type == "audio.play") {
                const auto it = cache.find(field(parsed.message.payload_json, "soundId"));
                if (it == cache.end()) {
                    reply = error_response(parsed.message, "AUDIO_NOT_LOADED", "soundId is not cached");
                } else {
                    std::string play_error;
                    const float volume = number_field(parsed.message.payload_json, "volume").value_or(1.0f);
                    const bool played = output.play(it->second, volume, play_error);
                    reply = played
                        ? response(parsed.message, "{\"accepted\":true,\"rendered\":true}")
                        : error_response(parsed.message, "AUDIO_PLAYBACK_FAILED", play_error);
                }
            } else if (parsed.message.type == "audio.health") {
                reply = output_ready
                    ? response(parsed.message, "{\"audio\":true,\"wavPcm\":true,\"wasapi\":true,\"renderLoop\":true}")
                    : error_response(parsed.message, "AUDIO_DEVICE_UNAVAILABLE", output_error.empty() ? "WASAPI audio device is unavailable" : output_error);
            } else if (parsed.message.type == "health" || parsed.message.type == "capabilities" || parsed.message.type == "audio.stop") reply = response(parsed.message, "{\"audio\":true,\"wavPcm\":true,\"wasapi\":true,\"renderLoop\":true}");
            else reply = error_response(parsed.message, "AUDIO_UNKNOWN_COMMAND", "unsupported audio command");
            const auto encoded = transport::encode_frame(reply); DWORD written = 0; WriteFile(pipe, encoded.bytes.data(), static_cast<DWORD>(encoded.bytes.size()), &written, nullptr);
        }
    }
    FlushFileBuffers(pipe); DisconnectNamedPipe(pipe); CloseHandle(pipe); if (SUCCEEDED(com_result)) CoUninitialize(); return 0;
}
#else
int run_audio_service(std::string_view) { return 2; }
#endif
}  // namespace notification_hub::audio
