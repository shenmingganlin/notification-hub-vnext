#include "work_area.hpp"

#include <cmath>
#include <limits>

#ifdef _WIN32
#include <windows.h>
#endif

namespace notification_hub::scene {

bool valid_work_area(const WorkAreaSnapshot& snapshot) noexcept {
    return snapshot.rect.width > 0
        && snapshot.rect.height > 0
        && std::isfinite(snapshot.dpi_scale)
        && snapshot.dpi_scale > 0.0f
        && !snapshot.source.empty();
}

WorkAreaSnapshot fallback_work_area(int virtual_width, int virtual_height, float dpi_scale) noexcept {
    WorkAreaSnapshot snapshot{
        WorkAreaRect{0, 0, virtual_width, virtual_height},
        dpi_scale,
        true,
        "virtual-screen-fallback"};
    if (!valid_work_area(snapshot)) return {};
    return snapshot;
}

#ifdef _WIN32
namespace {

float dpi_scale_for_monitor(HMONITOR monitor) noexcept {
    if (monitor == nullptr) return 0.0f;

    UINT dpi_x = 0;
    UINT dpi_y = 0;
    using GetDpiForMonitorFn = HRESULT(WINAPI*)(HMONITOR, int, UINT*, UINT*);
    const auto shcore = LoadLibraryW(L"Shcore.dll");
    if (shcore != nullptr) {
        const auto get_dpi = reinterpret_cast<GetDpiForMonitorFn>(GetProcAddress(shcore, "GetDpiForMonitor"));
        if (get_dpi != nullptr && SUCCEEDED(get_dpi(monitor, 0, &dpi_x, &dpi_y)) && dpi_x > 0) {
            FreeLibrary(shcore);
            return static_cast<float>(dpi_x) / 96.0f;
        }
        FreeLibrary(shcore);
    }
    return 0.0f;
}

}  // namespace
#endif

WorkAreaSnapshot query_primary_work_area() noexcept {
#ifdef _WIN32
    const auto monitor = MonitorFromPoint(POINT{0, 0}, MONITOR_DEFAULTTONEAREST);
    MONITORINFO monitor_info{};
    monitor_info.cbSize = sizeof(monitor_info);
    if (monitor != nullptr && GetMonitorInfoW(monitor, &monitor_info) != FALSE) {
        const auto& work = monitor_info.rcWork;
        const auto width = work.right - work.left;
        const auto height = work.bottom - work.top;
        const auto dpi_scale = dpi_scale_for_monitor(monitor);
        if (dpi_scale > 0.0f) {
            return WorkAreaSnapshot{
                WorkAreaRect{work.left, work.top, width, height},
                dpi_scale,
                false,
                "primary-monitor-work-area"};
        }
    }

    const auto virtual_width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    const auto virtual_height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    return fallback_work_area(virtual_width, virtual_height, 1.0f);
#else
    return {};
#endif
}

}  // namespace notification_hub::scene
