#pragma once

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
//   否则 clearance = lane_right - nearest_ahead_right_edge - min_gap
// 注意：新卡出生时左边缘位于 lane_right（完全屏外），故要求的是
// nearest_ahead_right_edge <= lane_right - min_gap，即 clearance >= 0。
double ticker_track_clearance(
    bool has_card_ahead,
    double nearest_ahead_right_edge,
    int lane_right_px,
    int min_gap_px);

// 选轨（契约 §4）：净空最大者；并列取 index 最小者。空输入返回 -1。
int choose_ticker_track(const std::vector<double>& clearances);

// 延迟进屏毫秒数（契约 §4.3）：所有轨道净空为负时，延迟 (-clearance)/speed 秒。
// 不换道、不叠放。clearance >= 0 时返回 0。
double ticker_entry_delay_ms(double best_clearance_px, double speed_px_per_second);

// 位置是时间的纯函数（契约 §2.1 硬约束）。
// x(t) = spawn_left_x - speed × (t - spawn_t)。禁止逐帧累加位移：
// 心跳可能抖动/丢拍，累加会漂移和跳变。
double ticker_position_x(
    double spawn_left_x,
    double speed_px_per_second,
    double elapsed_ms);

// 出屏判定（契约 §8）：card.right < lane.left - exit_margin。
// 24px 缓冲用于避免窗口阴影/圆角被边缘「切一半」留在屏上。
bool ticker_is_offscreen(
    double card_right_x,
    int lane_left_px,
    int exit_margin_px);

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
