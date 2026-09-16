#pragma once

#include <cmath>

namespace notification_hub::scene {

struct CardBounds {
    float left{};
    float top{};
    float right{};
    float bottom{};
    float radius{};
};

struct CloseButtonBounds {
    float left{};
    float top{};
    float right{};
    float bottom{};
};

inline CardBounds card_bounds(float width, float height) noexcept {
    // 窗口就是可见卡面；不再写死 10/4 板内缩，否则 gap 0 仍会露 8~20px 缝。
    // 圆角仍按高度：矮卡/弹幕 10，堆叠卡 14。
    const float radius = height < 96.0f ? 10.0f : 14.0f;
    return CardBounds{0.0f, 0.0f, width, height, radius};
}

inline CloseButtonBounds close_button_bounds(float width, float height) noexcept {
    const auto card = card_bounds(width, height);
    constexpr float size = 28.0f;
    constexpr float inset = 12.0f;
    return CloseButtonBounds{
        card.right - inset - size,
        card.top + inset,
        card.right - inset,
        card.top + inset + size};
}

inline bool point_inside_close_button(float x, float y, float width, float height) noexcept {
    const auto bounds = close_button_bounds(width, height);
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

inline int clamp_paint_overflow(int value) noexcept {
    if (value < 0) return 0;
    if (value > 240) return 240;
    return value;
}

struct PaintBox {
    int x{};
    int y{};
    int width{};
    int height{};
};

inline PaintBox paint_box_from_hit_box(int x, int y, int width, int height, int overflow) noexcept {
    overflow = clamp_paint_overflow(overflow);
    return PaintBox{x - overflow, y - overflow, width + (overflow * 2), height + (overflow * 2)};
}

inline void paint_origin_to_hit_origin(int& x, int& y, int overflow) noexcept {
    overflow = clamp_paint_overflow(overflow);
    x += overflow;
    y += overflow;
}

inline void client_to_hit_box(float& x, float& y, int overflow) noexcept {
    overflow = clamp_paint_overflow(overflow);
    x -= static_cast<float>(overflow);
    y -= static_cast<float>(overflow);
}

inline bool point_inside_card(float x, float y, float width, float height) noexcept {
    const auto bounds = card_bounds(width, height);
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return false;

    const auto corner_x = x < bounds.left + bounds.radius
        ? bounds.left + bounds.radius
        : (x > bounds.right - bounds.radius ? bounds.right - bounds.radius : x);
    const auto corner_y = y < bounds.top + bounds.radius
        ? bounds.top + bounds.radius
        : (y > bounds.bottom - bounds.radius ? bounds.bottom - bounds.radius : y);
    const auto delta_x = x - corner_x;
    const auto delta_y = y - corner_y;
    return (delta_x * delta_x) + (delta_y * delta_y) <= bounds.radius * bounds.radius;
}

}  // namespace notification_hub::scene
