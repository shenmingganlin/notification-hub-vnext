#pragma once

#include <string>
#include <string_view>

namespace notification_hub::scene {

struct WindowConfig {
    std::wstring title{L"Notification Hub"};
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
    void* native_handle() const noexcept;
    void mark_first_paint() noexcept;
    void mark_native_destroyed() noexcept;

private:
    WindowConfig config_;
    void* hwnd_{};
    bool class_registered_{};
    bool visible_{};
    bool first_paint_seen_{};
    std::wstring class_name_{L"NotificationHubVNextSceneWindow"};
};

}  // namespace notification_hub::scene
