#pragma once

#include <string>
#include <vector>

namespace notification_hub::scene {

// Ticker（弹幕）行为的纯逻辑层。
// 依据：docs/superpowers/specs/ticker-behavior-contract.md
//
// 本文件刻意不依赖任何窗口 / 渲染设施：位置、轨道、出屏判定都是纯函数，
// 因此契约里的判定条件可以被自检直接覆盖，而非依赖肉眼观察。

// 弹幕通道参数（契约 §2）。数值为 Lumen 定稿默认值。
struct TickerChannelOptions {
    double speed_px_per_second{400.0};
    int min_gap_px{64};
    int track_gap_px{8};  // 异轨纵向间距；0 = 轨道贴紧
    int track_count{0};  // 0 = 旧自动档（按 band 高度）；显式条数时 band 是从动
    double band_ratio{0.28};
    bool band_top{true};
    int heartbeat_ms{16};
    int exit_margin_px{24};
    std::string direction{"left"};
};

// 轨道几何（契约 §2.3）：轨道高 = 卡高 + 轨内间距。
// 显式条数时 band 是从动高度；0 才按 band 高度自动算条数。
struct TickerTrackPlan {
    int track_height_px{};
    int track_gap_px{8};
    int track_count{};
};

// 按 band 高度或显式条数推导轨道几何。
// trackCount = 0 时按 band 自动算；显式条数照单全收，band 高度由调用方按 needed 可撑可缩。
// 工作区高度上限由调用方夹紧。下限恒为 1。
TickerTrackPlan plan_ticker_tracks(
    int band_height_px,
    int card_height_px,
    int track_gap_px,
    int configured_track_count);

// 单轨净空（契约 §4）。
// 判据是「进屏点前方的净空距离」，不是「轨道里的卡片数量」——等速弹幕一进屏
// 相对间距即冻结，故「卡少」的轨道可能恰好有一张刚进屏的长卡。
//   has_card_ahead == false → 记为 +∞（一定优先）
//   左飞：clearance = lane_right - ahead.right - min_gap
//   右飞：clearance = ahead.left - lane_left - min_gap
// spawn_edge_px 左飞传 lane_right，右飞传 lane_left。
double ticker_track_clearance(
    bool has_card_ahead,
    double nearest_ahead_edge,
    int spawn_edge_px,
    int min_gap_px,
    bool fly_right = false);

// 选轨（契约 §4）：净空最大者；并列取 index 最小者。空输入返回 -1。
int choose_ticker_track(const std::vector<double>& clearances);

// 延迟进屏毫秒数（契约 §4.3）：所有轨道净空为负时，延迟 (-clearance)/speed 秒。
// 不换道、不叠放。clearance >= 0 时返回 0。
double ticker_entry_delay_ms(double best_clearance_px, double speed_px_per_second);

// 位置是时间的纯函数（契约 §2.1 硬约束）。
// 左飞 x(t) = spawn_left_x - speed × t；右飞 x(t) = spawn_left_x + speed × t。
// 三参数保持左飞语义。禁止逐帧累加位移。
double ticker_position_x(
    double spawn_left_x,
    double speed_px_per_second,
    double elapsed_ms,
    bool fly_right = false);

// 出屏判定（契约 §8）。左飞：card.right < lane.left - exit_margin。
// 右飞：card.left > lane.right + exit_margin。三参数保持左飞语义。
bool ticker_is_offscreen(
    double card_edge_x,
    int lane_edge_px,
    int exit_margin_px,
    bool fly_right = false);

// 弹幕带的顶边 y（契约 §2.3）。band_top 为真时贴工作区顶部，否则贴底部。
int ticker_band_top_y(
    bool band_top,
    int work_area_top_px,
    int work_area_height_px,
    int band_height_px);

// 轨道纵向位置：band 顶边 + index × 轨道高。
int ticker_track_y(
    int band_top_px,
    int track_index,
    const TickerTrackPlan& plan);

}  // namespace notification_hub::scene
