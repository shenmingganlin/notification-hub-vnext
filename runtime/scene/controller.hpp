#pragma once

#include <string>
#include <string_view>

namespace notification_hub::scene {

struct SceneWindowState {
    int x{};
    int y{};
    int width{420};
    int height{180};
};

class RuntimeSceneController {
public:
    RuntimeSceneController() = default;
    ~RuntimeSceneController();

    RuntimeSceneController(const RuntimeSceneController&) = delete;
    RuntimeSceneController& operator=(const RuntimeSceneController&) = delete;

    bool apply_window_state(const SceneWindowState& state, std::string& error_code, std::string& error_message);
    bool get_window_state(SceneWindowState& state) const noexcept;
    std::string state_result_json(bool deduplicated) const;
    void pump_messages();
    bool has_window() const noexcept;

private:
    class Impl;
    Impl* impl_{};
};

}  // namespace notification_hub::scene
