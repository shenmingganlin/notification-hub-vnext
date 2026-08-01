#include "renderer.hpp"
#include "geometry.hpp"

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <d2d1_1.h>
#include <d3d11.h>
#include <dcomp.h>
#include <dwrite.h>
#include <dxgi1_2.h>
#include <windows.h>
#include <wrl/client.h>
#endif

#include <algorithm>
#include <utility>

namespace notification_hub::scene {

#ifdef _WIN32
namespace {

using Microsoft::WRL::ComPtr;

D2D1_COLOR_F color(float red, float green, float blue, float alpha = 1.0f) {
    return D2D1::ColorF(red, green, blue, alpha);
}

HRESULT create_d3d_device(ComPtr<ID3D11Device>& device, ComPtr<ID3D11DeviceContext>& context) {
    constexpr D3D_FEATURE_LEVEL levels[] = {
        D3D_FEATURE_LEVEL_11_1,
        D3D_FEATURE_LEVEL_11_0,
        D3D_FEATURE_LEVEL_10_1,
        D3D_FEATURE_LEVEL_10_0
    };
    constexpr UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
    D3D_FEATURE_LEVEL selected{};

    auto result = D3D11CreateDevice(
        nullptr,
        D3D_DRIVER_TYPE_HARDWARE,
        nullptr,
        flags,
        levels,
        static_cast<UINT>(std::size(levels)),
        D3D11_SDK_VERSION,
        &device,
        &selected,
        &context);
    if (SUCCEEDED(result)) return result;

    return D3D11CreateDevice(
        nullptr,
        D3D_DRIVER_TYPE_WARP,
        nullptr,
        flags,
        levels,
        static_cast<UINT>(std::size(levels)),
        D3D11_SDK_VERSION,
        &device,
        &selected,
        &context);
}

}  // namespace
#endif

struct CardRenderer::Impl {
#ifdef _WIN32
    ComPtr<ID3D11Device> d3d_device;
    ComPtr<ID3D11DeviceContext> d3d_context;
    ComPtr<IDXGIDevice> dxgi_device;
    ComPtr<ID2D1Factory1> d2d_factory;
    ComPtr<ID2D1Device> d2d_device;
    ComPtr<ID2D1DeviceContext> d2d_context;
    ComPtr<IDWriteFactory> write_factory;
    ComPtr<IDWriteTextFormat> title_format;
    ComPtr<IDWriteTextFormat> body_format;
    ComPtr<ID2D1SolidColorBrush> surface_brush;
    ComPtr<ID2D1SolidColorBrush> accent_brush;
    ComPtr<ID2D1SolidColorBrush> title_brush;
    ComPtr<ID2D1SolidColorBrush> body_brush;
    ComPtr<IDCompositionDevice> composition_device;
    ComPtr<IDCompositionTarget> composition_target;
    ComPtr<IDCompositionVisual> composition_visual;
    ComPtr<IDCompositionSurface> composition_surface;
    HWND hwnd{};
    int width{};
    int height{};
#endif
    bool ready{};
};

CardRenderer::CardRenderer() : impl_(std::make_unique<Impl>()) {}

CardRenderer::~CardRenderer() = default;

#ifdef _WIN32
bool CardRenderer::create_composition_surface(int width, int height) {
    if (impl_ == nullptr || !impl_->composition_device || !impl_->composition_visual || width <= 0 || height <= 0) {
        return false;
    }
    ComPtr<IDCompositionSurface> surface;
    const auto result = impl_->composition_device->CreateSurface(
        static_cast<UINT>(width),
        static_cast<UINT>(height),
        DXGI_FORMAT_B8G8R8A8_UNORM,
        DXGI_ALPHA_MODE_PREMULTIPLIED,
        &surface);
    if (FAILED(result)) return false;
    if (FAILED(impl_->composition_visual->SetContent(surface.Get()))) return false;
    if (FAILED(impl_->composition_device->Commit())) return false;
    impl_->composition_surface = std::move(surface);
    impl_->width = width;
    impl_->height = height;
    return true;
}
#endif

bool CardRenderer::initialize(void* native_window, int width, int height) {
#ifdef _WIN32
    reset();
    if (native_window == nullptr || width <= 0 || height <= 0) return false;

    impl_->hwnd = static_cast<HWND>(native_window);
    impl_->width = width;
    impl_->height = height;

    auto result = create_d3d_device(impl_->d3d_device, impl_->d3d_context);
    if (FAILED(result)) return false;
    result = impl_->d3d_device.As(&impl_->dxgi_device);
    if (FAILED(result)) return false;

    result = D2D1CreateFactory(
        D2D1_FACTORY_TYPE_SINGLE_THREADED,
        IID_PPV_ARGS(&impl_->d2d_factory));
    if (FAILED(result)) return false;
    result = impl_->d2d_factory->CreateDevice(impl_->dxgi_device.Get(), &impl_->d2d_device);
    if (FAILED(result)) return false;
    result = impl_->d2d_device->CreateDeviceContext(
        D2D1_DEVICE_CONTEXT_OPTIONS_NONE,
        &impl_->d2d_context);
    if (FAILED(result)) return false;

    result = DWriteCreateFactory(
        DWRITE_FACTORY_TYPE_SHARED,
        __uuidof(IDWriteFactory),
        reinterpret_cast<IUnknown**>(impl_->write_factory.GetAddressOf()));
    if (FAILED(result)) return false;

    result = DCompositionCreateDevice2(
        impl_->dxgi_device.Get(),
        IID_PPV_ARGS(&impl_->composition_device));
    if (FAILED(result)) return false;
    result = impl_->composition_device->CreateTargetForHwnd(
        impl_->hwnd,
        TRUE,
        &impl_->composition_target);
    if (FAILED(result)) return false;
    result = impl_->composition_device->CreateVisual(&impl_->composition_visual);
    if (FAILED(result)) return false;
    result = impl_->composition_target->SetRoot(impl_->composition_visual.Get());
    if (FAILED(result)) return false;
    if (!create_composition_surface(width, height)) return false;

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

    result = impl_->d2d_context->CreateSolidColorBrush(
        color(0.08f, 0.10f, 0.12f, 0.96f), &impl_->surface_brush);
    if (FAILED(result)) return false;
    result = impl_->d2d_context->CreateSolidColorBrush(
        color(0.30f, 0.85f, 0.70f, 1.0f), &impl_->accent_brush);
    if (FAILED(result)) return false;
    result = impl_->d2d_context->CreateSolidColorBrush(
        color(0.96f, 0.98f, 0.98f, 1.0f), &impl_->title_brush);
    if (FAILED(result)) return false;
    result = impl_->d2d_context->CreateSolidColorBrush(
        color(0.70f, 0.76f, 0.78f, 1.0f), &impl_->body_brush);
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
    return create_composition_surface(width, height);
#else
    static_cast<void>(width);
    static_cast<void>(height);
    return false;
#endif
}

bool CardRenderer::draw(std::wstring_view title, std::wstring_view body) {
#ifdef _WIN32
    if (!impl_->ready || impl_->composition_surface == nullptr) return false;

    POINT offset{};
    ComPtr<IDXGISurface> dxgi_surface;
    auto result = impl_->composition_surface->BeginDraw(
        nullptr,
        IID_PPV_ARGS(&dxgi_surface),
        &offset);
    if (FAILED(result)) return false;

    ComPtr<ID2D1Bitmap1> bitmap;
    const auto bitmap_properties = D2D1::BitmapProperties1(
        D2D1_BITMAP_OPTIONS_TARGET | D2D1_BITMAP_OPTIONS_CANNOT_DRAW,
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED));
    result = impl_->d2d_context->CreateBitmapFromDxgiSurface(
        dxgi_surface.Get(),
        &bitmap_properties,
        &bitmap);
    if (FAILED(result)) {
        impl_->composition_surface->EndDraw();
        return false;
    }

    impl_->d2d_context->SetTarget(bitmap.Get());
    impl_->d2d_context->BeginDraw();
    impl_->d2d_context->SetTransform(D2D1::Matrix3x2F::Translation(
        -static_cast<float>(offset.x),
        -static_cast<float>(offset.y)));
    impl_->d2d_context->Clear(color(0.0f, 0.0f, 0.0f, 0.0f));

    const auto width = static_cast<float>(impl_->width);
    const auto height = static_cast<float>(impl_->height);
    const auto bounds = card_bounds(width, height);
    const auto card = D2D1::RoundedRect(
        D2D1::RectF(bounds.left, bounds.top, (std::max)(20.0f, bounds.right), (std::max)(20.0f, bounds.bottom)),
        bounds.radius,
        bounds.radius);
    impl_->d2d_context->FillRoundedRectangle(card, impl_->surface_brush.Get());

    const auto accent = D2D1::RectF(bounds.left, bounds.top, bounds.left + 4.0f, (std::max)(20.0f, bounds.bottom));
    impl_->d2d_context->FillRectangle(accent, impl_->accent_brush.Get());

    const auto title_rect = D2D1::RectF(30.0f, 24.0f, (std::max)(36.0f, width - 24.0f), 56.0f);
    impl_->d2d_context->DrawText(
        title.data(), static_cast<UINT32>(title.size()), impl_->title_format.Get(), title_rect,
        impl_->title_brush.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);

    const auto body_rect = D2D1::RectF(30.0f, 62.0f, (std::max)(36.0f, width - 24.0f), (std::max)(72.0f, height - 22.0f));
    impl_->d2d_context->DrawText(
        body.data(), static_cast<UINT32>(body.size()), impl_->body_format.Get(), body_rect,
        impl_->body_brush.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);

    result = impl_->d2d_context->EndDraw();
    impl_->d2d_context->SetTarget(nullptr);
    const auto surface_result = impl_->composition_surface->EndDraw();
    if (FAILED(result) || FAILED(surface_result)) {
        if (result == D2DERR_RECREATE_TARGET) reset();
        return false;
    }

    result = impl_->composition_device->Commit();
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
    if (impl_->composition_visual != nullptr) {
        impl_->composition_visual->SetContent(nullptr);
    }
    if (impl_->composition_target != nullptr) {
        impl_->composition_target->SetRoot(nullptr);
    }
    if (impl_->composition_device != nullptr) {
        impl_->composition_device->Commit();
    }
    impl_->composition_surface.Reset();
    impl_->composition_visual.Reset();
    impl_->composition_target.Reset();
    impl_->composition_device.Reset();
    impl_->surface_brush.Reset();
    impl_->accent_brush.Reset();
    impl_->title_brush.Reset();
    impl_->body_brush.Reset();
    impl_->title_format.Reset();
    impl_->body_format.Reset();
    impl_->d2d_context.Reset();
    impl_->d2d_device.Reset();
    impl_->d2d_factory.Reset();
    impl_->write_factory.Reset();
    impl_->dxgi_device.Reset();
    impl_->d3d_context.Reset();
    impl_->d3d_device.Reset();
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
