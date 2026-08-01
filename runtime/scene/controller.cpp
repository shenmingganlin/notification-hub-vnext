#include "controller.hpp"

#include "window.hpp"
#include "layout.hpp"
#include "work_area.hpp"
#include "../protocol/message.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <ctime>
#include <iomanip>
#include <memory>
#include <sstream>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

namespace notification_hub::scene {
namespace {

std::wstring widen(std::string_view value) {
    return std::wstring(value.begin(), value.end());
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
        + ",\"height\":" + std::to_string(card.window.height) + "}";
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

}  // namespace

class RuntimeSceneController::Impl {
public:
    std::unique_ptr<SceneWindow> window;
    SceneWindowState state{};
    std::unordered_map<std::string, SceneCardState> cards;
    std::unordered_map<std::string, std::unique_ptr<SceneWindow>> card_windows;
    std::vector<std::string> card_order;
    StackLayoutOptions active_layout{};
    bool has_active_layout{};
    bool active_layout_uses_provider{};
    WorkAreaSnapshot provider_work_area{};
    WorkAreaSnapshot active_work_area{};
};

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
            true});
        if (!impl_->window->create() || !impl_->window->show()) {
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = "Runtime scene window could not be created or shown";
            impl_->window.reset();
            return false;
        }
    }

#ifdef _WIN32
    const auto hwnd = static_cast<HWND>(impl_->window->native_handle());
    if (hwnd == nullptr || SetWindowPos(
        hwnd,
        nullptr,
        state.x,
        state.y,
        state.width,
        state.height,
        SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW) == FALSE) {
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
    impl_->window->paint();
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

    auto window = std::make_unique<SceneWindow>(WindowConfig{
        widen(card.title),
        widen(card.body),
        card.window.width,
        card.window.height,
        true});
    if (!window->create() || !window->show()) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = "scene.create could not create or show the card window";
        return false;
    }
#ifdef _WIN32
    const auto hwnd = static_cast<HWND>(window->native_handle());
    if (hwnd == nullptr || SetWindowPos(
        hwnd,
        nullptr,
        card.window.x,
        card.window.y,
        card.window.width,
        card.window.height,
        SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW) == FALSE) {
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
    window->paint();
    auto stored_card = card;
    stored_card.layout_width = card.layout_width > 0 ? card.layout_width : card.window.width;
    stored_card.layout_height = card.layout_height > 0 ? card.layout_height : card.window.height;
    impl_->cards.emplace(card.id, stored_card);
    impl_->card_windows.emplace(card.id, std::move(window));
    impl_->card_order.push_back(card.id);

    if (impl_->has_active_layout) {
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
            impl_->card_order.pop_back();
            impl_->card_windows.erase(card.id);
            impl_->cards.erase(card.id);
            error_code = layout_error_code;
            error_message = layout_error_message;
            return false;
        }
    }
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
    auto window_it = impl_->card_windows.find(card.id);
    if (window_it == impl_->card_windows.end() || window_it->second == nullptr) {
        error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
        error_message = "scene.update card window is unavailable";
        return false;
    }
    auto& window = window_it->second;
    window->update_content(widen(card.title), widen(card.body));
#ifdef _WIN32
    const auto hwnd = static_cast<HWND>(window->native_handle());
    if (hwnd == nullptr || SetWindowPos(
        hwnd,
        nullptr,
        card.window.x,
        card.window.y,
        card.window.width,
        card.window.height,
        SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW) == FALSE) {
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
    window->paint();
    auto stored_card = card;
    const auto previous = impl_->cards.find(card.id);
    stored_card.layout_width = card.layout_width > 0
        ? card.layout_width
        : (previous != impl_->cards.end() ? previous->second.layout_width : card.window.width);
    stored_card.layout_height = card.layout_height > 0
        ? card.layout_height
        : (previous != impl_->cards.end() ? previous->second.layout_height : card.window.height);
    impl_->cards[card.id] = stored_card;
    return true;
}

bool RuntimeSceneController::dismiss_card(
    std::string_view id,
    std::string& error_code,
    std::string& error_message) {
    if (impl_ == nullptr || !impl_->cards.contains(std::string(id))) {
        error_code = "RUNTIME_SCENE_CARD_NOT_FOUND";
        error_message = "scene.dismiss card id was not found";
        return false;
    }
    impl_->card_windows.erase(std::string(id));
    impl_->cards.erase(std::string(id));
    impl_->card_order.erase(
        std::remove(impl_->card_order.begin(), impl_->card_order.end(), id),
        impl_->card_order.end());
    return true;
}

bool RuntimeSceneController::apply_stack_layout(
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
        return true;
    }

    inputs.reserve(impl_->card_order.size());
    for (const auto& id : impl_->card_order) {
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
    for (const auto& placement : layout.placements) {
        auto card_it = impl_->cards.find(placement.id);
        auto window_it = impl_->card_windows.find(placement.id);
        if (card_it == impl_->cards.end() || window_it == impl_->card_windows.end() || window_it->second == nullptr) {
            error_code = "RUNTIME_SCENE_CARD_NOT_FOUND";
            error_message = "stack layout card window is unavailable";
            return false;
        }
            auto& card = card_it->second;
        card.window = SceneWindowState{placement.x, placement.y, placement.width, placement.height};
        auto& window = window_it->second;
#ifdef _WIN32
        const auto hwnd = static_cast<HWND>(window->native_handle());
        if (hwnd == nullptr || SetWindowPos(
            hwnd,
            nullptr,
            placement.x,
            placement.y,
            placement.width,
            placement.height,
            SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW) == FALSE) {
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = "stack layout could not apply card geometry";
            return false;
        }
#endif
        if (!window->resize_render_target(placement.width, placement.height)) {
            error_code = "RUNTIME_SCENE_WINDOW_APPLY_FAILED";
            error_message = "stack layout could not resize the card renderer target";
            return false;
        }
        window->paint();
    }
    impl_->active_work_area = effective_work_area;
    options.mode = requested_options.mode;
    impl_->active_layout = options;
    impl_->has_active_layout = true;
    impl_->active_layout_uses_provider = !has_explicit_work_area;
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
        + ",\"workAreaSource\":" + json_string(options.work_area_source) + "}";
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
    SceneWindowState state{};
    if (!get_window_state(state) && impl_ != nullptr) state = impl_->state;

    std::string result = std::string("{\"sceneStateVersion\":1,\"protocolVersion\":1,\"updatedAt\":")
        + json_string(scene_state_timestamp())
        + ",\"sceneWindow\":{\"x\":" + std::to_string(state.x)
        + ",\"y\":" + std::to_string(state.y)
        + ",\"width\":" + std::to_string(state.width)
        + ",\"height\":" + std::to_string(state.height) + "}"
        + ",\"cardOrder\":[";

    if (impl_ != nullptr) {
        bool first = true;
        for (const auto& id : impl_->card_order) {
            if (impl_->cards.find(id) == impl_->cards.end()) continue;
            if (!first) result += ',';
            first = false;
            result += json_string(id);
        }
    }
    result += "],\"cards\":" + cards_json() + ",\"layout\":";
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

void RuntimeSceneController::pump_messages() {
#ifdef _WIN32
    if (impl_ == nullptr) return;
    MSG message{};
    while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
#endif
}

bool RuntimeSceneController::has_window() const noexcept {
    return impl_ != nullptr && impl_->window != nullptr && impl_->window->is_created();
}

}  // namespace notification_hub::scene
