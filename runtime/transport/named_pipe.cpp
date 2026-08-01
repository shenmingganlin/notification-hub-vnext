#include "named_pipe.hpp"

#include "../diagnostics/event.hpp"
#include "../protocol/message.hpp"
#include "../scene/controller.hpp"
#include "frame.hpp"

#include <charconv>
#include <cmath>
#include <cctype>
#include <cstdlib>
#include <limits>
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

bool parse_json_string_token(std::string_view payload, size_t& position, std::string& value) {
    if (position >= payload.size() || payload[position] != '"') return false;
    ++position;
    value.clear();
    while (position < payload.size()) {
        const char ch = payload[position++];
        if (ch == '"') return true;
        if (ch == '\\') {
            if (position >= payload.size()) return false;
            const char escaped = payload[position++];
            if (escaped == '"' || escaped == '\\' || escaped == '/') value.push_back(escaped);
            else if (escaped == 'n') value.push_back('\n');
            else if (escaped == 't') value.push_back('\t');
            else return false;
        } else {
            value.push_back(ch);
        }
    }
    return false;
}

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

bool parse_scene_card_payload(std::string_view payload, scene::SceneCardState& card) {
    size_t position = 0;
    const auto skip = [&]() {
        while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    };
    const auto consume = [&](char expected) {
        skip();
        if (position >= payload.size() || payload[position] != expected) return false;
        ++position;
        return true;
    };
    if (!consume('{')) return false;
    bool seen_id = false;
    bool seen_title = false;
    bool seen_body = false;
    bool seen_x = false;
    bool seen_y = false;
    bool seen_width = false;
    bool seen_height = false;
    while (true) {
        skip();
        if (position < payload.size() && payload[position] == '}') {
            ++position;
            break;
        }
        std::string key;
        if (!parse_json_string_token(payload, position, key) || !consume(':')) return false;
        skip();
        if (key == "id" || key == "title" || key == "body") {
            std::string value;
            if (!parse_json_string_token(payload, position, value)) return false;
            if (key == "id" && !seen_id) { card.id = std::move(value); seen_id = true; }
            else if (key == "title" && !seen_title) { card.title = std::move(value); seen_title = true; }
            else if (key == "body" && !seen_body) { card.body = std::move(value); seen_body = true; }
            else return false;
        } else if (key == "x" || key == "y" || key == "width" || key == "height") {
            const auto start = position;
            if (position < payload.size() && payload[position] == '-') ++position;
            const auto digits = position;
            while (position < payload.size() && std::isdigit(static_cast<unsigned char>(payload[position]))) ++position;
            if (digits == position) return false;
            int value = 0;
            const auto parsed = std::from_chars(payload.data() + start, payload.data() + position, value);
            if (parsed.ec != std::errc{} || parsed.ptr != payload.data() + position) return false;
            if (key == "x" && !seen_x) { card.window.x = value; seen_x = true; }
            else if (key == "y" && !seen_y) { card.window.y = value; seen_y = true; }
            else if (key == "width" && !seen_width) { card.window.width = value; seen_width = true; }
            else if (key == "height" && !seen_height) { card.window.height = value; seen_height = true; }
            else return false;
        } else return false;
        skip();
        if (position < payload.size() && payload[position] == ',') { ++position; continue; }
        if (position < payload.size() && payload[position] == '}') { ++position; break; }
        return false;
    }
    skip();
    return position == payload.size() && seen_id && seen_title && seen_x && seen_y && seen_width && seen_height
        && !card.id.empty() && !card.title.empty()
        && card.window.width > 0 && card.window.width <= 10000
        && card.window.height > 0 && card.window.height <= 10000;
}

bool parse_scene_mode_payload(std::string_view payload, scene::StackLayoutOptions& options) {
    size_t position = 0;
    const auto skip = [&]() {
        while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    };
    const auto consume = [&](char expected) {
        skip();
        if (position >= payload.size() || payload[position] != expected) return false;
        ++position;
        return true;
    };
    const auto parse_number = [&](double& value) {
        skip();
        const auto start = position;
        if (position < payload.size() && (payload[position] == '-' || payload[position] == '+')) ++position;
        while (position < payload.size() && std::isdigit(static_cast<unsigned char>(payload[position]))) ++position;
        if (position < payload.size() && payload[position] == '.') {
            ++position;
            while (position < payload.size() && std::isdigit(static_cast<unsigned char>(payload[position]))) ++position;
        }
        if (start == position) return false;
        const std::string token(payload.substr(start, position - start));
        char* end = nullptr;
        value = std::strtod(token.c_str(), &end);
        return end == token.c_str() + token.size();
    };
    if (!consume('{')) return false;
    bool seen_layout = false;
    bool seen_direction = false;
    bool seen_anchor = false;
    bool seen_spacing = false;
    bool seen_work_area_width = false;
    bool seen_work_area_height = false;
    bool seen_dpi_scale = false;
    std::string layout;
    std::string direction;
    std::string anchor;
    while (true) {
        skip();
        if (position < payload.size() && payload[position] == '}') {
            ++position;
            break;
        }
        std::string key;
        if (!parse_json_string_token(payload, position, key) || !consume(':')) return false;
        if (key == "layout" || key == "direction" || key == "anchor") {
            std::string value;
            if (!parse_json_string_token(payload, position, value)) return false;
            if (key == "layout" && !seen_layout) { layout = std::move(value); seen_layout = true; }
            else if (key == "direction" && !seen_direction) { direction = std::move(value); seen_direction = true; }
            else if (key == "anchor" && !seen_anchor) { anchor = std::move(value); seen_anchor = true; }
            else return false;
        } else if (key == "spacing" || key == "workAreaWidth" || key == "workAreaHeight" || key == "dpiScale") {
            double numeric = 0.0;
            if (!parse_number(numeric)) return false;
            if (key != "dpiScale"
                && (std::floor(numeric) != numeric
                    || numeric < static_cast<double>((std::numeric_limits<int>::min)())
                    || numeric > static_cast<double>((std::numeric_limits<int>::max)()))) return false;
            if (key == "spacing" && !seen_spacing) { options.spacing = static_cast<int>(numeric); seen_spacing = true; }
            else if (key == "workAreaWidth" && !seen_work_area_width) { options.work_area_width = static_cast<int>(numeric); seen_work_area_width = true; }
            else if (key == "workAreaHeight" && !seen_work_area_height) { options.work_area_height = static_cast<int>(numeric); seen_work_area_height = true; }
            else if (key == "dpiScale" && !seen_dpi_scale) { options.dpi_scale = static_cast<float>(numeric); seen_dpi_scale = true; }
            else return false;
        } else return false;
        skip();
        if (position < payload.size() && payload[position] == ',') { ++position; continue; }
        if (position < payload.size() && payload[position] == '}') { ++position; break; }
        return false;
    }
    skip();
    const bool any_work_area_override = seen_work_area_width || seen_work_area_height || seen_dpi_scale;
    const bool complete_work_area_override = seen_work_area_width
        && seen_work_area_height
        && seen_dpi_scale;
    if (position != payload.size() || !seen_layout || !seen_direction || !seen_anchor
        || !seen_spacing || (any_work_area_override && !complete_work_area_override)
        || (layout != "stack" && layout != "shelf")) return false;
    if (direction == "down") options.direction = scene::StackDirection::Down;
    else if (direction == "up") options.direction = scene::StackDirection::Up;
    else if (direction == "right") options.direction = scene::StackDirection::Right;
    else if (direction == "left") options.direction = scene::StackDirection::Left;
    else return false;
    options.mode = layout == "shelf" ? scene::LayoutMode::Shelf : scene::LayoutMode::Stack;
    if (anchor == "top-left") options.anchor = scene::StackAnchor::TopLeft;
    else if (anchor == "top-right") options.anchor = scene::StackAnchor::TopRight;
    else if (anchor == "bottom-left") options.anchor = scene::StackAnchor::BottomLeft;
    else if (anchor == "bottom-right") options.anchor = scene::StackAnchor::BottomRight;
    else return false;
    return true;
}

bool parse_scene_dismiss_payload(std::string_view payload, std::string& id) {
    size_t position = 0;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    if (position >= payload.size() || payload[position++] != '{') return false;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    std::string key;
    if (!parse_json_string_token(payload, position, key) || key != "id") return false;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    if (position >= payload.size() || payload[position++] != ':') return false;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    if (!parse_json_string_token(payload, position, id) || id.empty()) return false;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    if (position >= payload.size() || payload[position++] != '}') return false;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    return position == payload.size();
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
                scene::SceneCardState requested_card{};
                scene::StackLayoutOptions requested_layout_options{};
                std::string requested_dismiss_id;
                const bool is_card_update = parsed.message.type == "scene.update"
                    && parsed.message.payload_json.find("\"id\"") != std::string::npos;
                const bool is_card_command = parsed.message.type == "scene.create"
                    || is_card_update
                    || parsed.message.type == "scene.dismiss";
                const bool is_layout_command = parsed.message.type == "scene.set-mode";
                bool payload_valid = true;
                if (parsed.message.type == "scene.update" && !is_card_update) {
                    payload_valid = parse_scene_update_payload(parsed.message.payload_json, requested_scene_state);
                } else if (parsed.message.type == "scene.create" || is_card_update) {
                    payload_valid = parse_scene_card_payload(parsed.message.payload_json, requested_card);
                } else if (parsed.message.type == "scene.dismiss") {
                    payload_valid = parse_scene_dismiss_payload(parsed.message.payload_json, requested_dismiss_id);
                } else if (is_layout_command) {
                    payload_valid = parse_scene_mode_payload(parsed.message.payload_json, requested_layout_options);
                }
                if (!payload_valid) {
                    protocol::ProtocolError error{
                        is_card_command
                            ? "RUNTIME_SCENE_CARD_INVALID"
                            : (is_layout_command ? "LAYOUT_INVALID" : "RUNTIME_SCENE_STATE_INVALID"),
                        is_card_command
                            ? "scene card payload is invalid"
                            : (is_layout_command
                                ? "scene.set-mode requires a valid stack or shelf layout payload"
                                : "scene.update requires integer x, y, width, and height"),
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
                if (!deduplicated && is_layout_command) {
                    std::string apply_error_code;
                    std::string apply_error_message;
                    if (!scene_controller.apply_stack_layout(
                            requested_layout_options,
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
                } else if (!deduplicated && parsed.message.type == "scene.update" && !is_card_update) {
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
                } else if (!deduplicated && parsed.message.type == "scene.create") {
                    std::string apply_error_code;
                    std::string apply_error_message;
                    if (!scene_controller.create_card(
                            requested_card,
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
                } else if (!deduplicated && is_card_update) {
                    std::string apply_error_code;
                    std::string apply_error_message;
                    if (!scene_controller.update_card(
                            requested_card,
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
                } else if (!deduplicated && parsed.message.type == "scene.dismiss") {
                    std::string apply_error_code;
                    std::string apply_error_message;
                    if (!scene_controller.dismiss_card(
                            requested_dismiss_id,
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
                const auto result_json = parsed.message.type == "scene.update" && !is_card_update
                    ? scene_controller.state_result_json(deduplicated)
                    : (parsed.message.type == "scene.create" || is_card_update || parsed.message.type == "scene.dismiss" || is_layout_command
                        ? scene_controller.cards_result_json(deduplicated)
                        : (parsed.message.type == "health"
                            ? std::string("{\"status\":\"accepted\",\"deduplicated\":")
                                + (deduplicated ? "true" : "false")
                                + ",\"sceneState\":" + scene_controller.state_json()
                                + ",\"sceneCards\":" + scene_controller.cards_json()
                                + ",\"layout\":" + scene_controller.layout_json()
                                + ",\"workArea\":" + scene_controller.work_area_json() + "}"
                            : std::string(generic_result)));
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
