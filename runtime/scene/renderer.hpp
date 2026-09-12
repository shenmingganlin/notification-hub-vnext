#pragma once

#include <cstdint>
#include <memory>
#include <string_view>

#include "visual.hpp"

namespace notification_hub::scene {

struct Pixel {
    std::uint8_t red{};
    std::uint8_t green{};
    std::uint8_t blue{};
    std::uint8_t alpha{};
};

class CardRenderer {
public:
    CardRenderer();
    ~CardRenderer();

    CardRenderer(const CardRenderer&) = delete;
    CardRenderer& operator=(const CardRenderer&) = delete;

    bool initialize(void* native_window, int width, int height);
    bool resize(int width, int height);
    bool draw(std::wstring_view title, std::wstring_view body, const VisualStyle& visual = {}, bool capture_output = false);
    bool capture_pixels() const noexcept;
    bool sample_pixel(int x, int y, Pixel& pixel) const noexcept;
    void reset() noexcept;
    bool is_ready() const noexcept;

private:
    struct Impl;
    bool capture_offscreen(std::wstring_view title, std::wstring_view body, const VisualStyle& visual);
    bool load_background_bitmap(const VisualStyle& visual);
    bool update_layered_window();
    std::unique_ptr<Impl> impl_;
};

}  // namespace notification_hub::scene
