#include "renderer.hpp"

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <d2d1.h>
#include <dwrite.h>
#include <windows.h>
#include <wrl/client.h>
#endif

#include <algorithm>
#include <string>
#include <utility>

namespace notification_hub::scene {

#ifdef _WIN32
namespace {

using Microsoft::WRL::ComPtr;

D2D1_COLOR_F color(float red, float green, float blue, float alpha = 1.0f) {
    return D2D1::ColorF(red, green, blue, alpha);
}

}  // namespace
#endif

struct CardRenderer::Impl {
#ifdef _WIN32
    ComPtr<ID2D1Factory> d2d_factory;
    ComPtr<ID2D1HwndRenderTarget> render_target;
    ComPtr<IDWriteFactory> write_factory;
    ComPtr<IDWriteTextFormat> title_format;
    ComPtr<IDWriteTextFormat> body_format;
    ComPtr<ID2D1SolidColorBrush> surface_brush;
    ComPtr<ID2D1SolidColorBrush> accent_brush;
    ComPtr<ID2D1SolidColorBrush> title_brush;
    ComPtr<ID2D1SolidColorBrush> body_brush;
    HWND hwnd{};
    int width{};
    int height{};
#endif
    bool ready{};
};

CardRenderer::CardRenderer() : impl_(std::make_unique<Impl>()) {}

CardRenderer::~CardRenderer() = default;

bool CardRenderer::initialize(void* native_window, int width, int height) {
#ifdef _WIN32
    reset();
    if (native_window == nullptr || width <= 0 || height <= 0) return false;

    impl_->hwnd = static_cast<HWND>(native_window);
    impl_->width = width;
    impl_->height = height;

    HRESULT result = D2D1CreateFactory(
        D2D1_FACTORY_TYPE_SINGLE_THREADED,
        IID_PPV_ARGS(&impl_->d2d_factory));
    if (FAILED(result)) return false;

    result = DWriteCreateFactory(
        DWRITE_FACTORY_TYPE_SHARED,
        __uuidof(IDWriteFactory),
        reinterpret_cast<IUnknown**>(impl_->write_factory.GetAddressOf()));
    if (FAILED(result)) return false;

    const auto render_target_properties = D2D1::RenderTargetProperties(
        D2D1_RENDER_TARGET_TYPE_DEFAULT,
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_IGNORE),
        0.0f,
        0.0f,
        D2D1_RENDER_TARGET_USAGE_NONE,
        D2D1_FEATURE_LEVEL_DEFAULT);
    const auto hwnd_properties = D2D1::HwndRenderTargetProperties(
        impl_->hwnd,
        D2D1::SizeU(static_cast<UINT32>(width), static_cast<UINT32>(height)),
        D2D1_PRESENT_OPTIONS_NONE);
    result = impl_->d2d_factory->CreateHwndRenderTarget(
        render_target_properties,
        hwnd_properties,
        &impl_->render_target);
    if (FAILED(result)) return false;

    result = impl_->write_factory->CreateTextFormat(
        L"Segoe UI", nullptr, DWRITE_FONT_WEIGHT_SEMI_BOLD, DWRITE_FONT_STYLE_NORMAL,
        DWRITE_FONT_STRETCH_NORMAL, 20.0f, L"en-us", &impl_->title_format);
    if (FAILED(result)) return false;
    result = impl_->write_factory->CreateTextFormat(
        L"Segoe UI", nullptr, DWRITE_FONT_WEIGHT_NORMAL, DWRITE_FONT_STYLE_NORMAL,
        DWRITE_FONT_STRETCH_NORMAL, 13.0f, L"en-us", &impl_->body_format);
    if (FAILED(result)) return false;

    impl_->title_format->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
    impl_->body_format->SetWordWrapping(DWRITE_WORD_WRAPPING_WRAP);

    result = impl_->render_target->CreateSolidColorBrush(color(0.08f, 0.10f, 0.12f, 1.0f), &impl_->surface_brush);
    if (FAILED(result)) return false;
    result = impl_->render_target->CreateSolidColorBrush(color(0.30f, 0.85f, 0.70f, 1.0f), &impl_->accent_brush);
    if (FAILED(result)) return false;
    result = impl_->render_target->CreateSolidColorBrush(color(0.96f, 0.98f, 0.98f, 1.0f), &impl_->title_brush);
    if (FAILED(result)) return false;
    result = impl_->render_target->CreateSolidColorBrush(color(0.70f, 0.76f, 0.78f, 1.0f), &impl_->body_brush);
    if (FAILED(result)) return false;

    impl_->ready = true;
    return true;
#else
    static_cast<void>(native_window);
    static_cast<void>(width);
    static_cast<void>(height);
    return false;
#endif
}

bool CardRenderer::resize(int width, int height) {
#ifdef _WIN32
    if (!impl_->ready || width <= 0 || height <= 0) return false;
    impl_->width = width;
    impl_->height = height;
    return SUCCEEDED(impl_->render_target->Resize(
        D2D1::SizeU(static_cast<UINT32>(width), static_cast<UINT32>(height))));
#else
    static_cast<void>(width);
    static_cast<void>(height);
    return false;
#endif
}

bool CardRenderer::draw(std::wstring_view title, std::wstring_view body) {
#ifdef _WIN32
    if (!impl_->ready) return false;

    impl_->render_target->BeginDraw();
    impl_->render_target->SetTransform(D2D1::Matrix3x2F::Identity());
    impl_->render_target->Clear(color(0.025f, 0.035f, 0.04f, 1.0f));

    const auto width = static_cast<float>(impl_->width);
    const auto height = static_cast<float>(impl_->height);
    const auto card = D2D1::RoundedRect(
        D2D1::RectF(10.0f, 10.0f, (std::max)(20.0f, width - 10.0f), (std::max)(20.0f, height - 10.0f)),
        14.0f,
        14.0f);
    impl_->render_target->FillRoundedRectangle(card, impl_->surface_brush.Get());

    const auto accent = D2D1::RectF(10.0f, 10.0f, 14.0f, (std::max)(20.0f, height - 10.0f));
    impl_->render_target->FillRectangle(accent, impl_->accent_brush.Get());

    const auto title_rect = D2D1::RectF(30.0f, 24.0f, (std::max)(36.0f, width - 24.0f), 56.0f);
    impl_->render_target->DrawText(
        title.data(), static_cast<UINT32>(title.size()), impl_->title_format.Get(), title_rect,
        impl_->title_brush.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);

    const auto body_rect = D2D1::RectF(30.0f, 62.0f, (std::max)(36.0f, width - 24.0f), (std::max)(72.0f, height - 22.0f));
    impl_->render_target->DrawText(
        body.data(), static_cast<UINT32>(body.size()), impl_->body_format.Get(), body_rect,
        impl_->body_brush.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);

    const auto result = impl_->render_target->EndDraw();
    if (result == D2DERR_RECREATE_TARGET) {
        reset();
        return false;
    }
    return SUCCEEDED(result);
#else
    static_cast<void>(title);
    static_cast<void>(body);
    return false;
#endif
}

void CardRenderer::reset() noexcept {
    if (impl_ == nullptr) return;
#ifdef _WIN32
    impl_->render_target.Reset();
    impl_->surface_brush.Reset();
    impl_->accent_brush.Reset();
    impl_->title_brush.Reset();
    impl_->body_brush.Reset();
    impl_->title_format.Reset();
    impl_->body_format.Reset();
    impl_->write_factory.Reset();
    impl_->d2d_factory.Reset();
    impl_->hwnd = nullptr;
    impl_->width = 0;
    impl_->height = 0;
#endif
    impl_->ready = false;
}

bool CardRenderer::is_ready() const noexcept {
    return impl_ != nullptr && impl_->ready;
}

}  // namespace notification_hub::scene
