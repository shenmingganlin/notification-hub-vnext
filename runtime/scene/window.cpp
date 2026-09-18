#include "window.hpp"
#include "overlay.hpp"

#ifdef _WIN32
#include <windows.h>
#include <windowsx.h>
#include <dwmapi.h>
#include <d3d11_1.h>
#include <d2d1_1.h>
#include <dcomp.h>
#include <dxgi1_2.h>
#include <wrl/client.h>
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "dcomp.lib")
#endif

#include <chrono>
#include <cstdio>
#include <thread>
#include <unordered_map>

namespace notification_hub::scene {

#ifdef _WIN32
namespace {

constexpr wchar_t kWindowProperty[] = L"NotificationHubVNextSceneWindowInstance";
constexpr UINT_PTR kDismissTimerId = 0x4E48;

SceneWindow* from_hwnd(HWND hwnd) {
    return reinterpret_cast<SceneWindow*>(GetPropW(hwnd, kWindowProperty));
}

LRESULT CALLBACK window_proc(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
    auto* window = from_hwnd(hwnd);
    if (message == WM_NCCREATE) {
        const auto* create = reinterpret_cast<const CREATESTRUCTW*>(lparam);
        window = static_cast<SceneWindow*>(create->lpCreateParams);
        SetPropW(hwnd, kWindowProperty, window);
    }

    switch (message) {
    case WM_NCHITTEST: {
        if (window == nullptr) return DefWindowProcW(hwnd, message, wparam, lparam);
        if (window->ignores_pointer()) return HTTRANSPARENT;
        POINT point{GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
        ScreenToClient(hwnd, &point);
        return window->hit_test_client_point(static_cast<float>(point.x), static_cast<float>(point.y))
            ? HTCLIENT
            : HTTRANSPARENT;
    }
    case WM_TIMER:
        if (window != nullptr && wparam == kDismissTimerId && window->close_reason().empty()) {
            window->request_close("timeout");
        }
        return 0;
    case WM_LBUTTONDOWN:
        if (window != nullptr) {
            const auto client_x = static_cast<float>(GET_X_LPARAM(lparam));
            const auto client_y = static_cast<float>(GET_Y_LPARAM(lparam));
            window->reset_pointer_gesture();
            if (window->begin_close_button_press(client_x, client_y)
                || window->begin_drag_client_point(client_x, client_y)) {
                SetCapture(hwnd);
            }
        }
        return 0;
    case WM_MOUSEMOVE:
        if (window != nullptr) {
            const auto client_x = static_cast<float>(GET_X_LPARAM(lparam));
            const auto client_y = static_cast<float>(GET_Y_LPARAM(lparam));
            if (window->is_dragging()) {
                POINT point{GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
                ClientToScreen(hwnd, &point);
                window->update_drag_screen_point(point.x, point.y);
            } else {
                window->note_pointer_client(client_x, client_y);
            }
        }
        return 0;
    case WM_MOUSELEAVE:
        if (window != nullptr) window->clear_hover();
        return 0;
    case WM_LBUTTONUP:
        if (window != nullptr) {
            const auto client_x = static_cast<float>(GET_X_LPARAM(lparam));
            const auto client_y = static_cast<float>(GET_Y_LPARAM(lparam));
            const bool dragging = window->is_dragging();
            const bool close_released = !dragging && window->release_close_button_press(client_x, client_y);
            if (dragging) {
                window->end_drag();
            } else if (close_released) {
                // A close is committed only after the same card receives the
                // matching release. The down event never reflows the scene.
                window->release_pointer_capture();
                window->request_close("user-close");
            } else {
                window->cancel_pointer_press();
                window->release_pointer_capture();
            }
        }
        return 0;
    case WM_CAPTURECHANGED:
        if (window != nullptr && !window->suppressing_capture_loss()) {
            window->end_drag();
            window->cancel_pointer_press();
        }
        return 0;
    case WM_PAINT: {
        PAINTSTRUCT paint{};
        const auto device_context = BeginPaint(hwnd, &paint);
        const bool rendered = window != nullptr && window->paint();
        if (!rendered) {
            FillRect(device_context, &paint.rcPaint, static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH)));
        }
        EndPaint(hwnd, &paint);
        if (window != nullptr) window->mark_first_paint();
        return 0;
    }
    case WM_SIZE:
        if (window != nullptr) {
            const int overflow = window->paint_overflow();
            const int hit_w = static_cast<int>(LOWORD(lparam)) - overflow * 2;
            const int hit_h = static_cast<int>(HIWORD(lparam)) - overflow * 2;
            if (hit_w > 0 && hit_h > 0) window->resize_render_target(hit_w, hit_h);
        }
        return 0;
    case WM_DPICHANGED:
        if (window != nullptr) {
            window->apply_dpi_change(
                static_cast<unsigned int>(LOWORD(wparam)),
                reinterpret_cast<const void*>(lparam));
        }
        return 0;
    case WM_ERASEBKGND:
        return 1;
    case WM_APP + 1:
        // Owner-thread probe used by the isolated Native Runtime lifecycle smoke test.
        DestroyWindow(hwnd);
        return 0;
    case WM_APP + 0x4E49:
        if (window != nullptr && window->is_created()) window->paint();
        return 0;
    case WM_CLOSE:
        if (window != nullptr && window->close_reason().empty()) {
            window->mark_close_requested("user-close");
        }
        DestroyWindow(hwnd);
        return 0;
    case WM_NCDESTROY:
        KillTimer(hwnd, kDismissTimerId);
        RemovePropW(hwnd, kWindowProperty);
        if (window != nullptr) window->mark_native_destroyed();
        return DefWindowProcW(hwnd, message, wparam, lparam);
    case WM_DESTROY:
        // These scene windows share the Runtime thread. Destroying one card must
        // not post WM_QUIT, which would terminate the shared message pump and
        // make the remaining cards disappear with it.
        return 0;
    default:
        return DefWindowProcW(hwnd, message, wparam, lparam);
    }
}

}  // namespace
#endif

SceneWindow::SceneWindow(WindowConfig config) : config_(std::move(config)) {}

SceneWindow::~SceneWindow() {
    destroy();
}

bool SceneWindow::create() {
#ifdef _WIN32
    create_error_.clear();
    if (hwnd_ != nullptr) return true;

    auto fail_win32 = [this](const char* stage) {
        char buf[192];
        std::snprintf(
            buf,
            sizeof(buf),
            "stage=%s win32=%lu hr=0x00000000",
            stage,
            static_cast<unsigned long>(GetLastError()));
        create_error_ = buf;
        return false;
    };

    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    const auto instance = GetModuleHandleW(nullptr);
    WNDCLASSEXW window_class{};
    window_class.cbSize = sizeof(window_class);
    window_class.hInstance = instance;
    window_class.lpfnWndProc = window_proc;
    window_class.lpszClassName = class_name_.c_str();
    window_class.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(IDC_ARROW));
    window_class.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));

    SetLastError(0);
    if (!GetClassInfoExW(instance, class_name_.c_str(), &window_class)) {
        window_class.cbSize = sizeof(window_class);
        window_class.hInstance = instance;
        window_class.lpfnWndProc = window_proc;
        window_class.lpszClassName = class_name_.c_str();
        window_class.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(IDC_ARROW));
        window_class.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
        SetLastError(0);
        if (RegisterClassExW(&window_class) == 0) return fail_win32("register_class");
        class_registered_ = true;
    }

    DWORD style = WS_POPUP;
    DWORD extended_style = WS_EX_NOACTIVATE | WS_EX_LAYERED | WS_EX_TOPMOST;
    if (config_.tool_window) extended_style |= WS_EX_TOOLWINDOW;
    if (config_.visual.ticker_specified && config_.visual.ticker_click_through) extended_style |= WS_EX_TRANSPARENT;

    const int overflow = paint_overflow();
    RECT bounds{0, 0, config_.width + overflow * 2, config_.height + overflow * 2};
    AdjustWindowRectEx(&bounds, style, FALSE, extended_style);
    const auto initial_x = config_.has_initial_position ? config_.x - overflow : CW_USEDEFAULT;
    const auto initial_y = config_.has_initial_position ? config_.y - overflow : CW_USEDEFAULT;
    SetLastError(0);
    const auto hwnd = CreateWindowExW(
        extended_style,
        class_name_.c_str(),
        config_.title.c_str(),
        style,
        initial_x,
        initial_y,
        bounds.right - bounds.left,
        bounds.bottom - bounds.top,
        nullptr,
        nullptr,
        instance,
        this);
    if (hwnd == nullptr) return fail_win32("create_window");

    hwnd_ = hwnd;
    dpi_ = GetDpiForWindow(hwnd);
    BOOL disable_transitions = TRUE;
    DwmSetWindowAttribute(hwnd, DWMWA_TRANSITIONS_FORCEDISABLED, &disable_transitions, sizeof(disable_transitions));
    if (!renderer_.initialize(hwnd_, config_.width + overflow * 2, config_.height + overflow * 2)) {
        create_error_ = renderer_.last_error().empty()
            ? "stage=renderer.initialize win32=0 hr=0x00000000"
            : renderer_.last_error();
        DestroyWindow(hwnd);
        hwnd_ = nullptr;
        visible_ = false;
        return false;
    }
    if ((config_.visual.auto_dismiss || config_.visual.dismiss_mode == "timeout") && !config_.visual.ticker_specified) {
        SetTimer(static_cast<HWND>(hwnd_), kDismissTimerId, static_cast<UINT>(config_.visual.dismiss_timeout_ms), nullptr);
    }
    return true;
#else
    create_error_ = "stage=unsupported win32=0 hr=0x00000000";
    return false;
#endif
}

bool SceneWindow::show() {
#ifdef _WIN32
    if (hwnd_ == nullptr) return false;
    ShowWindow(static_cast<HWND>(hwnd_), SW_SHOWNOACTIVATE);
    visible_ = IsWindowVisible(static_cast<HWND>(hwnd_)) != FALSE;
    if (!visible_) return false;
    const auto positioned = SetWindowPos(
        static_cast<HWND>(hwnd_),
        HWND_TOPMOST,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW) != FALSE;
    if (positioned) BringWindowToTop(static_cast<HWND>(hwnd_));
    return positioned;
#else
    return false;
#endif
}

void SceneWindow::request_close(std::string_view reason) {
    mark_close_requested(reason);
#ifdef _WIN32
    if (hwnd_ != nullptr) PostMessageW(static_cast<HWND>(hwnd_), WM_CLOSE, 0, 0);
#endif
}

void SceneWindow::mark_close_requested(std::string_view reason) {
    if (!reason.empty() && close_reason_.empty()) close_reason_ = std::string(reason);
    close_requested_ = true;
}

int SceneWindow::run_message_pump(bool close_after_first_paint) {
#ifdef _WIN32
    MSG message{};
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
    while (std::chrono::steady_clock::now() < deadline) {
        while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
            if (message.message == WM_QUIT) return static_cast<int>(message.wParam);
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        if (close_after_first_paint && first_paint_seen_) request_close();
        if (hwnd_ == nullptr) return 0;
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    request_close("pump-timeout");
    while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
        if (message.message == WM_QUIT) return static_cast<int>(message.wParam);
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
    return hwnd_ == nullptr ? 0 : 1;
#else
    static_cast<void>(close_after_first_paint);
    return 1;
#endif
}

void SceneWindow::destroy() {
#ifdef _WIN32
    renderer_.reset();
    if (hwnd_ != nullptr) {
        if (close_reason_.empty()) close_reason_ = "programmatic-destroy";
        DestroyWindow(static_cast<HWND>(hwnd_));
        hwnd_ = nullptr;
    }
    visible_ = false;
#endif
}

bool SceneWindow::is_created() const noexcept {
    return hwnd_ != nullptr;
}

bool SceneWindow::is_visible() const noexcept {
    return visible_;
}

bool SceneWindow::is_renderer_ready() const noexcept {
    return renderer_.is_ready();
}

bool SceneWindow::is_frame_rendered() const noexcept {
    return frame_rendered_;
}

bool SceneWindow::is_close_requested() const noexcept {
    return close_requested_;
}

unsigned int SceneWindow::dpi() const noexcept {
    return dpi_;
}

bool SceneWindow::apply_dpi_change(unsigned int dpi, const void* suggested_rect) noexcept {
#ifdef _WIN32
    if (hwnd_ == nullptr || dpi == 0 || suggested_rect == nullptr) return false;
    const auto* rect = static_cast<const RECT*>(suggested_rect);
    const int width = rect->right - rect->left;
    const int height = rect->bottom - rect->top;
    if (width <= 0 || height <= 0) return false;
    dpi_ = dpi;
    const auto moved = SetWindowPos(
        static_cast<HWND>(hwnd_),
        nullptr,
        rect->left,
        rect->top,
        width,
        height,
        SWP_NOZORDER | SWP_NOACTIVATE) != FALSE;
    const int overflow = paint_overflow();
    const int hit_w = width - overflow * 2;
    const int hit_h = height - overflow * 2;
    if (hit_w <= 0 || hit_h <= 0) return false;
    const auto resized = resize_render_target(hit_w, hit_h);
    return moved && resized;
#else
    static_cast<void>(dpi);
    static_cast<void>(suggested_rect);
    return false;
#endif
}

bool SceneWindow::is_dragging() const noexcept {
    return drag_active_;
}

bool SceneWindow::ignores_pointer() const noexcept {
    return config_.visual.ticker_specified && config_.visual.ticker_click_through;
}

bool SceneWindow::get_window_position(int& x, int& y) const noexcept {
#ifdef _WIN32
    if (hwnd_ == nullptr) return false;
    RECT bounds{};
    if (GetWindowRect(static_cast<HWND>(hwnd_), &bounds) == FALSE) return false;
    x = bounds.left;
    y = bounds.top;
    return true;
#else
    static_cast<void>(x);
    static_cast<void>(y);
    return false;
#endif
}

int SceneWindow::paint_overflow() const noexcept {
    return clamp_paint_overflow(config_.visual.paint_overflow);
}

bool SceneWindow::point_on_close_control(float x, float y) const noexcept {
    bool saw_close = false;
    for (const auto& part : config_.parts) {
        if (part.kind != "close") continue;
        saw_close = true;
        return x >= static_cast<float>(part.x) && x <= static_cast<float>(part.x + part.w)
            && y >= static_cast<float>(part.y) && y <= static_cast<float>(part.y + part.h);
    }
    if (!config_.parts.empty() && !saw_close) return false;
    if (config_.visual.dismiss_mode != "closeButton" && config_.visual.dismiss_mode != "buttonOnly") return false;
    return point_inside_close_button(x, y, static_cast<float>(config_.width), static_cast<float>(config_.height));
}

bool SceneWindow::begin_close_button_press(float x, float y) noexcept {
#ifdef _WIN32
    if (hwnd_ == nullptr || close_requested_) return false;
    client_to_hit_box(x, y, paint_overflow());
    const bool anywhere = config_.visual.dismiss_mode == "anywhere";
    if (!anywhere && !point_on_close_control(x, y)) return false;
    close_button_pressed_ = true;
    return true;
#else
    static_cast<void>(x);
    static_cast<void>(y);
    return false;
#endif
}

bool SceneWindow::release_close_button_press(float x, float y) noexcept {
#ifdef _WIN32
    if (!close_button_pressed_) return false;
    client_to_hit_box(x, y, paint_overflow());
    const bool released_inside = config_.visual.dismiss_mode == "anywhere"
        ? point_inside_card(x, y, static_cast<float>(config_.width), static_cast<float>(config_.height))
        : point_on_close_control(x, y);
    close_button_pressed_ = false;
    return released_inside && !close_requested_;
#else
    static_cast<void>(x);
    static_cast<void>(y);
    return false;
#endif
}

void SceneWindow::cancel_pointer_press() noexcept {
    close_button_pressed_ = false;
}

bool SceneWindow::begin_drag_client_point(float x, float y) noexcept {
#ifdef _WIN32
    if (hwnd_ == nullptr || close_requested_ || ignores_pointer() || config_.visual.ticker_specified || !config_.visual.hold_drag || config_.visual.dismiss_mode == "anywhere") return false;
    float hit_x = x;
    float hit_y = y;
    client_to_hit_box(hit_x, hit_y, paint_overflow());
    if (!point_inside_card(hit_x, hit_y, static_cast<float>(config_.width), static_cast<float>(config_.height))
        || point_on_close_control(hit_x, hit_y)) {
        return false;
    }
    POINT point{static_cast<LONG>(x), static_cast<LONG>(y)};
    if (ClientToScreen(static_cast<HWND>(hwnd_), &point) == FALSE) return false;
    int window_x = 0;
    int window_y = 0;
    if (!get_window_position(window_x, window_y)) return false;
    drag_start_screen_x_ = point.x;
    drag_start_screen_y_ = point.y;
    drag_window_start_x_ = window_x;
    drag_window_start_y_ = window_y;
    drag_active_ = true;
    return true;
#else
    static_cast<void>(x);
    static_cast<void>(y);
    return false;
#endif
}

bool SceneWindow::update_drag_screen_point(int x, int y) noexcept {
#ifdef _WIN32
    if (!drag_active_ || hwnd_ == nullptr) return false;
    const auto next_x = drag_window_start_x_ + (x - drag_start_screen_x_);
    const auto next_y = drag_window_start_y_ + (y - drag_start_screen_y_);
    const auto hwnd = static_cast<HWND>(hwnd_);
    suppress_capture_loss_ = true;
    const auto moved = SetWindowPos(
        hwnd,
        nullptr,
        next_x,
        next_y,
        0,
        0,
        SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE) != FALSE;
    if (moved) renderer_.present_layered();
    suppress_capture_loss_ = false;
    if (drag_active_ && GetCapture() != hwnd) SetCapture(hwnd);
    return moved;
#else
    static_cast<void>(x);
    static_cast<void>(y);
    return false;
#endif
}

void SceneWindow::end_drag() noexcept {
#ifdef _WIN32
    if (!drag_active_) return;
    drag_active_ = false;
    release_pointer_capture();
#else
    drag_active_ = false;
#endif
}

bool SceneWindow::present_layered() {
    return renderer_.present_layered();
}

bool SceneWindow::layered_present_origin(int& x, int& y) const noexcept {
    return renderer_.layered_present_origin(x, y);
}

void SceneWindow::reset_pointer_gesture() noexcept {
    end_drag();
    cancel_pointer_press();
}

void SceneWindow::release_pointer_capture() noexcept {
#ifdef _WIN32
    if (hwnd_ != nullptr && GetCapture() == static_cast<HWND>(hwnd_)) ReleaseCapture();
#endif
}

bool SceneWindow::suppressing_capture_loss() const noexcept {
    return suppress_capture_loss_;
}

void SceneWindow::update_content(std::wstring title, std::wstring body) {
    config_.title = std::move(title);
    config_.body = std::move(body);
#ifdef _WIN32
    if (hwnd_ != nullptr) {
        SetWindowTextW(static_cast<HWND>(hwnd_), config_.title.c_str());
        InvalidateRect(static_cast<HWND>(hwnd_), nullptr, FALSE);
    }
#endif
}

void SceneWindow::update_assistant_name(std::wstring assistant_name) {
    config_.assistant_name = std::move(assistant_name);
#ifdef _WIN32
    if (hwnd_ != nullptr) InvalidateRect(static_cast<HWND>(hwnd_), nullptr, FALSE);
#endif
}

void SceneWindow::update_parts(std::vector<CardPart> parts) {
    config_.parts = std::move(parts);
#ifdef _WIN32
    if (hwnd_ != nullptr) {
        InvalidateRect(static_cast<HWND>(hwnd_), nullptr, FALSE);
    }
#endif
}

bool SceneWindow::capture_pixels() const noexcept {
    return renderer_.capture_pixels();
}

bool SceneWindow::sample_pixel(int x, int y, Pixel& pixel) const noexcept {
    return renderer_.sample_pixel(x, y, pixel);
}

bool SceneWindow::hit_test_client_point(float x, float y) const noexcept {
    client_to_hit_box(x, y, paint_overflow());
    return point_inside_card(x, y, static_cast<float>(config_.width), static_cast<float>(config_.height));
}

bool SceneWindow::click_client_point(float x, float y) noexcept {
    client_to_hit_box(x, y, paint_overflow());
    if (!point_on_close_control(x, y)) {
        return false;
    }
    request_close("user-close");
    return true;
}

void* SceneWindow::native_handle() const noexcept {
    return hwnd_;
}

void SceneWindow::update_visual(VisualStyle visual) {
    if (valid_visual_style(visual)) config_.visual = std::move(visual);
#ifdef _WIN32
    if (hwnd_ != nullptr) {
        KillTimer(static_cast<HWND>(hwnd_), kDismissTimerId);
        if ((config_.visual.auto_dismiss || config_.visual.dismiss_mode == "timeout") && !config_.visual.ticker_specified) {
            SetTimer(static_cast<HWND>(hwnd_), kDismissTimerId, static_cast<UINT>(config_.visual.dismiss_timeout_ms), nullptr);
        }
        const auto hwnd = static_cast<HWND>(hwnd_);
        auto style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        const auto next = ignores_pointer() ? (style | WS_EX_TRANSPARENT) : (style & ~WS_EX_TRANSPARENT);
        if (next != style) {
            SetWindowLongW(hwnd, GWL_EXSTYLE, next);
            SetWindowPos(hwnd, nullptr, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
        }
        InvalidateRect(hwnd, nullptr, FALSE);
    }
#endif
}

void SceneWindow::note_pointer_client(float x, float y) noexcept {
#ifdef _WIN32
    if (hwnd_ == nullptr) return;
    if (!mouse_leave_tracked_) {
        TRACKMOUSEEVENT track{};
        track.cbSize = sizeof(track);
        track.dwFlags = TME_LEAVE;
        track.hwndTrack = static_cast<HWND>(hwnd_);
        if (TrackMouseEvent(&track) != FALSE) mouse_leave_tracked_ = true;
    }
    if (ignores_pointer() || !config_.visual.hover_highlight) {
        if (hovered_) {
            hovered_ = false;
            InvalidateRect(static_cast<HWND>(hwnd_), nullptr, FALSE);
        }
        return;
    }
    client_to_hit_box(x, y, paint_overflow());
    const bool next = point_inside_card(x, y, static_cast<float>(config_.width), static_cast<float>(config_.height));
    if (next == hovered_) return;
    hovered_ = next;
    InvalidateRect(static_cast<HWND>(hwnd_), nullptr, FALSE);
#else
    static_cast<void>(x);
    static_cast<void>(y);
#endif
}

void SceneWindow::clear_hover() noexcept {
#ifdef _WIN32
    mouse_leave_tracked_ = false;
    if (!hovered_) return;
    hovered_ = false;
    if (hwnd_ != nullptr) InvalidateRect(static_cast<HWND>(hwnd_), nullptr, FALSE);
#endif
}

namespace {
std::uint64_t g_scene_window_paint_count = 0;
}

std::uint64_t scene_window_paint_count() noexcept {
    return g_scene_window_paint_count;
}

bool SceneWindow::paint(bool capture_output) {
#ifdef _WIN32
    ++g_scene_window_paint_count;
    if (hwnd_ == nullptr || !renderer_.is_ready()) return false;
    const bool rendered = renderer_.draw(config_.title, config_.body, config_.visual, capture_output, config_.parts, hovered_ && config_.visual.hover_highlight, config_.assistant_name);
    frame_rendered_ = frame_rendered_ || rendered;
    return rendered;
#else
    return false;
#endif
}

bool SceneWindow::resize_render_target(int width, int height) {
    const int overflow = paint_overflow();
    const bool resized = renderer_.resize(width + overflow * 2, height + overflow * 2);
    if (resized) {
        config_.width = width;
        config_.height = height;
    }
    return resized;
}

void SceneWindow::mark_first_paint() noexcept {
    first_paint_seen_ = true;
}

void SceneWindow::mark_native_destroyed() noexcept {
    drag_active_ = false;
    if (close_reason_.empty()) close_reason_ = "window-destroyed";
    hwnd_ = nullptr;
    visible_ = false;
    renderer_.reset();
}

const std::string& SceneWindow::close_reason() const noexcept {
    return close_reason_;
}

#ifdef _WIN32
using Microsoft::WRL::ComPtr;

namespace {
constexpr wchar_t kOverlayClass[] = L"NotificationHubVNextTickerOverlay";
constexpr wchar_t kOverlayProperty[] = L"NotificationHubVNextTickerOverlayInstance";
bool g_overlay_class_registered = false;

struct OverlaySprite {
    std::string id;
    ComPtr<IDCompositionVisual> visual;
    ComPtr<IDCompositionSurface> surface;
    int width{};
    int height{};
    int x{};
    int y{};
};

LRESULT CALLBACK overlay_proc(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
    auto* overlay = reinterpret_cast<TickerOverlay*>(GetPropW(hwnd, kOverlayProperty));
    if (message == WM_NCCREATE) {
        const auto* create = reinterpret_cast<const CREATESTRUCTW*>(lparam);
        overlay = static_cast<TickerOverlay*>(create->lpCreateParams);
        SetPropW(hwnd, kOverlayProperty, overlay);
    }
    if (message == WM_MOUSEACTIVATE) return MA_NOACTIVATE;
    if (message == WM_NCHITTEST) {
        // 幕布 HWND 铺满工作区，但 USER 区域是卡面并集。空处不在窗里。
        // 点穿开：整张幕布 HTTRANSPARENT，连卡面也不吃鼠标。
        // 点穿关：只有卡面矩形 HTCLIENT。
        if (overlay == nullptr || overlay->click_through()) return HTTRANSPARENT;
        POINT point{GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
        if (overlay->hit_test(point.x, point.y).empty()) return HTTRANSPARENT;
        return HTCLIENT;
    }
    if (message == WM_MOUSEMOVE && overlay != nullptr) {
        POINT point{GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
        ClientToScreen(hwnd, &point);
        overlay->note_pointer(point.x, point.y);
        return 0;
    }
    if (message == WM_MOUSELEAVE && overlay != nullptr) {
        overlay->clear_hover();
        return 0;
    }
    if (message == WM_LBUTTONUP && overlay != nullptr) {
        POINT point{GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
        ClientToScreen(hwnd, &point);
        overlay->note_click(point.x, point.y);
        return 0;
    }
    if (message == WM_DESTROY) {
        RemovePropW(hwnd, kOverlayProperty);
    }
    return DefWindowProcW(hwnd, message, wparam, lparam);
}
}  // namespace
#endif

struct TickerOverlay::Impl {
#ifdef _WIN32
    HWND hwnd{};
    int host_x{};
    int host_y{};
    int host_w{};
    int host_h{};
    bool click_through{true};
    bool dirty{};
    bool mouse_leave_tracked{};
    std::uint64_t paints{};
    std::uint64_t commits{};
    std::string last_error;
    std::string clicked_id;
    std::string hovered_id;
    int clicked_x{};
    int clicked_y{};
    ComPtr<ID3D11Device> d3d;
    ComPtr<IDXGIDevice> dxgi;
    ComPtr<IDCompositionDevice> dcomp;
    ComPtr<IDCompositionTarget> target;
    ComPtr<IDCompositionVisual> root;
    ComPtr<ID2D1Factory1> d2d_factory;
    ComPtr<ID2D1Device> d2d_device;
    ComPtr<ID2D1DeviceContext> d2d;
    std::vector<OverlaySprite> sprites;

    void sync_input_region() {
        if (hwnd == nullptr) return;
        if (sprites.empty()) {
            SetWindowRgn(hwnd, nullptr, FALSE);
            return;
        }
        HRGN combined = nullptr;
        for (const auto& sprite : sprites) {
            const int x = sprite.x - host_x;
            const int y = sprite.y - host_y;
            HRGN part = CreateRectRgn(x, y, x + sprite.width, y + sprite.height);
            if (part == nullptr) continue;
            if (combined == nullptr) {
                combined = part;
                continue;
            }
            CombineRgn(combined, combined, part, RGN_OR);
            DeleteObject(part);
        }
        if (combined == nullptr) {
            SetWindowRgn(hwnd, nullptr, FALSE);
            return;
        }
        if (SetWindowRgn(hwnd, combined, FALSE) == 0) {
            DeleteObject(combined);
        }
    }

    OverlaySprite* find(std::string_view id) {
        for (auto& sprite : sprites) {
            if (sprite.id == id) return &sprite;
        }
        return nullptr;
    }
    const OverlaySprite* find(std::string_view id) const {
        for (const auto& sprite : sprites) {
            if (sprite.id == id) return &sprite;
        }
        return nullptr;
    }

    void fail(const char* stage, HRESULT hr = S_OK, DWORD win32 = 0) {
        char buffer[160];
        std::snprintf(
            buffer,
            sizeof(buffer),
            "stage=%s win32=%lu hr=0x%08lX",
            stage,
            static_cast<unsigned long>(win32),
            static_cast<unsigned long>(hr));
        last_error = buffer;
    }

    bool upload(OverlaySprite& sprite, const void* bgra, int pitch) {
        if (sprite.surface == nullptr || d2d == nullptr || bgra == nullptr || pitch < sprite.width * 4) {
            fail("overlay.upload.args");
            return false;
        }
        POINT update_offset{};
        ComPtr<IDXGISurface> dxgi_surface;
        HRESULT hr = sprite.surface->BeginDraw(nullptr, IID_PPV_ARGS(&dxgi_surface), &update_offset);
        if (FAILED(hr)) {
            fail("overlay.begin_draw", hr);
            return false;
        }
        D2D1_BITMAP_PROPERTIES1 target_props{};
        target_props.pixelFormat = {DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED};
        target_props.dpiX = 96.0f;
        target_props.dpiY = 96.0f;
        target_props.bitmapOptions = D2D1_BITMAP_OPTIONS_TARGET | D2D1_BITMAP_OPTIONS_CANNOT_DRAW;
        ComPtr<ID2D1Bitmap1> target_bitmap;
        hr = d2d->CreateBitmapFromDxgiSurface(dxgi_surface.Get(), &target_props, &target_bitmap);
        if (FAILED(hr)) {
            sprite.surface->EndDraw();
            fail("overlay.target_bitmap", hr);
            return false;
        }
        d2d->SetTarget(target_bitmap.Get());
        d2d->BeginDraw();
        d2d->SetTransform(D2D1::Matrix3x2F::Translation(
            static_cast<float>(update_offset.x), static_cast<float>(update_offset.y)));
        d2d->Clear(D2D1::ColorF(0.0f, 0.0f, 0.0f, 0.0f));
        D2D1_BITMAP_PROPERTIES src_props{};
        src_props.pixelFormat = {DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED};
        src_props.dpiX = 96.0f;
        src_props.dpiY = 96.0f;
        ComPtr<ID2D1Bitmap> source;
        hr = d2d->CreateBitmap(
            D2D1::SizeU(static_cast<UINT32>(sprite.width), static_cast<UINT32>(sprite.height)),
            bgra,
            static_cast<UINT32>(pitch),
            src_props,
            &source);
        if (SUCCEEDED(hr)) {
            d2d->DrawBitmap(
                source.Get(),
                D2D1::RectF(0.0f, 0.0f, static_cast<float>(sprite.width), static_cast<float>(sprite.height)),
                1.0f,
                D2D1_BITMAP_INTERPOLATION_MODE_NEAREST_NEIGHBOR);
        }
        const HRESULT end_dc = d2d->EndDraw();
        d2d->SetTarget(nullptr);
        const HRESULT end_surface = sprite.surface->EndDraw();
        if (FAILED(hr) || FAILED(end_dc) || FAILED(end_surface)) {
            fail("overlay.end_draw", FAILED(hr) ? hr : (FAILED(end_dc) ? end_dc : end_surface));
            return false;
        }
        paints += 1;
        dirty = true;
        return true;
    }
#endif
};

TickerOverlay::TickerOverlay() : impl_(std::make_unique<Impl>()) {}
TickerOverlay::~TickerOverlay() { destroy(); }

bool TickerOverlay::create(int x, int y, int width, int height) {
#ifdef _WIN32
    if (width <= 0 || height <= 0) {
        impl_->fail("overlay.args");
        return false;
    }
    if (impl_->hwnd != nullptr) {
        impl_->host_x = x;
        impl_->host_y = y;
        impl_->host_w = width;
        impl_->host_h = height;
        SetWindowPos(
            impl_->hwnd,
            HWND_TOPMOST,
            x,
            y,
            width,
            height,
            SWP_NOACTIVATE | SWP_NOREDRAW | SWP_NOSENDCHANGING);
        impl_->dirty = true;
        impl_->sync_input_region();
        return true;
    }
    const auto com = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(com) && com != RPC_E_CHANGED_MODE) {
        impl_->fail("overlay.com", com);
        return false;
    }
    const auto instance = GetModuleHandleW(nullptr);
    if (!g_overlay_class_registered) {
        WNDCLASSEXW window_class{};
        window_class.cbSize = sizeof(window_class);
        window_class.hInstance = instance;
        window_class.lpfnWndProc = overlay_proc;
        window_class.lpszClassName = kOverlayClass;
        window_class.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(IDC_ARROW));
        if (RegisterClassExW(&window_class) == 0 && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
            impl_->fail("overlay.register_class", S_OK, GetLastError());
            return false;
        }
        g_overlay_class_registered = true;
    }
    DWORD extended = WS_EX_NOACTIVATE | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOREDIRECTIONBITMAP
        | WS_EX_TRANSPARENT;
    const HWND hwnd = CreateWindowExW(
        extended,
        kOverlayClass,
        L"Notification Hub Overlay",
        WS_POPUP,
        x,
        y,
        width,
        height,
        nullptr,
        nullptr,
        instance,
        this);
    if (hwnd == nullptr) {
        impl_->fail("overlay.create_window", S_OK, GetLastError());
        return false;
    }
    BOOL disable_transitions = TRUE;
    DwmSetWindowAttribute(hwnd, DWMWA_TRANSITIONS_FORCEDISABLED, &disable_transitions, sizeof(disable_transitions));

    D3D_FEATURE_LEVEL level{};
    const D3D_FEATURE_LEVEL levels[] = {
        D3D_FEATURE_LEVEL_11_0,
        D3D_FEATURE_LEVEL_10_1,
        D3D_FEATURE_LEVEL_10_0
    };
    HRESULT hr = D3D11CreateDevice(
        nullptr,
        D3D_DRIVER_TYPE_HARDWARE,
        nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        levels,
        3,
        D3D11_SDK_VERSION,
        &impl_->d3d,
        &level,
        nullptr);
    if (FAILED(hr)) {
        hr = D3D11CreateDevice(
            nullptr,
            D3D_DRIVER_TYPE_WARP,
            nullptr,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            levels,
            3,
            D3D11_SDK_VERSION,
            &impl_->d3d,
            &level,
            nullptr);
    }
    if (FAILED(hr)) {
        DestroyWindow(hwnd);
        impl_->fail("overlay.d3d", hr);
        return false;
    }
    hr = impl_->d3d.As(&impl_->dxgi);
    if (FAILED(hr)) {
        DestroyWindow(hwnd);
        impl_->fail("overlay.dxgi", hr);
        return false;
    }
    hr = DCompositionCreateDevice(impl_->dxgi.Get(), IID_PPV_ARGS(&impl_->dcomp));
    if (FAILED(hr)) {
        DestroyWindow(hwnd);
        impl_->fail("overlay.dcomp", hr);
        return false;
    }
    hr = impl_->dcomp->CreateTargetForHwnd(hwnd, TRUE, &impl_->target);
    if (FAILED(hr)) {
        DestroyWindow(hwnd);
        impl_->fail("overlay.target", hr);
        return false;
    }
    hr = impl_->dcomp->CreateVisual(&impl_->root);
    if (FAILED(hr) || FAILED(impl_->target->SetRoot(impl_->root.Get()))) {
        DestroyWindow(hwnd);
        impl_->fail("overlay.root", hr);
        return false;
    }
    hr = D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, IID_PPV_ARGS(&impl_->d2d_factory));
    if (FAILED(hr)) {
        DestroyWindow(hwnd);
        impl_->fail("overlay.d2d_factory", hr);
        return false;
    }
    hr = impl_->d2d_factory->CreateDevice(impl_->dxgi.Get(), &impl_->d2d_device);
    if (FAILED(hr)) {
        DestroyWindow(hwnd);
        impl_->fail("overlay.d2d_device", hr);
        return false;
    }
    hr = impl_->d2d_device->CreateDeviceContext(D2D1_DEVICE_CONTEXT_OPTIONS_NONE, &impl_->d2d);
    if (FAILED(hr)) {
        DestroyWindow(hwnd);
        impl_->fail("overlay.d2d", hr);
        return false;
    }
    impl_->hwnd = hwnd;
    impl_->host_x = x;
    impl_->host_y = y;
    impl_->host_w = width;
    impl_->host_h = height;
    ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    impl_->dirty = true;
    return commit();
#else
    static_cast<void>(x);
    static_cast<void>(y);
    static_cast<void>(width);
    static_cast<void>(height);
    return false;
#endif
}

void TickerOverlay::destroy() {
#ifdef _WIN32
    if (impl_ == nullptr) return;
    impl_->sprites.clear();
    impl_->root.Reset();
    impl_->target.Reset();
    impl_->dcomp.Reset();
    impl_->d2d.Reset();
    impl_->d2d_device.Reset();
    impl_->d2d_factory.Reset();
    impl_->dxgi.Reset();
    impl_->d3d.Reset();
    if (impl_->hwnd != nullptr) {
        DestroyWindow(impl_->hwnd);
        impl_->hwnd = nullptr;
    }
    impl_->dirty = false;
#endif
}

bool TickerOverlay::is_created() const noexcept {
#ifdef _WIN32
    return impl_ != nullptr && impl_->hwnd != nullptr;
#else
    return false;
#endif
}

bool TickerOverlay::empty() const noexcept {
#ifdef _WIN32
    return impl_ == nullptr || impl_->sprites.empty();
#else
    return true;
#endif
}

bool TickerOverlay::click_through() const noexcept {
#ifdef _WIN32
    return impl_ != nullptr && impl_->click_through;
#else
    return true;
#endif
}

bool TickerOverlay::set_click_through(bool on) {
#ifdef _WIN32
    impl_->click_through = on;
    if (on) clear_hover();
    if (impl_->hwnd == nullptr) return true;
    auto style = GetWindowLongW(impl_->hwnd, GWL_EXSTYLE);
    const auto next = on ? (style | WS_EX_TRANSPARENT) : (style & ~WS_EX_TRANSPARENT);
    if (next != style) {
        SetWindowLongW(impl_->hwnd, GWL_EXSTYLE, next);
        SetWindowPos(
            impl_->hwnd,
            nullptr,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }
    return true;
#else
    static_cast<void>(on);
    return false;
#endif
}

bool TickerOverlay::add_sprite(std::string id, int width, int height, const void* bgra, int pitch) {
#ifdef _WIN32
    if (!is_created() || id.empty() || width <= 0 || height <= 0 || bgra == nullptr) {
        impl_->fail("overlay.add.args");
        return false;
    }
    remove_sprite(id);
    OverlaySprite sprite;
    sprite.id = std::move(id);
    sprite.width = width;
    sprite.height = height;
    HRESULT hr = impl_->dcomp->CreateSurface(
        static_cast<UINT>(width),
        static_cast<UINT>(height),
        DXGI_FORMAT_B8G8R8A8_UNORM,
        DXGI_ALPHA_MODE_PREMULTIPLIED,
        &sprite.surface);
    if (FAILED(hr)) {
        impl_->fail("overlay.surface", hr);
        return false;
    }
    hr = impl_->dcomp->CreateVisual(&sprite.visual);
    if (FAILED(hr) || FAILED(sprite.visual->SetContent(sprite.surface.Get()))) {
        impl_->fail("overlay.visual", hr);
        return false;
    }
    if (!impl_->upload(sprite, bgra, pitch)) return false;
    if (FAILED(impl_->root->AddVisual(sprite.visual.Get(), TRUE, nullptr))) {
        impl_->fail("overlay.add_visual");
        return false;
    }
    impl_->sprites.push_back(std::move(sprite));
    impl_->dirty = true;
    return true;
#else
    static_cast<void>(id);
    static_cast<void>(width);
    static_cast<void>(height);
    static_cast<void>(bgra);
    static_cast<void>(pitch);
    return false;
#endif
}

bool TickerOverlay::update_pixels(std::string_view id, int width, int height, const void* bgra, int pitch) {
#ifdef _WIN32
    auto* sprite = impl_->find(id);
    if (sprite == nullptr || width != sprite->width || height != sprite->height) {
        impl_->fail("overlay.update.args");
        return false;
    }
    return impl_->upload(*sprite, bgra, pitch);
#else
    static_cast<void>(id);
    static_cast<void>(width);
    static_cast<void>(height);
    static_cast<void>(bgra);
    static_cast<void>(pitch);
    return false;
#endif
}

bool TickerOverlay::set_offset(std::string_view id, int x, int y) {
#ifdef _WIN32
    auto* sprite = impl_->find(id);
    if (sprite == nullptr || sprite->visual == nullptr) return false;
    sprite->x = x;
    sprite->y = y;
    const auto local_x = static_cast<float>(x - impl_->host_x);
    const auto local_y = static_cast<float>(y - impl_->host_y);
    if (FAILED(sprite->visual->SetOffsetX(local_x)) || FAILED(sprite->visual->SetOffsetY(local_y))) {
        impl_->fail("overlay.offset");
        return false;
    }
    impl_->dirty = true;
    return true;
#else
    static_cast<void>(id);
    static_cast<void>(x);
    static_cast<void>(y);
    return false;
#endif
}

bool TickerOverlay::has_sprite(std::string_view id) const noexcept {
#ifdef _WIN32
    return impl_ != nullptr && impl_->find(id) != nullptr;
#else
    static_cast<void>(id);
    return false;
#endif
}

bool TickerOverlay::remove_sprite(std::string_view id) {
#ifdef _WIN32
    for (auto it = impl_->sprites.begin(); it != impl_->sprites.end(); ++it) {
        if (it->id != id) continue;
        if (impl_->root != nullptr && it->visual != nullptr) {
            impl_->root->RemoveVisual(it->visual.Get());
        }
        impl_->sprites.erase(it);
        impl_->dirty = true;
        return true;
    }
    return false;
#else
    static_cast<void>(id);
    return false;
#endif
}

bool TickerOverlay::commit() {
#ifdef _WIN32
    if (impl_->dcomp == nullptr) return false;
    if (!impl_->dirty) return true;
    const HRESULT hr = impl_->dcomp->Commit();
    if (FAILED(hr)) {
        impl_->fail("overlay.commit", hr);
        return false;
    }
    impl_->commits += 1;
    impl_->dirty = false;
    impl_->sync_input_region();
    return true;
#else
    return false;
#endif
}

std::string TickerOverlay::hit_test(int screen_x, int screen_y) const {
#ifdef _WIN32
    std::vector<OverlaySpriteBox> boxes;
    boxes.reserve(impl_->sprites.size());
    for (const auto& sprite : impl_->sprites) {
        boxes.push_back({sprite.id, sprite.x, sprite.y, sprite.width, sprite.height});
    }
    return hit_test_overlay_sprites(boxes, screen_x, screen_y);
#else
    static_cast<void>(screen_x);
    static_cast<void>(screen_y);
    return {};
#endif
}

void* TickerOverlay::native_handle() const noexcept {
#ifdef _WIN32
    return impl_->hwnd;
#else
    return nullptr;
#endif
}

std::uint64_t TickerOverlay::paint_count() const noexcept {
#ifdef _WIN32
    return impl_->paints;
#else
    return 0;
#endif
}

std::uint64_t TickerOverlay::commit_count() const noexcept {
#ifdef _WIN32
    return impl_->commits;
#else
    return 0;
#endif
}

std::string TickerOverlay::hovered_id() const {
#ifdef _WIN32
    return impl_ != nullptr ? impl_->hovered_id : std::string{};
#else
    return {};
#endif
}

void TickerOverlay::note_pointer(int screen_x, int screen_y) {
#ifdef _WIN32
    if (impl_ == nullptr) return;
    if (impl_->click_through) {
        clear_hover();
        return;
    }
    impl_->hovered_id = hit_test(screen_x, screen_y);
    if (impl_->hwnd != nullptr && !impl_->mouse_leave_tracked) {
        TRACKMOUSEEVENT track{};
        track.cbSize = sizeof(track);
        track.dwFlags = TME_LEAVE;
        track.hwndTrack = impl_->hwnd;
        if (TrackMouseEvent(&track) != FALSE) impl_->mouse_leave_tracked = true;
    }
#else
    static_cast<void>(screen_x);
    static_cast<void>(screen_y);
#endif
}

void TickerOverlay::clear_hover() {
#ifdef _WIN32
    if (impl_ == nullptr) return;
    impl_->hovered_id.clear();
    impl_->mouse_leave_tracked = false;
#endif
}

void TickerOverlay::note_click(int screen_x, int screen_y) {
#ifdef _WIN32
    impl_->clicked_id = hit_test(screen_x, screen_y);
    impl_->clicked_x = screen_x;
    impl_->clicked_y = screen_y;
#else
    static_cast<void>(screen_x);
    static_cast<void>(screen_y);
#endif
}

std::string TickerOverlay::take_click(int& screen_x, int& screen_y) {
#ifdef _WIN32
    auto id = impl_->clicked_id;
    screen_x = impl_->clicked_x;
    screen_y = impl_->clicked_y;
    impl_->clicked_id.clear();
    return id;
#else
    static_cast<void>(screen_x);
    static_cast<void>(screen_y);
    return {};
#endif
}

const std::string& TickerOverlay::last_error() const noexcept {
    return impl_->last_error;
}

}  // namespace notification_hub::scene
