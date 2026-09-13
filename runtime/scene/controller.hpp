#pragma once

#include "layout.hpp"
#include "visual.hpp"

#include <string>
#include <string_view>
#include <vector>

namespace notification_hub::scene {

struct SceneWindowState {
    int x{};
    int y{};
    int width{420};
    int height{180};
};

struct VisualAssetRecord {
    std::string asset_id;
    std::string format;
    std::string relative_path;
    std::string sha256;
    bool enabled{};
};

struct SceneCardState {
    std::string id;
    std::string title;
    std::string body;
    SceneWindowState window{};
    int layout_width{};
    int layout_height{};
    VisualStyle visual{};
    bool presentation_specified{};
    std::string event_id;
    std::string category_id;
    std::string event_type_id;
    std::string visual_profile_id;
    bool behavior_specified{};
    std::string behavior_profile_id;
    std::string behavior_channel_id;
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
    bool dismiss_card(
        std::string_view id,
        std::string& error_code,
        std::string& error_message,
        std::string_view reason = "scene.dismiss");
    bool apply_stack_layout(const StackLayoutOptions& options, std::string& error_code, std::string& error_message);
    void configure_visual_assets(const std::vector<VisualAssetRecord>& assets, std::string_view root_dir);
    bool has_visual_asset(std::string_view asset_id) const noexcept;
    std::size_t visual_asset_count() const noexcept;
    bool get_window_state(SceneWindowState& state) const noexcept;
    std::string state_json() const;
    std::string cards_json() const;
    std::string layout_json() const;
    std::string work_area_json() const;
    std::string scene_state_snapshot_json() const;
    std::string consume_change_metadata_json();
    std::string change_metadata_json() const;
    std::string state_result_json(bool deduplicated) const;
    std::string cards_result_json(bool deduplicated) const;
    std::string dismiss_result_json(bool deduplicated, std::string_view card_id) const;
    bool tick_animation();
    bool pump_messages();
    bool has_window() const noexcept;

private:
    class Impl;
    bool apply_channel_layout(
        const StackLayoutOptions& requested_options,
        std::string& error_code,
        std::string& error_message);
    Impl* impl_{};
};

}  // namespace notification_hub::scene
