#include "named_pipe.hpp"

#include "../diagnostics/event.hpp"
#include "../protocol/message.hpp"
#include "frame.hpp"

#include <iostream>
#include <string>
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

#endif

}  // namespace

int run_named_pipe_server(std::string_view pipe_name, bool drop_after_health) {
#ifndef _WIN32
    static_cast<void>(pipe_name);
    static_cast<void>(drop_after_health);
    std::cerr << "TRANSPORT_PIPE_UNSUPPORTED: Named Pipe server requires Windows\n";
    return 2;
#else
    const auto wide_name = to_wide_ascii(pipe_name);
    bool injected_drop = false;
    bool shutdown_requested = false;

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

                if (!send_payload(pipe, protocol::serialize_ack(parsed.message, "{\"status\":\"accepted\"}"))) {
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
            }
        }

        close_pipe(pipe);
    }

    return 0;
#endif
}

}  // namespace notification_hub::transport
