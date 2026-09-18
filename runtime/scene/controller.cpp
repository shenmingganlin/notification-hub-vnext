#include "controller.hpp"

#include "window.hpp"
#include "overlay.hpp"
#include "layout.hpp"
#include "follow.hpp"
#include "ticker.hpp"
#include "work_area.hpp"
#include "../protocol/message.hpp"

#include <algorithm>
#include <array>
#include <cstdint>
#include <cctype>
#include <chrono>
#include <cmath>
#include <ctime>
#include <iomanip>
#include <limits>
#include <memory>
#include <optional>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#include <wincrypt.h>
#endif

namespace notification_hub::scene {
namespace {

bool is_visual_preview_card(std::string_view id) {
    return id.rfind("nh-visual-preview-", 0) == 0;
}

bool is_ticker_profile(std::string_view profile_id) {
    return profile_id == "ticker" || profile_id == "danmaku";
}

bool card_is_ticker(const SceneCardState& card) {
    if (card.visual.ticker_specified) return true;
    return card.behavior_specified && is_ticker_profile(card.behavior_profile_id);
}

#ifdef _WIN32
PaintBox card_paint_box(int x, int y, int width, int height, const VisualStyle& visual) {
    return paint_box_from_hit_box(x, y, width, height, clamp_paint_overflow(visual.paint_overflow));
}

std::uint64_t g_card_window_move_count = 0;
std::uint64_t g_scene_change_emit_count = 0;

bool apply_card_window_pos(HWND hwnd, int x, int y, int width, int height, bool size_changed, const VisualStyle& visual = {}) {
    if (hwnd == nullptr) return false;
    const auto paint = card_paint_box(x, y, width, height, visual);
    UINT flags = SWP_NOACTIVATE | SWP_NOZORDER;
    if (!size_changed) flags |= SWP_NOSIZE | SWP_NOREDRAW | SWP_NOSENDCHANGING | SWP_NOCOPYBITS | SWP_ASYNCWINDOWPOS;
    const bool moved = SetWindowPos(
        hwnd,
        nullptr,
        paint.x,
        paint.y,
        size_changed ? paint.width : 0,
        size_changed ? paint.height : 0,
        flags) != FALSE;
    if (moved) ++g_card_window_move_count;
    return moved;
}
#endif

bool apply_stack_card_placement(
    SceneCardState& card,
    SceneWindow& window,
    const StackCardPlacement& placement,
    bool follow,
    std::unordered_map<std::string, StackFollow>& follows,
    std::string& error_code,
    std::string& error_message,
    std::string_view geom_fail,
    std::string_view draw_fail) {
    const bool size_changed = card.window.width != placement.width || card.window.height != placement.height;
#ifdef _WIN32
    const bool dragging = window.is_dragging();
#else
    const bool dragging = false;
#endif
    const bool existing = follows.find(placement.id) != follows.end();
    if (!follow) {
        follows.erase(placement.id);
    } else {
        auto& chase = follows[placement.id];
        chase.target_x = static_cast<double>(placement.x);
        chase.target_y = static_cast<double>(placement.y);
        if (!existing) {
            chase.state.x = chase.target_x;
            chase.state.y = chase.target_y;
            chase.state.vx = 0.0;
            chase.state.vy = 0.0;
        } else if (dragging) {
            chase.state.x = static_cast<double>(card.window.x);
            chase.state.y = static_cast<double>(card.window.y);
            chase.state.vx = 0.0;
            chase.state.vy = 0.0;
        }
    }
    const bool jump = !follow || !existing;
    const bool move_window = jump && !dragging;
    if (move_window) {
        card.window = SceneWindowState{placement.x, placement.y, placement.width, placement.height};
    } else {
        card.window.width = placement.width;
        card.window.height = placement.height;
    }
#ifdef _WIN32
    const auto hwnd = static_cast<HWND>(window.native_handle());
    if (hwnd == nullptr) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = std::string(geom_fail);
        return false;
    }
    if (move_window || size_changed) {
        const int x = move_window ? placement.x : card.window.x;
        const int y = move_window ? placement.y : card.window.y;
        const auto paint = card_paint_box(x, y, placement.width, placement.height, card.visual);
        UINT flags = SWP_NOACTIVATE;
        if (!size_changed) flags |= SWP_NOSIZE;
        if (!move_window) flags |= SWP_NOMOVE;
        if (SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            paint.x,
            paint.y,
            size_changed ? paint.width : 0,
            size_changed ? paint.height : 0,
            flags) == FALSE) {
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = std::string(geom_fail);
            return false;
        }
        if (move_window) ++g_card_window_move_count;
    }
#endif
    if (size_changed && (!window.resize_render_target(placement.width, placement.height) || !window.paint())) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = std::string(draw_fail);
        return false;
    }
    return true;
}

void prune_stack_follows(
    std::unordered_map<std::string, StackFollow>& follows,
    const std::vector<StackCardPlacement>& placements,
    bool follow) {
    if (!follow) {
        follows.clear();
        return;
    }
    std::unordered_set<std::string> live;
    live.reserve(placements.size());
    for (const auto& placement : placements) live.insert(placement.id);
    for (auto it = follows.begin(); it != follows.end();) {
        if (!live.contains(it->first)) it = follows.erase(it);
        else ++it;
    }
}

bool visual_asset_file_is_trusted(std::string_view root_dir, const VisualAssetRecord& asset) {
#ifdef _WIN32
    const auto widen = [](std::string value) { return std::wstring(value.begin(), value.end()); };
    const auto root = widen(std::string(root_dir));
    std::wstring candidate = root;
    if (!candidate.empty() && candidate.back() != L'\\') candidate += L'\\';
    candidate += widen(asset.relative_path);
    wchar_t root_full[32768]{}; wchar_t candidate_full[32768]{};
    if (!GetFullPathNameW(root.c_str(), static_cast<DWORD>(std::size(root_full)), root_full, nullptr)
        || !GetFullPathNameW(candidate.c_str(), static_cast<DWORD>(std::size(candidate_full)), candidate_full, nullptr)) return false;
    std::wstring prefix(root_full);
    if (!prefix.empty() && prefix.back() != L'\\') prefix += L'\\';
    if (std::wstring(candidate_full).rfind(prefix, 0) != 0) return false;
    const auto attributes = GetFileAttributesW(candidate_full);
    if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0) return false;
    const auto file = CreateFileW(candidate_full, GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    wchar_t final_path[32768]{};
    const auto final_len = GetFinalPathNameByHandleW(file, final_path, static_cast<DWORD>(std::size(final_path)), VOLUME_NAME_DOS);
    if (final_len == 0 || final_len >= std::size(final_path)) { CloseHandle(file); return false; }
    std::wstring final_full(final_path);
    static constexpr std::wstring_view long_prefix = L"\\\\?\\";
    if (final_full.rfind(long_prefix, 0) == 0) final_full.erase(0, long_prefix.size());
    if (final_full.size() < prefix.size() || _wcsnicmp(final_full.c_str(), prefix.c_str(), prefix.size()) != 0) { CloseHandle(file); return false; }
    HCRYPTPROV provider{}; HCRYPTHASH hash{}; bool valid = false;
    if (CryptAcquireContextW(&provider, nullptr, nullptr, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)
        && CryptCreateHash(provider, CALG_SHA_256, 0, 0, &hash)) {
        std::array<std::uint8_t, 8192> buffer{}; DWORD read = 0; bool read_ok = true;
        while (ReadFile(file, buffer.data(), static_cast<DWORD>(buffer.size()), &read, nullptr) && read > 0) if (!CryptHashData(hash, buffer.data(), read, 0)) { read_ok = false; break; }
        DWORD size = 32; std::array<std::uint8_t, 32> digest{};
        if (read_ok && CryptGetHashParam(hash, HP_HASHVAL, digest.data(), &size, 0)) {
            static constexpr char hex[] = "0123456789abcdef"; std::string actual;
            for (const auto byte : digest) { actual.push_back(hex[byte >> 4]); actual.push_back(hex[byte & 15]); }
            auto expected = asset.sha256; std::transform(expected.begin(), expected.end(), expected.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
            valid = actual == expected;
        }
        CryptDestroyHash(hash);
    }
    if (provider) CryptReleaseContext(provider, 0);
    CloseHandle(file); return valid;
#else
    static_cast<void>(root_dir); static_cast<void>(asset); return false;
#endif
}

std::wstring widen(std::string_view value) {
#ifdef _WIN32
    if (value.empty() || value.size() > static_cast<std::size_t>((std::numeric_limits<int>::max)())) {
        return {};
    }
    const auto byte_count = static_cast<int>(value.size());
    const auto wide_count = MultiByteToWideChar(
        CP_UTF8,
        0,
        value.data(),
        byte_count,
        nullptr,
        0);
    if (wide_count <= 0) return {};
    std::wstring result(static_cast<std::size_t>(wide_count), L'\0');
    if (MultiByteToWideChar(
            CP_UTF8,
            0,
            value.data(),
            byte_count,
            result.data(),
            wide_count) != wide_count) {
        return {};
    }
    return result;
#else
    return std::wstring(value.begin(), value.end());
#endif
}

bool valid_window_state(const SceneWindowState& state) {
    return state.width > 0 && state.height > 0 && state.width <= 10000 && state.height <= 10000;
}

std::string json_string(std::string_view value) {
    return std::string("\"") + protocol::escape_json_string(value) + "\"";
}

std::string card_json(const SceneCardState& card) {
    return std::string("{\"id\":") + json_string(card.id)
        + ",\"title\":" + json_string(card.title)
        + ",\"body\":" + json_string(card.body)
        + ",\"x\":" + std::to_string(card.window.x)
        + ",\"y\":" + std::to_string(card.window.y)
        + ",\"width\":" + std::to_string(card.window.width)
        + ",\"height\":" + std::to_string(card.window.height)
        + (card.visual.specified
            ? std::string(",\"visual\":{\"enabled\":") + (card.visual.enabled ? "true" : "false")
                + ",\"preset\":" + json_string(card.visual.preset)
                + ",\"intensity\":" + json_string(card.visual.intensity)
                + ",\"category\":" + (card.visual.category.empty() ? std::string("null") : json_string(card.visual.category))
                + ",\"cardType\":" + json_string(card.visual.card_type)
                + ",\"behavior\":{\"layout\":" + json_string(card.visual.layout)
                + ",\"boundary\":" + json_string(card.visual.boundary) + "}"
                + ",\"interaction\":{\"dismissMode\":" + json_string(card.visual.dismiss_mode)
                + ",\"closeButtonPosition\":" + json_string(card.visual.close_button_position)
                + ",\"timeoutMs\":" + std::to_string(card.visual.dismiss_timeout_ms)
                + (card.visual.hover_highlight ? ",\"hoverHighlight\":true" : std::string())
                + (card.visual.auto_dismiss ? ",\"autoDismiss\":true" : std::string())
                + (!card.visual.hold_drag ? ",\"holdDrag\":false" : std::string()) + "}"
                + ",\"appearance\":{\"size\":" + json_string(card.visual.size)
                + ",\"aspectRatio\":" + json_string(card.visual.aspect_ratio)
                + ",\"backgroundColor\":" + json_string(card.visual.background_color)
                + (card.visual.background_asset_id.empty() ? std::string() : ",\"backgroundAssetId\":" + json_string(card.visual.background_asset_id))
                + ",\"backgroundFit\":" + json_string(card.visual.background_fit)
                + ",\"backgroundPadding\":" + std::to_string(card.visual.background_padding) + ",\"borderRadius\":" + std::to_string(card.visual.border_radius)
                + ",\"opacity\":" + std::to_string(card.visual.opacity)
                + (card.visual.border_width > 0
                    ? ",\"borderWidth\":" + std::to_string(card.visual.border_width) + ",\"borderColor\":" + json_string(card.visual.border_color)
                    : std::string())
                + (card.visual.paint_overflow > 0
                    ? ",\"paintOverflow\":" + std::to_string(card.visual.paint_overflow)
                    : std::string())
                + "}}"
            : std::string())
        + (card.presentation_specified
            ? std::string(",\"presentation\":{\"eventId\":") + json_string(card.event_id)
                + ",\"categoryId\":" + json_string(card.category_id)
                + ",\"eventTypeId\":" + json_string(card.event_type_id)
                + ",\"visualProfileId\":" + json_string(card.visual_profile_id) + "}"
            : std::string())
        + (card.behavior_specified
            ? std::string(",\"behavior\":{\"behaviorProfileId\":") + json_string(card.behavior_profile_id)
                + ",\"behaviorChannelId\":" + json_string(card.behavior_channel_id) + "}"
            : std::string())
        + "}";
}

std::string scene_state_timestamp() {
    const auto now = std::chrono::system_clock::now();
    const auto time = std::chrono::system_clock::to_time_t(now);
    std::tm utc{};
#ifdef _WIN32
    gmtime_s(&utc, &time);
#else
    gmtime_r(&time, &utc);
#endif
    const auto milliseconds = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;
    std::ostringstream output;
    output << std::put_time(&utc, "%Y-%m-%dT%H:%M:%S")
        << '.' << std::setfill('0') << std::setw(3) << milliseconds.count() << 'Z';
    return output.str();
}

std::string change_json(
    std::string_view reason,
    std::string_view target,
    std::string_view target_id,
    bool recoverable,
    bool notify_user,
    std::string_view error_code = {},
    std::string_view error_message = {}) {
    const auto error = error_code.empty()
        ? std::string("null")
        : std::string("{\"code\":") + json_string(error_code)
            + ",\"message\":" + json_string(error_message) + "}";
    return std::string("{\"status\":\"changed\",\"reason\":") + json_string(reason)
        + ",\"target\":" + json_string(target)
        + ",\"targetId\":" + json_string(target_id)
        + ",\"recoverable\":" + (recoverable ? "true" : "false")
        + ",\"notifyUser\":" + (notify_user ? "true" : "false")
        + ",\"error\":" + error + "}";
}

}  // namespace

class RuntimeSceneController::Impl {
public:
    struct FlightChannelState {
        std::string channel_id;
        std::string profile_id;
        std::vector<std::string> card_order;
        // 弹幕公路法：优先 explicit_ticker_charter；否则第一张 ticker 卡播种。后卡不得覆盖。
        TickerChannelOptions ticker_options{};
        bool ticker_options_specified{};
    };

    TickerChannelOptions explicit_ticker_charter{};
    bool explicit_ticker_charter_specified{};

    static std::string channel_id_for(const SceneCardState& card) {
        return card.behavior_specified && !card.behavior_channel_id.empty()
            ? card.behavior_channel_id
            : "__legacy__";
    }

    static std::string profile_id_for(const SceneCardState& card) {
        return card.behavior_specified && !card.behavior_profile_id.empty()
            ? card.behavior_profile_id
            : "stack";
    }

    bool has_explicit_flight_channels() const {
        return std::any_of(
            flight_channel_order.begin(),
            flight_channel_order.end(),
            [](const std::string& channel_id) { return channel_id != "__legacy__"; });
    }

    VisualStyle resolve_visual(const VisualStyle& visual) const {
        auto resolved = visual;
        if (resolved.background_asset_id.empty()) return resolved;
        const auto asset_it = visual_assets.find(resolved.background_asset_id);
        if (asset_it == visual_assets.end() || !asset_it->second.enabled
            || (asset_it->second.format != "png" && asset_it->second.format != "webp" && asset_it->second.format != "jpg")
            || !trusted_asset(asset_it->second)) {
            resolved.background_asset_id.clear();
            resolved.background_asset_path.clear();
        } else {
            resolved.background_asset_path = visual_asset_root_dir;
            if (!resolved.background_asset_path.empty() && resolved.background_asset_path.back() != '\\') resolved.background_asset_path += '\\';
            resolved.background_asset_path += asset_it->second.relative_path;
            resolved.background_asset_sha256 = asset_it->second.sha256;
        }
        return resolved;
    }

    bool image_format_ok(const std::string& format) const {
        return format == "png" || format == "webp" || format == "jpg" || format == "jpeg";
    }

    bool trusted_agent_asset(const VisualAssetRecord& asset) const {
        const auto key = asset.asset_id + "|" + asset.sha256;
        if (trusted_agent_avatar_keys.contains(key)) return true;
        if (!visual_asset_file_is_trusted(agent_avatar_root_dir, asset)) return false;
        trusted_agent_avatar_keys.insert(key);
        return true;
    }

    void resolve_part_wallpaper(CardPart& part) const {
        if (part.background_asset_id.empty()) return;
        const bool agent = part.background_asset_id.rfind("agent.", 0) == 0;
        const auto& table = agent ? agent_avatars : visual_assets;
        const auto& root = agent ? agent_avatar_root_dir : visual_asset_root_dir;
        const auto asset_it = table.find(part.background_asset_id);
        const bool trusted = asset_it == table.end()
            ? false
            : (agent ? trusted_agent_asset(asset_it->second) : trusted_asset(asset_it->second));
        if (asset_it == table.end() || !asset_it->second.enabled
            || !image_format_ok(asset_it->second.format)
            || !trusted) {
            part.background_asset_id.clear();
            part.background_asset_path.clear();
            part.background_asset_sha256.clear();
        } else {
            part.background_asset_path = root;
            if (!part.background_asset_path.empty() && part.background_asset_path.back() != '\\') part.background_asset_path += '\\';
            part.background_asset_path += asset_it->second.relative_path;
            part.background_asset_sha256 = asset_it->second.sha256;
        }
    }

    void resolve_part_font(CardPart& part) const {
        if (part.font_asset_id.empty()) return;
        const auto asset_it = font_assets.find(part.font_asset_id);
        if (asset_it == font_assets.end() || !asset_it->second.enabled
            || (asset_it->second.format != "ttf" && asset_it->second.format != "otf")
            || !trusted_font_asset(asset_it->second)) {
            part.font_asset_id.clear();
            part.font_asset_path.clear();
        } else {
            part.font_asset_path = font_asset_root_dir;
            if (!part.font_asset_path.empty() && part.font_asset_path.back() != '\\') part.font_asset_path += '\\';
            part.font_asset_path += asset_it->second.relative_path;
        }
    }

    void rebuild_flight_channels() {
        flight_channels.clear();
        flight_channel_order.clear();
        for (const auto& id : card_order) {
            const auto card_it = cards.find(id);
            if (card_it == cards.end()) continue;
            const auto channel_id = channel_id_for(card_it->second);
            auto channel_it = flight_channels.find(channel_id);
            if (channel_it == flight_channels.end()) {
                FlightChannelState channel{channel_id, profile_id_for(card_it->second), {}};
                channel_it = flight_channels.emplace(channel_id, std::move(channel)).first;
                flight_channel_order.push_back(channel_id);
            }
            const bool ticker_card = card_it->second.visual.ticker_specified
                || is_ticker_profile(channel_it->second.profile_id);
            if (explicit_ticker_charter_specified && ticker_card) {
                channel_it->second.ticker_options = explicit_ticker_charter;
                channel_it->second.ticker_options_specified = true;
            } else if (card_it->second.visual.ticker_specified && !channel_it->second.ticker_options_specified) {
                // Compat seed: first ticker card writes the highway if JS has not sent set-charter.
                auto& options = channel_it->second.ticker_options;
                options.band_top = card_it->second.visual.ticker_band != "bottom";
                options.band_ratio = card_it->second.visual.ticker_band_ratio;
                options.track_count = card_it->second.visual.ticker_track_count;
                options.track_gap_px = card_it->second.visual.ticker_track_gap_px;
                options.min_gap_px = card_it->second.visual.ticker_min_gap_px;
                channel_it->second.ticker_options_specified = true;
            }
            channel_it->second.card_order.push_back(id);
        }
    }

    // 弹幕卡片的运动状态。位置不存当前值，而是存「出生时刻 + 出生位置」，
    // 每拍按契约 §2.1 的纯函数重算——这样心跳抖动/丢拍不会造成漂移。
    struct TickerMotion {
        std::chrono::steady_clock::time_point spawn{};
        double spawn_left_x{};
        double speed_px_per_second{400.0};
        int track_index{};
        int band_top{};
        int lane_left{};
        int lane_right{};
        int exit_margin_px{24};
        bool fly_right{};
        TickerTrackPlan plan{};
    };

    // Ticker 通道摆位（契约 §3 / §4）。返回 false 表示几何无法应用。
    bool place_ticker_channel(
        const FlightChannelState& channel,
        const StackLayoutOptions& options,
        std::string& error_code,
        std::string& error_message);

    std::unordered_map<std::string, TickerMotion> ticker_motions;
    std::unordered_map<std::string, StackFollow> stack_follows;
    bool ticker_ticking{};
    std::chrono::steady_clock::time_point last_tick{};
    int ticker_heartbeat_ms{16};

    bool has_active_follow() const {
        if (active_layout.settle != StackSettle::Follow) return false;
        for (const auto& entry : stack_follows) {
            const auto window_it = card_windows.find(entry.first);
            if (window_it == card_windows.end() || window_it->second == nullptr) continue;
#ifdef _WIN32
            if (window_it->second->is_dragging()) continue;
#endif
            const auto& chase = entry.second;
            const double dx = chase.target_x - chase.state.x;
            const double dy = chase.target_y - chase.state.y;
            const double speed2 = chase.state.vx * chase.state.vx + chase.state.vy * chase.state.vy;
            if ((dx * dx + dy * dy) > kFollowPosEps * kFollowPosEps
                || speed2 > kFollowVelEps * kFollowVelEps) {
                return true;
            }
        }
        return false;
    }

    std::unique_ptr<SceneWindow> window;
    SceneWindowState state{};
    std::unordered_map<std::string, SceneCardState> cards;
    std::unordered_map<std::string, std::unique_ptr<SceneWindow>> card_windows;
#ifdef _WIN32
    std::unique_ptr<TickerOverlay> ticker_overlay;
    CardRenderer overlay_painter;
    bool overlay_painter_ready{};
    bool ensure_ticker_overlay();
    bool paint_ticker_sprite(const SceneCardState& card);
    bool move_ticker_sprite(const SceneCardState& card, bool commit_now);
    void drop_ticker_sprite(std::string_view id);
    bool sync_overlay_hover();
    void raise_stack_above_overlay();
    std::string overlay_hover_id;
#endif
    std::vector<std::string> card_order;
    std::unordered_map<std::string, FlightChannelState> flight_channels;
    std::vector<std::string> flight_channel_order;
    StackLayoutOptions active_layout{};
    bool has_active_layout{};
    bool active_layout_uses_provider{};
    WorkAreaSnapshot provider_work_area{};
    WorkAreaSnapshot active_work_area{};
    std::string pending_change_metadata_json;
    std::unordered_map<std::string, VisualAssetRecord> visual_assets;
    std::string visual_asset_root_dir;
    mutable std::unordered_set<std::string> trusted_visual_asset_keys;
    std::unordered_map<std::string, VisualAssetRecord> font_assets;
    std::string font_asset_root_dir;
    mutable std::unordered_set<std::string> trusted_font_asset_keys;
    std::unordered_map<std::string, VisualAssetRecord> agent_avatars;
    std::string agent_avatar_root_dir;
    mutable std::unordered_set<std::string> trusted_agent_avatar_keys;

    bool trusted_asset(const VisualAssetRecord& asset) const {
        const auto key = asset.asset_id + "|" + asset.sha256;
        if (trusted_visual_asset_keys.contains(key)) return true;
        if (!visual_asset_file_is_trusted(visual_asset_root_dir, asset)) return false;
        trusted_visual_asset_keys.insert(key);
        return true;
    }

    bool trusted_font_asset(const VisualAssetRecord& asset) const {
        const auto key = asset.asset_id + "|" + asset.sha256;
        if (trusted_font_asset_keys.contains(key)) return true;
        if (!visual_asset_file_is_trusted(font_asset_root_dir, asset)) return false;
        trusted_font_asset_keys.insert(key);
        return true;
    }
};

#ifdef _WIN32
bool RuntimeSceneController::Impl::ensure_ticker_overlay() {
    int left = 0;
    int top = 0;
    int width = 0;
    int height = 0;
    if (has_active_layout && active_layout.work_area_width > 0 && active_layout.work_area_height > 0) {
        left = active_layout.work_area_left;
        top = active_layout.work_area_top;
        width = active_layout.work_area_width;
        height = active_layout.work_area_height;
    } else if (active_work_area.rect.width > 0 && active_work_area.rect.height > 0) {
        left = active_work_area.rect.left;
        top = active_work_area.rect.top;
        width = active_work_area.rect.width;
        height = active_work_area.rect.height;
    } else {
        const auto area = query_primary_work_area();
        left = area.rect.left;
        top = area.rect.top;
        width = area.rect.width;
        height = area.rect.height;
    }
    if (width <= 0 || height <= 0) return false;
    if (ticker_overlay == nullptr) ticker_overlay = std::make_unique<TickerOverlay>();
    if (!ticker_overlay->create(left, top, width, height)) return false;
    if (!overlay_painter_ready) {
        if (!overlay_painter.initialize(ticker_overlay->native_handle(), 64, 64)) return false;
        overlay_painter_ready = true;
    }
    bool click_through = true;
    for (const auto& id : card_order) {
        const auto it = cards.find(id);
        if (it == cards.end()) continue;
        if (it->second.visual.ticker_specified && !it->second.visual.ticker_click_through) {
            click_through = false;
            break;
        }
    }
    ticker_overlay->set_click_through(click_through);
    raise_stack_above_overlay();
    return sync_overlay_hover();
}

bool RuntimeSceneController::Impl::paint_ticker_sprite(const SceneCardState& card) {
    if (!ensure_ticker_overlay()) return false;
    const auto paint = card_paint_box(
        card.window.x, card.window.y, card.window.width, card.window.height, card.visual);
    if (!overlay_painter.resize(paint.width, paint.height)) return false;
    const bool hovered = overlay_should_highlight(
        ticker_overlay->click_through(),
        ticker_overlay->hovered_id(),
        card.id,
        card.visual.hover_highlight);
    if (!overlay_painter.draw_buffer(
            widen(card.title),
            widen(card.body),
            card.visual,
            false,
            card.parts,
            hovered,
            widen(card.assistant_name))) {
        return false;
    }
    const void* bits = nullptr;
    int pitch = 0;
    int buffer_width = 0;
    int buffer_height = 0;
    if (!overlay_painter.buffer_bits(bits, pitch, buffer_width, buffer_height)) return false;
    if (ticker_overlay->has_sprite(card.id)
        && ticker_overlay->update_pixels(card.id, buffer_width, buffer_height, bits, pitch)) {
        return ticker_overlay->commit();
    }
    if (!ticker_overlay->add_sprite(card.id, buffer_width, buffer_height, bits, pitch)) return false;
    if (!ticker_overlay->set_offset(card.id, paint.x, paint.y)) return false;
    return ticker_overlay->commit();
}

bool RuntimeSceneController::Impl::move_ticker_sprite(const SceneCardState& card, bool commit_now) {
    if (ticker_overlay == nullptr || !ticker_overlay->has_sprite(card.id)) {
        return paint_ticker_sprite(card);
    }
    const auto paint = card_paint_box(
        card.window.x, card.window.y, card.window.width, card.window.height, card.visual);
    if (!ticker_overlay->set_offset(card.id, paint.x, paint.y)) return false;
    return commit_now ? ticker_overlay->commit() : true;
}

bool RuntimeSceneController::Impl::sync_overlay_hover() {
    if (ticker_overlay == nullptr) {
        overlay_hover_id.clear();
        return true;
    }
    const auto next = ticker_overlay->click_through() ? std::string{} : ticker_overlay->hovered_id();
    if (next == overlay_hover_id) return true;
    const auto previous = overlay_hover_id;
    overlay_hover_id = next;
    bool ok = true;
    if (!previous.empty()) {
        const auto it = cards.find(previous);
        if (it != cards.end() && it->second.visual.hover_highlight) {
            ok = paint_ticker_sprite(it->second) && ok;
        }
    }
    if (!next.empty() && next != previous) {
        const auto it = cards.find(next);
        if (it != cards.end() && it->second.visual.hover_highlight) {
            ok = paint_ticker_sprite(it->second) && ok;
        }
    }
    return ok;
}

void RuntimeSceneController::Impl::drop_ticker_sprite(std::string_view id) {
    if (ticker_overlay == nullptr) return;
    if (overlay_hover_id == id) overlay_hover_id.clear();
    if (ticker_overlay->hovered_id() == id) ticker_overlay->clear_hover();
    ticker_overlay->remove_sprite(id);
    ticker_overlay->commit();
    if (ticker_overlay->empty()) {
        ticker_overlay->destroy();
        overlay_painter.reset();
        overlay_painter_ready = false;
        overlay_hover_id.clear();
    }
}

void RuntimeSceneController::Impl::raise_stack_above_overlay() {
    if (ticker_overlay == nullptr || !ticker_overlay->is_created()) return;
    for (const auto& entry : card_windows) {
        if (entry.second == nullptr) continue;
        const auto hwnd = static_cast<HWND>(entry.second->native_handle());
        if (hwnd == nullptr) continue;
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOREDRAW | SWP_NOSENDCHANGING);
    }
}
#endif

bool RuntimeSceneController::Impl::place_ticker_channel(
    const FlightChannelState& channel,
    const StackLayoutOptions& options,
    std::string& error_code,
    std::string& error_message) {
    const auto& ticker = channel.ticker_options;
    const auto lane_left = options.work_area_left;
    const auto lane_right = options.work_area_left + options.work_area_width;
    // 卡高取本通道最大者：契约 §2.2 要求等高，用最大值保证轨道容纳。
    auto card_height = 0;
    for (const auto& id : channel.card_order) {
        const auto card_it = cards.find(id);
        if (card_it == cards.end()) continue;
        const auto height = card_it->second.layout_height > 0
            ? card_it->second.layout_height
            : card_it->second.window.height;
        if (height > card_height) card_height = height;
    }
    if (card_height <= 0) return true;

    auto band_height = 0;
    auto band_top = options.work_area_top;
    TickerTrackPlan plan{};
    if (ticker.track_count > 0) {
        plan = plan_ticker_tracks(options.work_area_height, card_height, ticker.track_gap_px, ticker.track_count);
    } else {
        band_height = static_cast<int>(std::lround(
            static_cast<double>(options.work_area_height) * ticker.band_ratio));
        band_top = ticker_band_top_y(
            ticker.band_top, options.work_area_top, options.work_area_height, band_height);
        plan = plan_ticker_tracks(band_height, card_height, ticker.track_gap_px, ticker.track_count);
    }
    const auto max_tracks = (std::max)(1, (options.work_area_height + plan.track_gap_px) / plan.track_height_px);
    if (plan.track_count > max_tracks) plan.track_count = max_tracks;
    const auto needed_band = plan.track_count * plan.track_height_px - plan.track_gap_px;
    if (ticker.track_count > 0) {
        band_height = (std::min)(options.work_area_height, needed_band);
        band_top = ticker_band_top_y(
            ticker.band_top, options.work_area_top, options.work_area_height, band_height);
    } else if (needed_band > band_height) {
        band_height = (std::min)(options.work_area_height, needed_band);
        band_top = ticker_band_top_y(
            ticker.band_top, options.work_area_top, options.work_area_height, band_height);
    }
    const auto now = std::chrono::steady_clock::now();

    for (const auto& id : channel.card_order) {
        auto card_it = cards.find(id);
        if (card_it == cards.end()) continue;

        auto motion_it = ticker_motions.find(id);
        if (motion_it == ticker_motions.end()) {
            // 新卡：按「进屏点前方的净空」选轨（契约 §4），不是按轨道里卡片的数量。
            // 方向是这张卡的动态；已在飞的卡锁出生方向，这里不算掉头。
            const auto fly_right = card_it->second.visual.ticker_specified
                ? card_it->second.visual.ticker_direction == "right"
                : ticker.direction == "right";
            const auto card_width = card_it->second.layout_width > 0
                ? card_it->second.layout_width
                : card_it->second.window.width;
            std::vector<double> nearest_ahead(static_cast<std::size_t>(plan.track_count), 0.0);
            std::vector<bool> has_ahead(static_cast<std::size_t>(plan.track_count), false);
            for (const auto& other_id : channel.card_order) {
                if (other_id == id) continue;
                const auto other_motion_it = ticker_motions.find(other_id);
                const auto other_card_it = cards.find(other_id);
                if (other_motion_it == ticker_motions.end() || other_card_it == cards.end()) continue;
                const auto& other = other_motion_it->second;
                if (other.track_index < 0 || other.track_index >= plan.track_count) continue;
                const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                    now - other.spawn).count();
                const auto other_width = other_card_it->second.layout_width > 0
                    ? other_card_it->second.layout_width
                    : other_card_it->second.window.width;
                const auto other_x = ticker_position_x(
                    other.spawn_left_x, other.speed_px_per_second, static_cast<double>(elapsed), other.fly_right);
                const auto index = static_cast<std::size_t>(other.track_index);
                if (fly_right) {
                    if (!has_ahead[index] || other_x < nearest_ahead[index]) {
                        nearest_ahead[index] = other_x;
                        has_ahead[index] = true;
                    }
                } else {
                    const auto ahead_right = other_x + static_cast<double>(other_width);
                    if (!has_ahead[index] || ahead_right > nearest_ahead[index]) {
                        nearest_ahead[index] = ahead_right;
                        has_ahead[index] = true;
                    }
                }
            }

            std::vector<double> clearances(static_cast<std::size_t>(plan.track_count), 0.0);
            for (auto index = 0; index < plan.track_count; ++index) {
                clearances[static_cast<std::size_t>(index)] = ticker_track_clearance(
                    has_ahead[static_cast<std::size_t>(index)],
                    nearest_ahead[static_cast<std::size_t>(index)],
                    fly_right ? lane_left : lane_right,
                    ticker.min_gap_px,
                    fly_right);
            }
            const auto track_index = choose_ticker_track(clearances);
            if (track_index < 0) continue;
            auto card_speed = ticker.speed_px_per_second;
            if (card_it->second.visual.ticker_specified) {
                card_speed = static_cast<double>(card_it->second.visual.ticker_speed_px_per_second);
                if (card_speed < 150.0) card_speed = 150.0;
                if (card_speed > 800.0) card_speed = 800.0;
            }
            // 全占时不换道、不叠放：把出生时间推到未来，卡片在屏外等待（契约 §4.3）。
            const auto delay_ms = ticker_entry_delay_ms(
                clearances[static_cast<std::size_t>(track_index)], card_speed);

            TickerMotion motion{};
            motion.spawn = now + std::chrono::milliseconds(static_cast<long long>(std::llround(delay_ms)));
            motion.spawn_left_x = fly_right
                ? static_cast<double>(lane_left - card_width)
                : static_cast<double>(lane_right);
            motion.speed_px_per_second = card_speed;
            motion.track_index = track_index;
            motion.band_top = band_top;
            motion.lane_left = lane_left;
            motion.lane_right = lane_right;
            motion.exit_margin_px = ticker.exit_margin_px;
            motion.fly_right = fly_right;
            motion.plan = plan;
            ticker_motions.emplace(id, motion);
            motion_it = ticker_motions.find(id);
        } else {
            // 其它卡片进出可能改变本通道 lane：出屏判定必须用当前 lane，
            // 否则会把弹幕提前回收（或永远回收不掉）。
            // 只刷新判定参数，不动出生点与方向，避免飞行中的卡片跳变或掉头。
            motion_it->second.lane_left = lane_left;
            motion_it->second.lane_right = lane_right;
            motion_it->second.exit_margin_px = ticker.exit_margin_px;
        }

        if (motion_it == ticker_motions.end()) continue;
        const auto& motion = motion_it->second;
        const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - motion.spawn).count();
        const auto x = static_cast<int>(std::lround(ticker_position_x(
            motion.spawn_left_x, motion.speed_px_per_second, static_cast<double>(elapsed), motion.fly_right)));
        const auto y = ticker_track_y(motion.band_top, motion.track_index, motion.plan);
        const auto width = card_it->second.layout_width > 0
            ? card_it->second.layout_width
            : card_it->second.window.width;
        const auto height = card_it->second.layout_height > 0
            ? card_it->second.layout_height
            : card_it->second.window.height;
        const auto size_changed = card_it->second.window.width != width
            || card_it->second.window.height != height;
        card_it->second.window = SceneWindowState{x, y, width, height};
#ifdef _WIN32
        if (size_changed) {
            if (!paint_ticker_sprite(card_it->second)) {
                error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
                error_message = "Ticker overlay could not paint the card surface";
                return false;
            }
        } else if (!move_ticker_sprite(card_it->second, false)) {
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = "Ticker overlay could not move the card sprite";
            return false;
        }
#endif
    }
#ifdef _WIN32
    if (ticker_overlay != nullptr && !ticker_overlay->commit()) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = "Ticker overlay could not commit sprite offsets";
        return false;
    }
#endif
    return true;
}

void RuntimeSceneController::configure_visual_assets(const std::vector<VisualAssetRecord>& assets, std::string_view root_dir) {
    if (impl_ == nullptr) impl_ = new Impl();
    impl_->visual_assets.clear();
    impl_->trusted_visual_asset_keys.clear();
    impl_->visual_asset_root_dir = std::string(root_dir);
    for (const auto& asset : assets) impl_->visual_assets.emplace(asset.asset_id, asset);
}

void RuntimeSceneController::configure_font_assets(const std::vector<VisualAssetRecord>& assets, std::string_view root_dir) {
    if (impl_ == nullptr) impl_ = new Impl();
    impl_->font_assets.clear();
    impl_->trusted_font_asset_keys.clear();
    impl_->font_asset_root_dir = std::string(root_dir);
    for (const auto& asset : assets) impl_->font_assets.emplace(asset.asset_id, asset);
}

void RuntimeSceneController::configure_agent_avatars(const std::vector<VisualAssetRecord>& assets, std::string_view root_dir) {
    if (impl_ == nullptr) impl_ = new Impl();
    impl_->agent_avatars.clear();
    impl_->trusted_agent_avatar_keys.clear();
    impl_->agent_avatar_root_dir = std::string(root_dir);
    for (const auto& asset : assets) impl_->agent_avatars.emplace(asset.asset_id, asset);
}

bool RuntimeSceneController::has_visual_asset(std::string_view asset_id) const noexcept {
    if (impl_ == nullptr) return false;
    const auto it = impl_->visual_assets.find(std::string(asset_id));
    return it != impl_->visual_assets.end() && it->second.enabled;
}

bool RuntimeSceneController::has_font_asset(std::string_view asset_id) const noexcept {
    if (impl_ == nullptr) return false;
    const auto it = impl_->font_assets.find(std::string(asset_id));
    return it != impl_->font_assets.end() && it->second.enabled;
}

std::size_t RuntimeSceneController::visual_asset_count() const noexcept {
    return impl_ == nullptr ? 0 : impl_->visual_assets.size();
}

std::size_t RuntimeSceneController::font_asset_count() const noexcept {
    return impl_ == nullptr ? 0 : impl_->font_assets.size();
}

RuntimeSceneController::~RuntimeSceneController() {
    if (impl_ == nullptr) return;
    delete impl_;
    impl_ = nullptr;
}

bool RuntimeSceneController::apply_window_state(
    const SceneWindowState& state,
    std::string& error_code,
    std::string& error_message) {
    if (!valid_window_state(state)) {
        error_code = "RUNTIME_SCENE_STATE_INVALID";
        error_message = "scene.update width and height are outside the supported range";
        return false;
    }

    if (impl_ == nullptr) impl_ = new Impl();
    if (impl_->window == nullptr) {
        impl_->window = std::make_unique<SceneWindow>(WindowConfig{
            L"Notification Hub Runtime Scene",
            L"Recovered scene window",
            state.width,
            state.height,
            true,
            state.x,
            state.y,
            true});
        if (!impl_->window->create() || !impl_->window->show()) {
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = "Runtime scene window could not be created or shown; " + impl_->window->create_error();
            impl_->window.reset();
            return false;
        }
    }

#ifdef _WIN32
    const auto hwnd = static_cast<HWND>(impl_->window->native_handle());
    if (hwnd == nullptr || SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        state.x,
        state.y,
        state.width,
        state.height,
        SWP_NOACTIVATE | SWP_SHOWWINDOW) == FALSE) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = "Runtime scene window position or size could not be applied";
        return false;
    }
#endif

    if (!impl_->window->resize_render_target(state.width, state.height)) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = "Runtime scene renderer target could not be resized";
        return false;
    }
    if (!impl_->window->paint()) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = "Runtime scene renderer could not draw the scene window";
        return false;
    }
    impl_->state = state;
    return true;
}

bool RuntimeSceneController::create_card(
    const SceneCardState& card,
    std::string& error_code,
    std::string& error_message) {
    if (card.id.empty() || card.title.empty() || !valid_window_state(card.window)) {
        error_code = "RUNTIME_SCENE_CARD_INVALID";
        error_message = "scene.create requires id, title, and a valid window state";
        return false;
    }
    if (impl_ == nullptr) impl_ = new Impl();
    if (impl_->cards.contains(card.id)) {
        error_code = "RUNTIME_SCENE_CARD_EXISTS";
        error_message = "scene.create id already exists";
        return false;
    }

    auto resolved_parts = card.parts;
    for (auto& part : resolved_parts) {
        impl_->resolve_part_wallpaper(part);
        impl_->resolve_part_font(part);
    }
    const auto resolved_visual = impl_->resolve_visual(card.visual);
    auto stored_card = card;
    stored_card.parts = std::move(resolved_parts);
    stored_card.visual = resolved_visual;
    stored_card.layout_width = card.layout_width > 0 ? card.layout_width : card.window.width;
    stored_card.layout_height = card.layout_height > 0 ? card.layout_height : card.window.height;

    const auto rollback_card = [&]() {
        if (!impl_->card_order.empty() && impl_->card_order.back() == card.id) impl_->card_order.pop_back();
        impl_->card_windows.erase(card.id);
        impl_->cards.erase(card.id);
#ifdef _WIN32
        impl_->drop_ticker_sprite(card.id);
#endif
        impl_->rebuild_flight_channels();
    };
    const auto reapply_active_layout = [&]() {
        if (!impl_->has_active_layout) return true;
        auto reapply_options = impl_->active_layout;
        if (impl_->active_layout_uses_provider) {
            reapply_options.work_area_width = 0;
            reapply_options.work_area_height = 0;
            reapply_options.dpi_scale = 1.0f;
            reapply_options.work_area_left = 0;
            reapply_options.work_area_top = 0;
            reapply_options.work_area_is_fallback = false;
            reapply_options.work_area_source.clear();
        }
        return apply_stack_layout(reapply_options, error_code, error_message);
    };

    if (card_is_ticker(stored_card)) {
        impl_->cards.emplace(card.id, stored_card);
        impl_->card_order.push_back(card.id);
        impl_->rebuild_flight_channels();
#ifdef _WIN32
        if (!impl_->has_active_layout && !impl_->paint_ticker_sprite(impl_->cards.at(card.id))) {
            rollback_card();
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = "scene.create could not paint the ticker overlay sprite";
            return false;
        }
#endif
        if (!reapply_active_layout()) {
            rollback_card();
            return false;
        }
        return true;
    }

    auto window = std::make_unique<SceneWindow>(WindowConfig{
        widen(card.title),
        widen(card.body),
        card.window.width,
        card.window.height,
        true,
        card.window.x,
        card.window.y,
        true});
    window->update_parts(stored_card.parts);
    window->update_assistant_name(widen(card.assistant_name));
    window->update_visual(resolved_visual);
    if (!window->create()) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = "scene.create could not create the card window; " + window->create_error();
        return false;
    }
    auto* created_window = window.get();
#ifdef _WIN32
    const auto hwnd = static_cast<HWND>(created_window->native_handle());
    const auto create_paint = card_paint_box(card.window.x, card.window.y, card.window.width, card.window.height, resolved_visual);
    if (hwnd == nullptr || SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        create_paint.x,
        create_paint.y,
        0,
        0,
        SWP_NOACTIVATE | SWP_NOSIZE) == FALSE) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = "scene.create could not apply card geometry";
        return false;
    }
#endif
    if (!window->resize_render_target(card.window.width, card.window.height)) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = "scene.create could not resize the card renderer target";
        return false;
    }
    if (!window->paint()) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = "scene.create could not draw the card surface";
        return false;
    }
    impl_->cards.emplace(card.id, stored_card);
    impl_->card_windows.emplace(card.id, std::move(window));
    impl_->card_order.push_back(card.id);
    impl_->rebuild_flight_channels();

    if (!reapply_active_layout()) {
        rollback_card();
        return false;
    }
    if (!created_window->show()) {
        rollback_card();
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = "scene.create could not show the card window at its final position";
        return false;
    }
#ifdef _WIN32
    impl_->raise_stack_above_overlay();
#endif
    return true;
}

bool RuntimeSceneController::update_card(
    const SceneCardState& card,
    std::string& error_code,
    std::string& error_message) {
    if (impl_ == nullptr || !impl_->cards.contains(card.id)) {
        error_code = "RUNTIME_SCENE_CARD_NOT_FOUND";
        error_message = "scene.update card id was not found";
        return false;
    }
    if (card.title.empty() || !valid_window_state(card.window)) {
        error_code = "RUNTIME_SCENE_CARD_INVALID";
        error_message = "scene.update requires title and a valid window state";
        return false;
    }
    auto resolved_parts = card.parts;
    for (auto& part : resolved_parts) {
        impl_->resolve_part_wallpaper(part);
        impl_->resolve_part_font(part);
    }
    const auto resolved_visual = impl_->resolve_visual(card.visual);
    auto stored_card = card;
    stored_card.parts = std::move(resolved_parts);
    stored_card.visual = resolved_visual;
    const auto previous = impl_->cards.find(card.id);
    const auto previous_state = previous != impl_->cards.end()
        ? std::optional<SceneCardState>(previous->second)
        : std::nullopt;
    if (previous_state.has_value()) {
        if (!stored_card.presentation_specified && previous_state->presentation_specified) {
            stored_card.presentation_specified = true;
            stored_card.event_id = previous_state->event_id;
            stored_card.category_id = previous_state->category_id;
            stored_card.event_type_id = previous_state->event_type_id;
            stored_card.visual_profile_id = previous_state->visual_profile_id;
        }
        if (!stored_card.behavior_specified && previous_state->behavior_specified) {
            stored_card.behavior_specified = true;
            stored_card.behavior_profile_id = previous_state->behavior_profile_id;
            stored_card.behavior_channel_id = previous_state->behavior_channel_id;
        }
    }
    stored_card.layout_width = card.layout_width > 0
        ? card.layout_width
        : (previous_state.has_value() ? previous_state->layout_width : card.window.width);
    stored_card.layout_height = card.layout_height > 0
        ? card.layout_height
        : (previous_state.has_value() ? previous_state->layout_height : card.window.height);
    const auto previous_channel_id = previous_state.has_value()
        ? Impl::channel_id_for(*previous_state)
        : std::string{};
    const bool ticker = card_is_ticker(stored_card)
        || (previous_state.has_value() && card_is_ticker(*previous_state));
#ifdef _WIN32
    if (ticker && impl_->ticker_motions.contains(card.id) && previous_state.has_value()) {
        stored_card.window.x = previous_state->window.x;
        stored_card.window.y = previous_state->window.y;
    }
#endif
    if (!ticker) {
        auto window_it = impl_->card_windows.find(card.id);
        if (window_it == impl_->card_windows.end() || window_it->second == nullptr) {
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = "scene.update card window is unavailable";
            return false;
        }
        auto& window = window_it->second;
        window->update_content(widen(card.title), widen(card.body));
        window->update_assistant_name(widen(card.assistant_name));
        window->update_parts(stored_card.parts);
        window->update_visual(resolved_visual);
#ifdef _WIN32
        const auto hwnd = static_cast<HWND>(window->native_handle());
        const auto update_paint = card_paint_box(
            card.window.x, card.window.y, card.window.width, card.window.height, resolved_visual);
        if (hwnd == nullptr || SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            update_paint.x,
            update_paint.y,
            update_paint.width,
            update_paint.height,
            SWP_NOACTIVATE | SWP_SHOWWINDOW) == FALSE) {
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = "scene.update could not apply card geometry";
            return false;
        }
#endif
        if (!window->resize_render_target(card.window.width, card.window.height)) {
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = "scene.update could not resize the card renderer target";
            return false;
        }
        if (!window->paint()) {
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = "scene.update could not draw the card surface";
            return false;
        }
#ifdef _WIN32
        impl_->raise_stack_above_overlay();
#endif
    }
    impl_->cards[card.id] = stored_card;
    impl_->rebuild_flight_channels();
    const auto channel_changed = previous_channel_id != Impl::channel_id_for(stored_card);
    if (impl_->has_active_layout && channel_changed) {
        auto reapply_options = impl_->active_layout;
        if (impl_->active_layout_uses_provider) {
            reapply_options.work_area_width = 0;
            reapply_options.work_area_height = 0;
            reapply_options.dpi_scale = 1.0f;
            reapply_options.work_area_left = 0;
            reapply_options.work_area_top = 0;
            reapply_options.work_area_is_fallback = false;
            reapply_options.work_area_source.clear();
        }
        std::string layout_error_code;
        std::string layout_error_message;
        if (!apply_stack_layout(reapply_options, layout_error_code, layout_error_message)) {
            if (previous_state.has_value()) impl_->cards[card.id] = *previous_state;
            impl_->rebuild_flight_channels();
            error_code = layout_error_code;
            error_message = layout_error_message;
            return false;
        }
    } else if (ticker) {
#ifdef _WIN32
        if (!impl_->paint_ticker_sprite(impl_->cards.at(card.id))) {
            if (previous_state.has_value()) impl_->cards[card.id] = *previous_state;
            impl_->rebuild_flight_channels();
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = "scene.update could not paint the ticker overlay sprite";
            return false;
        }
#endif
    }
    return true;
}

bool RuntimeSceneController::dismiss_card(
    std::string_view id,
    std::string& error_code,
    std::string& error_message,
    std::string_view reason) {
    if (impl_ == nullptr || !impl_->cards.contains(std::string(id))) {
        error_code = "RUNTIME_SCENE_CARD_NOT_FOUND";
        error_message = "scene.dismiss card id was not found";
        return false;
    }

    const auto card_id = std::string(id);
    std::unique_ptr<SceneWindow> removed_card;
    auto window_it = impl_->card_windows.find(card_id);
    if (window_it != impl_->card_windows.end()) {
        removed_card = std::move(window_it->second);
        impl_->card_windows.erase(window_it);
    }
    const auto removed_state = impl_->cards.at(card_id);
    const auto removed_order = impl_->card_order;
#ifdef _WIN32
    impl_->drop_ticker_sprite(card_id);
#endif
    impl_->cards.erase(card_id);
    impl_->stack_follows.erase(card_id);
    impl_->card_order.erase(
        std::remove(impl_->card_order.begin(), impl_->card_order.end(), id),
        impl_->card_order.end());
    impl_->rebuild_flight_channels();

    if (impl_->has_active_layout && !impl_->card_order.empty()) {
        auto reapply_options = impl_->active_layout;
        if (impl_->active_layout_uses_provider) {
            reapply_options.work_area_width = 0;
            reapply_options.work_area_height = 0;
            reapply_options.dpi_scale = 1.0f;
            reapply_options.work_area_left = 0;
            reapply_options.work_area_top = 0;
            reapply_options.work_area_is_fallback = false;
            reapply_options.work_area_source.clear();
        }
        std::string layout_error_code;
        std::string layout_error_message;
        if (!apply_stack_layout(reapply_options, layout_error_code, layout_error_message)) {
            impl_->cards.emplace(card_id, removed_state);
            if (removed_card != nullptr) impl_->card_windows.emplace(card_id, std::move(removed_card));
            impl_->card_order = removed_order;
            impl_->rebuild_flight_channels();
#ifdef _WIN32
            if (card_is_ticker(removed_state)) impl_->paint_ticker_sprite(removed_state);
#endif
            error_code = layout_error_code;
            error_message = "scene.dismiss removed card but could not reflow remaining cards: " + layout_error_message;
            impl_->pending_change_metadata_json = change_json(
                "dismiss-reflow-failed", "card", card_id, true, true, error_code, error_message);
            return false;
        }
    }
    impl_->ticker_motions.erase(card_id);
    const bool abnormal_destruction = reason == "window-destroyed";
    impl_->pending_change_metadata_json = change_json(
        reason, "card", card_id, abnormal_destruction, abnormal_destruction);
    return true;
}

bool RuntimeSceneController::apply_channel_layout(
    const StackLayoutOptions& requested_options,
    std::string& error_code,
    std::string& error_message) {
    if (impl_ == nullptr) impl_ = new Impl();
    if (!valid_work_area(impl_->provider_work_area)) impl_->provider_work_area = query_primary_work_area();

    auto options = requested_options;
    WorkAreaSnapshot effective_work_area{};
    const bool has_explicit_work_area = requested_options.work_area_width > 0
        || requested_options.work_area_height > 0
        || requested_options.dpi_scale != 1.0f
        || requested_options.work_area_left != 0
        || requested_options.work_area_top != 0;
    if (!has_explicit_work_area) {
        if (!valid_work_area(impl_->provider_work_area)) {
            error_code = "LAYOUT_WORK_AREA_INVALID";
            error_message = "Runtime display work area provider returned an invalid snapshot";
            return false;
        }
        effective_work_area = impl_->provider_work_area;
        options.work_area_width = effective_work_area.rect.width;
        options.work_area_height = effective_work_area.rect.height;
        options.dpi_scale = effective_work_area.dpi_scale;
        options.work_area_left = effective_work_area.rect.left;
        options.work_area_top = effective_work_area.rect.top;
        options.work_area_is_fallback = effective_work_area.is_fallback;
        options.work_area_source = effective_work_area.source;
    } else {
        if (options.work_area_width <= 0 || options.work_area_height <= 0
            || options.dpi_scale <= 0.0f || !std::isfinite(options.dpi_scale)) {
            error_code = "LAYOUT_WORK_AREA_INVALID";
            error_message = "Explicit stack layout work area override is invalid";
            return false;
        }
        effective_work_area = WorkAreaSnapshot{
            WorkAreaRect{0, 0, options.work_area_width, options.work_area_height},
            options.dpi_scale,
            false,
            "explicit-override"};
        options.work_area_source = effective_work_area.source;
        options.work_area_is_fallback = effective_work_area.is_fallback;
    }

    impl_->rebuild_flight_channels();
    if (impl_->flight_channel_order.size() > 1 || impl_->has_explicit_flight_channels()) {
        auto card_is_ticker = [&](const std::string& id) {
            const auto card_it = impl_->cards.find(id);
            if (card_it == impl_->cards.end()) return false;
            return is_ticker_profile(Impl::profile_id_for(card_it->second));
        };
        const auto channel_count = static_cast<int>(impl_->flight_channel_order.size());
        for (int channel_index = 0; channel_index < channel_count; ++channel_index) {
            const auto& channel_id = impl_->flight_channel_order[static_cast<std::size_t>(channel_index)];
            const auto channel_it = impl_->flight_channels.find(channel_id);
            if (channel_it == impl_->flight_channels.end()) continue;
            const auto profile_id = channel_it->second.profile_id;

            auto channel_options = options;
            channel_options.work_area_height = effective_work_area.rect.height;
            channel_options.work_area_top = effective_work_area.rect.top;
            channel_options.mode = options.mode;
            channel_options.direction = options.direction;
            channel_options.anchor = options.anchor;

            std::vector<std::string> ticker_ids;
            std::vector<std::string> stack_ids;
            for (const auto& id : channel_it->second.card_order) {
                if (card_is_ticker(id)) ticker_ids.push_back(id);
                else if (!is_visual_preview_card(id)) stack_ids.push_back(id);
            }

            // 弹幕叠满屏，不跟堆叠抢半条 lane。同通道里的堆叠卡仍走堆叠，不被第一张弹幕锁死。
            if (!ticker_ids.empty()) {
                auto ticker_channel = channel_it->second;
                ticker_channel.card_order = ticker_ids;
                auto ticker_options = channel_options;
                ticker_options.work_area_width = effective_work_area.rect.width;
                ticker_options.work_area_left = effective_work_area.rect.left;
                ticker_options.mode = LayoutMode::Shelf;
                ticker_options.direction = StackDirection::Right;
                ticker_options.anchor = StackAnchor::TopLeft;
                ticker_options.margin_left = 0;
                ticker_options.margin_right = 0;
                ticker_options.margin_top = 0;
                ticker_options.margin_bottom = 0;
                if (!impl_->place_ticker_channel(
                    ticker_channel, ticker_options, error_code, error_message)) {
                    return false;
                }
            }
            (void)stack_ids;
            (void)profile_id;
        }

        std::vector<StackCardInput> unified_stack;
        for (const auto& id : impl_->card_order) {
            if (is_visual_preview_card(id) || card_is_ticker(id)) continue;
            const auto card_it = impl_->cards.find(id);
            if (card_it == impl_->cards.end()) continue;
            unified_stack.push_back(StackCardInput{
                id,
                card_it->second.layout_width > 0 ? card_it->second.layout_width : card_it->second.window.width,
                card_it->second.layout_height > 0 ? card_it->second.layout_height : card_it->second.window.height});
        }
        if (!unified_stack.empty()) {
            auto stack_options = options;
            stack_options.work_area_width = effective_work_area.rect.width;
            stack_options.work_area_height = effective_work_area.rect.height;
            stack_options.work_area_left = effective_work_area.rect.left;
            stack_options.work_area_top = effective_work_area.rect.top;
            stack_options.mode = LayoutMode::Stack;
            const auto layout = layout_stack(unified_stack, stack_options);
            if (!layout.ok) {
                error_code = layout.code == "LAYOUT_CARD_OUT_OF_BOUNDS"
                    ? "LAYOUT_BEHAVIOR_CHANNEL_OUT_OF_BOUNDS"
                    : layout.code;
                error_message = "Stack layout failed: " + layout.message;
                return false;
            }
            const bool follow = stack_options.settle == StackSettle::Follow;
            for (const auto& placement : layout.placements) {
                auto card_it = impl_->cards.find(placement.id);
                auto window_it = impl_->card_windows.find(placement.id);
                if (card_it == impl_->cards.end() || window_it == impl_->card_windows.end() || window_it->second == nullptr) {
                    error_code = "RUNTIME_SCENE_CARD_NOT_FOUND";
                    error_message = "Behavior channel layout card window is unavailable";
                    return false;
                }
                if (!apply_stack_card_placement(
                    card_it->second,
                    *window_it->second,
                    placement,
                    follow,
                    impl_->stack_follows,
                    error_code,
                    error_message,
                    "Behavior channel layout could not apply card geometry",
                    "Behavior channel layout could not redraw the card surface")) {
                    return false;
                }
            }
            prune_stack_follows(impl_->stack_follows, layout.placements, follow);
        } else {
            prune_stack_follows(impl_->stack_follows, {}, options.settle == StackSettle::Follow);
        }
        impl_->active_work_area = effective_work_area;
        options.mode = requested_options.mode;
        impl_->active_layout = options;
        impl_->has_active_layout = true;
        impl_->active_layout_uses_provider = !has_explicit_work_area;
        return true;
    }

    const auto apply_layout = [&](const std::vector<StackCardInput>& cards) {
        return options.mode == LayoutMode::Shelf
            ? layout_shelf(cards, options)
            : layout_stack(cards, options);
    };
    std::vector<StackCardInput> inputs;
    if (impl_->card_order.empty()) {
        const auto layout = apply_layout(inputs);
        if (!layout.ok) {
            error_code = layout.code;
            error_message = layout.message;
            return false;
        }
        impl_->active_work_area = effective_work_area;
        options.mode = requested_options.mode;
        impl_->active_layout = options;
        impl_->has_active_layout = true;
        impl_->active_layout_uses_provider = !has_explicit_work_area;
        impl_->stack_follows.clear();
        return true;
    }

    inputs.reserve(impl_->card_order.size());
    for (const auto& id : impl_->card_order) {
        if (is_visual_preview_card(id)) continue;
        const auto card_it = impl_->cards.find(id);
        if (card_it == impl_->cards.end()) continue;
        inputs.push_back(StackCardInput{
            id,
            card_it->second.layout_width > 0 ? card_it->second.layout_width : card_it->second.window.width,
            card_it->second.layout_height > 0 ? card_it->second.layout_height : card_it->second.window.height});
    }
    const auto layout = apply_layout(inputs);
    if (!layout.ok) {
        error_code = layout.code;
        error_message = layout.message;
        return false;
    }
    const bool follow = options.settle == StackSettle::Follow;
    for (const auto& placement : layout.placements) {
        auto card_it = impl_->cards.find(placement.id);
        auto window_it = impl_->card_windows.find(placement.id);
        if (card_it == impl_->cards.end() || window_it == impl_->card_windows.end() || window_it->second == nullptr) {
            error_code = "RUNTIME_SCENE_CARD_NOT_FOUND";
            error_message = "stack layout card window is unavailable";
            return false;
        }
        const bool ticker = is_ticker_profile(Impl::profile_id_for(card_it->second));
        if (!apply_stack_card_placement(
            card_it->second,
            *window_it->second,
            placement,
            follow && !ticker,
            impl_->stack_follows,
            error_code,
            error_message,
            "stack layout could not apply card geometry",
            "stack layout could not draw the card surface")) {
            return false;
        }
    }
    prune_stack_follows(impl_->stack_follows, layout.placements, follow);
    impl_->active_work_area = effective_work_area;
    options.mode = requested_options.mode;
    impl_->active_layout = options;
    impl_->has_active_layout = true;
    impl_->active_layout_uses_provider = !has_explicit_work_area;
#ifdef _WIN32
    impl_->raise_stack_above_overlay();
#endif
    return true;
}

bool RuntimeSceneController::apply_stack_layout(
    const StackLayoutOptions& options,
    std::string& error_code,
    std::string& error_message) {
    return apply_channel_layout(options, error_code, error_message);
}

bool RuntimeSceneController::apply_ticker_charter(
    const TickerChannelOptions& options,
    std::string& error_code,
    std::string& error_message) {
    if (impl_ == nullptr) impl_ = new Impl();
    impl_->explicit_ticker_charter = options;
    impl_->explicit_ticker_charter_specified = true;
    impl_->rebuild_flight_channels();
    static_cast<void>(error_code);
    static_cast<void>(error_message);
    return true;
}

bool RuntimeSceneController::get_window_state(SceneWindowState& state) const noexcept {
    if (impl_ == nullptr || impl_->window == nullptr || !impl_->window->is_created()) return false;
    int x = 0;
    int y = 0;
    if (!impl_->window->get_window_position(x, y)) return false;
#ifdef _WIN32
    const auto hwnd = static_cast<HWND>(impl_->window->native_handle());
    RECT client_rect{};
    if (hwnd == nullptr || GetClientRect(hwnd, &client_rect) == FALSE) return false;
    state = SceneWindowState{x, y, client_rect.right - client_rect.left, client_rect.bottom - client_rect.top};
    return true;
#else
    static_cast<void>(x);
    static_cast<void>(y);
    return false;
#endif
}

std::string RuntimeSceneController::state_json() const {
    SceneWindowState state{};
    if (!get_window_state(state) && impl_ != nullptr) state = impl_->state;
    return std::string("{\"x\":") + std::to_string(state.x)
        + ",\"y\":" + std::to_string(state.y)
        + ",\"width\":" + std::to_string(state.width)
        + ",\"height\":" + std::to_string(state.height) + "}";
}

std::string RuntimeSceneController::cards_json() const {
    std::string result = "[";
    if (impl_ != nullptr) {
        bool first = true;
        for (const auto& id : impl_->card_order) {
            const auto card_it = impl_->cards.find(id);
            if (card_it == impl_->cards.end()) continue;
            if (!first) result += ',';
            first = false;
            result += card_json(card_it->second);
        }
    }
    result += ']';
    return result;
}

std::string RuntimeSceneController::layout_json() const {
    if (impl_ == nullptr || !impl_->has_active_layout) return "null";
    const auto& options = impl_->active_layout;
    const auto mode = options.mode == LayoutMode::Shelf ? "shelf" : "stack";
    const auto direction = options.direction == StackDirection::Down ? "down"
        : options.direction == StackDirection::Up ? "up"
        : options.direction == StackDirection::Right ? "right" : "left";
    const auto anchor = options.anchor == StackAnchor::TopLeft ? "top-left"
        : options.anchor == StackAnchor::TopRight ? "top-right"
        : options.anchor == StackAnchor::BottomLeft ? "bottom-left" : "bottom-right";
    return std::string("{\"layout\":") + json_string(mode)
        + ",\"direction\":" + json_string(direction)
        + ",\"anchor\":" + json_string(anchor)
        + ",\"spacing\":" + std::to_string(options.spacing)
        + ",\"workAreaWidth\":" + std::to_string(options.work_area_width)
        + ",\"workAreaHeight\":" + std::to_string(options.work_area_height)
        + ",\"dpiScale\":" + std::to_string(options.dpi_scale)
        + ",\"workAreaLeft\":" + std::to_string(options.work_area_left)
        + ",\"workAreaTop\":" + std::to_string(options.work_area_top)
        + ",\"workAreaIsFallback\":" + (options.work_area_is_fallback ? "true" : "false")
        + ",\"workAreaSource\":" + json_string(options.work_area_source)
        + ",\"marginLeft\":" + std::to_string(options.margin_left)
        + ",\"marginRight\":" + std::to_string(options.margin_right)
        + ",\"marginTop\":" + std::to_string(options.margin_top)
        + ",\"marginBottom\":" + std::to_string(options.margin_bottom)
        + ",\"wrap\":" + json_string(options.wrap == StackWrap::Off ? "off"
            : options.wrap == StackWrap::Snake ? "snake"
            : options.wrap == StackWrap::Coil ? "coil" : "parallel")
        + ",\"newest\":" + json_string(options.newest == StackNewest::Next ? "next" : "dock") + "}";
}

std::string RuntimeSceneController::work_area_json() const {
    WorkAreaSnapshot snapshot{};
    if (impl_ != nullptr && valid_work_area(impl_->active_work_area)) {
        snapshot = impl_->active_work_area;
    } else if (impl_ != nullptr && valid_work_area(impl_->provider_work_area)) {
        snapshot = impl_->provider_work_area;
    } else {
        snapshot = query_primary_work_area();
    }
    if (!valid_work_area(snapshot)) return "null";
    return std::string("{\"left\":") + std::to_string(snapshot.rect.left)
        + ",\"top\":" + std::to_string(snapshot.rect.top)
        + ",\"width\":" + std::to_string(snapshot.rect.width)
        + ",\"height\":" + std::to_string(snapshot.rect.height)
        + ",\"dpiScale\":" + std::to_string(snapshot.dpi_scale)
        + ",\"isFallback\":" + (snapshot.is_fallback ? "true" : "false")
        + ",\"source\":" + json_string(snapshot.source) + "}";
}

std::string RuntimeSceneController::scene_state_snapshot_json() const {
    return scene_state_snapshot_json(cards_json());
}

std::string RuntimeSceneController::scene_state_snapshot_json(const std::string& cards) const {
    SceneWindowState state{};
    const bool scene_window_alive = impl_ != nullptr
        && impl_->window != nullptr
        && impl_->window->is_created();
    if (scene_window_alive && !get_window_state(state) && impl_ != nullptr) state = impl_->state;

    std::string result = std::string("{\"sceneStateVersion\":1,\"protocolVersion\":1,\"updatedAt\":")
        + json_string(scene_state_timestamp())
        + ",\"sceneWindow\":";
    if (!scene_window_alive) {
        result += "null";
    } else {
        result += "{\"x\":" + std::to_string(state.x)
            + ",\"y\":" + std::to_string(state.y)
            + ",\"width\":" + std::to_string(state.width)
            + ",\"height\":" + std::to_string(state.height) + "}";
    }
    result += ",\"cardOrder\":[";

    if (impl_ != nullptr) {
        bool first = true;
        for (const auto& id : impl_->card_order) {
            if (impl_->cards.find(id) == impl_->cards.end()) continue;
            if (!first) result += ',';
            first = false;
            result += json_string(id);
        }
    }
    result += "],\"cards\":" + cards;
    if (impl_ != nullptr && impl_->has_explicit_flight_channels()) {
        // Protocol JSON keeps behaviorChannels as the alias; internal type is FlightChannelState.
        result += ",\"behaviorChannels\":[";
        bool first_channel = true;
        for (const auto& channel_id : impl_->flight_channel_order) {
            if (channel_id == "__legacy__") continue;
            const auto channel_it = impl_->flight_channels.find(channel_id);
            if (channel_it == impl_->flight_channels.end()) continue;
            if (!first_channel) result += ',';
            first_channel = false;
            result += "{\"channelId\":" + json_string(channel_it->second.channel_id)
                + ",\"profileId\":" + json_string(channel_it->second.profile_id)
                + ",\"cardOrder\":[";
            for (std::size_t index = 0; index < channel_it->second.card_order.size(); ++index) {
                if (index > 0) result += ',';
                result += json_string(channel_it->second.card_order[index]);
            }
            result += "]}";
        }
        result += "]";
    }
    result += ",\"layout\":";
    if (impl_ == nullptr || !impl_->has_active_layout || !valid_work_area(impl_->active_work_area)) {
        result += "null";
    } else {
        const auto& options = impl_->active_layout;
        const auto mode = options.mode == LayoutMode::Shelf ? "shelf" : "stack";
        const auto direction = options.direction == StackDirection::Down ? "down"
            : options.direction == StackDirection::Up ? "up"
            : options.direction == StackDirection::Right ? "right" : "left";
        const auto anchor = options.anchor == StackAnchor::TopLeft ? "top-left"
            : options.anchor == StackAnchor::TopRight ? "top-right"
            : options.anchor == StackAnchor::BottomLeft ? "bottom-left" : "bottom-right";
        const auto& work_area = impl_->active_work_area;
        const auto resolution = impl_->active_layout_uses_provider ? "provider" : "explicit";
        result += std::string("{\"mode\":") + json_string(mode)
            + ",\"direction\":" + json_string(direction)
            + ",\"anchor\":" + json_string(anchor)
            + ",\"spacing\":" + std::to_string(options.spacing)
            + ",\"workArea\":{\"resolution\":" + json_string(resolution)
            + ",\"left\":" + std::to_string(work_area.rect.left)
            + ",\"top\":" + std::to_string(work_area.rect.top)
            + ",\"width\":" + std::to_string(work_area.rect.width)
            + ",\"height\":" + std::to_string(work_area.rect.height)
            + ",\"dpiScale\":" + std::to_string(work_area.dpi_scale)
            + ",\"isFallback\":" + (work_area.is_fallback ? "true" : "false")
            + ",\"source\":" + json_string(work_area.source) + "}}";
    }
    return result + "}";
}

std::string RuntimeSceneController::consume_change_metadata_json() {
    if (impl_ == nullptr || impl_->pending_change_metadata_json.empty()) return "null";
    auto result = std::move(impl_->pending_change_metadata_json);
    impl_->pending_change_metadata_json.clear();
    return result;
}

std::string RuntimeSceneController::change_metadata_json() const {
    if (impl_ == nullptr || impl_->pending_change_metadata_json.empty()) return "null";
    return impl_->pending_change_metadata_json;
}

std::string RuntimeSceneController::dismiss_result_json(bool deduplicated, std::string_view card_id) const {
    return std::string("{\"status\":\"accepted\",\"deduplicated\":")
        + (deduplicated ? "true" : "false")
        + ",\"removed\":true,\"targetId\":" + json_string(card_id)
        + ",\"sceneCards\":" + cards_json()
        + ",\"sceneStateSnapshot\":" + scene_state_snapshot_json()
        + ",\"change\":" + change_metadata_json()
        + ",\"layout\":" + layout_json()
        + ",\"workArea\":" + work_area_json() + "}";
}

std::string RuntimeSceneController::state_result_json(bool deduplicated) const {
    return std::string("{\"status\":\"accepted\",\"deduplicated\":")
        + (deduplicated ? "true" : "false")
        + ",\"sceneState\":" + state_json()
        + ",\"sceneStateSnapshot\":" + scene_state_snapshot_json()
        + ",\"layout\":" + layout_json()
        + ",\"workArea\":" + work_area_json() + "}"
        ;
}

std::string RuntimeSceneController::cards_result_json(bool deduplicated) const {
    return std::string("{\"status\":\"accepted\",\"deduplicated\":")
        + (deduplicated ? "true" : "false")
        + ",\"sceneCards\":" + cards_json()
        + ",\"sceneStateSnapshot\":" + scene_state_snapshot_json()
        + ",\"layout\":" + layout_json()
        + ",\"workArea\":" + work_area_json() + "}"
        ;
}

bool RuntimeSceneController::pump_messages() {
    bool changed = false;
    bool pumped_any = false;
#ifdef _WIN32
    if (impl_ == nullptr) return false;
    MSG message{};
    while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
        pumped_any = true;
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
#endif
    if (impl_ == nullptr) return false;

    const bool has_pending_change = !impl_->pending_change_metadata_json.empty();
    if (has_pending_change) changed = true;

    if (impl_->window != nullptr && !impl_->window->is_created()) {
        changed = true;
        const auto reason = impl_->window->close_reason().empty()
            ? std::string_view("window-destroyed")
            : std::string_view(impl_->window->close_reason());
        impl_->pending_change_metadata_json = change_json(
            reason,
            "scene-window",
            {},
            reason == "window-destroyed",
            reason == "window-destroyed");
        impl_->window.reset();
    }

    if (pumped_any && impl_->window != nullptr && impl_->window->is_created()) {
        int x = 0;
        int y = 0;
        if (impl_->window->get_window_position(x, y)) {
            if (impl_->state.x != x || impl_->state.y != y) changed = true;
            impl_->state.x = x;
            impl_->state.y = y;
        }
    }

    std::vector<std::string> dismissed_cards;
#ifdef _WIN32
    if (impl_->ticker_overlay != nullptr) {
        int click_x = 0;
        int click_y = 0;
        const auto clicked_id = impl_->ticker_overlay->take_click(click_x, click_y);
        if (!clicked_id.empty()) {
            const auto card_it = impl_->cards.find(clicked_id);
            if (card_it != impl_->cards.end()) {
                const auto& visual = card_it->second.visual;
                const auto anywhere = visual.dismiss_mode == "anywhere";
                const auto close_button = visual.dismiss_mode == "closeButton"
                    || visual.dismiss_mode == "buttonOnly";
                bool should_dismiss = anywhere;
                if (!should_dismiss && close_button) {
                    const auto local_x = static_cast<float>(click_x - card_it->second.window.x);
                    const auto local_y = static_cast<float>(click_y - card_it->second.window.y);
                    should_dismiss = point_inside_close_button(
                        local_x,
                        local_y,
                        static_cast<float>(card_it->second.window.width),
                        static_cast<float>(card_it->second.window.height));
                }
                if (should_dismiss) dismissed_cards.push_back(clicked_id);
            }
        }
        impl_->sync_overlay_hover();
    }
#endif
    for (const auto& id : impl_->card_order) {
        const auto card_it = impl_->cards.find(id);
        if (card_it == impl_->cards.end()) {
            dismissed_cards.push_back(id);
            continue;
        }
        if (card_is_ticker(card_it->second)) continue;
        const auto window_it = impl_->card_windows.find(id);
        if (window_it == impl_->card_windows.end() || window_it->second == nullptr) {
            dismissed_cards.push_back(id);
            continue;
        }
        auto& window = window_it->second;
        if (!window->is_created()) {
            dismissed_cards.push_back(id);
            continue;
        }
        const bool ticker = is_ticker_profile(Impl::profile_id_for(card_it->second));
        const bool follow = impl_->stack_follows.find(id) != impl_->stack_follows.end();
        if (!window->is_dragging() && (ticker || follow)) continue;
        int x = 0;
        int y = 0;
        if (window->get_window_position(x, y)) {
            paint_origin_to_hit_origin(x, y, window->paint_overflow());
            if (card_it->second.window.x != x || card_it->second.window.y != y) {
                // Ticker/follow motion is a local time function. Emitting scene.changed every
                // pixel move floods the pipe, recovery snapshot, and Hana main thread.
                // Drag still emits because the continue above skipped only non-drag follow.
                if (!ticker) changed = true;
                card_it->second.window.x = x;
                card_it->second.window.y = y;
            }
        }
    }

    for (const auto& id : dismissed_cards) {
        std::string dismiss_error_code;
        std::string dismiss_error_message;
        const auto window_it = impl_->card_windows.find(id);
        const auto reason = window_it != impl_->card_windows.end()
            && window_it->second != nullptr
            && !window_it->second->close_reason().empty()
            ? std::string_view(window_it->second->close_reason())
            : std::string_view("window-destroyed");
        if (dismiss_card(id, dismiss_error_code, dismiss_error_message, reason)) {
            changed = true;
        } else {
            changed = true;
            if (impl_->pending_change_metadata_json.empty()) {
                impl_->pending_change_metadata_json = change_json(
                    "dismiss-failed", "card", id, true, true, dismiss_error_code, dismiss_error_message);
            }
        }
    }
    if (changed) ++g_scene_change_emit_count;
    return changed;
}

std::string RuntimeSceneController::perf_json() const {
    std::uint64_t paints = scene_window_paint_count();
#ifdef _WIN32
    if (impl_ != nullptr && impl_->ticker_overlay != nullptr) {
        paints += impl_->ticker_overlay->paint_count();
    }
#endif
    return std::string("{\"paints\":") + std::to_string(paints)
        + ",\"moves\":" + std::to_string(g_card_window_move_count)
        + ",\"sceneChanges\":" + std::to_string(g_scene_change_emit_count) + "}";
}

bool RuntimeSceneController::tick_animation() {
#ifdef _WIN32
    if (impl_ == nullptr) return false;
    // 无 ticker 且无未到位 follow → 心跳停摆，空闲零开销（契约 §2.5）。
    if (impl_->ticker_motions.empty() && !impl_->has_active_follow()) {
        impl_->ticker_ticking = false;
        return false;
    }

    const auto now = std::chrono::steady_clock::now();
    double dt = 1.0 / 60.0;
    if (impl_->ticker_ticking) {
        const auto since_last = std::chrono::duration_cast<std::chrono::milliseconds>(
            now - impl_->last_tick).count();
        if (since_last < impl_->ticker_heartbeat_ms) return false;
        dt = static_cast<double>(since_last) / 1000.0;
    }
    impl_->last_tick = now;
    impl_->ticker_ticking = true;
    if (!impl_->sync_overlay_hover()) return false;

    auto changed = false;
    std::vector<std::string> exiting;
    exiting.reserve(impl_->ticker_motions.size());
    struct TickerMove {
        HWND hwnd{};
        int paint_x{};
        int paint_y{};
        SceneCardState* card{};
        int x{};
        int y{};
    };
    struct OverlayMove {
        SceneCardState* card{};
        int x{};
        int y{};
    };
    std::vector<TickerMove> moves;
    std::vector<OverlayMove> overlay_moves;
    moves.reserve(impl_->stack_follows.size());
    overlay_moves.reserve(impl_->ticker_motions.size());
    for (auto& entry : impl_->ticker_motions) {
        const auto& card_id = entry.first;
        auto& motion = entry.second;
        auto card_it = impl_->cards.find(card_id);
        if (card_it == impl_->cards.end()) {
            exiting.push_back(card_id);
            continue;
        }

        const bool paused = impl_->ticker_overlay != nullptr && overlay_should_pause(
            impl_->ticker_overlay->click_through(),
            impl_->ticker_overlay->hovered_id(),
            card_id,
            card_it->second.visual.ticker_hover_pause);
        const auto shift_ms = ticker_spawn_shift_ms(dt * 1000.0, paused);
        if (shift_ms > 0.0) {
            motion.spawn += std::chrono::microseconds(static_cast<std::int64_t>(shift_ms * 1000.0));
            continue;
        }

        const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            now - motion.spawn).count();
        const auto x = static_cast<int>(std::lround(ticker_position_x(
            motion.spawn_left_x, motion.speed_px_per_second, static_cast<double>(elapsed), motion.fly_right)));
        const auto y = ticker_track_y(motion.band_top, motion.track_index, motion.plan);
        const auto width = card_it->second.window.width;
        const auto height = card_it->second.window.height;

        if (card_it->second.window.x != x || card_it->second.window.y != y) {
            overlay_moves.push_back(OverlayMove{&card_it->second, x, y});
        }
        // 出屏回收（契约 §8）：含 24px 缓冲，避免窗口边缘被「切一半」留在屏上。
        // 方向用出生时记下的 fly_right，中途改设置不掉头。
        const auto offscreen = motion.fly_right
            ? ticker_is_offscreen(static_cast<double>(x), motion.lane_right, motion.exit_margin_px, true)
            : ticker_is_offscreen(static_cast<double>(x + width), motion.lane_left, motion.exit_margin_px);
        if (offscreen) {
            exiting.push_back(card_id);
        }
    }

    if (impl_->active_layout.settle == StackSettle::Follow) {
        for (auto& entry : impl_->stack_follows) {
            const auto& card_id = entry.first;
            auto& chase = entry.second;
            auto card_it = impl_->cards.find(card_id);
            const auto window_it = impl_->card_windows.find(card_id);
            if (card_it == impl_->cards.end() || window_it == impl_->card_windows.end()
                || window_it->second == nullptr) {
                continue;
            }
            if (window_it->second->is_dragging()) {
                chase.state.x = static_cast<double>(card_it->second.window.x);
                chase.state.y = static_cast<double>(card_it->second.window.y);
                chase.state.vx = 0.0;
                chase.state.vy = 0.0;
                continue;
            }
            const auto step = tick_follow(chase.state, chase.target_x, chase.target_y, dt);
            chase.state = step.state;
            const auto x = static_cast<int>(std::lround(chase.state.x));
            const auto y = static_cast<int>(std::lround(chase.state.y));
            if (card_it->second.window.x != x || card_it->second.window.y != y) {
                const auto hwnd = static_cast<HWND>(window_it->second->native_handle());
                if (hwnd == nullptr || IsWindow(hwnd) == FALSE) continue;
                const auto paint = card_paint_box(
                    x, y, card_it->second.window.width, card_it->second.window.height, card_it->second.visual);
                moves.push_back(TickerMove{hwnd, paint.x, paint.y, &card_it->second, x, y});
            }
        }
    }

    if (!overlay_moves.empty()) {
        bool overlay_moved = true;
        for (const auto& move : overlay_moves) {
            move.card->window.x = move.x;
            move.card->window.y = move.y;
            if (!impl_->move_ticker_sprite(*move.card, false)) {
                overlay_moved = false;
                break;
            }
        }
        if (overlay_moved && impl_->ticker_overlay != nullptr && impl_->ticker_overlay->commit()) {
            g_card_window_move_count += static_cast<std::uint64_t>(overlay_moves.size());
            changed = true;
        }
    }

    if (!moves.empty()) {
        HDWP hdwp = BeginDeferWindowPos(static_cast<int>(moves.size()));
        bool deferred = hdwp != nullptr;
        if (hdwp != nullptr) {
            for (const auto& move : moves) {
                const HDWP next = DeferWindowPos(
                    hdwp,
                    move.hwnd,
                    nullptr,
                    move.paint_x,
                    move.paint_y,
                    0,
                    0,
                    SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOSIZE | SWP_NOREDRAW
                        | SWP_NOSENDCHANGING | SWP_NOCOPYBITS | SWP_ASYNCWINDOWPOS);
                if (next == nullptr) {
                    deferred = false;
                    break;
                }
                hdwp = next;
            }
            // HDWP 是 USER 对象。Begin 成功后无论 Defer 是否失败都必须 End，
            // 否则漏 1 个句柄；堆到 10000 后 CreateWindowEx 会 1158。
            if (EndDeferWindowPos(hdwp) == FALSE) deferred = false;
        }
        if (deferred) {
            g_card_window_move_count += static_cast<std::uint64_t>(moves.size());
            for (const auto& move : moves) {
                move.card->window.x = move.x;
                move.card->window.y = move.y;
            }
            changed = true;
        } else {
            for (const auto& move : moves) {
                if (apply_card_window_pos(
                        move.hwnd,
                        move.x,
                        move.y,
                        move.card->window.width,
                        move.card->window.height,
                        false,
                        move.card->visual)) {
                    move.card->window.x = move.x;
                    move.card->window.y = move.y;
                    changed = true;
                }
            }
        }
    }

    for (const auto& id : exiting) {
        std::string error_code;
        std::string error_message;
        if (dismiss_card(id, error_code, error_message, "scene.ticker-exit")) {
            changed = true;
        }
        impl_->ticker_motions.erase(id);
    }
    return changed;
#else
    return false;
#endif
}

bool RuntimeSceneController::has_ticker_motion() const noexcept {
    return impl_ != nullptr && (!impl_->ticker_motions.empty() || impl_->has_active_follow());
}

unsigned RuntimeSceneController::pump_idle_ms() const noexcept {
    return has_ticker_motion() ? 16u : 32u;
}

bool RuntimeSceneController::has_window() const noexcept {
    return impl_ != nullptr && impl_->window != nullptr && impl_->window->is_created();
}

}  // namespace notification_hub::scene
