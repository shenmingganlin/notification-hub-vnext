#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

namespace notification_hub::scene {

struct OverlayWorkArea {
    int left{};
    int top{};
    int width{};
    int height{};
};

struct OverlaySpriteBox {
    std::string id;
    int x{};
    int y{};
    int width{};
    int height{};
};

inline OverlayWorkArea overlay_host_rect(const OverlayWorkArea& work_area) noexcept {
    return work_area;
}

inline std::string hit_test_overlay_sprites(
    const std::vector<OverlaySpriteBox>& sprites,
    int x,
    int y) {
    for (auto it = sprites.rbegin(); it != sprites.rend(); ++it) {
        if (x >= it->x && y >= it->y && x < it->x + it->width && y < it->y + it->height) {
            return it->id;
        }
    }
    return {};
}

inline bool overlay_hover_enabled(bool click_through) noexcept {
    return !click_through;
}

inline bool overlay_sprite_hovered(
    bool click_through,
    std::string_view hovered_id,
    std::string_view card_id) noexcept {
    return overlay_hover_enabled(click_through)
        && !card_id.empty()
        && hovered_id == card_id;
}

inline bool overlay_should_highlight(
    bool click_through,
    std::string_view hovered_id,
    std::string_view card_id,
    bool hover_highlight) noexcept {
    return hover_highlight
        && overlay_sprite_hovered(click_through, hovered_id, card_id);
}

inline bool overlay_should_pause(
    bool click_through,
    std::string_view hovered_id,
    std::string_view card_id,
    bool hover_pause) noexcept {
    return hover_pause
        && overlay_sprite_hovered(click_through, hovered_id, card_id);
}

inline double ticker_spawn_shift_ms(double tick_ms, bool paused) noexcept {
    if (!paused || !(tick_ms > 0.0)) return 0.0;
    return tick_ms;
}

class TickerOverlay {
public:
    TickerOverlay();
    ~TickerOverlay();

    TickerOverlay(const TickerOverlay&) = delete;
    TickerOverlay& operator=(const TickerOverlay&) = delete;

    bool create(int x, int y, int width, int height);
    void destroy();
    bool is_created() const noexcept;
    bool empty() const noexcept;
    bool click_through() const noexcept;
    bool set_click_through(bool on);
    bool add_sprite(
        std::string id,
        int width,
        int height,
        const void* bgra,
        int pitch);
    bool update_pixels(std::string_view id, int width, int height, const void* bgra, int pitch);
    bool set_offset(std::string_view id, int x, int y);
    bool remove_sprite(std::string_view id);
    bool has_sprite(std::string_view id) const noexcept;
    bool commit();
    std::string hit_test(int screen_x, int screen_y) const;
    std::string hovered_id() const;
    void note_pointer(int screen_x, int screen_y);
    void clear_hover();
    void note_click(int screen_x, int screen_y);
    std::string take_click(int& screen_x, int& screen_y);
    void* native_handle() const noexcept;
    std::uint64_t paint_count() const noexcept;
    std::uint64_t commit_count() const noexcept;
    const std::string& last_error() const noexcept;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace notification_hub::scene
