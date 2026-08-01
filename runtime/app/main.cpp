#include "../diagnostics/event.hpp"
#include "../protocol/message.hpp"
#include "../transport/frame.hpp"
#include "../transport/named_pipe.hpp"
#include "../scene/window.hpp"

#ifdef _WIN32
#include <windows.h>
#endif

#include <iostream>
#include <string>
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
using notification_hub::scene::Pixel;
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

bool visual_self_test() {
#ifndef _WIN32
    std::cerr << "RENDERER_UNSUPPORTED: Visual regression requires Windows\n";
    return false;
#else
    SceneWindow window(WindowConfig{
        L"Notification Hub Visual Self Test",
        L"Structural pixel sampling",
        420,
        180,
        true});
    if (!window.create() || !window.is_renderer_ready() || !window.show() || !window.paint(true)) return false;
    const bool pixels_captured = window.capture_pixels();

    Pixel transparent{};
    Pixel surface{};
    Pixel accent{};
    Pixel close_background{};
    const auto close_bounds = close_button_bounds(420.0f, 180.0f);
    const auto close_x = static_cast<int>((close_bounds.left + close_bounds.right) * 0.5f);
    const auto close_y = static_cast<int>((close_bounds.top + close_bounds.bottom) * 0.5f);
    const bool sampled = window.sample_pixel(0, 0, transparent)
        && window.sample_pixel(200, 100, surface)
        && window.sample_pixel(11, 90, accent)
        && window.sample_pixel(close_x, close_y, close_background);
    const bool transparent_corner = sampled && pixels_captured && transparent.alpha <= 16;
    const bool opaque_surface = sampled && pixels_captured && surface.alpha >= 220 && surface.red < 80 && surface.green < 100;
    const bool visible_accent = sampled && pixels_captured && accent.alpha >= 220 && accent.green > accent.red + 80;
    const bool visible_close = sampled && pixels_captured && close_background.alpha >= 180
        && close_background.red > surface.red + 20;

    window.request_close();
    const auto pump_result = window.run_message_pump(false);
    if (!sampled || !transparent_corner || !opaque_surface || !visible_accent || !visible_close
        || pump_result != 0 || window.is_created()) {
        std::cerr << "visual samples: "
                  << "sampled=" << sampled
                  << " pixelsCaptured=" << pixels_captured
                  << " transparent=" << static_cast<int>(transparent.red) << ","
                  << static_cast<int>(transparent.green) << ","
                  << static_cast<int>(transparent.blue) << ","
                  << static_cast<int>(transparent.alpha)
                  << " surface=" << static_cast<int>(surface.red) << ","
                  << static_cast<int>(surface.green) << ","
                  << static_cast<int>(surface.blue) << ","
                  << static_cast<int>(surface.alpha)
                  << " accent=" << static_cast<int>(accent.red) << ","
                  << static_cast<int>(accent.green) << ","
                  << static_cast<int>(accent.blue) << ","
                  << static_cast<int>(accent.alpha)
                  << " close=" << static_cast<int>(close_background.red) << ","
                  << static_cast<int>(close_background.green) << ","
                  << static_cast<int>(close_background.blue) << ","
                  << static_cast<int>(close_background.alpha) << "\n";
        const auto event = create_event(
            "visual-self-test", "pixel-sampled", "RENDERER_VISUAL_REGRESSION_FAILED", "error", false,
            "Structural card pixel assertions failed", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    const auto event = create_event(
        "visual-self-test", "pixel-sampled", "RENDERER_VISUAL_REGRESSION_OK", "info", true,
        "Structural card pixel assertions completed", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
#endif
}

bool desktop_visual_self_test() {
#ifndef _WIN32
    std::cerr << "RENDERER_UNSUPPORTED: Desktop capture requires Windows\n";
    return false;
#else
    SceneWindow window(WindowConfig{
        L"Notification Hub Desktop Visual Self Test",
        L"PrintWindow compositor capture",
        420,
        180,
        true});
    if (!window.create() || !window.is_renderer_ready() || !window.show() || !window.paint()) return false;

    const auto hwnd = static_cast<HWND>(window.native_handle());
    SetWindowPos(hwnd, HWND_TOP, 96, 96, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    UpdateWindow(hwnd);
    Sleep(50);
    RECT client_rect{};
    if (GetClientRect(hwnd, &client_rect) == FALSE) return false;
    const int width = client_rect.right - client_rect.left;
    const int height = client_rect.bottom - client_rect.top;
    BITMAPINFO bitmap_info{};
    bitmap_info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bitmap_info.bmiHeader.biWidth = width;
    bitmap_info.bmiHeader.biHeight = -height;
    bitmap_info.bmiHeader.biPlanes = 1;
    bitmap_info.bmiHeader.biBitCount = 32;
    bitmap_info.bmiHeader.biCompression = BI_RGB;

    void* bits = nullptr;
    const auto screen_dc = GetDC(nullptr);
    const auto memory_dc = CreateCompatibleDC(screen_dc);
    const auto bitmap = CreateDIBSection(
        screen_dc,
        &bitmap_info,
        DIB_RGB_COLORS,
        &bits,
        nullptr,
        0);
    const auto previous = bitmap != nullptr ? SelectObject(memory_dc, bitmap) : nullptr;
    bool captured = bitmap != nullptr
        && PrintWindow(hwnd, memory_dc, PW_RENDERFULLCONTENT) != FALSE;
    bool used_screen_capture = false;

    std::size_t nonzero_pixels = 0;
    Pixel center{};
    Pixel corner{};
    const auto scan_pixels = [&]() {
        nonzero_pixels = 0;
        center = {};
        corner = {};
        if (bits == nullptr) return;
        const auto* pixels = static_cast<const std::uint8_t*>(bits);
        for (int index = 0; index < width * height; ++index) {
            const auto* bgra = pixels + (index * 4);
            if (bgra[0] != 0 || bgra[1] != 0 || bgra[2] != 0) ++nonzero_pixels;
        }
        const auto read_pixel = [&](int x, int y) {
            const auto* bgra = pixels + (((y * width) + x) * 4);
            return Pixel{bgra[2], bgra[1], bgra[0], bgra[3]};
        };
        center = read_pixel(width / 2, height / 2);
        corner = read_pixel(0, 0);
    };
    scan_pixels();

    if (bitmap != nullptr && nonzero_pixels == 0 && screen_dc != nullptr && memory_dc != nullptr) {
        POINT origin{0, 0};
        ClientToScreen(hwnd, &origin);
        captured = BitBlt(
            memory_dc,
            0,
            0,
            width,
            height,
            screen_dc,
            origin.x,
            origin.y,
            SRCCOPY | CAPTUREBLT) != FALSE;
        used_screen_capture = captured;
        scan_pixels();
    }

    if (previous != nullptr) SelectObject(memory_dc, previous);
    if (bitmap != nullptr) DeleteObject(bitmap);
    if (memory_dc != nullptr) DeleteDC(memory_dc);
    if (screen_dc != nullptr) ReleaseDC(nullptr, screen_dc);

    window.request_close();
    const auto pump_result = window.run_message_pump(false);
    const bool valid_capture = captured && nonzero_pixels > 0 && pump_result == 0 && !window.is_created();
    if (!valid_capture) {
        std::cerr << "desktop capture: captured=" << captured
                  << " usedScreenCapture=" << used_screen_capture
                  << " nonzeroPixels=" << nonzero_pixels
                  << " center=" << static_cast<int>(center.red) << ","
                  << static_cast<int>(center.green) << ","
                  << static_cast<int>(center.blue) << ","
                  << static_cast<int>(center.alpha)
                  << " corner=" << static_cast<int>(corner.red) << ","
                  << static_cast<int>(corner.green) << ","
                  << static_cast<int>(corner.blue) << ","
                  << static_cast<int>(corner.alpha) << "\n";
        const auto event = create_event(
            "desktop-visual-self-test", "window-captured", "RENDERER_DESKTOP_CAPTURE_FAILED", "error", false,
            "Desktop compositor capture was empty or failed", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    const auto event = create_event(
        "desktop-visual-self-test", "window-captured", "RENDERER_DESKTOP_CAPTURE_OK", "info", true,
        used_screen_capture
            ? "Screen-region desktop compositor capture completed after PrintWindow returned empty"
            : "PrintWindow desktop compositor capture completed", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
#endif
}

bool drag_interaction_self_test() {
#ifndef _WIN32
    std::cerr << "INTERACTION_UNSUPPORTED: Native drag interaction requires Windows\n";
    return false;
#else
    SceneWindow window(WindowConfig{
        L"Notification Hub Drag Self Test",
        L"Drag interaction",
        420,
        180,
        true});
    if (!window.create() || !window.show()) return false;

    int start_x = 0;
    int start_y = 0;
    if (!window.get_window_position(start_x, start_y)) return false;
    if (window.begin_drag_client_point(210.0f, 90.0f) == false || !window.is_dragging()) return false;
    constexpr int delta_x = 37;
    constexpr int delta_y = 23;
    if (!window.update_drag_screen_point(start_x + delta_x + 210, start_y + delta_y + 90)) return false;

    int moved_x = 0;
    int moved_y = 0;
    if (!window.get_window_position(moved_x, moved_y)
        || moved_x != start_x + delta_x
        || moved_y != start_y + delta_y) {
        const auto event = create_event(
            "interaction-drag-self-test", "drag-moved", "INTERACTION_DRAG_FAILED", "error", false,
            "Dragged window position did not match screen delta", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    window.end_drag();
    const auto close_bounds = close_button_bounds(420.0f, 180.0f);
    if (window.begin_drag_client_point(
            (close_bounds.left + close_bounds.right) * 0.5f,
            (close_bounds.top + close_bounds.bottom) * 0.5f)) {
        return false;
    }
    window.request_close();
    if (window.run_message_pump(false) != 0 || window.is_created()) return false;

    const auto event = create_event(
        "interaction-drag-self-test", "drag-completed", "INTERACTION_DRAG_COMPLETED", "info", true,
        "Window drag state and position delta completed", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
#endif
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
    if (argc > 1 && std::string_view(argv[1]) == "--desktop-visual-self-test") {
        const bool passed = desktop_visual_self_test();
        std::cout << "notification-hub-runtime desktop visual self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--drag-interaction-self-test") {
        const bool passed = drag_interaction_self_test();
        std::cout << "notification-hub-runtime drag interaction self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--close-interaction-self-test") {
        const bool passed = close_interaction_self_test();
        std::cout << "notification-hub-runtime close interaction self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--visual-self-test") {
        const bool passed = visual_self_test();
        std::cout << "notification-hub-runtime visual self-test: " << (passed ? "ok" : "failed") << "\n";
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
