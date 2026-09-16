#include "ticker.hpp"

#include <algorithm>
#include <limits>

namespace notification_hub::scene {

namespace {

constexpr double kInfinity = std::numeric_limits<double>::infinity();

}  // namespace

TickerTrackPlan plan_ticker_tracks(
    int band_height_px,
    int card_height_px,
    int track_gap_px,
    int configured_track_count) {
    TickerTrackPlan plan{};
    plan.track_gap_px = track_gap_px > 0 ? track_gap_px : 0;
    const auto card_height = card_height_px > 0 ? card_height_px : 1;
    plan.track_height_px = card_height + plan.track_gap_px;

    // n 条轨道 + (n-1) 个间距恰好放进 band：n × trackHeight <= band + gap
    auto auto_count = 1;
    if (band_height_px > 0) {
        auto_count = (band_height_px + plan.track_gap_px) / plan.track_height_px;
    }
    if (auto_count < 1) auto_count = 1;

    // 0 = 按 band 自动；显式条数名实一致。显式时 band 是从动，由调用方按 needed 可撑可缩。
    plan.track_count = configured_track_count > 0
        ? configured_track_count
        : auto_count;
    if (plan.track_count < 1) plan.track_count = 1;
    return plan;
}

double ticker_track_clearance(
    bool has_card_ahead,
    double nearest_ahead_edge,
    int spawn_edge_px,
    int min_gap_px,
    bool fly_right) {
    // 没有前车的轨道记 +∞，一定优先（契约 §4.1）。
    if (!has_card_ahead) return kInfinity;
    if (fly_right) {
        return nearest_ahead_edge
            - static_cast<double>(spawn_edge_px)
            - static_cast<double>(min_gap_px);
    }
    return static_cast<double>(spawn_edge_px)
        - nearest_ahead_edge
        - static_cast<double>(min_gap_px);
}

int choose_ticker_track(const std::vector<double>& clearances) {
    if (clearances.empty()) return -1;
    auto best = 0;
    for (auto i = 1; i < static_cast<int>(clearances.size()); ++i) {
        // 严格大于 → 并列时保留最小 index（最上一条），保证可预测、不随机。
        if (clearances[static_cast<std::size_t>(i)] > clearances[static_cast<std::size_t>(best)]) {
            best = i;
        }
    }
    return best;
}

double ticker_entry_delay_ms(double best_clearance_px, double speed_px_per_second) {
    // 净空足够或速度非法 → 不延迟。
    if (best_clearance_px >= 0.0 || speed_px_per_second <= 0.0) return 0.0;
    return (-best_clearance_px) / speed_px_per_second * 1000.0;
}

double ticker_position_x(
    double spawn_left_x,
    double speed_px_per_second,
    double elapsed_ms,
    bool fly_right) {
    const auto travel = speed_px_per_second * (elapsed_ms / 1000.0);
    return fly_right ? spawn_left_x + travel : spawn_left_x - travel;
}

bool ticker_is_offscreen(double card_edge_x, int lane_edge_px, int exit_margin_px, bool fly_right) {
    if (fly_right) return card_edge_x > static_cast<double>(lane_edge_px + exit_margin_px);
    return card_edge_x < static_cast<double>(lane_edge_px - exit_margin_px);
}

int ticker_band_top_y(
    bool band_top,
    int work_area_top_px,
    int work_area_height_px,
    int band_height_px) {
    if (band_top) return work_area_top_px;
    return work_area_top_px + work_area_height_px - band_height_px;
}

int ticker_track_y(int band_top_px, int track_index, const TickerTrackPlan& plan) {
    const auto index = track_index < 0 ? 0 : track_index;
    return band_top_px + index * plan.track_height_px;
}

}  // namespace notification_hub::scene
