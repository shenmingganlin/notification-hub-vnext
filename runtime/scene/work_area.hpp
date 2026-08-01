#pragma once

#include <string>

namespace notification_hub::scene {

struct WorkAreaRect {
    int left{};
    int top{};
    int width{};
    int height{};
};

struct WorkAreaSnapshot {
    WorkAreaRect rect{};
    float dpi_scale{1.0f};
    bool is_fallback{};
    std::string source;
};

bool valid_work_area(const WorkAreaSnapshot& snapshot) noexcept;
WorkAreaSnapshot fallback_work_area(int virtual_width, int virtual_height, float dpi_scale) noexcept;
WorkAreaSnapshot query_primary_work_area() noexcept;

}  // namespace notification_hub::scene
