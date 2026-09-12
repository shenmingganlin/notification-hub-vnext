#include "window.hpp"

#ifdef _WIN32
#include <windows.h>
#include <windowsx.h>
#endif

#include <chrono>
#include <thread>

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
            if (window->begin_close_button_press(client_x, client_y)
                || window->begin_drag_client_point(client_x, client_y)) {
                SetCapture(hwnd);
            }
        }
        return 0;
    case WM_MOUSEMOVE:
        if (window != nullptr && window->is_dragging()) {
            POINT point{GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
            ClientToScreen(hwnd, &point);
            window->update_drag_screen_point(point.x, point.y);
        }
        return 0;
    case WM_LBUTTONUP:
        if (window != nullptr) {
            const auto client_x = static_cast<float>(GET_X_LPARAM(lparam));
            const auto client_y = static_cast<float>(GET_Y_LPARAM(lparam));
            if (window->is_dragging()) {
                window->end_drag();
            } else if (window->release_close_button_press(client_x, client_y)) {
                // A close is committed only after the same card receives the
                // matching release. The down event never reflows the scene.
                window->request_close("user-close");
            } else {
                window->cancel_pointer_press();
            }
        }
        return 0;
    case WM_CAPTURECHANGED:
        if (window != nullptr) {
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
            window->resize_render_target(LOWORD(lparam), HIWORD(lparam));
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
    if (hwnd_ != nullptr) return true;

    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    const auto instance = GetModuleHandleW(nullptr);
    WNDCLASSEXW window_class{};
    window_class.cbSize = sizeof(window_class);
    window_class.hInstance = instance;
    window_class.lpfnWndProc = window_proc;
    window_class.lpszClassName = class_name_.c_str();
    window_class.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(IDC_ARROW));
    window_class.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));

    if (!GetClassInfoExW(instance, class_name_.c_str(), &window_class)) {
        if (RegisterClassExW(&window_class) == 0) return false;
        class_registered_ = true;
    }

    DWORD style = WS_POPUP;
    DWORD extended_style = WS_EX_NOACTIVATE | WS_EX_LAYERED | WS_EX_TOPMOST;
    if (config_.tool_window) extended_style |= WS_EX_TOOLWINDOW;

    RECT bounds{0, 0, config_.width, config_.height};
    AdjustWindowRectEx(&bounds, style, FALSE, extended_style);
    const auto initial_x = config_.has_initial_position ? config_.x : CW_USEDEFAULT;
    const auto initial_y = config_.has_initial_position ? config_.y : CW_USEDEFAULT;
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
    if (hwnd == nullptr) return false;

    hwnd_ = hwnd;
    dpi_ = GetDpiForWindow(hwnd);
    if (!renderer_.initialize(hwnd_, config_.width, config_.height)) {
        DestroyWindow(hwnd);
        hwnd_ = nullptr;
        visible_ = false;
        return false;
    }
    if (config_.visual.dismiss_mode == "timeout") SetTimer(static_cast<HWND>(hwnd_), kDismissTimerId, static_cast<UINT>(config_.visual.dismiss_timeout_ms), nullptr);
    return true;
#else
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
    const auto resized = resize_render_target(width, height);
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

bool SceneWindow::begin_close_button_press(float x, float y) noexcept {
#ifdef _WIN32
    if (hwnd_ == nullptr || close_requested_) return false;
    const bool anywhere = config_.visual.dismiss_mode == "anywhere";
    if (!anywhere && !point_inside_close_button(x, y, static_cast<float>(config_.width), static_cast<float>(config_.height))) return false;
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
    const bool released_inside = config_.visual.dismiss_mode == "anywhere"
        ? point_inside_card(x, y, static_cast<float>(config_.width), static_cast<float>(config_.height))
        : point_inside_close_button(x, y, static_cast<float>(config_.width), static_cast<float>(config_.height));
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
    if (hwnd_ == nullptr || close_requested_ || !point_inside_card(x, y, static_cast<float>(config_.width), static_cast<float>(config_.height))
        || point_inside_close_button(x, y, static_cast<float>(config_.width), static_cast<float>(config_.height))) {
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
    return SetWindowPos(
        static_cast<HWND>(hwnd_),
        nullptr,
        next_x,
        next_y,
        0,
        0,
        SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE) != FALSE;
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
    if (hwnd_ != nullptr && GetCapture() == static_cast<HWND>(hwnd_)) ReleaseCapture();
#else
    drag_active_ = false;
#endif
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

bool SceneWindow::capture_pixels() const noexcept {
    return renderer_.capture_pixels();
}

bool SceneWindow::sample_pixel(int x, int y, Pixel& pixel) const noexcept {
    return renderer_.sample_pixel(x, y, pixel);
}

bool SceneWindow::hit_test_client_point(float x, float y) const noexcept {
    return point_inside_card(x, y, static_cast<float>(config_.width), static_cast<float>(config_.height));
}

bool SceneWindow::click_client_point(float x, float y) noexcept {
    if (!point_inside_close_button(x, y, static_cast<float>(config_.width), static_cast<float>(config_.height))) {
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
        if (config_.visual.dismiss_mode == "timeout") SetTimer(static_cast<HWND>(hwnd_), kDismissTimerId, static_cast<UINT>(config_.visual.dismiss_timeout_ms), nullptr);
        InvalidateRect(static_cast<HWND>(hwnd_), nullptr, FALSE);
    }
#endif
}

bool SceneWindow::paint(bool capture_output) {
#ifdef _WIN32
    if (hwnd_ == nullptr || !renderer_.is_ready()) return false;
    const bool rendered = renderer_.draw(config_.title, config_.body, config_.visual, capture_output);
    frame_rendered_ = frame_rendered_ || rendered;
    return rendered;
#else
    return false;
#endif
}

bool SceneWindow::resize_render_target(int width, int height) {
    const bool resized = renderer_.resize(width, height);
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

}  // namespace notification_hub::scene
