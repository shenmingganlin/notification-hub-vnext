#pragma once

#include "geometry.hpp"
#include "renderer.hpp"

#include <string>

namespace notification_hub::scene {

struct WindowConfig {
    std::wstring title{L"Notification Hub"};
    std::wstring body{L"Native scene surface ready"};
    int width{420};
    int height{180};
    bool tool_window{true};
};

class SceneWindow {
public:
    explicit SceneWindow(WindowConfig config = {});
    ~SceneWindow();

    SceneWindow(const SceneWindow&) = delete;
    SceneWindow& operator=(const SceneWindow&) = delete;

    bool create();
    bool show();
    void request_close();
    int run_message_pump(bool close_after_first_paint = false);
    void destroy();

    bool is_created() const noexcept;
    bool is_visible() const noexcept;
    bool is_renderer_ready() const noexcept;
    bool is_frame_rendered() const noexcept;
    bool is_close_requested() const noexcept;
    bool is_dragging() const noexcept;
    bool get_window_position(int& x, int& y) const noexcept;
    bool begin_drag_client_point(float x, float y) noexcept;
    bool update_drag_screen_point(int x, int y) noexcept;
    void end_drag() noexcept;
    bool capture_pixels() const noexcept;
    bool sample_pixel(int x, int y, Pixel& pixel) const noexcept;
    bool hit_test_client_point(float x, float y) const noexcept;
    bool click_client_point(float x, float y) noexcept;
    void* native_handle() const noexcept;
    bool paint(bool capture_output = false);
    bool resize_render_target(int width, int height);
    void mark_first_paint() noexcept;
    void mark_native_destroyed() noexcept;

private:
    WindowConfig config_;
    void* hwnd_{};
    bool class_registered_{};
    bool visible_{};
    bool first_paint_seen_{};
    bool frame_rendered_{};
    bool close_requested_{};
    bool drag_active_{};
    int drag_start_screen_x_{};
    int drag_start_screen_y_{};
    int drag_window_start_x_{};
    int drag_window_start_y_{};
    CardRenderer renderer_;
    std::wstring class_name_{L"NotificationHubVNextSceneWindow"};
};

}  // namespace notification_hub::scene
