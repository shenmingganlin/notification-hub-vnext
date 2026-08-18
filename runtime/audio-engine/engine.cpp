#include "engine.hpp"

#include "asset-cache.hpp"
#include "device-output.hpp"
#include "mixer.hpp"
#include "../protocol/message.hpp"
#include "../transport/frame.hpp"

#include <algorithm>
#include <chrono>
#include <ctime>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>
#include <thread>
#include <atomic>
#include <vector>

#ifdef _WIN32
#include <objbase.h>
#include <windows.h>
#endif

namespace notification_hub::audio_engine {
namespace {
std::string response(const protocol::Message& request, std::string_view result) { return protocol::serialize_ack(request, result); }
std::string error_response(const protocol::Message& request, std::string_view code, std::string_view message) {
    return protocol::serialize_error({std::string(code), std::string(message), request.request_id, request.trace_id});
}
std::string field(std::string_view json, std::string_view name) {
    const auto needle = std::string("\"") + std::string(name) + "\":\"";
    const auto start = json.find(needle);
    if (start == std::string_view::npos) return {};
    const auto begin = start + needle.size();
    const auto end = json.find('"', begin);
    return end == std::string_view::npos ? std::string{} : std::string(json.substr(begin, end - begin));
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
std::string timestamp() {
#ifdef _WIN32
    const auto now = std::chrono::system_clock::now();
    const auto time = std::chrono::system_clock::to_time_t(now);
    std::tm utc{};
    gmtime_s(&utc, &time);
    const auto millis = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    char date[32]{};
    std::strftime(date, sizeof(date), "%Y-%m-%dT%H:%M:%S", &utc);
    std::ostringstream output;
    output << date << '.' << std::setfill('0') << std::setw(3) << millis.count() << 'Z';
    return output.str();
#else
    return "1970-01-01T00:00:00.000Z";
#endif
}
#ifdef _WIN32
bool write_all(HANDLE pipe, const std::vector<std::uint8_t>& bytes) {
    std::size_t offset = 0;
    while (offset < bytes.size()) {
        DWORD written = 0;
        const auto count = static_cast<DWORD>(std::min<std::size_t>(bytes.size() - offset, 0xffffffffu));
        if (!WriteFile(pipe, bytes.data() + offset, count, &written, nullptr) || written == 0) return false;
        offset += written;
    }
    return true;
}
bool send_payload(HANDLE pipe, std::string_view payload) {
    const auto encoded = transport::encode_frame(payload);
    return encoded.ok && write_all(pipe, encoded.bytes);
}
#endif
}

bool audio_engine_self_test() {
    const auto asset = std::make_shared<PcmAsset>(PcmAsset{"self-test", 48000, 1, {0.1f, 0.2f}, 1});
    Mixer mixer(2);
    const auto result = mixer.play(asset, "voice-self-test", 1.0f);
    if (!result.ok || mixer.active_voice_count() != 1) return false;
    float output[2]{};
    if (mixer.mix(output, 2, 1) != 2 || mixer.active_voice_count() != 0) return false;
    return mixer.collect_finished().size() == 1;
}

#ifdef _WIN32
int run_audio_engine(std::string_view pipe_name) {
    const HRESULT com_result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(com_result) && com_result != RPC_E_CHANGED_MODE) return 4;
    const auto wide_name = std::wstring(pipe_name.begin(), pipe_name.end());
    HANDLE pipe = CreateNamedPipeW(wide_name.c_str(), PIPE_ACCESS_DUPLEX, PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT, 1, 1 << 20, 1 << 20, 0, nullptr);
    if (pipe == INVALID_HANDLE_VALUE) { if (SUCCEEDED(com_result)) CoUninitialize(); return 2; }
    std::cout << "notification-hub-audio-engine named pipe ready: " << pipe_name << "\n" << std::flush;
    if (!ConnectNamedPipe(pipe, nullptr) && GetLastError() != ERROR_PIPE_CONNECTED) { CloseHandle(pipe); if (SUCCEEDED(com_result)) CoUninitialize(); return 3; }

    AssetCache cache;
    Mixer mixer;
    DeviceOutput output;
    std::string output_error;
    if (!output.start(mixer, output_error)) {
        CloseHandle(pipe);
        if (SUCCEEDED(com_result)) CoUninitialize();
        return 5;
    }
    transport::FrameDecoder decoder;
    std::uint64_t voice_sequence = 0;
    std::atomic<bool> shutdown{false};
    std::mutex pipe_write_mutex;
    std::thread event_thread([&] {
        while (!shutdown.load()) {
            const auto finished = mixer.collect_finished();
            for (const auto& voice : finished) {
                const auto event = protocol::serialize_event("audio.voice_finished", "evt-audio-" + voice.voice_id, "trace-audio-" + voice.voice_id, timestamp(), "{\"voiceId\":\"" + voice.voice_id + "\",\"soundId\":\"" + voice.sound_id + "\",\"reason\":\"" + voice.reason + "\"}");
                std::lock_guard lock(pipe_write_mutex);
                if (!send_payload(pipe, event)) { shutdown = true; break; }
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }
    });
    std::uint8_t buffer[16 * 1024];
    while (!shutdown.load()) {
        DWORD read = 0;
        if (!ReadFile(pipe, buffer, sizeof(buffer), &read, nullptr) || read == 0) break;
        decoder.append(std::string_view(reinterpret_cast<char*>(buffer), read));
        for (;;) {
            const auto frame = decoder.next();
            if (frame.status == transport::FrameStatus::NeedMoreData) break;
            if (frame.status == transport::FrameStatus::Rejected) { shutdown = true; break; }
            const auto parsed = protocol::parse_message(frame.payload);
            if (!parsed.ok) { send_payload(pipe, protocol::serialize_error(parsed.error)); continue; }
            const auto& request = parsed.message;
            std::string reply;
            if (request.type == "hello") {
                reply = response(request, "{\"ready\":true,\"engine\":true}");
            } else if (request.type == "audio.health" || request.type == "health") {
                std::ostringstream result;
                result << "{\"ready\":" << (output.available() ? "true" : "false")
                       << ",\"deviceAvailable\":" << (output.available() ? "true" : "false")
                       << ",\"activeVoices\":" << mixer.active_voice_count()
                       << ",\"cachedAssets\":" << cache.size()
                       << ",\"bufferFrames\":" << output.buffer_frames() << "}";
                reply = output.available() ? response(request, result.str()) : error_response(request, "AUDIO_DEVICE_UNAVAILABLE", output.last_error());
            } else if (request.type == "audio.load") {
                const auto id = field(request.payload_json, "soundId");
                const auto path = field(request.payload_json, "path");
                const auto loaded = cache.load(id, path);
                if (!loaded.ok) reply = error_response(request, loaded.code, loaded.message);
                else { std::ostringstream result; result << "{\"loaded\":true,\"durationMs\":" << (loaded.asset->frame_count() * 1000 / loaded.asset->sample_rate) << "}"; reply = response(request, result.str()); }
            } else if (request.type == "audio.unload") {
                reply = response(request, cache.unload(field(request.payload_json, "soundId")) ? "{\"unloaded\":true}" : "{\"unloaded\":false}");
            } else if (request.type == "audio.play") {
                const auto id = field(request.payload_json, "soundId");
                const auto asset = cache.find(id);
                const auto volume = number_field(request.payload_json, "volume");
                if (!asset) reply = error_response(request, "AUDIO_NOT_LOADED", "soundId is not cached");
                else if (!volume) reply = error_response(request, "AUDIO_VOLUME_INVALID", "volume must be between 0 and 1");
                else {
                    const auto voice_id = "voice-" + std::to_string(++voice_sequence);
                    const auto played = mixer.play(asset, voice_id, *volume);
                    reply = played.ok ? response(request, "{\"accepted\":true,\"voiceId\":\"" + voice_id + "\"}") : error_response(request, played.code, played.message);
                }
            } else if (request.type == "audio.stop") {
                const auto stopped = mixer.stop(field(request.payload_json, "voiceId"));
                reply = stopped.ok ? response(request, "{\"stopped\":true}") : error_response(request, stopped.code, stopped.message);
            } else if (request.type == "audio.stop_all") {
                const auto count = mixer.stop_all();
                reply = response(request, "{\"stopped\":true,\"count\":" + std::to_string(count) + "}");
            } else if (request.type == "audio.shutdown" || request.type == "shutdown") {
                shutdown = true;
                reply = response(request, "{\"shuttingDown\":true}");
            } else {
                reply = error_response(request, "AUDIO_UNKNOWN_COMMAND", "unsupported audio engine command");
            }
            {
                std::lock_guard lock(pipe_write_mutex);
                if (!send_payload(pipe, reply)) { shutdown = true; break; }
            }
        }
    }
    shutdown = true;
    if (event_thread.joinable()) event_thread.join();
    output.stop();
    FlushFileBuffers(pipe); DisconnectNamedPipe(pipe); CloseHandle(pipe);
    if (SUCCEEDED(com_result)) CoUninitialize();
    return 0;
}
#else
int run_audio_engine(std::string_view) { return 2; }
#endif

}  // namespace notification_hub::audio_engine
