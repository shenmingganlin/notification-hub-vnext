#include "../diagnostics/event.hpp"
#include "../protocol/message.hpp"
#include "../transport/frame.hpp"
#include "../transport/named_pipe.hpp"
#include "../scene/window.hpp"

#include <iostream>
#include <string_view>

namespace {

using notification_hub::diagnostics::create_event;
using notification_hub::diagnostics::serialize_jsonl;
using notification_hub::protocol::Message;
using notification_hub::protocol::parse_message;
using notification_hub::protocol::serialize_ack;
using notification_hub::transport::FrameDecoder;
using notification_hub::transport::FrameStatus;
using notification_hub::transport::encode_frame;
using notification_hub::transport::run_named_pipe_server;
using notification_hub::scene::SceneWindow;
using notification_hub::scene::WindowConfig;
using notification_hub::scene::close_button_bounds;
using notification_hub::scene::point_inside_card;

constexpr std::string_view kTimestamp = "2026-08-01T00:00:00.000Z";

bool expect_valid(std::string_view input, std::string_view expected_type) {
    const auto result = parse_message(input);
    if (!result.ok || result.message.type != expected_type) {
        std::cerr << "expected valid message of type " << expected_type << "\n";
        return false;
    }
    return true;
}

bool expect_rejected(std::string_view input, std::string_view expected_code) {
    const auto result = parse_message(input);
    if (result.ok || result.error.code != expected_code) {
        std::cerr << "expected rejection code " << expected_code << "\n";
        return false;
    }
    return true;
}

bool transport_self_test() {
    const auto encoded = encode_frame("hello-frame");
    if (!encoded.ok || encoded.bytes.size() != 4 + 11) {
        std::cerr << "frame encoding failed\n";
        return false;
    }

    FrameDecoder decoder;
    decoder.append(std::string_view(reinterpret_cast<const char*>(encoded.bytes.data()), 2));
    if (decoder.next().status != FrameStatus::NeedMoreData) return false;
    decoder.append(std::string_view(reinterpret_cast<const char*>(encoded.bytes.data() + 2), encoded.bytes.size() - 2));
    const auto first = decoder.next();
    if (first.status != FrameStatus::Ready || first.payload != "hello-frame") {
        std::cerr << "fragmented frame decoding failed\n";
        return false;
    }

    const auto second = encode_frame("second-frame");
    decoder.append(std::string_view(reinterpret_cast<const char*>(second.bytes.data()), second.bytes.size()));
    const auto second_result = decoder.next();
    if (second_result.status != FrameStatus::Ready || second_result.payload != "second-frame") {
        std::cerr << "coalesced frame decoding failed\n";
        return false;
    }

    const auto empty = encode_frame("");
    if (empty.ok || empty.code != "TRANSPORT_FRAME_EMPTY") return false;

    std::string oversized(notification_hub::transport::kMaxFramePayloadBytes + 1, 'x');
    const auto too_large = encode_frame(oversized);
    if (too_large.ok || too_large.code != "TRANSPORT_FRAME_TOO_LARGE") return false;

    decoder.append(std::string_view("\x05\0\0\0ab", 6));
    if (decoder.finish().code != "TRANSPORT_FRAME_TRUNCATED") {
        std::cerr << "truncated frame rejection failed\n";
        return false;
    }

    decoder.append(std::string_view("\0\0\0\0", 4));
    if (decoder.next().code != "TRANSPORT_FRAME_EMPTY") return false;
    decoder.append(std::string_view("\x01\x00\x10\0", 4));
    if (decoder.next().code != "TRANSPORT_FRAME_TOO_LARGE") return false;
    return true;
}

bool hit_test_self_test() {
    constexpr float width = 420.0f;
    constexpr float height = 180.0f;
    if (!point_inside_card(210.0f, 90.0f, width, height)) return false;
    if (!point_inside_card(10.0f, 90.0f, width, height)) return false;
    if (!point_inside_card(24.0f, 24.0f, width, height)) return false;
    if (point_inside_card(0.0f, 0.0f, width, height)) return false;
    if (point_inside_card(10.0f, 10.0f, width, height)) return false;
    if (point_inside_card(11.0f, 11.0f, width, height)) return false;

    const auto event = create_event(
        "interaction-self-test", "hit-test", "INTERACTION_HIT_TEST_OK", "info", true,
        "Card and transparent-region hit testing completed", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
}

bool close_interaction_self_test() {
#ifndef _WIN32
    std::cerr << "INTERACTION_UNSUPPORTED: Native close interaction requires Windows\n";
    return false;
#else
    SceneWindow window(WindowConfig{
        L"Notification Hub Close Self Test",
        L"Close button interaction",
        420,
        180,
        true});
    if (!window.create() || !window.show()) return false;

    const auto close_bounds = close_button_bounds(420.0f, 180.0f);
    const auto center_x = (close_bounds.left + close_bounds.right) * 0.5f;
    const auto center_y = (close_bounds.top + close_bounds.bottom) * 0.5f;
    if (window.click_client_point(40.0f, 40.0f) || window.is_close_requested()) return false;
    if (!window.click_client_point(center_x, center_y) || !window.is_close_requested()) return false;

    if (window.run_message_pump(false) != 0 || window.is_created()) {
        const auto event = create_event(
            "interaction-close-self-test", "close-completed", "INTERACTION_CLOSE_FAILED", "error", false,
            "Close button did not destroy the scene window", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    const auto event = create_event(
        "interaction-close-self-test", "close-completed", "INTERACTION_CLOSE_COMPLETED", "info", true,
        "Close button requested and completed window destruction", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
#endif
}

bool render_self_test() {
#ifndef _WIN32
    std::cerr << "RENDERER_UNSUPPORTED: Native card rendering requires Windows\n";
    return false;
#else
    SceneWindow window(WindowConfig{
        L"Notification Hub Render Self Test",
        L"Direct2D and DirectWrite card surface",
        420,
        180,
        true});
    if (!window.create() || !window.is_renderer_ready()) {
        const auto event = create_event(
            "render-self-test", "renderer-created", "RENDERER_RESOURCE_FAILED", "error", false,
            "Direct2D or DirectWrite resources could not be initialized", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    if (!window.show()) {
        const auto event = create_event(
            "render-self-test", "shown", "RENDERER_WINDOW_SHOW_FAILED", "error", false,
            "Rendered scene window show failed", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    if (window.run_message_pump(true) != 0 || !window.is_frame_rendered()) {
        const auto event = create_event(
            "render-self-test", "renderer-drawn", "RENDERER_FRAME_TIMEOUT", "error", false,
            "Direct2D card surface did not render a frame", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    const auto event = create_event(
        "render-self-test", "renderer-drawn", "RENDERER_FRAME_RENDERED", "info", true,
        "Direct2D and DirectWrite card surface rendered", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
#endif
}

bool window_self_test() {
#ifndef _WIN32
    std::cerr << "WINDOW_UNSUPPORTED: Native Scene Window requires Windows\\n";
    return false;
#else
    SceneWindow window(WindowConfig{
        L"Notification Hub Self Test",
        L"Native scene window lifecycle",
        320,
        120,
        true});
    if (!window.create()) {
        const auto event = create_event(
            "window-self-test", "renderer-created", "RENDERER_WINDOW_CREATE_FAILED", "error", false,
            "Native scene window creation failed", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    if (!window.show()) {
        const auto event = create_event(
            "window-self-test", "shown", "RENDERER_WINDOW_SHOW_FAILED", "error", false,
            "Native scene window show failed", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    if (window.run_message_pump(true) != 0 || window.is_created()) {
        const auto event = create_event(
            "window-self-test", "dismissed", "RENDERER_WINDOW_CLOSE_FAILED", "error", false,
            "Native scene window did not close cleanly", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    const auto event = create_event(
        "window-self-test", "dismissed", "RENDERER_WINDOW_LIFECYCLE_OK", "info", true,
        "Native scene window lifecycle completed", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
#endif
}

bool protocol_self_test() {
    constexpr std::string_view hello =
        R"({"protocolVersion":1,"requestId":"req-test","traceId":"trace-test","type":"hello","timestamp":"2026-08-01T00:00:00.000Z","payload":{"clientVersion":"test"}})";
    constexpr std::string_view health =
        R"({"protocolVersion":1,"requestId":"req-health","traceId":"trace-health","type":"health","timestamp":"2026-08-01T00:00:00.000Z","payload":{}})";

    if (!expect_valid(hello, "hello") || !expect_valid(health, "health")) return false;
    if (!expect_rejected(R"({})", "PROTOCOL_MISSING_FIELD")) return false;
    if (!expect_rejected(
            R"({"protocolVersion":1,"requestId":"req","traceId":"trace","type":"health","timestamp":"2026-08-01T00:00:00.000Z","payload":{},"future":true})",
            "PROTOCOL_UNKNOWN_FIELD")) return false;
    if (!expect_rejected(
            R"({"protocolVersion":2,"requestId":"req","traceId":"trace","type":"health","timestamp":"2026-08-01T00:00:00.000Z","payload":{}})",
            "PROTOCOL_VERSION_UNSUPPORTED")) return false;
    if (!expect_rejected(
            R"({"protocolVersion":1,"requestId":"req","traceId":"trace","type":"unknown","timestamp":"2026-08-01T00:00:00.000Z","payload":{}})",
            "PROTOCOL_UNKNOWN_TYPE")) return false;
    if (!expect_rejected(
            R"({"protocolVersion":1,"requestId":"req","traceId":"trace","type":"health","timestamp":"2026-08-01T00:00:00.000Z","payload":[]})",
            "PROTOCOL_INVALID_PAYLOAD")) return false;
    if (!expect_rejected(
            R"({"protocolVersion":1,"requestId":"req","traceId":"trace","type":"health","timestamp":"2026-08-01T00:00:00.000Z","payload":{"x":}})",
            "PROTOCOL_INVALID_PAYLOAD")) return false;

    const auto parsed = parse_message(hello);
    const auto ack = serialize_ack(parsed.message, R"({"status":"healthy"})");
    if (ack.find("\"type\":\"ack\"") == std::string::npos ||
        ack.find("\"requestId\":\"req-test\"") == std::string::npos) {
        std::cerr << "ack correlation failed\n";
        return false;
    }

    const auto event = create_event(
        "trace-test", "runtime-accepted", "PROTOCOL_INVALID_MESSAGE", "error", true,
        "Rejected protocol message", std::string(kTimestamp), R"({"source":"self-test"})");
    const auto jsonl = serialize_jsonl(event);
    if (jsonl.back() != '\n' || jsonl.find("\"traceId\":\"trace-test\"") == std::string::npos) {
        std::cerr << "diagnostic serialization failed\n";
        return false;
    }

    return true;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc > 1 && std::string_view(argv[1]) == "--self-test") {
        std::cout << "notification-hub-runtime self-test: ok\n";
        return 0;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--protocol-self-test") {
        const bool passed = protocol_self_test();
        std::cout << "notification-hub-runtime protocol self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--transport-self-test") {
        const bool passed = transport_self_test();
        std::cout << "notification-hub-runtime transport self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--window-self-test") {
        const bool passed = window_self_test();
        std::cout << "notification-hub-runtime window self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--render-self-test") {
        const bool passed = render_self_test();
        std::cout << "notification-hub-runtime render self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--hit-test-self-test") {
        const bool passed = hit_test_self_test();
        std::cout << "notification-hub-runtime hit-test self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--close-interaction-self-test") {
        const bool passed = close_interaction_self_test();
        std::cout << "notification-hub-runtime close interaction self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 2 && std::string_view(argv[1]) == "--pipe-server") {
        const bool drop_after_health = argc > 3 && std::string_view(argv[3]) == "--drop-after-health";
        const bool exit_after_health = argc > 3 && std::string_view(argv[3]) == "--exit-after-health";
        return run_named_pipe_server(argv[2], drop_after_health, exit_after_health);
    }

    std::cout << "notification-hub-runtime " << NOTIFICATION_HUB_VERSION << "\n";
    return 0;
}
