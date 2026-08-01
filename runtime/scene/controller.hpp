#pragma once

#include "layout.hpp"

#include <string>
#include <string_view>

namespace notification_hub::scene {

struct SceneWindowState {
    int x{};
    int y{};
    int width{420};
    int height{180};
};

struct SceneCardState {
    std::string id;
    std::string title;
    std::string body;
    SceneWindowState window{};
    int layout_width{};
    int layout_height{};
};

class RuntimeSceneController {
public:
    RuntimeSceneController() = default;
    ~RuntimeSceneController();

    RuntimeSceneController(const RuntimeSceneController&) = delete;
    RuntimeSceneController& operator=(const RuntimeSceneController&) = delete;

    bool apply_window_state(const SceneWindowState& state, std::string& error_code, std::string& error_message);
    bool create_card(const SceneCardState& card, std::string& error_code, std::string& error_message);
    bool update_card(const SceneCardState& card, std::string& error_code, std::string& error_message);
    bool dismiss_card(std::string_view id, std::string& error_code, std::string& error_message);
    bool apply_stack_layout(const StackLayoutOptions& options, std::string& error_code, std::string& error_message);
    bool get_window_state(SceneWindowState& state) const noexcept;
    std::string state_json() const;
    std::string cards_json() const;
    std::string layout_json() const;
    std::string work_area_json() const;
    std::string scene_state_snapshot_json() const;
    std::string state_result_json(bool deduplicated) const;
    std::string cards_result_json(bool deduplicated) const;
    void pump_messages();
    bool has_window() const noexcept;

private:
    class Impl;
    Impl* impl_{};
};

}  // namespace notification_hub::scene
