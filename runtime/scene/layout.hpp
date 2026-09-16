#pragma once

#include <string>
#include <vector>

namespace notification_hub::scene {

enum class StackDirection {
    Down,
    Up,
    Right,
    Left
};

enum class StackAnchor {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight
};

enum class LayoutMode {
    Stack,
    Shelf
};

enum class StackWrap {
    Parallel,
    Off,
    Snake
};

enum class StackSettle {
    Snap
};

struct StackCardInput {
    std::string id;
    int width{};
    int height{};
};

struct StackLayoutOptions {
    StackDirection direction{StackDirection::Down};
    StackAnchor anchor{StackAnchor::TopRight};
    int spacing{};
    int work_area_width{};
    int work_area_height{};
    float dpi_scale{1.0f};
    int work_area_left{};
    int work_area_top{};
    bool work_area_is_fallback{};
    std::string work_area_source;
    LayoutMode mode{LayoutMode::Stack};
    int margin_left{};
    int margin_right{};
    int margin_top{};
    int margin_bottom{};
    StackWrap wrap{StackWrap::Parallel};
    StackSettle settle{StackSettle::Snap};
};

struct StackCardPlacement {
    std::string id;
    int x{};
    int y{};
    int width{};
    int height{};
};

struct StackLayoutResult {
    bool ok{};
    std::string code;
    std::string message;
    std::string failing_card_id;
    std::vector<StackCardPlacement> placements;
};

StackLayoutResult layout_stack(
    const std::vector<StackCardInput>& cards,
    const StackLayoutOptions& options);

StackLayoutResult layout_shelf(
    const std::vector<StackCardInput>& cards,
    const StackLayoutOptions& options);

}  // namespace notification_hub::scene
