#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

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
    const std::string& last_error() const noexcept { return last_error_; }
    bool resize(int width, int height);
    bool draw(std::wstring_view title, std::wstring_view body, const VisualStyle& visual = {}, bool capture_output = false, const std::vector<CardPart>& parts = {}, bool hovered = false, std::wstring_view assistant_name = {});
    bool draw_buffer(std::wstring_view title, std::wstring_view body, const VisualStyle& visual = {}, bool capture_output = false, const std::vector<CardPart>& parts = {}, bool hovered = false, std::wstring_view assistant_name = {});
    bool buffer_bits(const void*& bits, int& pitch, int& width, int& height) const noexcept;
    bool capture_pixels() const noexcept;
    bool sample_pixel(int x, int y, Pixel& pixel) const noexcept;
    void reset() noexcept;
    bool is_ready() const noexcept;
    bool present_layered();
    bool layered_present_origin(int& x, int& y) const noexcept;

private:
    struct Impl;
    bool capture_offscreen(std::wstring_view title, std::wstring_view body, const VisualStyle& visual, const std::vector<CardPart>& parts, bool hovered, bool wait_for_wallpaper, std::wstring_view assistant_name = {});
    bool ensure_background_bitmap(const VisualStyle& visual, float dest_left, float dest_top, float dest_right, float dest_bottom, bool wait_for_wallpaper);
    bool update_layered_window();
    std::unique_ptr<Impl> impl_;
    std::string last_error_;
};

}  // namespace notification_hub::scene
