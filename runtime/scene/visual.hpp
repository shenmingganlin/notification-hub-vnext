#pragma once

#include <cctype>
#include <string>
#include <string_view>

namespace notification_hub::scene {

inline bool valid_hex_color(std::string_view value) {
    if (value.size() != 7 || value[0] != '#') return false;
    for (std::size_t index = 1; index < value.size(); ++index) {
        const auto c = value[index];
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
    }
    return true;
}

struct CardPart {
    std::string id;
    std::string kind;
    std::string binding;
    int x{};
    int y{};
    int w{};
    int h{};
    int radius{};
    std::string fill;
    std::string stroke;
    int stroke_width{};
    std::string background_asset_id;
    std::string background_asset_path;
    std::string background_asset_sha256;
    std::string background_fit;
    bool background_transform_specified{};
    float background_scale{1.0f};
    float background_x{0.5f};
    float background_y{0.5f};
    int font_size{};
    std::string font_family;
    std::string font_asset_id;
    std::string font_asset_path;
    std::string text_paint;
    bool font_bold{};
    bool font_italic{};
    bool font_underline{};
    bool font_strike{};
    std::string background;
    float opacity{1.0f};
    bool fit_width{};
    bool fit_compensate{};
    bool text_stroke{};
    std::string text_stroke_color;
    bool radius_specified{};
    int text_stroke_width{};
    std::string text_stroke_paint;
    std::string stroke_paint;
    std::string close_icon;
    std::string close_icon_color;
};

struct VisualStyle {
    bool specified{};
    bool enabled{true};
    std::string preset{"minimal"};
    std::string intensity{"balanced"};
    std::string category;
    std::string card_type{"minimal"};
    std::string layout{"simple"};
    std::string boundary{"work-area"};
    std::string dismiss_mode{"closeButton"};
    std::string close_button_position{"top-right"};
    int dismiss_timeout_ms{30000};
    bool hover_highlight{};
    bool auto_dismiss{};
    std::string size{"medium"};
    std::string aspect_ratio{"default"};
    std::string background_color{"#0e1916"};
    std::string background_asset_id;
    std::string background_asset_path;
    std::string background_asset_sha256;
    std::string background_fit{"fill"};
    float background_padding{0.0f};
    int border_radius{16};
    float opacity{0.96f};
    int border_width{};
    std::string border_color{"#0e1916"};
    int paint_overflow{};
    bool background_transform_specified{};
    float background_scale{1.0f};
    float background_x{0.5f};
    float background_y{0.5f};
    // Ticker（弹幕）行为参数（ticker 契约 §2）。仅当卡片确实携带时生效；
    // 参数属行为/通道，此处随卡片下发，通道取用同一份。
    bool ticker_specified{};
    int ticker_speed_px_per_second{400};
    std::string ticker_band{"top"};
    double ticker_band_ratio{0.28};
    int ticker_track_count{0};
    int ticker_track_gap_px{8};
    int ticker_min_gap_px{64};
    bool ticker_click_through{true};
    bool ticker_hover_pause{};
    std::string ticker_overflow{"avoid"};
    std::string ticker_direction{"left"};
    bool hold_drag{true};
};

inline bool valid_visual_style(const VisualStyle& style) {
    if (!style.specified) return true;
    if (style.preset != "minimal" && style.preset != "soft" && style.preset != "accent"
        && style.preset != "warning" && style.preset != "critical") return false;
    if (style.intensity != "reduced" && style.intensity != "balanced" && style.intensity != "expressive") return false;
    if (!style.category.empty()
        && style.category != "chat" && style.category != "channel" && style.category != "tool"
        && style.category != "error" && style.category != "plugin" && style.category != "model_service") return false;
    if (style.card_type != "minimal" && style.card_type != "danmaku" && style.card_type != "popup") return false;
    if (style.layout != "simple" || style.boundary != "work-area") return false;
    if (style.dismiss_mode != "closeButton" && style.dismiss_mode != "anywhere" && style.dismiss_mode != "timeout" && style.dismiss_mode != "buttonOnly") return false;
    if (style.close_button_position != "top-right" && style.close_button_position != "top-left" && style.close_button_position != "bottom-right" && style.close_button_position != "bottom-left") return false;
    if (style.dismiss_timeout_ms < 1000 || style.dismiss_timeout_ms > 120000) return false;
    if (style.size != "small" && style.size != "medium" && style.size != "large") return false;
    if (style.aspect_ratio != "default" && style.aspect_ratio != "square" && style.aspect_ratio != "wide") return false;
    if (!style.background_asset_id.empty()) {
        if (style.background_asset_id.size() > 80 || !std::isalnum(static_cast<unsigned char>(style.background_asset_id[0]))) return false;
        for (const auto c : style.background_asset_id) if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '.' || c == '_' || c == '-')) return false;
    }
    if (style.background_fit != "fill" && style.background_fit != "contain" && style.background_fit != "cover") return false;
    if (style.background_padding < 0.0f || style.background_padding > 40.0f) return false;
    if (!valid_hex_color(style.background_color)) return false;
    if (style.border_radius < 0 || style.border_radius > 480) return false;
    if (style.opacity < 0.0f || style.opacity > 1.0f) return false;
    if (style.border_width < 0 || style.border_width > 32) return false;
    if (!valid_hex_color(style.border_color)) return false;
    if (style.paint_overflow < 0 || style.paint_overflow > 240) return false;
    if (style.background_scale < 0.2f || style.background_scale > 8.0f) return false;
    if (style.background_x < 0.0f || style.background_x > 1.0f) return false;
    if (style.background_y < 0.0f || style.background_y > 1.0f) return false;
    if (style.ticker_specified) {
        if (style.ticker_speed_px_per_second < 150 || style.ticker_speed_px_per_second > 800) return false;
        if (style.ticker_band != "top" && style.ticker_band != "bottom") return false;
        if (!(style.ticker_band_ratio >= 0.15 && style.ticker_band_ratio <= 1.0)) return false;
        // 0 = 自动；显式条数只设下限，**不设上限**（满屏弹幕）。
        if (style.ticker_track_count < 0) return false;
        if (style.ticker_track_gap_px < 0 || style.ticker_track_gap_px > 48) return false;
        if (style.ticker_min_gap_px < 24 || style.ticker_min_gap_px > 160) return false;
        if (style.ticker_overflow != "avoid" && style.ticker_overflow != "queue") return false;
        if (style.ticker_direction != "left" && style.ticker_direction != "right") return false;
    }
    return true;
}

}  // namespace notification_hub::scene
