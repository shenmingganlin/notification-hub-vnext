#pragma once

#include "geometry.hpp"
#include "renderer.hpp"
#include "visual.hpp"

#include <string>
#include <string_view>
#include <vector>

namespace notification_hub::scene {

struct WindowConfig {
    std::wstring title{L"Notification Hub"};
    std::wstring body{L"Native scene surface ready"};
    int width{420};
    int height{180};
    bool tool_window{true};
    int x{};
    int y{};
    bool has_initial_position{};
    VisualStyle visual{};
    std::vector<CardPart> parts{};
    std::wstring assistant_name{};
};

class SceneWindow {
public:
    explicit SceneWindow(WindowConfig config = {});
    ~SceneWindow();

    SceneWindow(const SceneWindow&) = delete;
    SceneWindow& operator=(const SceneWindow&) = delete;

    bool create();
    bool show();
    void request_close(std::string_view reason = "programmatic-close");
    void mark_close_requested(std::string_view reason);
    int run_message_pump(bool close_after_first_paint = false);
    void destroy();

    bool is_created() const noexcept;
    bool is_visible() const noexcept;
    bool is_renderer_ready() const noexcept;
    bool is_frame_rendered() const noexcept;
    bool is_close_requested() const noexcept;
    bool is_dragging() const noexcept;
    bool ignores_pointer() const noexcept;
    unsigned int dpi() const noexcept;
    bool apply_dpi_change(unsigned int dpi, const void* suggested_rect) noexcept;
    bool get_window_position(int& x, int& y) const noexcept;
    bool begin_close_button_press(float x, float y) noexcept;
    bool release_close_button_press(float x, float y) noexcept;
    void cancel_pointer_press() noexcept;
    bool begin_drag_client_point(float x, float y) noexcept;
    bool update_drag_screen_point(int x, int y) noexcept;
    void end_drag() noexcept;
    bool present_layered();
    bool layered_present_origin(int& x, int& y) const noexcept;
    void reset_pointer_gesture() noexcept;
    void release_pointer_capture() noexcept;
    bool suppressing_capture_loss() const noexcept;
    void update_content(std::wstring title, std::wstring body);
    void update_assistant_name(std::wstring assistant_name);
    void update_parts(std::vector<CardPart> parts);
    void update_visual(VisualStyle visual);
    bool capture_pixels() const noexcept;
    bool sample_pixel(int x, int y, Pixel& pixel) const noexcept;
    bool hit_test_client_point(float x, float y) const noexcept;
    bool click_client_point(float x, float y) noexcept;
    void* native_handle() const noexcept;
    int paint_overflow() const noexcept;
    bool point_on_close_control(float x, float y) const noexcept;
    void note_pointer_client(float x, float y) noexcept;
    void clear_hover() noexcept;
    bool paint(bool capture_output = false);
    bool resize_render_target(int width, int height);
    void mark_first_paint() noexcept;
    void mark_native_destroyed() noexcept;
    const std::string& close_reason() const noexcept;

private:
    WindowConfig config_;
    void* hwnd_{};
    bool class_registered_{};
    bool visible_{};
    bool first_paint_seen_{};
    bool frame_rendered_{};
    bool close_requested_{};
    std::string close_reason_;
    unsigned int dpi_{96};
    bool close_button_pressed_{};
    bool hovered_{};
    bool mouse_leave_tracked_{};
    bool drag_active_{};
    bool suppress_capture_loss_{};
    int drag_start_screen_x_{};
    int drag_start_screen_y_{};
    int drag_window_start_x_{};
    int drag_window_start_y_{};
    CardRenderer renderer_;
    std::wstring class_name_{L"NotificationHubVNextSceneWindow"};
};

}  // namespace notification_hub::scene
