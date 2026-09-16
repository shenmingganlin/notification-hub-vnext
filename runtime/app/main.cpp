#include "../config/config.hpp"
#include "../diagnostics/event.hpp"
#include "../protocol/message.hpp"
#include "../transport/frame.hpp"
#include "../transport/named_pipe.hpp"
#include "../scene/controller.hpp"
#include "../scene/layout.hpp"
#include "../scene/ticker.hpp"
#include "../scene/work_area.hpp"
#include "../scene/window.hpp"
#include "../scene/visual.hpp"

#ifdef _WIN32
#include <windows.h>
#endif

#include <chrono>
#include <iostream>
#include <limits>
#include <string>
#include <string_view>
#include <vector>

namespace {

using notification_hub::diagnostics::create_event;
using notification_hub::diagnostics::serialize_jsonl;
using notification_hub::protocol::Message;
using notification_hub::protocol::parse_message;
using notification_hub::protocol::serialize_ack;
using notification_hub::protocol::serialize_event;
using notification_hub::protocol::escape_json_string;
using notification_hub::transport::FrameDecoder;
using notification_hub::transport::FrameStatus;
using notification_hub::transport::encode_frame;
using notification_hub::transport::run_named_pipe_server;
using notification_hub::scene::Pixel;
using notification_hub::scene::RuntimeSceneController;
using notification_hub::scene::SceneWindow;
using notification_hub::scene::SceneCardState;
using notification_hub::scene::VisualStyle;
using notification_hub::scene::StackAnchor;
using notification_hub::scene::StackCardInput;
using notification_hub::scene::StackDirection;
using notification_hub::scene::StackLayoutOptions;
using notification_hub::scene::StackWrap;
using notification_hub::scene::layout_stack;
using notification_hub::scene::layout_shelf;
using notification_hub::scene::fallback_work_area;
using notification_hub::scene::valid_work_area;
using notification_hub::scene::query_primary_work_area;
using notification_hub::scene::SceneWindowState;
using notification_hub::scene::WindowConfig;
using notification_hub::scene::CardPart;
using notification_hub::scene::close_button_bounds;
using notification_hub::scene::point_inside_card;
using notification_hub::scene::valid_visual_style;
using notification_hub::scene::TickerChannelOptions;
using notification_hub::scene::TickerTrackPlan;
using notification_hub::scene::plan_ticker_tracks;
using notification_hub::scene::ticker_track_clearance;
using notification_hub::scene::choose_ticker_track;
using notification_hub::scene::ticker_entry_delay_ms;
using notification_hub::scene::ticker_position_x;
using notification_hub::scene::ticker_is_offscreen;
using notification_hub::scene::ticker_band_top_y;
using notification_hub::scene::ticker_track_y;

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
    if (!point_inside_card(10.0f, 10.0f, width, height)) return false;
    if (!point_inside_card(11.0f, 11.0f, width, height)) return false;
    if (point_inside_card(0.0f, 0.0f, width, height)) return false;

    const auto event = create_event(
        "interaction-self-test", "hit-test", "INTERACTION_HIT_TEST_OK", "info", true,
        "Card and transparent-region hit testing completed", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
}

bool visual_asset_self_test(std::string_view asset_path, std::string_view asset_sha256) {
#ifndef _WIN32
    static_cast<void>(asset_path);
    return false;
#else
    if (asset_path.empty()) return false;
    SceneWindow window(WindowConfig{L"Notification Hub PNG Self Test", L"PNG background", 420, 180, true});
    VisualStyle visual{};
    visual.specified = true;
    visual.background_asset_path = std::string(asset_path);
    visual.background_asset_sha256 = std::string(asset_sha256);
    visual.background_color = "#0e1916";
    window.update_visual(visual);
    if (!window.create() || !window.is_renderer_ready() || !window.show() || !window.paint(true)) return false;
    Pixel sample{};
    const bool sampled = window.capture_pixels() && window.sample_pixel(380, 150, sample);
    const bool image_visible = sampled && sample.red > 180 && sample.green < 100 && sample.blue < 100 && sample.alpha > 180;
    window.request_close();
    const auto pump_result = window.run_message_pump(false);
    if (!image_visible || pump_result != 0 || window.is_created()) {
        std::cerr << "png self-test sample=" << static_cast<int>(sample.red) << "," << static_cast<int>(sample.green) << "," << static_cast<int>(sample.blue) << "," << static_cast<int>(sample.alpha) << "\\n";
        return false;
    }
    return true;
#endif
}

bool root_wallpaper_self_test(std::string_view asset_path, std::string_view asset_sha256) {
#ifndef _WIN32
    static_cast<void>(asset_path);
    static_cast<void>(asset_sha256);
    return false;
#else
    if (asset_path.empty() || asset_sha256.empty()) return false;
    const auto red_visible = [](const Pixel& sample) {
        return sample.red > 180 && sample.green < 100 && sample.blue < 100 && sample.alpha > 180;
    };

    VisualStyle visual{};
    visual.specified = true;
    visual.enabled = true;
    visual.background_color = "#0044aa";
    visual.opacity = 1.0f;
    visual.paint_overflow = 0;

    std::vector<CardPart> rooted_parts{
        {"root", "block", "", 0, 0, 420, 180, 0, "#0044aa", "", 0},
    };
    rooted_parts[0].background_asset_path = std::string(asset_path);
    rooted_parts[0].background_asset_sha256 = std::string(asset_sha256);

    SceneWindow rooted(WindowConfig{
        L"Root Wallpaper Self Test",
        L"PNG background",
        420,
        180,
        true,
        0,
        0,
        false,
        visual,
        rooted_parts});
    if (!rooted.create() || !rooted.is_renderer_ready() || !rooted.show() || !rooted.paint(true)) return false;
    Pixel rooted_sample{};
    const bool rooted_sampled = rooted.capture_pixels() && rooted.sample_pixel(380, 150, rooted_sample);
    const bool rooted_red = rooted_sampled && red_visible(rooted_sample);
    rooted.request_close();
    const auto rooted_pump = rooted.run_message_pump(false);
    if (!rooted_red || rooted_pump != 0 || rooted.is_created()) {
        std::cerr << "root wallpaper self-test sample=" << static_cast<int>(rooted_sample.red) << "," << static_cast<int>(rooted_sample.green) << "," << static_cast<int>(rooted_sample.blue) << "," << static_cast<int>(rooted_sample.alpha) << "\n";
        return false;
    }

    VisualStyle fallback_visual = visual;
    fallback_visual.background_asset_path = std::string(asset_path);
    fallback_visual.background_asset_sha256 = std::string(asset_sha256);
    const std::vector<CardPart> fallback_parts{
        {"root", "block", "", 0, 0, 420, 180, 0, "#0044aa", "", 0},
    };
    SceneWindow fallback(WindowConfig{
        L"Root Wallpaper Fallback Self Test",
        L"PNG background",
        420,
        180,
        true,
        0,
        0,
        false,
        fallback_visual,
        fallback_parts});
    if (!fallback.create() || !fallback.is_renderer_ready() || !fallback.show() || !fallback.paint(true)) return false;
    Pixel fallback_sample{};
    const bool fallback_sampled = fallback.capture_pixels() && fallback.sample_pixel(380, 150, fallback_sample);
    const bool fallback_red = fallback_sampled && red_visible(fallback_sample);
    fallback.request_close();
    const auto fallback_pump = fallback.run_message_pump(false);
    if (!fallback_red || fallback_pump != 0 || fallback.is_created()) {
        std::cerr << "root wallpaper fallback sample=" << static_cast<int>(fallback_sample.red) << "," << static_cast<int>(fallback_sample.green) << "," << static_cast<int>(fallback_sample.blue) << "," << static_cast<int>(fallback_sample.alpha) << "\n";
        return false;
    }
    return true;
#endif
}

bool close_part_image_self_test(std::string_view asset_path, std::string_view asset_sha256) {
#ifndef _WIN32
    static_cast<void>(asset_path);
    static_cast<void>(asset_sha256);
    return false;
#else
    if (asset_path.empty() || asset_sha256.empty()) return false;
    const auto red_visible = [](const Pixel& sample) {
        return sample.red > 180 && sample.green < 100 && sample.blue < 100 && sample.alpha > 180;
    };
    const auto blue_plate = [](const Pixel& sample) {
        return sample.blue > sample.red + 40 && sample.red < 80 && sample.blue > 100 && sample.alpha > 180;
    };

    VisualStyle visual{};
    visual.specified = true;
    visual.enabled = true;
    visual.background_color = "#0044aa";
    visual.opacity = 1.0f;
    visual.paint_overflow = 0;
    visual.dismiss_mode = "closeButton";

    CardPart close{};
    close.id = "close";
    close.kind = "close";
    close.x = 200;
    close.y = 40;
    close.w = 80;
    close.h = 80;
    close.background_asset_path = std::string(asset_path);
    close.background_asset_sha256 = std::string(asset_sha256);
    close.close_icon = "none";

    const std::vector<CardPart> parts{
        {"root", "block", "", 0, 0, 320, 160, 0, "#0044aa", "", 0},
        close,
    };

    SceneWindow window(WindowConfig{
        L"Close Part Image Self Test",
        L"T",
        320,
        160,
        true,
        0,
        0,
        false,
        visual,
        parts});
    if (!window.create() || !window.is_renderer_ready() || !window.show() || !window.paint(true)) {
        std::cerr << "close part image create failed\n";
        return false;
    }
    Pixel plate{};
    Pixel close_center{};
    const bool sampled = window.capture_pixels()
        && window.sample_pixel(40, 80, plate)
        && window.sample_pixel(240, 80, close_center);
    const bool plate_is_blue = sampled && blue_plate(plate);
    const bool close_shows_image = sampled && red_visible(close_center);
    window.request_close();
    const auto pump = window.run_message_pump(false);
    if (!plate_is_blue || !close_shows_image || pump != 0 || window.is_created()) {
        std::cerr << "close part image samples: sampled=" << sampled
                  << " plate=" << static_cast<int>(plate.red) << ","
                  << static_cast<int>(plate.green) << ","
                  << static_cast<int>(plate.blue) << ","
                  << static_cast<int>(plate.alpha)
                  << " close=" << static_cast<int>(close_center.red) << ","
                  << static_cast<int>(close_center.green) << ","
                  << static_cast<int>(close_center.blue) << ","
                  << static_cast<int>(close_center.alpha) << "\n";
        return false;
    }
    return true;
#endif
}

bool visual_asset_opacity_self_test(std::string_view asset_path, std::string_view asset_sha256) {
#ifndef _WIN32
    static_cast<void>(asset_path); static_cast<void>(asset_sha256); return false;
#else
    if (asset_path.empty() || asset_sha256.empty()) return false;
    SceneWindow window(WindowConfig{L"Notification Hub Opacity Self Test", L"Opacity", 420, 180, true});
    VisualStyle visual{};
    visual.specified = true;
    visual.background_asset_path = std::string(asset_path);
    visual.background_asset_sha256 = std::string(asset_sha256);
    visual.background_color = "#0e1916";
    visual.opacity = 0.15f;
    window.update_visual(visual);
    if (!window.create() || !window.is_renderer_ready() || !window.show() || !window.paint(true)) return false;
    Pixel sample{};
    const bool sampled = window.capture_pixels() && window.sample_pixel(380, 150, sample);
    const bool wallpaper_still_there = sampled && sample.alpha > 80 && sample.red > 80
        && sample.red > sample.green + 40 && sample.red > sample.blue + 40;
    window.request_close();
    const auto pump_result = window.run_message_pump(false);
    if (!wallpaper_still_there || pump_result != 0 || window.is_created()) {
        std::cerr << "opacity self-test sample=" << static_cast<int>(sample.red) << "," << static_cast<int>(sample.green) << "," << static_cast<int>(sample.blue) << "," << static_cast<int>(sample.alpha) << "\n";
        return false;
    }
    return true;
#endif
}

bool visual_asset_fallback_self_test(std::string_view asset_path) {
#ifndef _WIN32
    static_cast<void>(asset_path);
    return false;
#else
    if (asset_path.empty()) return false;
    SceneWindow window(WindowConfig{L"Notification Hub PNG Fallback Self Test", L"Fallback", 420, 180, true});
    VisualStyle visual{};
    visual.specified = true;
    visual.background_asset_path = std::string(asset_path);
    visual.background_asset_sha256 = "a2f1fd24269194c781385faedf255eead2ddc66f0a8200d04bdaa040d42e2a22";
    visual.background_color = "#123456";
    visual.opacity = 1.0f;
    window.update_visual(visual);
    if (!window.create() || !window.is_renderer_ready() || !window.show() || !window.paint(true)) return false;
    Pixel sample{};
    const bool sampled = window.capture_pixels() && window.sample_pixel(380, 150, sample);
    const bool color_fallback = sampled && sample.red >= 14 && sample.red <= 24
        && sample.green >= 44 && sample.green <= 60
        && sample.blue >= 76 && sample.blue <= 96 && sample.alpha > 180;
    window.request_close();
    const auto pump_result = window.run_message_pump(false);
    return color_fallback && pump_result == 0 && !window.is_created();
#endif
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
        && window.sample_pixel(2, 90, accent)
        && window.sample_pixel(close_x, close_y, close_background);
    const bool transparent_corner = sampled && pixels_captured && transparent.alpha <= 16;
    const bool opaque_surface = sampled && pixels_captured && surface.alpha >= 220 && surface.red < 80 && surface.green < 100;
    const bool visible_accent = sampled && pixels_captured && accent.alpha >= 220 && accent.red < 80 && accent.green < 100;
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

bool zero_opacity_hit_self_test() {
#ifndef _WIN32
    std::cerr << "INTERACTION_UNSUPPORTED: Zero-opacity hit testing requires Windows\n";
    return false;
#else
    VisualStyle visual{};
    visual.specified = true;
    visual.enabled = true;
    visual.background_color = "#cc2020";
    visual.opacity = 0.0f;
    visual.border_radius = 0;
    visual.paint_overflow = 0;

    SceneWindow window(WindowConfig{
        L"Notification Hub Zero Opacity Hit Self Test",
        L"Clear",
        420,
        180,
        true,
        0,
        0,
        false,
        visual});
    if (!window.create() || !window.is_renderer_ready() || !window.show() || !window.paint(true)) {
        std::cerr << "zero opacity create failed\n";
        return false;
    }

    Pixel center{};
    Pixel corner{};
    const bool sampled = window.capture_pixels()
        && window.sample_pixel(210, 90, center)
        && window.sample_pixel(0, 0, corner);
    const bool plate_clear = sampled && center.red <= 8 && center.green <= 8 && center.blue <= 8
        && center.alpha >= 1 && center.alpha <= 2;
    const bool corner_clear = sampled && corner.alpha == 0;
    const bool geometry_hit = window.hit_test_client_point(210.0f, 90.0f)
        && !window.hit_test_client_point(0.0f, 0.0f);

    const auto hwnd = static_cast<HWND>(window.native_handle());
    const int virtual_left = GetSystemMetrics(SM_XVIRTUALSCREEN);
    const int virtual_top = GetSystemMetrics(SM_YVIRTUALSCREEN);
    const int virtual_width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    const int virtual_height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    const POINT candidates[] = {
        {virtual_left + 32, virtual_top + 32},
        {virtual_left + virtual_width - 452, virtual_top + 32},
        {virtual_left + 32, virtual_top + virtual_height - 212},
        {virtual_left + virtual_width - 452, virtual_top + virtual_height - 212},
        {virtual_left + (virtual_width - 420) / 2, virtual_top + (virtual_height - 180) / 2}
    };
    bool card_owned = false;
    bool corner_transparent = false;
    for (const auto& candidate : candidates) {
        if (SetWindowPos(
                hwnd,
                nullptr,
                candidate.x,
                candidate.y,
                0,
                0,
                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW) == FALSE) continue;
        if (!window.paint()) continue;
        POINT origin{0, 0};
        if (ClientToScreen(hwnd, &origin) == FALSE) continue;
        const auto center_point = POINT{origin.x + 210, origin.y + 90};
        const auto corner_point = POINT{origin.x, origin.y};
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(500);
        do {
            card_owned = WindowFromPoint(center_point) == hwnd;
            corner_transparent = WindowFromPoint(corner_point) != hwnd;
            if (card_owned && corner_transparent) break;
            Sleep(10);
        } while (std::chrono::steady_clock::now() < deadline);
        if (card_owned && corner_transparent) break;
    }

    window.request_close();
    const auto pump_result = window.run_message_pump(false);
    if (!plate_clear || !corner_clear || !geometry_hit || !card_owned || !corner_transparent
        || pump_result != 0 || window.is_created()) {
        std::cerr << "zero opacity hit: sampled=" << sampled
                  << " plateClear=" << plate_clear
                  << " cornerClear=" << corner_clear
                  << " geometryHit=" << geometry_hit
                  << " cardOwned=" << card_owned
                  << " cornerTransparent=" << corner_transparent
                  << " center=" << static_cast<int>(center.red) << ","
                  << static_cast<int>(center.green) << ","
                  << static_cast<int>(center.blue) << ","
                  << static_cast<int>(center.alpha) << "\n";
        return false;
    }
    return true;
#endif
}

bool part_height_self_test() {
#ifndef _WIN32
    std::cerr << "RENDERER_UNSUPPORTED: Part height sampling requires Windows\n";
    return false;
#else
    VisualStyle visual{};
    visual.specified = true;
    visual.enabled = true;
    visual.background_color = "#cc2020";
    visual.opacity = 1.0f;
    visual.border_radius = 0;
    visual.paint_overflow = 0;
    visual.dismiss_mode = "anywhere";

    CardPart band{};
    band.id = "band";
    band.kind = "block";
    band.x = 0;
    band.y = 0;
    band.w = 80;
    band.h = 30;
    band.fill = "#20cc40";
    band.background = "#20cc40";
    band.radius_specified = true;
    band.radius = 0;

    SceneWindow window(WindowConfig{
        L"Notification Hub Part Height Self Test",
        L"H",
        160,
        30,
        true,
        0,
        0,
        false,
        visual,
        {band}});
    if (!window.create() || !window.is_renderer_ready() || !window.show() || !window.paint(true)) {
        std::cerr << "part height create failed\n";
        return false;
    }

    const auto is_red = [](const Pixel& sample) {
        return sample.alpha > 180 && sample.red > 160 && sample.red > sample.green + 40 && sample.red > sample.blue + 40;
    };
    const auto is_green = [](const Pixel& sample) {
        return sample.alpha > 180 && sample.green > 160 && sample.green > sample.red + 40 && sample.green > sample.blue + 40;
    };

    Pixel part_top{};
    Pixel part_mid{};
    Pixel part_bottom{};
    Pixel plate_top{};
    Pixel plate_mid{};
    Pixel plate_bottom{};
    const bool sampled = window.capture_pixels()
        && window.sample_pixel(40, 1, part_top)
        && window.sample_pixel(40, 15, part_mid)
        && window.sample_pixel(40, 28, part_bottom)
        && window.sample_pixel(120, 1, plate_top)
        && window.sample_pixel(120, 15, plate_mid)
        && window.sample_pixel(120, 28, plate_bottom);
    const bool part_spans = sampled && is_green(part_top) && is_green(part_mid) && is_green(part_bottom);
    const bool plate_spans = sampled && is_red(plate_top) && is_red(plate_mid) && is_red(plate_bottom);

    window.request_close();
    const auto pump_result = window.run_message_pump(false);
    if (!part_spans || !plate_spans || pump_result != 0 || window.is_created()) {
        std::cerr << "part height samples: sampled=" << sampled
                  << " partTop=" << static_cast<int>(part_top.red) << ","
                  << static_cast<int>(part_top.green) << ","
                  << static_cast<int>(part_top.blue) << ","
                  << static_cast<int>(part_top.alpha)
                  << " partBottom=" << static_cast<int>(part_bottom.red) << ","
                  << static_cast<int>(part_bottom.green) << ","
                  << static_cast<int>(part_bottom.blue) << ","
                  << static_cast<int>(part_bottom.alpha)
                  << " plateTop=" << static_cast<int>(plate_top.red) << ","
                  << static_cast<int>(plate_top.green) << ","
                  << static_cast<int>(plate_top.blue) << ","
                  << static_cast<int>(plate_top.alpha)
                  << " plateBottom=" << static_cast<int>(plate_bottom.red) << ","
                  << static_cast<int>(plate_bottom.green) << ","
                  << static_cast<int>(plate_bottom.blue) << ","
                  << static_cast<int>(plate_bottom.alpha) << "\n";
        return false;
    }
    return true;
#endif
}

bool work_area_self_test() {
    const auto fallback = fallback_work_area(1920, 1080, 1.0f);
    if (!valid_work_area(fallback)
        || fallback.rect.left != 0
        || fallback.rect.top != 0
        || fallback.rect.width != 1920
        || fallback.rect.height != 1080
        || !fallback.is_fallback
        || fallback.source != "virtual-screen-fallback") return false;

    if (valid_work_area(fallback_work_area(0, 1080, 1.0f))
        || valid_work_area(fallback_work_area(1920, -1, 1.0f))
        || valid_work_area(fallback_work_area(1920, 1080, 0.0f))) return false;

    const auto invalid_nan = fallback_work_area(1920, 1080, std::numeric_limits<float>::quiet_NaN());
    if (valid_work_area(invalid_nan)) return false;

#ifdef _WIN32
    const auto primary = query_primary_work_area();
    if (!valid_work_area(primary) || primary.dpi_scale <= 0.0f) return false;
#endif

    const auto event = create_event(
        "work-area-self-test", "snapshot-validated", "WORK_AREA_PROVIDER_OK", "info", true,
        "Display work area snapshot validation completed", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
}

bool layout_self_test() {
    const std::vector<StackCardInput> cards{
        {"a", 100, 40},
        {"b", 120, 60},
        {"c", 80, 30},
    };
    const StackLayoutOptions options{
        StackDirection::Down,
        StackAnchor::TopRight,
        10,
        500,
        300,
        1.0f,
    };
    const auto result = layout_stack(cards, options);
    if (!result.ok || result.placements.size() != 3
        || result.placements[0].x != 400 || result.placements[0].y != 0
        || result.placements[1].x != 380 || result.placements[1].y != 50
        || result.placements[2].x != 420 || result.placements[2].y != 120) {
        std::cerr << "stack layout placement failed\n";
        return false;
    }

    const auto flush = layout_stack(
        {{ "a", 100, 40 }, { "b", 100, 40 }},
        StackLayoutOptions{StackDirection::Down, StackAnchor::TopLeft, 0, 500, 300, 1.0f});
    if (!flush.ok || flush.placements.size() != 2
        || flush.placements[0].y != 0 || flush.placements[1].y != 40) {
        std::cerr << "stack layout gap 0 failed\n";
        return false;
    }

    const auto too_large = layout_stack(
        {{"large", 600, 40}},
        StackLayoutOptions{StackDirection::Down, StackAnchor::TopLeft, 0, 500, 300, 1.0f});
    if (too_large.ok || too_large.code != "LAYOUT_CARD_OUT_OF_BOUNDS"
        || too_large.failing_card_id != "large") return false;

    StackLayoutOptions wrap_options;
    wrap_options.direction = StackDirection::Down;
    wrap_options.anchor = StackAnchor::BottomRight;
    wrap_options.spacing = 0;
    wrap_options.work_area_width = 200;
    wrap_options.work_area_height = 80;
    wrap_options.dpi_scale = 1.0f;
    const auto wrapped = layout_stack(
        {{ "a", 80, 40 }, { "b", 80, 40 }, { "c", 80, 40 }},
        wrap_options);
    if (!wrapped.ok || wrapped.placements.size() != 3
        || wrapped.placements[0].id != "b" || wrapped.placements[0].x != 120 || wrapped.placements[0].y != 0
        || wrapped.placements[1].id != "c" || wrapped.placements[1].x != 120 || wrapped.placements[1].y != 40
        || wrapped.placements[2].id != "a" || wrapped.placements[2].x != 40 || wrapped.placements[2].y != 40) {
        std::cerr << "stack layout wrap failed\n";
        return false;
    }

    StackLayoutOptions grow_left_options;
    grow_left_options.direction = StackDirection::Right;
    grow_left_options.anchor = StackAnchor::BottomRight;
    grow_left_options.spacing = 0;
    grow_left_options.work_area_width = 200;
    grow_left_options.work_area_height = 80;
    grow_left_options.dpi_scale = 1.0f;
    const auto grow_left = layout_stack(
        {{ "old", 80, 40 }, { "new", 80, 40 }},
        grow_left_options);
    if (!grow_left.ok || grow_left.placements.size() != 2
        || grow_left.placements[0].id != "old" || grow_left.placements[0].x != 40 || grow_left.placements[0].y != 40
        || grow_left.placements[1].id != "new" || grow_left.placements[1].x != 120 || grow_left.placements[1].y != 40) {
        std::cerr << "stack layout grow left failed\n";
        return false;
    }

    StackLayoutOptions wrap_off_options = wrap_options;
    wrap_off_options.wrap = StackWrap::Off;
    const auto wrap_off = layout_stack(
        {{ "a", 80, 40 }, { "b", 80, 40 }, { "c", 80, 40 }},
        wrap_off_options);
    if (wrap_off.ok || wrap_off.code != "LAYOUT_CARD_OUT_OF_BOUNDS") {
        std::cerr << "stack layout wrap off failed\n";
        return false;
    }

    StackLayoutOptions snake_options;
    snake_options.direction = StackDirection::Right;
    snake_options.anchor = StackAnchor::TopLeft;
    snake_options.spacing = 0;
    snake_options.work_area_width = 320;
    snake_options.work_area_height = 80;
    snake_options.dpi_scale = 1.0f;
    snake_options.wrap = StackWrap::Snake;
    const auto snaked = layout_stack(
        {{ "1", 80, 40 }, { "2", 80, 40 }, { "3", 80, 40 }, { "4", 80, 40 },
         { "5", 80, 40 }, { "6", 80, 40 }, { "7", 80, 40 }, { "8", 80, 40 }},
        snake_options);
    if (!snaked.ok || snaked.placements.size() != 8
        || snaked.placements[0].id != "1" || snaked.placements[0].x != 0 || snaked.placements[0].y != 0
        || snaked.placements[3].id != "4" || snaked.placements[3].x != 240 || snaked.placements[3].y != 0
        || snaked.placements[4].id != "5" || snaked.placements[4].x != 240 || snaked.placements[4].y != 40
        || snaked.placements[7].id != "8" || snaked.placements[7].x != 0 || snaked.placements[7].y != 40) {
        std::cerr << "stack layout snake failed\n";
        return false;
    }

    const auto snake_hole = layout_stack(
        {{ "2", 80, 40 }, { "3", 80, 40 }, { "4", 80, 40 }, { "5", 80, 40 },
         { "6", 80, 40 }, { "7", 80, 40 }, { "8", 80, 40 }},
        snake_options);
    if (!snake_hole.ok || snake_hole.placements.size() != 7
        || snake_hole.placements[0].id != "2" || snake_hole.placements[0].x != 0
        || snake_hole.placements[3].id != "5" || snake_hole.placements[3].x != 240
        || snake_hole.placements[4].id != "6" || snake_hole.placements[4].x != 240 || snake_hole.placements[4].y != 40
        || snake_hole.placements[6].id != "8" || snake_hole.placements[6].x != 80 || snake_hole.placements[6].y != 40) {
        std::cerr << "stack layout snake hole failed\n";
        return false;
    }

    StackLayoutOptions snake_mixed_options = snake_options;
    snake_mixed_options.work_area_width = 200;
    const auto snake_mixed = layout_stack(
        {{ "1", 80, 40 }, { "2", 40, 30 }, { "3", 40, 30 }, { "4", 80, 40 }, { "5", 40, 30 }},
        snake_mixed_options);
    if (!snake_mixed.ok || snake_mixed.placements.size() != 5
        || snake_mixed.placements[0].x != 0 || snake_mixed.placements[0].y != 0
        || snake_mixed.placements[2].x != 120 || snake_mixed.placements[2].y != 0
        || snake_mixed.placements[3].id != "4" || snake_mixed.placements[3].x != 120 || snake_mixed.placements[3].y != 40
        || snake_mixed.placements[4].id != "5" || snake_mixed.placements[4].x != 80 || snake_mixed.placements[4].y != 40) {
        std::cerr << "stack layout snake mixed failed\n";
        return false;
    }

    const auto invalid_dpi = layout_stack(
        {}, StackLayoutOptions{StackDirection::Down, StackAnchor::TopLeft, 0, 500, 300, 0.0f});
    if (invalid_dpi.ok || invalid_dpi.code != "LAYOUT_DPI_INVALID") return false;

    const auto physical_geometry = layout_stack(
        {{"physical", 100, 40}},
        StackLayoutOptions{StackDirection::Down, StackAnchor::TopRight, 8, 500, 300, 1.25f});
    if (!physical_geometry.ok || physical_geometry.placements.size() != 1
        || physical_geometry.placements[0].x != 400 || physical_geometry.placements[0].y != 0
        || physical_geometry.placements[0].width != 100 || physical_geometry.placements[0].height != 40) return false;

    const auto empty = layout_stack(
        {}, StackLayoutOptions{StackDirection::Down, StackAnchor::TopLeft, 0, 500, 300, 1.0f});
    if (!empty.ok || !empty.placements.empty()) return false;

    const auto shelf_top = layout_shelf(
        {{"a", 100, 40}, {"b", 120, 60}},
        StackLayoutOptions{StackDirection::Right, StackAnchor::TopLeft, 10, 500, 300, 1.0f});
    if (!shelf_top.ok || shelf_top.placements.size() != 2
        || shelf_top.placements[0].x != 0 || shelf_top.placements[0].y != 0
        || shelf_top.placements[1].x != 110 || shelf_top.placements[1].y != 0) return false;

    const auto shelf_bottom = layout_shelf(
        {{"a", 100, 40}, {"b", 120, 60}},
        StackLayoutOptions{StackDirection::Left, StackAnchor::BottomRight, 10, 500, 300, 1.0f});
    if (!shelf_bottom.ok || shelf_bottom.placements.size() != 2
        || shelf_bottom.placements[0].x != 400 || shelf_bottom.placements[0].y != 260
        || shelf_bottom.placements[1].x != 270 || shelf_bottom.placements[1].y != 240) return false;

    const auto shelf_invalid_direction = layout_shelf(
        {{"a", 100, 40}},
        StackLayoutOptions{StackDirection::Down, StackAnchor::TopLeft, 0, 500, 300, 1.0f});
    if (shelf_invalid_direction.ok || shelf_invalid_direction.code != "LAYOUT_SHELF_DIRECTION_INVALID") return false;

    const auto shelf_too_large = layout_shelf(
        {{"large", 600, 40}},
        StackLayoutOptions{StackDirection::Right, StackAnchor::TopLeft, 0, 500, 300, 1.0f});
    if (shelf_too_large.ok || shelf_too_large.code != "LAYOUT_SHELF_OUT_OF_BOUNDS") return false;

    const auto shelf_origin = layout_shelf(
        {{"origin", 100, 40}},
        StackLayoutOptions{StackDirection::Right, StackAnchor::TopLeft, 0, 500, 300, 1.0f, 40, 50});
    if (!shelf_origin.ok || shelf_origin.placements[0].x != 40 || shelf_origin.placements[0].y != 50) return false;

    StackLayoutOptions inset_options;
    inset_options.direction = StackDirection::Down;
    inset_options.anchor = StackAnchor::TopRight;
    inset_options.work_area_width = 500;
    inset_options.work_area_height = 300;
    inset_options.dpi_scale = 1.0f;
    inset_options.margin_left = 18;
    inset_options.margin_right = 18;
    inset_options.margin_top = 18;
    inset_options.margin_bottom = 18;
    const auto inset = layout_stack({{"inset", 100, 40}}, inset_options);
    if (!inset.ok || inset.placements.size() != 1
        || inset.placements[0].x != 382 || inset.placements[0].y != 18) {
        std::cerr << "stack layout inset failed\n";
        return false;
    }

    const auto event = create_event(
        "layout-self-test", "layout-planned", "LAYOUT_STACK_SHELF_OK", "info", true,
        "Deterministic stack and shelf layout calculation completed", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
}

// Ticker 行为纯逻辑自检（契约 §2.1 / §2.3 / §4 / §8）。
// 不创建窗口：位置、选轨、出屏判定都是纯函数，因此可在无显示器环境下判定。
bool ticker_self_test() {
    // §2.3 轨道几何：契约里的 1080 屏算例 —— band 28% = 302，卡高 76 + 8 = 84，得 3 条。
    const auto band_height = 302;
    const auto plan = plan_ticker_tracks(band_height, 76, 8, 0);
    if (plan.track_height_px != 84 || plan.track_count != 3) {
        std::cerr << "ticker track plan mismatch: height=" << plan.track_height_px
                  << " count=" << plan.track_count << "\n";
        return false;
    }
    // 显式配置名实一致：填 10 就是 10，不按 28% 带子裁成 3。
    if (plan_ticker_tracks(band_height, 76, 8, 2).track_count != 2) return false;
    if (plan_ticker_tracks(band_height, 76, 8, 10).track_count != 10) return false;
    if (plan_ticker_tracks(10, 76, 8, 0).track_count != 1) return false;
    // 不设上限：band 拉满时条数随高度增长，不裁到 4。
    if (plan_ticker_tracks(1080, 76, 8, 0).track_count != 12) {
        std::cerr << "ticker track plan must scale past 4 tracks when band is full\n";
        return false;
    }
    // 显式条数时 band 是从动：10 条照收，3 条把带子缩到 needed，贴底不留满屏空带。
    {
        const int work_h = 1080;
        auto plan10 = plan_ticker_tracks(work_h, 76, 8, 10);
        const auto max10 = (work_h + plan10.track_gap_px) / plan10.track_height_px;
        if (plan10.track_count > max10) plan10.track_count = max10;
        if (plan10.track_count != 10) return false;
        const auto needed10 = plan10.track_count * plan10.track_height_px - plan10.track_gap_px;
        if (needed10 != 832) return false;
        auto plan3 = plan_ticker_tracks(work_h, 76, 8, 3);
        const auto needed3 = plan3.track_count * plan3.track_height_px - plan3.track_gap_px;
        if (plan3.track_count != 3 || needed3 != 244) return false;
        if (ticker_band_top_y(false, 0, work_h, needed3) != 836) return false;
        if (ticker_band_top_y(false, 0, work_h, work_h) != 0) return false;
    }

    // §4 净空：无前车记 +∞（一定优先）；有前车 clearance = lane_right - prev_right - min_gap。
    const auto clear_empty = ticker_track_clearance(false, 0.0, 1920, 64);
    if (!(clear_empty > 1e9)) return false;
    if (ticker_track_clearance(true, 1800.0, 1920, 64) != 56.0) return false;

    // §4 选轨：净空最大者；并列取最小 index。
    if (choose_ticker_track({56.0, clear_empty, 100.0}) != 1) return false;
    if (choose_ticker_track({10.0, 10.0, 9.0}) != 0) return false;
    if (choose_ticker_track({}) != -1) return false;

    // §4.3 延迟进屏：全占时按 (-clearance)/speed 延迟，不换道、不叠放。
    if (ticker_entry_delay_ms(-320.0, 400.0) != 800.0) return false;
    if (ticker_entry_delay_ms(0.0, 400.0) != 0.0) return false;
    if (ticker_entry_delay_ms(-320.0, 0.0) != 0.0) return false;

    // §2.1 位置是时间的纯函数：400 px/s 走 1 秒 = 左移 400。三参数保持左飞。
    if (ticker_position_x(1920.0, 400.0, 1000.0) != 1520.0) return false;
    if (ticker_position_x(1920.0, 400.0, 0.0) != 1920.0) return false;
    // 同一时刻无论分几拍推进，结果必须一致（禁止逐帧累加导致漂移）。
    const auto once = ticker_position_x(1920.0, 400.0, 250.0);
    if (once != ticker_position_x(1920.0, 400.0, 250.0)) return false;

    // 右飞：x = spawn + speed × t；spawn 在 lane 左侧屏外。
    const auto spawn_right_x = 0.0 - 480.0;
    if (ticker_position_x(spawn_right_x, 400.0, 1000.0, true) != -80.0) return false;
    if (ticker_position_x(spawn_right_x, 400.0, 0.0, true) != spawn_right_x) return false;
    const auto right_once = ticker_position_x(spawn_right_x, 400.0, 250.0, true);
    if (right_once != ticker_position_x(spawn_right_x, 400.0, 250.0, true)) return false;

    // 右飞净空：ahead.left - lane_left - minGap。
    const auto lane_left_px = 0;
    const auto ahead_left = 200.0;
    if (ticker_track_clearance(true, ahead_left, lane_left_px, 64, true) != 136.0) return false;

    // §8 出屏判定含 24px 缓冲：右侧边缘必须越过 lane 左边再退 24px 才算离开。
    if (ticker_is_offscreen(100.0, 120, 24)) return false;  // 100 < 96 为假
    if (!ticker_is_offscreen(95.0, 120, 24)) return false;  // 95 < 96 为真
    // 右飞出屏：card.left > lane.right + 24。
    const auto lane_right_px = 1920;
    const auto card_left_on_edge = 1944.0;
    const auto card_left_past = 1945.0;
    if (ticker_is_offscreen(card_left_on_edge, lane_right_px, 24, true)) return false;
    if (!ticker_is_offscreen(card_left_past, lane_right_px, 24, true)) return false;

    // §2.3 band 贴顶/贴底与轨道 y。
    if (ticker_band_top_y(true, 0, 1080, 302) != 0) return false;
    if (ticker_band_top_y(false, 0, 1080, 302) != 778) return false;
    if (ticker_track_y(100, 2, plan) != 268) return false;

    // Native 侧校验：合法默认值通过、越界值被拒、条数不设上限。
    VisualStyle ticker_style{};
    ticker_style.specified = true;
    ticker_style.ticker_specified = true;
    if (!valid_visual_style(ticker_style)) {
        std::cerr << "default ticker visual style must be valid\n";
        return false;
    }
    auto bad_speed = ticker_style;
    bad_speed.ticker_speed_px_per_second = 100;
    if (valid_visual_style(bad_speed)) {
        std::cerr << "out-of-range ticker speed must be rejected\n";
        return false;
    }
    auto bad_band = ticker_style;
    bad_band.ticker_band = "middle";
    if (valid_visual_style(bad_band)) {
        std::cerr << "unknown ticker band must be rejected\n";
        return false;
    }
    auto many_tracks = ticker_style;
    many_tracks.ticker_track_count = 999;
    if (!valid_visual_style(many_tracks)) {
        std::cerr << "ticker track count must have no upper limit\n";
        return false;
    }
    auto fly_right_style = ticker_style;
    fly_right_style.ticker_direction = "right";
    if (!valid_visual_style(fly_right_style)) {
        std::cerr << "ticker direction right must be valid\n";
        return false;
    }
    auto bad_direction = ticker_style;
    bad_direction.ticker_direction = "up";
    if (valid_visual_style(bad_direction)) {
        std::cerr << "unknown ticker direction must be rejected\n";
        return false;
    }

    const auto event = create_event(
        "ticker-self-test", "ticker-planned", "TICKER_MOTION_CONTRACT_OK", "info", true,
        "Deterministic ticker track, clearance, position and offscreen calculation completed",
        std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
}

bool overflow_origin_self_test() {
#ifndef _WIN32
    return true;
#else
    int recovered_x = 88;
    int recovered_y = 188;
    notification_hub::scene::paint_origin_to_hit_origin(recovered_x, recovered_y, 12);
    if (recovered_x != 100 || recovered_y != 200) {
        std::cerr << "paint origin to hit origin helper drifted\n";
        return false;
    }
    const auto paint = notification_hub::scene::paint_box_from_hit_box(100, 200, 320, 160, 12);
    if (paint.x != 88 || paint.y != 188 || paint.width != 344 || paint.height != 184) {
        std::cerr << "hit box to paint box helper drifted\n";
        return false;
    }

    RuntimeSceneController controller;
    VisualStyle visual{};
    visual.specified = true;
    visual.enabled = true;
    SceneCardState card{
        "overflow-origin-card",
        "Overflow origin",
        "Hit-box must stay put",
        "",
        SceneWindowState{100, 200, 320, 160},
        320,
        160,
        visual};
    std::string error_code;
    std::string error_message;
    if (!controller.create_card(card, error_code, error_message)) {
        std::cerr << "overflow origin create failed: " << error_code << " " << error_message << "\n";
        return false;
    }
    controller.pump_messages();

    auto snapshot = controller.cards_json();
    if (snapshot.find("\"x\":100") == std::string::npos
        || snapshot.find("\"y\":200") == std::string::npos) {
        std::cerr << "overflow origin create snapshot drifted: " << snapshot << "\n";
        return false;
    }

    auto hwnd = FindWindowW(L"NotificationHubVNextSceneWindow", L"Overflow origin");
    RECT bounds{};
    if (hwnd == nullptr || GetWindowRect(hwnd, &bounds) == FALSE
        || bounds.left != 100 || bounds.top != 200
        || bounds.right - bounds.left != 320 || bounds.bottom - bounds.top != 160) {
        std::cerr << "overflow=0 HWND is not the hit-box: "
                  << bounds.left << "," << bounds.top << " "
                  << (bounds.right - bounds.left) << "x" << (bounds.bottom - bounds.top) << "\n";
        controller.dismiss_card("overflow-origin-card", error_code, error_message);
        return false;
    }

    card.visual.paint_overflow = 12;
    if (!controller.update_card(card, error_code, error_message)) {
        std::cerr << "overflow origin update 12 failed: " << error_code << " " << error_message << "\n";
        return false;
    }
    controller.pump_messages();
    snapshot = controller.cards_json();
    if (snapshot.find("\"x\":100") == std::string::npos
        || snapshot.find("\"y\":200") == std::string::npos) {
        std::cerr << "overflow=12 snapshot drifted: " << snapshot << "\n";
        controller.dismiss_card("overflow-origin-card", error_code, error_message);
        return false;
    }
    if (GetWindowRect(hwnd, &bounds) == FALSE
        || bounds.left != 88 || bounds.top != 188
        || bounds.right - bounds.left != 344 || bounds.bottom - bounds.top != 184) {
        std::cerr << "overflow=12 HWND is not the paint-box: "
                  << bounds.left << "," << bounds.top << " "
                  << (bounds.right - bounds.left) << "x" << (bounds.bottom - bounds.top) << "\n";
        controller.dismiss_card("overflow-origin-card", error_code, error_message);
        return false;
    }

    card.visual.paint_overflow = 24;
    if (!controller.update_card(card, error_code, error_message)) {
        std::cerr << "overflow origin update 24 failed: " << error_code << " " << error_message << "\n";
        controller.dismiss_card("overflow-origin-card", error_code, error_message);
        return false;
    }
    controller.pump_messages();
    snapshot = controller.cards_json();
    if (snapshot.find("\"x\":100") == std::string::npos
        || snapshot.find("\"y\":200") == std::string::npos) {
        std::cerr << "overflow=24 snapshot drifted: " << snapshot << "\n";
        controller.dismiss_card("overflow-origin-card", error_code, error_message);
        return false;
    }
    if (GetWindowRect(hwnd, &bounds) == FALSE
        || bounds.left != 76 || bounds.top != 176
        || bounds.right - bounds.left != 368 || bounds.bottom - bounds.top != 208) {
        std::cerr << "overflow=24 HWND is not the paint-box: "
                  << bounds.left << "," << bounds.top << " "
                  << (bounds.right - bounds.left) << "x" << (bounds.bottom - bounds.top) << "\n";
        controller.dismiss_card("overflow-origin-card", error_code, error_message);
        return false;
    }

    if (!controller.dismiss_card("overflow-origin-card", error_code, error_message)) {
        std::cerr << "overflow origin dismiss failed: " << error_code << " " << error_message << "\n";
        return false;
    }
    return true;
#endif
}

bool pointer_dismiss_after_drag_self_test() {
#ifndef _WIN32
    return true;
#else
    auto make_card = [](const wchar_t* title) {
        WindowConfig config;
        config.title = title;
        config.body = L"Close must survive drag";
        config.width = 320;
        config.height = 160;
        config.x = 100;
        config.y = 200;
        config.has_initial_position = true;
        config.visual.specified = true;
        config.visual.enabled = true;
        config.visual.dismiss_mode = "closeButton";
        config.visual.paint_overflow = 12;
        return config;
    };
    const auto close_bounds = close_button_bounds(320.0f, 160.0f);
    const auto close_client_x = static_cast<int>(close_bounds.left + (close_bounds.right - close_bounds.left) / 2.0f) + 12;
    const auto close_client_y = static_cast<int>(close_bounds.top + (close_bounds.bottom - close_bounds.top) / 2.0f) + 12;
    const auto close_lparam = MAKELPARAM(close_client_x, close_client_y);

    SceneWindow dragged(make_card(L"Pointer dismiss after drag"));
    if (!dragged.create() || !dragged.show() || !dragged.paint()) {
        std::cerr << "pointer dismiss after drag create failed\n";
        return false;
    }
    int hwnd_x = 0;
    int hwnd_y = 0;
    int present_x = 0;
    int present_y = 0;
    if (!dragged.get_window_position(hwnd_x, hwnd_y)
        || !dragged.layered_present_origin(present_x, present_y)
        || hwnd_x != present_x || hwnd_y != present_y) {
        std::cerr << "pointer dismiss initial layered origin mismatch hwnd="
                  << hwnd_x << "," << hwnd_y << " present=" << present_x << "," << present_y << "\n";
        return false;
    }
    const auto hwnd = static_cast<HWND>(dragged.native_handle());
    SendMessageW(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, MAKELPARAM(80, 80));
    SendMessageW(hwnd, WM_MOUSEMOVE, MK_LBUTTON, MAKELPARAM(140, 110));
    SendMessageW(hwnd, WM_LBUTTONUP, 0, MAKELPARAM(140, 110));
    if (dragged.is_dragging()) {
        std::cerr << "pointer dismiss drag stayed active after mouse-up\n";
        return false;
    }
    if (!dragged.get_window_position(hwnd_x, hwnd_y)
        || !dragged.layered_present_origin(present_x, present_y)
        || hwnd_x != present_x || hwnd_y != present_y) {
        std::cerr << "pointer dismiss layered origin desynced after drag hwnd="
                  << hwnd_x << "," << hwnd_y << " present=" << present_x << "," << present_y << "\n";
        return false;
    }
    if (hwnd_x == 88 && hwnd_y == 188) {
        std::cerr << "pointer dismiss drag did not move the HWND\n";
        return false;
    }
    SendMessageW(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, close_lparam);
    SendMessageW(hwnd, WM_LBUTTONUP, 0, close_lparam);
    if (!dragged.is_close_requested() || dragged.close_reason() != "user-close") {
        std::cerr << "pointer dismiss close after drag failed reason=" << dragged.close_reason() << "\n";
        return false;
    }
    dragged.destroy();

    SceneWindow stale(make_card(L"Pointer dismiss stale drag"));
    if (!stale.create() || !stale.show() || !stale.paint()) {
        std::cerr << "pointer dismiss stale drag create failed\n";
        return false;
    }
    if (!stale.begin_drag_client_point(80.0f, 80.0f) || !stale.is_dragging()) {
        std::cerr << "pointer dismiss stale drag did not start\n";
        return false;
    }
    const auto stale_hwnd = static_cast<HWND>(stale.native_handle());
    SendMessageW(stale_hwnd, WM_LBUTTONDOWN, MK_LBUTTON, close_lparam);
    SendMessageW(stale_hwnd, WM_LBUTTONUP, 0, close_lparam);
    if (stale.is_dragging()) {
        std::cerr << "pointer dismiss stale drag stayed active through close click\n";
        return false;
    }
    if (!stale.is_close_requested() || stale.close_reason() != "user-close") {
        std::cerr << "pointer dismiss close after stale drag failed reason=" << stale.close_reason() << "\n";
        return false;
    }
    stale.destroy();
    return true;
#endif
}

bool ticker_text_fill_self_test() {
#ifndef _WIN32
    return true;
#else
    VisualStyle visual{};
    visual.specified = true;
    visual.enabled = true;
    visual.background_color = "#0e1916";
    visual.border_width = 0;
    visual.border_radius = 8;
    visual.opacity = 1.0f;
    visual.ticker_specified = true;

    const std::vector<CardPart> parts{
        {"root", "block", "", 0, 0, 480, 76, 0, "#0e1916", "", 0},
        {"title", "text", "title", 14, 8, 452, 60, 0, "#ff2244", "", 0},
    };

    SceneWindow window(WindowConfig{
        L"HHHHHHHHHHHHHHHHHHHH",
        L"",
        480,
        76,
        true,
        0,
        0,
        false,
        visual,
        parts});
    if (!window.create() || !window.is_renderer_ready() || !window.show() || !window.paint(true)) {
        std::cerr << "ticker text fill create failed\n";
        return false;
    }
    bool saw_red_text = false;
    Pixel sample{};
    const bool captured = window.capture_pixels();
    if (captured) {
        for (int y = 16; y <= 44 && !saw_red_text; y += 2) {
            for (int x = 20; x <= 220 && !saw_red_text; x += 2) {
                if (!window.sample_pixel(x, y, sample)) continue;
                if (sample.alpha >= 180 && sample.red > sample.green + 40
                    && sample.red > sample.blue + 40 && sample.red > 140) {
                    saw_red_text = true;
                }
            }
        }
    }
    window.request_close();
    const auto pump = window.run_message_pump(false);
    if (!saw_red_text || pump != 0) {
        std::cerr << "ticker text fill samples: captured=" << captured
                  << " last=" << static_cast<int>(sample.red) << ","
                  << static_cast<int>(sample.green) << ","
                  << static_cast<int>(sample.blue) << ","
                  << static_cast<int>(sample.alpha) << "\n";
        return false;
    }
    return true;
#endif
}

bool root_part_plate_self_test() {
#ifndef _WIN32
    return true;
#else
    VisualStyle visual{};
    visual.specified = true;
    visual.enabled = true;
    visual.background_color = "#ff0000";
    visual.border_width = 0;
    visual.border_radius = 16;
    visual.opacity = 1.0f;
    visual.paint_overflow = 0;

    const std::vector<CardPart> parts{
        {"root", "block", "", 0, 0, 320, 160, 0, "#0044aa", "", 0},
        {"title", "text", "title", 30, 24, 200, 34},
        {"body", "text", "body", 30, 62, 260, 76},
    };

    SceneWindow rooted(WindowConfig{
        L"Root Part Plate Self Test",
        L"T",
        320,
        160,
        true,
        0,
        0,
        false,
        visual,
        parts});
    if (!rooted.create() || !rooted.is_renderer_ready() || !rooted.show() || !rooted.paint(true)) {
        std::cerr << "root part plate create failed\n";
        return false;
    }
    Pixel center{};
    Pixel corner{};
    const bool sampled = rooted.capture_pixels()
        && rooted.sample_pixel(160, 80, center)
        && rooted.sample_pixel(1, 1, corner);
    const bool center_is_root_blue = sampled
        && center.blue > center.red + 40
        && center.red < 80
        && center.blue > 100;
    const bool corner_not_squared = sampled && corner.alpha <= 40;
    rooted.request_close();
    const auto rooted_pump = rooted.run_message_pump(false);
    if (!center_is_root_blue || !corner_not_squared || rooted_pump != 0) {
        std::cerr << "root plate samples: sampled=" << sampled
                  << " center=" << static_cast<int>(center.red) << ","
                  << static_cast<int>(center.green) << ","
                  << static_cast<int>(center.blue) << ","
                  << static_cast<int>(center.alpha)
                  << " corner=" << static_cast<int>(corner.red) << ","
                  << static_cast<int>(corner.green) << ","
                  << static_cast<int>(corner.blue) << ","
                  << static_cast<int>(corner.alpha) << "\n";
        return false;
    }

    SceneWindow fallback(WindowConfig{
        L"Root Part Plate Fallback Self Test",
        L"B",
        320,
        160,
        true,
        0,
        0,
        false,
        visual,
        {}});
    if (!fallback.create() || !fallback.is_renderer_ready() || !fallback.show() || !fallback.paint(true)) {
        std::cerr << "root part plate fallback create failed\n";
        return false;
    }
    Pixel fallback_center{};
    const bool fallback_sampled = fallback.capture_pixels() && fallback.sample_pixel(160, 80, fallback_center);
    const bool fallback_is_red = fallback_sampled
        && fallback_center.red > fallback_center.blue + 40
        && fallback_center.red > 100;
    fallback.request_close();
    const auto fallback_pump = fallback.run_message_pump(false);
    if (!fallback_is_red || fallback_pump != 0) {
        std::cerr << "root plate fallback: sampled=" << fallback_sampled
                  << " center=" << static_cast<int>(fallback_center.red) << ","
                  << static_cast<int>(fallback_center.green) << ","
                  << static_cast<int>(fallback_center.blue) << ","
                  << static_cast<int>(fallback_center.alpha) << "\n";
        return false;
    }
    return true;
#endif
}

bool fit_width_self_test() {
#ifndef _WIN32
    return true;
#else
    VisualStyle visual{};
    visual.specified = true;
    visual.enabled = true;
    visual.background_color = "#0e1916";
    visual.border_width = 0;
    visual.border_radius = 8;
    visual.opacity = 1.0f;

    CardPart title{"title", "text", "title", 20, 24, 320, 36, 0, "#f2fff9", "", 0};
    title.background = "#cc3333";
    title.opacity = 1.0f;
    title.fit_width = true;
    title.font_size = 20;
    const std::vector<CardPart> parts{
        {"root", "block", "", 0, 0, 400, 160, 0, "#0e1916", "", 0},
        title,
    };

    SceneWindow window(WindowConfig{
        L"Hi",
        L"body",
        400,
        160,
        true,
        0,
        0,
        false,
        visual,
        parts});
    if (!window.create() || !window.is_renderer_ready() || !window.show() || !window.paint(true)) {
        std::cerr << "fit-width self-test create failed\n";
        return false;
    }
    Pixel plate{};
    Pixel unused{};
    Pixel left_of_box{};
    const bool sampled = window.capture_pixels()
        && window.sample_pixel(28, 40, plate)
        && window.sample_pixel(260, 40, unused)
        && window.sample_pixel(16, 40, left_of_box);
    const bool plate_near = sampled && plate.alpha >= 180 && plate.red > plate.green + 40 && plate.red > 140;
    const bool far_is_surface = sampled && unused.red < 80 && unused.green < 90 && unused.blue < 90;
    const bool left_stays = sampled && left_of_box.red < 80 && left_of_box.green < 90 && left_of_box.blue < 90;
    window.request_close();
    const auto pump = window.run_message_pump(false);
    if (!plate_near || !far_is_surface || !left_stays || pump != 0) {
        std::cerr << "fit-width samples: sampled=" << sampled
                  << " plate=" << static_cast<int>(plate.red) << ","
                  << static_cast<int>(plate.green) << ","
                  << static_cast<int>(plate.blue) << ","
                  << static_cast<int>(plate.alpha)
                  << " unused=" << static_cast<int>(unused.red) << ","
                  << static_cast<int>(unused.green) << ","
                  << static_cast<int>(unused.blue) << ","
                  << static_cast<int>(unused.alpha)
                  << " left=" << static_cast<int>(left_of_box.red) << ","
                  << static_cast<int>(left_of_box.green) << ","
                  << static_cast<int>(left_of_box.blue) << "\n";
        return false;
    }

    CardPart shifted{"title", "text", "title", 20, 24, 320, 36, 0, "#f2fff9", "", 0};
    shifted.background = "#cc3333";
    shifted.opacity = 1.0f;
    shifted.fit_width = true;
    shifted.fit_compensate = true;
    shifted.font_size = 20;
    const std::vector<CardPart> compensated_parts{
        {"root", "block", "", 0, 0, 400, 160, 0, "#0e1916", "", 0},
        shifted,
    };
    SceneWindow compensated(WindowConfig{
        L"Hi",
        L"body",
        400,
        160,
        true,
        0,
        0,
        false,
        visual,
        compensated_parts});
    if (!compensated.create() || !compensated.is_renderer_ready() || !compensated.show() || !compensated.paint(true)) {
        std::cerr << "fit-width compensate create failed\n";
        return false;
    }
    Pixel grown{};
    Pixel still_far{};
    const bool grown_sampled = compensated.capture_pixels()
        && compensated.sample_pixel(18, 40, grown)
        && compensated.sample_pixel(260, 40, still_far);
    const bool plate_grew_left = grown_sampled && grown.alpha >= 180 && grown.red > grown.green + 40 && grown.red > 140;
    const bool compensated_far = grown_sampled && still_far.red < 80 && still_far.green < 90 && still_far.blue < 90;
    compensated.request_close();
    const auto compensated_pump = compensated.run_message_pump(false);
    if (!plate_grew_left || !compensated_far || compensated_pump != 0) {
        std::cerr << "fit-width compensate samples: sampled=" << grown_sampled
                  << " grown=" << static_cast<int>(grown.red) << ","
                  << static_cast<int>(grown.green) << ","
                  << static_cast<int>(grown.blue) << ","
                  << static_cast<int>(grown.alpha)
                  << " far=" << static_cast<int>(still_far.red) << ","
                  << static_cast<int>(still_far.green) << ","
                  << static_cast<int>(still_far.blue) << "\n";
        return false;
    }
    return true;
#endif
}

bool scene_controller_self_test() {
#ifndef _WIN32
    std::cerr << "SCENE_UNSUPPORTED: Runtime scene controller requires Windows\n";
    return false;
#else
    if (!overflow_origin_self_test()) return false;
    if (!pointer_dismiss_after_drag_self_test()) return false;
    if (!root_part_plate_self_test()) return false;
    if (!ticker_text_fill_self_test()) return false;
    RuntimeSceneController controller;
    const SceneWindowState requested{137, 83, 500, 220};
    std::string error_code;
    std::string error_message;
    if (!controller.apply_window_state(requested, error_code, error_message)) {
        std::cerr << "scene controller apply failed: " << error_code << " " << error_message << "\n";
        return false;
    }

    SceneWindowState actual{};
    const bool state_valid = controller.get_window_state(actual)
        && actual.x == requested.x
        && actual.y == requested.y
        && actual.width == requested.width
        && actual.height == requested.height;
    if (!state_valid) {
        const auto event = create_event(
            "scene-controller-self-test", "state-applied", "RUNTIME_SCENE_WINDOW_APPLY_FAILED", "error", false,
            "Runtime scene controller HWND state did not match requested geometry", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }

    const StackLayoutOptions restored_layout{
        StackDirection::Down,
        StackAnchor::TopLeft,
        20,
        1200,
        800,
        1.0f,
        0,
        0,
        false,
        "self-test",
        notification_hub::scene::LayoutMode::Stack};
    if (!controller.apply_stack_layout(restored_layout, error_code, error_message)) {
        std::cerr << "scene controller restored layout setup failed: " << error_code << " " << error_message << "\n";
        return false;
    }

    const SceneCardState card{
        "controller-card",
        "Controller Card",
        "Native controller interaction",
        "",
        SceneWindowState{700, 150, 320, 160},
        320,
        160};
    if (!controller.create_card(card, error_code, error_message)) {
        std::cerr << "scene controller card create failed: " << error_code << " " << error_message << "\n";
        return false;
    }

    const auto created_card_hwnd = FindWindowW(
        L"NotificationHubVNextSceneWindow",
        L"Controller Card");
    RECT created_card_rect{};
    const bool created_card_visible_at_target = created_card_hwnd != nullptr
        && IsWindowVisible(created_card_hwnd) != FALSE
        && GetWindowRect(created_card_hwnd, &created_card_rect) != FALSE
        && created_card_rect.left == 0
        && created_card_rect.top == 0
        && created_card_rect.right - created_card_rect.left == card.window.width
        && created_card_rect.bottom - created_card_rect.top == card.window.height;
    if (!created_card_visible_at_target) {
        std::cerr << "scene controller card was not first shown at its requested position: "
                  << created_card_rect.left << "," << created_card_rect.top << " "
                  << (created_card_rect.right - created_card_rect.left) << "x"
                  << (created_card_rect.bottom - created_card_rect.top) << "\n";
        return false;
    }

    const SceneCardState second_card{
        "controller-card-2",
        "Second Controller Card",
        "Reflow after dismiss",
        "",
        SceneWindowState{700, 330, 320, 160},
        320,
        160};
    if (!controller.create_card(second_card, error_code, error_message)) {
        std::cerr << "scene controller second card create failed: " << error_code << " " << error_message << "\n";
        return false;
    }
    const auto second_card_hwnd = FindWindowW(
        L"NotificationHubVNextSceneWindow",
        L"Second Controller Card");
    RECT second_card_rect{};
    const bool second_card_visible_at_target = second_card_hwnd != nullptr
        && IsWindowVisible(second_card_hwnd) != FALSE
        && GetWindowRect(second_card_hwnd, &second_card_rect) != FALSE
        && second_card_rect.left == 0
        && second_card_rect.top == 180
        && second_card_rect.right - second_card_rect.left == second_card.window.width
        && second_card_rect.bottom - second_card_rect.top == second_card.window.height;
    if (!second_card_visible_at_target) {
        std::cerr << "scene controller second card was not first shown at its final layout position: "
                  << second_card_rect.left << "," << second_card_rect.top << " "
                  << (second_card_rect.right - second_card_rect.left) << "x"
                  << (second_card_rect.bottom - second_card_rect.top) << "\n";
        return false;
    }
    const auto stacked_before_dismiss = controller.cards_json();
    if (stacked_before_dismiss.find("controller-card-2") == std::string::npos) {
        std::cerr << "scene controller second card was not stored before dismiss\n";
        return false;
    }
    const StackLayoutOptions reflow_layout{
        StackDirection::Down,
        StackAnchor::TopLeft,
        20,
        1200,
        800,
        1.0f,
        0,
        0,
        false,
        "self-test",
        notification_hub::scene::LayoutMode::Stack};
    if (!controller.apply_stack_layout(reflow_layout, error_code, error_message)) {
        std::cerr << "scene controller stack layout failed: " << error_code << " " << error_message << "\n";
        return false;
    }

    const auto card_point = POINT{160, 80};
    const auto immediate_card_hwnd = WindowFromPoint(card_point);
    RECT immediate_card_rect{};
    const bool immediate_card_positioned = immediate_card_hwnd != nullptr
        && GetWindowRect(immediate_card_hwnd, &immediate_card_rect) != FALSE
        && immediate_card_rect.left == 0
        && immediate_card_rect.top == 0
        && immediate_card_rect.right - immediate_card_rect.left == card.window.width
        && immediate_card_rect.bottom - immediate_card_rect.top == card.window.height;
    wchar_t immediate_class_name[128]{};
    const bool immediate_card_hit = immediate_card_hwnd != nullptr
        && GetClassNameW(immediate_card_hwnd, immediate_class_name, static_cast<int>(sizeof(immediate_class_name) / sizeof(immediate_class_name[0]))) > 0
        && std::wstring(immediate_class_name) == L"NotificationHubVNextSceneWindow";
    if (!immediate_card_hit || !immediate_card_positioned) {
        std::cerr << "scene controller card was not visible at its target position immediately after creation\n";
        return false;
    }
    controller.pump_messages();

    const auto card_hwnd = WindowFromPoint(card_point);
    wchar_t class_name[128]{};
    const bool card_hit = card_hwnd != nullptr
        && GetClassNameW(card_hwnd, class_name, static_cast<int>(sizeof(class_name) / sizeof(class_name[0]))) > 0
        && std::wstring(class_name) == L"NotificationHubVNextSceneWindow";
    if (!card_hit) {
        std::cerr << "scene controller card was not topmost at its center\n";
        return false;
    }

    SendMessageW(card_hwnd, WM_LBUTTONDOWN, MK_LBUTTON, MAKELPARAM(80, 80));
    SendMessageW(card_hwnd, WM_MOUSEMOVE, MK_LBUTTON, MAKELPARAM(140, 110));
    SendMessageW(card_hwnd, WM_LBUTTONUP, 0, MAKELPARAM(140, 110));
    const bool drag_changed = controller.pump_messages();
    const auto dragged_cards = controller.cards_json();
    const bool drag_synced = dragged_cards.find("\"x\":60") != std::string::npos
        && dragged_cards.find("\"y\":30") != std::string::npos
        && drag_changed;
    if (!drag_synced) {
        std::cerr << "scene controller card drag was not synchronized: " << dragged_cards << "\n";
        return false;
    }

    SendMessageW(card_hwnd, WM_LBUTTONDOWN, MK_LBUTTON, MAKELPARAM(284, 36));
    const bool down_changed = controller.pump_messages();
    const auto cards_after_down = controller.cards_json();
    if (down_changed || cards_after_down.find("\"id\":\"controller-card\"") == std::string::npos) {
        std::cerr << "scene controller card closed during mouse-down instead of waiting for release: "
                  << cards_after_down << "\n";
        return false;
    }

    // Reproduce the real mouse sequence. The card must stay in place during
    // button-down, then close exactly once when the matching button-up arrives.
    SendMessageW(card_hwnd, WM_LBUTTONUP, 0, MAKELPARAM(284, 36));
    const bool close_changed = controller.pump_messages();
    const auto reflowed_cards = controller.cards_json();
    const auto remaining_card_hwnd = FindWindowW(
        L"NotificationHubVNextSceneWindow",
        L"Second Controller Card");
    RECT remaining_card_rect{};
    const bool remaining_card_reflowed = remaining_card_hwnd != nullptr
        && GetWindowRect(remaining_card_hwnd, &remaining_card_rect) != FALSE
        && remaining_card_rect.left == 0
        && remaining_card_rect.top == 0;
    if (!close_changed
        || reflowed_cards.find("\"id\":\"controller-card\"") != std::string::npos
        || reflowed_cards.find("\"id\":\"controller-card-2\"") == std::string::npos
        || reflowed_cards.find("\"x\":0") == std::string::npos
        || reflowed_cards.find("\"y\":0") == std::string::npos
        || !remaining_card_reflowed) {
        std::cerr << "scene controller card close/reflow was not synchronized: " << reflowed_cards
                  << " remainingCardHwnd=" << remaining_card_hwnd
                  << " remainingCardRect=" << remaining_card_rect.left << "," << remaining_card_rect.top << "\n";
        return false;
    }

    // A card close must not terminate the shared thread message pump. Verify
    // the surviving card is still a real native window after the first close.
    if (remaining_card_hwnd == nullptr || !IsWindow(remaining_card_hwnd)) {
        std::cerr << "scene controller remaining card was destroyed with the dismissed card\n";
        return false;
    }
    static_cast<void>(controller.consume_change_metadata_json());

    const auto scene_hwnd = FindWindowW(
        L"NotificationHubVNextSceneWindow",
        L"Notification Hub Runtime Scene");
    if (scene_hwnd == nullptr) {
        std::cerr << "scene controller main window was not found for close test\n";
        return false;
    }
    SendMessageW(scene_hwnd, WM_LBUTTONDOWN, MK_LBUTTON, MAKELPARAM(462, 36));
    if (controller.pump_messages()) {
        std::cerr << "scene controller main window changed during mouse-down\n";
        return false;
    }
    SendMessageW(scene_hwnd, WM_LBUTTONUP, 0, MAKELPARAM(462, 36));
    const bool scene_close_changed = controller.pump_messages();
    const auto closed_scene_snapshot = controller.scene_state_snapshot_json();
    if (!scene_close_changed
        || controller.has_window()
        || closed_scene_snapshot.find("\"sceneWindow\":null") == std::string::npos) {
        std::cerr << "scene controller main window close was not synchronized: "
                  << closed_scene_snapshot << "\n";
        return false;
    }

    {
        RuntimeSceneController isolated;
        SceneCardState channel_card{
            "channel-keep-xy",
            "Channel Keep XY",
            "Must keep JS coordinates without active layout",
            "",
            SceneWindowState{400, 300, 320, 160},
            320,
            160};
        channel_card.behavior_specified = true;
        channel_card.behavior_profile_id = "stack";
        channel_card.behavior_channel_id = "stack.main";
        if (!isolated.create_card(channel_card, error_code, error_message)) {
            std::cerr << "scene controller channel-without-layout create failed: " << error_code << " " << error_message << "\n";
            return false;
        }
        isolated.pump_messages();
        const auto channel_hwnd = FindWindowW(L"NotificationHubVNextSceneWindow", L"Channel Keep XY");
        RECT channel_rect{};
        const bool kept_xy = channel_hwnd != nullptr
            && GetWindowRect(channel_hwnd, &channel_rect) != FALSE
            && channel_rect.left == 400
            && channel_rect.top == 300;
        if (!kept_xy) {
            std::cerr << "scene controller reflowed a behavior-channel card without active layout: "
                      << channel_rect.left << "," << channel_rect.top << "\n";
            return false;
        }
        isolated.dismiss_card("channel-keep-xy", error_code, error_message, "self-test");
        isolated.pump_messages();
    }

    const auto event = create_event(
        "scene-controller-self-test", "state-applied", "RUNTIME_SCENE_WINDOW_APPLY_OK", "info", true,
        "Runtime scene controller applied state to the native window", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
#endif
}

bool controller_desktop_visual_self_test() {
#ifndef _WIN32
    std::cerr << "RENDERER_UNSUPPORTED: Controller desktop capture requires Windows\n";
    return false;
#else
    RuntimeSceneController controller;
    const SceneCardState card{
        "controller-visual-card",
        "Controller desktop visual",
        "Real layered window pixels",
        "",
        SceneWindowState{700, 150, 320, 160},
        320,
        160};
    std::string error_code;
    std::string error_message;
    if (!controller.create_card(card, error_code, error_message)) {
        std::cerr << "controller desktop visual card create failed: "
                  << error_code << " " << error_message << "\n";
        return false;
    }
    controller.pump_messages();

    const auto center = POINT{card.window.x + (card.window.width / 2), card.window.y + (card.window.height / 2)};
    const auto hwnd = WindowFromPoint(center);
    RECT bounds{};
    const bool geometry_valid = hwnd != nullptr
        && GetWindowRect(hwnd, &bounds) != FALSE
        && bounds.right - bounds.left == card.window.width
        && bounds.bottom - bounds.top == card.window.height;

    bool visible = false;
    COLORREF surface = CLR_INVALID;
    COLORREF accent = CLR_INVALID;
    const auto screen_dc = GetDC(nullptr);
    if (geometry_valid && screen_dc != nullptr) {
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(500);
        do {
            surface = GetPixel(screen_dc, bounds.left + 160, bounds.top + 132);
            accent = GetPixel(screen_dc, bounds.left + 11, bounds.top + 80);
            visible = surface != CLR_INVALID
                && accent != CLR_INVALID
                && GetRValue(surface) < 80
                && GetGValue(surface) < 100
                && GetGValue(accent) > GetRValue(accent) + 80;
            if (!visible) Sleep(10);
        } while (!visible && std::chrono::steady_clock::now() < deadline);
    }
    if (screen_dc != nullptr) ReleaseDC(nullptr, screen_dc);

    controller.dismiss_card(card.id, error_code, error_message);
    controller.pump_messages();
    if (!geometry_valid || !visible || controller.cards_json() != "[]") {
        std::cerr << "controller desktop visual: geometryValid=" << geometry_valid
                  << " visible=" << visible
                  << " surface=" << static_cast<int>(GetRValue(surface)) << ","
                  << static_cast<int>(GetGValue(surface)) << ","
                  << static_cast<int>(GetBValue(surface))
                  << " accent=" << static_cast<int>(GetRValue(accent)) << ","
                  << static_cast<int>(GetGValue(accent)) << ","
                  << static_cast<int>(GetBValue(accent)) << "\n";
        const auto event = create_event(
            "controller-desktop-visual-self-test", "window-captured",
            "RENDERER_CONTROLLER_DESKTOP_CAPTURE_FAILED", "error", false,
            "RuntimeSceneController card pixels were not visible on the desktop",
            std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    const auto event = create_event(
        "controller-desktop-visual-self-test", "window-captured",
        "RENDERER_CONTROLLER_DESKTOP_CAPTURE_OK", "info", true,
        "RuntimeSceneController card pixels were visible on the desktop",
        std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
#endif
}

bool dpi_transition_self_test() {
#ifndef _WIN32
    std::cerr << "DPI_UNSUPPORTED: DPI transition requires Windows\n";
    return false;
#else
    SceneWindow window(WindowConfig{
        L"Notification Hub DPI Transition Self Test",
        L"WM_DPICHANGED geometry transition",
        420,
        180,
        true});
    if (!window.create() || !window.show()) return false;

    int start_x = 0;
    int start_y = 0;
    if (!window.get_window_position(start_x, start_y)) return false;
    RECT suggested{start_x + 17, start_y + 19, start_x + 517, start_y + 239};
    const auto hwnd = static_cast<HWND>(window.native_handle());
    SendMessageW(
        hwnd,
        WM_DPICHANGED,
        MAKEWPARAM(144, 144),
        reinterpret_cast<LPARAM>(&suggested));

    RECT client_rect{};
    int moved_x = 0;
    int moved_y = 0;
    const bool dimensions_valid = GetClientRect(hwnd, &client_rect) != FALSE
        && client_rect.right - client_rect.left == 500
        && client_rect.bottom - client_rect.top == 220;
    const bool position_valid = window.get_window_position(moved_x, moved_y)
        && moved_x == suggested.left
        && moved_y == suggested.top;
    const bool geometry_valid = window.dpi() == 144
        && dimensions_valid
        && position_valid
        && window.hit_test_client_point(250.0f, 110.0f);

    window.request_close();
    const auto pump_result = window.run_message_pump(false);
    if (!geometry_valid || pump_result != 0 || window.is_created()) {
        std::cerr << "dpi transition: dpi=" << window.dpi()
                  << " dimensionsValid=" << dimensions_valid
                  << " positionValid=" << position_valid
                  << " geometryValid=" << geometry_valid << "\n";
        const auto event = create_event(
            "dpi-transition-self-test", "dpi-transitioned", "DPI_TRANSITION_FAILED", "error", false,
            "WM_DPICHANGED geometry transition failed", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    const auto event = create_event(
        "dpi-transition-self-test", "dpi-transitioned", "DPI_TRANSITION_OK", "info", true,
        "WM_DPICHANGED geometry transition completed", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
#endif
}

bool desktop_hit_test_self_test() {
#ifndef _WIN32
    std::cerr << "INTERACTION_UNSUPPORTED: Desktop hit testing requires Windows\n";
    return false;
#else
    SceneWindow window(WindowConfig{
        L"Notification Hub Desktop Hit Test Self Test",
        L"Transparent region hit testing",
        420,
        180,
        true});
    if (!window.create() || !window.show()) return false;

    const auto hwnd = static_cast<HWND>(window.native_handle());
    const int virtual_left = GetSystemMetrics(SM_XVIRTUALSCREEN);
    const int virtual_top = GetSystemMetrics(SM_YVIRTUALSCREEN);
    const int virtual_width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    const int virtual_height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    const POINT candidates[] = {
        {virtual_left + 32, virtual_top + 32},
        {virtual_left + virtual_width - 452, virtual_top + 32},
        {virtual_left + 32, virtual_top + virtual_height - 212},
        {virtual_left + virtual_width - 452, virtual_top + virtual_height - 212},
        {virtual_left + (virtual_width - 420) / 2, virtual_top + (virtual_height - 180) / 2}
    };
    HWND center_window = nullptr;
    HWND corner_window = nullptr;
    bool card_owned = false;
    bool corner_transparent = false;
    for (const auto& candidate : candidates) {
        if (SetWindowPos(
                hwnd,
                nullptr,
                candidate.x,
                candidate.y,
                0,
                0,
                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW) == FALSE) continue;
        if (!window.paint()) continue;
        POINT origin{0, 0};
        if (ClientToScreen(hwnd, &origin) == FALSE) continue;
        const auto center = POINT{origin.x + 210, origin.y + 90};
        const auto transparent_corner = POINT{origin.x, origin.y};
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(500);
        do {
            center_window = WindowFromPoint(center);
            corner_window = WindowFromPoint(transparent_corner);
            card_owned = center_window == hwnd;
            corner_transparent = corner_window != hwnd;
            if (card_owned && corner_transparent) break;
            Sleep(10);
        } while (std::chrono::steady_clock::now() < deadline);
        if (card_owned && corner_transparent) break;
    }

    window.request_close();
    const auto pump_result = window.run_message_pump(false);
    if (!card_owned || !corner_transparent || pump_result != 0 || window.is_created()) {
        std::cerr << "desktop hit test: cardOwned=" << card_owned
                  << " cornerTransparent=" << corner_transparent << "\n";
        const auto event = create_event(
            "desktop-interaction-self-test", "hit-tested", "INTERACTION_TRANSPARENT_HIT_FAILED", "error", false,
            "Desktop WindowFromPoint hit testing did not match card geometry", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    const auto event = create_event(
        "desktop-interaction-self-test", "hit-tested", "INTERACTION_TRANSPARENT_HIT_OK", "info", true,
        "Desktop card hit and transparent corner hit testing completed", std::string(kTimestamp));
    std::cout << serialize_jsonl(event);
    return true;
#endif
}

bool dpi_self_test() {
#ifndef _WIN32
    std::cerr << "DPI_UNSUPPORTED: Per-Monitor V2 DPI requires Windows\n";
    return false;
#else
    SceneWindow window(WindowConfig{
        L"Notification Hub DPI Self Test",
        L"Per-Monitor V2 DPI contract",
        420,
        180,
        true});
    if (!window.create() || !window.show()) return false;

    const auto hwnd = static_cast<HWND>(window.native_handle());
    const auto dpi = GetDpiForWindow(hwnd);
    const auto awareness = GetWindowDpiAwarenessContext(hwnd);
    RECT client_rect{};
    const bool size_valid = GetClientRect(hwnd, &client_rect) != FALSE
        && client_rect.right - client_rect.left == 420
        && client_rect.bottom - client_rect.top == 180;
    const bool awareness_valid = AreDpiAwarenessContextsEqual(
        awareness,
        DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) != FALSE;

    window.request_close();
    const auto pump_result = window.run_message_pump(false);
    if (dpi == 0 || !size_valid || !awareness_valid || pump_result != 0 || window.is_created()) {
        std::cerr << "dpi self test: dpi=" << dpi
                  << " sizeValid=" << size_valid
                  << " awarenessValid=" << awareness_valid << "\n";
        const auto event = create_event(
            "dpi-self-test", "dpi-validated", "DPI_REGRESSION_FAILED", "error", false,
            "Per-Monitor V2 DPI contract validation failed", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    const auto event = create_event(
        "dpi-self-test", "dpi-validated", "DPI_REGRESSION_OK", "info", true,
        "Per-Monitor V2 DPI contract validated", std::string(kTimestamp));
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

bool unicode_text_self_test() {
#ifndef _WIN32
    std::cerr << "TEXT_UNSUPPORTED: Native UTF-16 window text requires Windows\n";
    return false;
#else
    const std::string title = "vNext " "\xE9\x80\x9A\xE7\x9F\xA5 " "\xF0\x9F\x8C\xB8";
    SceneCardState card{
        "unicode-card",
        title,
        "UTF-8 text conversion",
        "",
        SceneWindowState{120, 140, 320, 120},
        0,
        0};
    RuntimeSceneController controller;
    std::string error_code;
    std::string error_message;
    if (!controller.create_card(card, error_code, error_message)) {
        std::cerr << "unicode text card creation failed: " << error_code << " " << error_message << "\n";
        return false;
    }

    constexpr wchar_t expected_title[] = {
        L'v', L'N', L'e', L'x', L't', L' ', 0x901A, 0x77E5, L' ', 0xD83C, 0xDF38, L'\0'};
    const auto found = FindWindowW(L"NotificationHubVNextSceneWindow", expected_title) != nullptr;
    controller.dismiss_card(card.id, error_code, error_message);
    if (!found) {
        std::cerr << "unicode text conversion produced an unexpected native window title\n";
        return false;
    }
    const auto event = create_event(
        "text-self-test", "utf8-to-utf16", "TEXT_UTF8_TO_UTF16_OK", "info", true,
        "UTF-8 card title was preserved in the native UTF-16 window title", std::string(kTimestamp));
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
    if (!window.paint() || !window.is_frame_rendered()) {
        const auto event = create_event(
            "render-self-test", "renderer-drawn", "RENDERER_FRAME_TIMEOUT", "error", false,
            "Direct2D card surface did not render a frame", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        window.request_close();
        window.run_message_pump(false);
        return false;
    }
    window.request_close();
    if (window.run_message_pump(false) != 0 || window.is_created()) return false;
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
    const auto hwnd = static_cast<HWND>(window.native_handle());
    const auto extended_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if ((extended_style & WS_EX_TOPMOST) == 0) {
        window.request_close();
        window.run_message_pump(false);
        const auto event = create_event(
            "window-self-test", "shown", "RENDERER_WINDOW_TOPMOST_FAILED", "error", false,
            "Native scene window did not retain the topmost extended style", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    if (!window.paint() || !window.is_frame_rendered()) {
        window.request_close();
        window.run_message_pump(false);
        return false;
    }
    window.request_close();
    if (window.run_message_pump(false) != 0 || window.is_created()) {
        const auto event = create_event(
            "window-self-test", "dismissed", "RENDERER_WINDOW_CLOSE_FAILED", "error", false,
            "Native scene window did not close cleanly", std::string(kTimestamp));
        std::cerr << serialize_jsonl(event);
        return false;
    }
    VisualStyle auto_style{};
    auto_style.specified = true;
    auto_style.auto_dismiss = true;
    auto_style.dismiss_mode = "closeButton";
    auto_style.dismiss_timeout_ms = 120000;
    if (!valid_visual_style(auto_style)) {
        std::cerr << "timeoutMs 120000 with autoDismiss must be valid\n";
        return false;
    }
    auto_style.dismiss_timeout_ms = 40;
    SceneWindow timed({
        L"Auto dismiss self test",
        L"timer",
        320,
        120,
        true,
        0,
        0,
        false,
        auto_style});
    if (!timed.create() || !timed.show()) {
        std::cerr << "autoDismiss window create/show failed\n";
        return false;
    }
    if (timed.run_message_pump(false) != 0 || timed.close_reason() != "timeout") {
        std::cerr << "autoDismiss timer did not close card reason=" << timed.close_reason() << "\n";
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
    constexpr std::string_view audio_play =
        R"({"protocolVersion":1,"requestId":"req-corpus-audio","traceId":"trace-corpus-audio","type":"audio.play","timestamp":"2026-08-01T00:00:00.000Z","payload":{"soundId":"default"}})";
    constexpr std::string_view visual_assets =
        R"({"protocolVersion":1,"requestId":"req-corpus-assets","traceId":"trace-corpus-assets","type":"visual-assets.configure","timestamp":"2026-08-01T00:00:00.000Z","payload":{"version":1,"assets":[]}})";
    constexpr std::string_view font_assets =
        R"({"protocolVersion":1,"requestId":"req-corpus-fonts","traceId":"trace-corpus-fonts","type":"font-assets.configure","timestamp":"2026-08-01T00:00:00.000Z","payload":{"version":1,"assets":[]}})";
    constexpr std::string_view agent_avatars =
        R"({"protocolVersion":1,"requestId":"req-corpus-agent-avatars","traceId":"trace-corpus-agent-avatars","type":"agent-avatars.configure","timestamp":"2026-08-01T00:00:00.000Z","payload":{"version":1,"items":[]}})";
    constexpr std::string_view voice_event =
        R"({"protocolVersion":1,"requestId":"evt-corpus-voice","traceId":"trace-corpus-voice","type":"event","timestamp":"2026-08-01T00:00:00.000Z","payload":{"eventType":"audio.voice_finished","result":{}}})";
    constexpr std::string_view set_charter =
        R"({"protocolVersion":1,"requestId":"req-corpus-charter","traceId":"trace-corpus-charter","type":"scene.set-charter","timestamp":"2026-08-01T00:00:00.000Z","payload":{"flight":"ticker","charter":{"band":"top"}}})";
    if (!expect_valid(audio_play, "audio.play") || !expect_valid(visual_assets, "visual-assets.configure")
        || !expect_valid(font_assets, "font-assets.configure")
        || !expect_valid(agent_avatars, "agent-avatars.configure")
        || !expect_valid(set_charter, "scene.set-charter")
        || !expect_valid(voice_event, "event")) return false;
    if (!expect_rejected(
            R"({"protocolVersion":1,"requestId":"req-invalid-time","traceId":"trace-invalid-time","type":"health","timestamp":"2026-08-01","payload":{}})",
            "PROTOCOL_INVALID_MESSAGE")) return false;
    {
        const auto invalid_time = parse_message(
            R"({"protocolVersion":1,"requestId":"req-invalid-time","traceId":"trace-invalid-time","type":"health","timestamp":"2026-08-01","payload":{}})");
        if (invalid_time.error.request_type != "health") {
            std::cerr << "parse error must echo request type, got " << invalid_time.error.request_type << "\n";
            return false;
        }
        const auto encoded = notification_hub::protocol::serialize_error(invalid_time.error);
        if (encoded.find("\"requestType\":\"health\"") == std::string::npos) {
            std::cerr << "serialized parse error lost requestType\n";
            return false;
        }
    }
    constexpr std::string_view escaped_scene =
        R"({"protocolVersion":1,"requestId":"req-escaped","traceId":"trace-escaped","type":"scene.create","timestamp":"2026-08-01T00:00:00.000Z","payload":{"id":"card-\u4e2d\ud83d\ude80","title":"\u6d4b\u8bd5","body":"escaped unicode"}})";
    const auto escaped_result = parse_message(escaped_scene);
    if (!escaped_result.ok || escaped_result.message.payload_json.find("\\u4e2d") == std::string::npos) {
        std::cerr << "escaped unicode protocol message failed\n";
        return false;
    }
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
    const auto error = notification_hub::protocol::serialize_error({
        "PROTOCOL_INVALID_MESSAGE", "invalid request", "req-test", "trace-test", "health", false, R"({"field":"timestamp"})"
    });
    if (error.find("\"requestType\":\"health\"") == std::string::npos
        || error.find("\"accepted\":false") == std::string::npos
        || error.find("\"retryable\":false") == std::string::npos
        || error.find("\"details\":{\"field\":\"timestamp\"}") == std::string::npos) {
        std::cerr << "error response contract failed\n";
        return false;
    }
    if (ack.find("\"type\":\"ack\"") == std::string::npos ||
        ack.find("\"requestId\":\"req-test\"") == std::string::npos) {
        std::cerr << "ack correlation failed\n";
        return false;
    }
    const auto escaped_control_text = escape_json_string(std::string("before") + std::string(1, '\b') + "after");
    const auto control_character_event = serialize_event(
        "scene.changed", "evt-control", "trace-control", kTimestamp,
        std::string(R"({"sceneStateSnapshot":{"body":")") + escaped_control_text + R"("}})");
    if (!expect_valid(control_character_event, "event")
        || control_character_event.find("\\b") == std::string::npos) {
        std::cerr << "control character JSON escaping failed\n";
        return false;
    }
    const auto scene_event = serialize_event(
        "scene.changed", "evt-test", "trace-event", kTimestamp,
        R"({"sceneStateSnapshot":{"cardOrder":[]}})");
    if (!expect_valid(scene_event, "event")
        || scene_event.find("\"eventType\":\"scene.changed\"") == std::string::npos) {
        std::cerr << "scene changed event serialization failed\n";
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
        const bool protocol_passed = protocol_self_test();
        const bool transport_passed = transport_self_test();
        const bool passed = protocol_passed && transport_passed;
        std::cout << "notification-hub-runtime self-test: " << (passed ? "ok" : "failed")
                  << " (protocol=" << (protocol_passed ? "ok" : "failed")
                  << ", transport=" << (transport_passed ? "ok" : "failed") << ")\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--config-self-test") {
        const bool passed = notification_hub::config::config_self_test();
        std::cout << "notification-hub-runtime config self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
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
    if (argc > 1 && std::string_view(argv[1]) == "--work-area-self-test") {
        const bool passed = work_area_self_test();
        std::cout << "notification-hub-runtime work area self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--layout-self-test") {
        const bool passed = layout_self_test();
        std::cout << "notification-hub-runtime layout self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--scene-controller-self-test") {
        const bool passed = scene_controller_self_test();
        std::cout << "notification-hub-runtime scene controller self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--fit-width-self-test") {
        const bool passed = fit_width_self_test();
        std::cout << "notification-hub-runtime fit-width self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--root-part-self-test") {
        const bool passed = root_part_plate_self_test() && ticker_text_fill_self_test() && fit_width_self_test();
        std::cout << "notification-hub-runtime root part self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--controller-desktop-visual-self-test") {
        const bool passed = controller_desktop_visual_self_test();
        std::cout << "notification-hub-runtime controller desktop visual self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--dpi-transition-self-test") {
        const bool passed = dpi_transition_self_test();
        std::cout << "notification-hub-runtime dpi transition self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--desktop-hit-test-self-test") {
        const bool passed = desktop_hit_test_self_test();
        std::cout << "notification-hub-runtime desktop hit-test self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--dpi-self-test") {
        const bool passed = dpi_self_test();
        std::cout << "notification-hub-runtime dpi self-test: " << (passed ? "ok" : "failed") << "\n";
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
    if (argc > 1 && std::string_view(argv[1]) == "--unicode-text-self-test") {
        const bool passed = unicode_text_self_test();
        std::cout << "notification-hub-runtime unicode text self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--visual-self-test") {
        const bool passed = visual_self_test();
        std::cout << "notification-hub-runtime visual self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--zero-opacity-hit-self-test") {
        const bool passed = zero_opacity_hit_self_test();
        std::cout << "notification-hub-runtime zero opacity hit self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--part-height-self-test") {
        const bool passed = part_height_self_test();
        std::cout << "notification-hub-runtime part height self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 3 && std::string_view(argv[1]) == "--visual-asset-self-test") {
        const bool passed = visual_asset_self_test(argv[2], argv[3]);
        std::cout << "notification-hub-runtime visual asset self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 3 && std::string_view(argv[1]) == "--root-wallpaper-self-test") {
        const bool passed = root_wallpaper_self_test(argv[2], argv[3]);
        std::cout << "notification-hub-runtime root wallpaper self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 3 && std::string_view(argv[1]) == "--close-part-image-self-test") {
        const bool passed = close_part_image_self_test(argv[2], argv[3]);
        std::cout << "notification-hub-runtime close part image self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 3 && std::string_view(argv[1]) == "--visual-asset-opacity-self-test") {
        const bool passed = visual_asset_opacity_self_test(argv[2], argv[3]);
        std::cout << "notification-hub-runtime visual asset opacity self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 2 && std::string_view(argv[1]) == "--visual-asset-fallback-self-test") {
        const bool passed = visual_asset_fallback_self_test(argv[2]);
        std::cout << "notification-hub-runtime visual asset fallback self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--ticker-self-test") {
        const bool passed = ticker_self_test();
        std::cout << "notification-hub-runtime ticker self-test: " << (passed ? "ok" : "failed") << "\n";
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
