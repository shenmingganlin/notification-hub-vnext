#pragma once

#include <cmath>

namespace notification_hub::scene {

struct FollowState {
    double x{};
    double y{};
    double vx{};
    double vy{};
};

struct FollowStep {
    FollowState state{};
    bool settled{};
};

struct StackFollow {
    FollowState state{};
    double target_x{};
    double target_y{};
};

constexpr double kFollowOmega = 14.0;
constexpr double kFollowZeta = 1.0;
constexpr double kFollowPosEps = 0.5;
constexpr double kFollowVelEps = 8.0;
constexpr double kFollowDtMin = 1.0 / 120.0;
constexpr double kFollowDtMax = 1.0 / 20.0;

inline double clamp_follow_dt(double dt) noexcept {
    if (!(dt > 0.0) || !std::isfinite(dt)) return 1.0 / 60.0;
    if (dt < kFollowDtMin) return kFollowDtMin;
    if (dt > kFollowDtMax) return kFollowDtMax;
    return dt;
}

inline FollowStep tick_follow(FollowState s, double target_x, double target_y, double dt) noexcept {
    dt = clamp_follow_dt(dt);
    const double dx = target_x - s.x;
    const double dy = target_y - s.y;
    const double speed2 = s.vx * s.vx + s.vy * s.vy;
    const double dist2 = dx * dx + dy * dy;
    if (dist2 <= kFollowPosEps * kFollowPosEps && speed2 <= kFollowVelEps * kFollowVelEps) {
        s.x = target_x;
        s.y = target_y;
        s.vx = 0.0;
        s.vy = 0.0;
        return {s, true};
    }
    const double ax = kFollowOmega * kFollowOmega * dx - 2.0 * kFollowZeta * kFollowOmega * s.vx;
    const double ay = kFollowOmega * kFollowOmega * dy - 2.0 * kFollowZeta * kFollowOmega * s.vy;
    s.vx += ax * dt;
    s.vy += ay * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const double ndx = target_x - s.x;
    const double ndy = target_y - s.y;
    const double nspeed2 = s.vx * s.vx + s.vy * s.vy;
    const bool settled = (ndx * ndx + ndy * ndy) <= kFollowPosEps * kFollowPosEps
        && nspeed2 <= kFollowVelEps * kFollowVelEps;
    if (settled) {
        s.x = target_x;
        s.y = target_y;
        s.vx = 0.0;
        s.vy = 0.0;
    }
    return {s, settled};
}

}  // namespace notification_hub::scene
