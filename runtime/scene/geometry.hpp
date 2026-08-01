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
    return CardBounds{10.0f, 10.0f, width - 10.0f, height - 10.0f, 14.0f};
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
