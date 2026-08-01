#include "named_pipe.hpp"

#include "../diagnostics/event.hpp"
#include "../protocol/message.hpp"
#include "../scene/controller.hpp"
#include "frame.hpp"

#include <charconv>
#include <cctype>
#include <iostream>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

namespace notification_hub::transport {
namespace {

#ifdef _WIN32

std::wstring to_wide_ascii(std::string_view value) {
    return std::wstring(value.begin(), value.end());
}

bool write_all(HANDLE pipe, const std::vector<std::uint8_t>& bytes) {
    size_t offset = 0;
    while (offset < bytes.size()) {
        const auto remaining = bytes.size() - offset;
        const auto chunk = static_cast<DWORD>(remaining > 0xffffffffu ? 0xffffffffu : remaining);
        DWORD written = 0;
        if (!WriteFile(pipe, bytes.data() + offset, chunk, &written, nullptr) || written == 0) return false;
        offset += written;
    }
    return true;
}

bool send_payload(HANDLE pipe, std::string_view payload) {
    const auto encoded = encode_frame(payload);
    return encoded.ok && write_all(pipe, encoded.bytes);
}

void close_pipe(HANDLE pipe) {
    FlushFileBuffers(pipe);
    DisconnectNamedPipe(pipe);
    CloseHandle(pipe);
}

using SceneState = scene::SceneWindowState;

bool parse_scene_update_payload(std::string_view payload, SceneState& state) {
    size_t position = 0;
    const auto skip_whitespace = [&]() {
        while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    };
    const auto consume = [&](char expected) {
        skip_whitespace();
        if (position >= payload.size() || payload[position] != expected) return false;
        ++position;
        return true;
    };
    if (!consume('{')) return false;

    bool seen_x = false;
    bool seen_y = false;
    bool seen_width = false;
    bool seen_height = false;
    while (true) {
        skip_whitespace();
        if (position < payload.size() && payload[position] == '}') {
            ++position;
            break;
        }
        if (position >= payload.size() || payload[position] != '"') return false;
        ++position;
        const auto key_start = position;
        while (position < payload.size() && payload[position] != '"') ++position;
        if (position >= payload.size()) return false;
        const std::string_view key = payload.substr(key_start, position - key_start);
        ++position;
        if (!consume(':')) return false;
        skip_whitespace();
        const auto number_start = position;
        if (position < payload.size() && payload[position] == '-') ++position;
        const auto digits_start = position;
        while (position < payload.size() && std::isdigit(static_cast<unsigned char>(payload[position]))) ++position;
        if (digits_start == position) return false;
        int value = 0;
        const auto parsed = std::from_chars(
            payload.data() + number_start,
            payload.data() + position,
            value);
        if (parsed.ec != std::errc{} || parsed.ptr != payload.data() + position) return false;
        if (key == "x" && !seen_x) {
            state.x = value;
            seen_x = true;
        } else if (key == "y" && !seen_y) {
            state.y = value;
            seen_y = true;
        } else if (key == "width" && !seen_width) {
            state.width = value;
            seen_width = true;
        } else if (key == "height" && !seen_height) {
            state.height = value;
            seen_height = true;
        } else {
            return false;
        }
        skip_whitespace();
        if (position < payload.size() && payload[position] == ',') {
            ++position;
            continue;
        }
        if (position < payload.size() && payload[position] == '}') {
            ++position;
            break;
        }
        return false;
    }
    skip_whitespace();
    return position == payload.size()
        && seen_x && seen_y && seen_width && seen_height
        && state.width > 0 && state.width <= 10000
        && state.height > 0 && state.height <= 10000;
}



#endif

}  // namespace

int run_named_pipe_server(std::string_view pipe_name, bool drop_after_health, bool exit_after_health) {
#ifndef _WIN32
    static_cast<void>(pipe_name);
    static_cast<void>(drop_after_health);
    static_cast<void>(exit_after_health);
    std::cerr << "TRANSPORT_PIPE_UNSUPPORTED: Named Pipe server requires Windows\n";
    return 2;
#else
    const auto wide_name = to_wide_ascii(pipe_name);
    bool injected_drop = false;
    bool shutdown_requested = false;
    std::unordered_map<std::string, std::string> idempotency_cache;
    scene::RuntimeSceneController scene_controller;

    while (!shutdown_requested) {
        HANDLE pipe = CreateNamedPipeW(
            wide_name.c_str(),
            PIPE_ACCESS_DUPLEX,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
            1,
            64 * 1024,
            64 * 1024,
            5000,
            nullptr);
        if (pipe == INVALID_HANDLE_VALUE) {
            std::cerr << "TRANSPORT_PIPE_CREATE_FAILED: " << GetLastError() << "\n";
            return 3;
        }

        std::cout << "notification-hub-runtime named pipe ready: " << pipe_name << "\n" << std::flush;
        const BOOL connected = ConnectNamedPipe(pipe, nullptr)
            ? TRUE
            : (GetLastError() == ERROR_PIPE_CONNECTED ? TRUE : FALSE);
        if (!connected) {
            const auto error = GetLastError();
            std::cerr << "TRANSPORT_PIPE_CONNECT_FAILED: " << error << "\n";
            CloseHandle(pipe);
            return 4;
        }

        FrameDecoder decoder;
        std::vector<char> read_buffer(16 * 1024);
        bool session_finished = false;
        while (!session_finished && !shutdown_requested) {
            scene_controller.pump_messages();
            DWORD bytes_read = 0;
            if (!ReadFile(pipe, read_buffer.data(), static_cast<DWORD>(read_buffer.size()), &bytes_read, nullptr)) {
                const auto error = GetLastError();
                if (error != ERROR_BROKEN_PIPE && error != ERROR_NO_DATA) {
                    std::cerr << "TRANSPORT_PIPE_READ_FAILED: " << error << "\n";
                    close_pipe(pipe);
                    return 5;
                }
                session_finished = true;
                break;
            }
            if (bytes_read == 0) {
                session_finished = true;
                break;
            }
            decoder.append(std::string_view(read_buffer.data(), bytes_read));

            while (!session_finished && !shutdown_requested) {
                const auto frame = decoder.next();
                if (frame.status == FrameStatus::NeedMoreData) break;
                if (frame.status == FrameStatus::Rejected) {
                    const auto event = diagnostics::create_event(
                        "pipe-trace", "transport-sent", frame.code, "error", true,
                        frame.message, "2026-08-01T00:00:00.000Z");
                    std::cerr << diagnostics::serialize_jsonl(event);
                    protocol::ProtocolError error{frame.code, frame.message, {}, {}};
                    if (!send_payload(pipe, protocol::serialize_error(error))) {
                        session_finished = true;
                    }
                    continue;
                }

                const auto parsed = protocol::parse_message(frame.payload);
                if (!parsed.ok) {
                    const auto event = diagnostics::create_event(
                        "pipe-trace", "runtime-accepted", parsed.error.code, "error", true,
                        parsed.error.message, "2026-08-01T00:00:00.000Z");
                    std::cerr << diagnostics::serialize_jsonl(event);
                    if (!send_payload(pipe, protocol::serialize_error(parsed.error))) {
                        session_finished = true;
                    }
                    continue;
                }

                scene::SceneWindowState requested_scene_state{};
                if (parsed.message.type == "scene.update"
                    && !parse_scene_update_payload(parsed.message.payload_json, requested_scene_state)) {
                    protocol::ProtocolError error{
                        "RUNTIME_SCENE_STATE_INVALID",
                        "scene.update requires integer x, y, width, and height",
                        parsed.message.request_id,
                        parsed.message.trace_id
                    };
                    if (!send_payload(pipe, protocol::serialize_error(error))) {
                        close_pipe(pipe);
                        return 10;
                    }
                    continue;
                }

                bool deduplicated = false;
                if (!parsed.message.idempotency_key.empty()) {
                    const auto fingerprint = parsed.message.type + "|" + parsed.message.payload_json;
                    const auto existing = idempotency_cache.find(parsed.message.idempotency_key);
                    if (existing != idempotency_cache.end()) {
                        if (existing->second != fingerprint) {
                            protocol::ProtocolError error{
                                "TRANSPORT_IDEMPOTENCY_CONFLICT",
                                "idempotencyKey was already used for a different request",
                                parsed.message.request_id,
                                parsed.message.trace_id
                            };
                            if (!send_payload(pipe, protocol::serialize_error(error))) {
                                close_pipe(pipe);
                                return 9;
                            }
                            continue;
                        }
                        deduplicated = true;
                    } else {
                        idempotency_cache.emplace(parsed.message.idempotency_key, fingerprint);
                    }
                }
                if (parsed.message.type == "scene.update" && !deduplicated) {
                    std::string apply_error_code;
                    std::string apply_error_message;
                    if (!scene_controller.apply_window_state(
                            requested_scene_state,
                            apply_error_code,
                            apply_error_message)) {
                        protocol::ProtocolError error{
                            apply_error_code,
                            apply_error_message,
                            parsed.message.request_id,
                            parsed.message.trace_id
                        };
                        if (!send_payload(pipe, protocol::serialize_error(error))) {
                            close_pipe(pipe);
                            return 11;
                        }
                        continue;
                    }
                }
                const auto generic_result = deduplicated
                    ? "{\"status\":\"accepted\",\"deduplicated\":true}"
                    : "{\"status\":\"accepted\",\"deduplicated\":false}";
                const auto result_json = parsed.message.type == "scene.update"
                    ? scene_controller.state_result_json(deduplicated)
                    : std::string(generic_result);
                if (!send_payload(pipe, protocol::serialize_ack(parsed.message, result_json))) {
                    std::cerr << "TRANSPORT_PIPE_WRITE_FAILED: " << GetLastError() << "\n";
                    close_pipe(pipe);
                    return 8;
                }
                if (parsed.message.type == "shutdown") {
                    shutdown_requested = true;
                    session_finished = true;
                    break;
                }
                if (drop_after_health && !injected_drop && parsed.message.type == "health") {
                    injected_drop = true;
                    session_finished = true;
                    break;
                }
                if (exit_after_health && parsed.message.type == "health") {
                    shutdown_requested = true;
                    session_finished = true;
                    break;
                }
            }
        }

        close_pipe(pipe);
    }

    return 0;
#endif
}

}  // namespace notification_hub::transport
