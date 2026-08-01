#include "window.hpp"

#ifdef _WIN32
#include <windows.h>
#endif

#include <chrono>
#include <thread>

namespace notification_hub::scene {

#ifdef _WIN32
namespace {

constexpr wchar_t kWindowProperty[] = L"NotificationHubVNextSceneWindowInstance";

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
    case WM_ERASEBKGND:
        return 1;
    case WM_CLOSE:
        DestroyWindow(hwnd);
        return 0;
    case WM_NCDESTROY:
        RemovePropW(hwnd, kWindowProperty);
        if (window != nullptr) window->mark_native_destroyed();
        return DefWindowProcW(hwnd, message, wparam, lparam);
    case WM_DESTROY:
        PostQuitMessage(0);
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
    DWORD extended_style = WS_EX_NOACTIVATE | WS_EX_NOREDIRECTIONBITMAP;
    if (config_.tool_window) extended_style |= WS_EX_TOOLWINDOW;

    RECT bounds{0, 0, config_.width, config_.height};
    AdjustWindowRectEx(&bounds, style, FALSE, extended_style);
    const auto hwnd = CreateWindowExW(
        extended_style,
        class_name_.c_str(),
        config_.title.c_str(),
        style,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        bounds.right - bounds.left,
        bounds.bottom - bounds.top,
        nullptr,
        nullptr,
        instance,
        this);
    if (hwnd == nullptr) return false;

    hwnd_ = hwnd;
    renderer_.initialize(hwnd_, config_.width, config_.height);
    return true;
#else
    return false;
#endif
}

bool SceneWindow::show() {
#ifdef _WIN32
    if (hwnd_ == nullptr) return false;
    ShowWindow(static_cast<HWND>(hwnd_), SW_SHOWNOACTIVATE);
    UpdateWindow(static_cast<HWND>(hwnd_));
    visible_ = IsWindowVisible(static_cast<HWND>(hwnd_)) != FALSE;
    return visible_;
#else
    return false;
#endif
}

void SceneWindow::request_close() {
#ifdef _WIN32
    if (hwnd_ != nullptr) PostMessageW(static_cast<HWND>(hwnd_), WM_CLOSE, 0, 0);
#endif
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
    request_close();
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

void* SceneWindow::native_handle() const noexcept {
    return hwnd_;
}

bool SceneWindow::paint() {
#ifdef _WIN32
    if (hwnd_ == nullptr || !renderer_.is_ready()) return false;
    const bool rendered = renderer_.draw(config_.title, config_.body);
    frame_rendered_ = frame_rendered_ || rendered;
    return rendered;
#else
    return false;
#endif
}

bool SceneWindow::resize_render_target(int width, int height) {
    return renderer_.resize(width, height);
}

void SceneWindow::mark_first_paint() noexcept {
    first_paint_seen_ = true;
}

void SceneWindow::mark_native_destroyed() noexcept {
    hwnd_ = nullptr;
    visible_ = false;
    renderer_.reset();
}

}  // namespace notification_hub::scene
