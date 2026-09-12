#include "renderer.hpp"
#include "geometry.hpp"

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <d2d1_1.h>
#include <wincodec.h>
#include <d3d11.h>
#include <dwrite.h>
#include <dxgi1_2.h>
#include <windows.h>
#include <wincrypt.h>
#include <wrl/client.h>
#endif

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <vector>

namespace notification_hub::scene {

#ifdef _WIN32
namespace {

using Microsoft::WRL::ComPtr;

D2D1_COLOR_F color(float red, float green, float blue, float alpha = 1.0f) {
    return D2D1::ColorF(red, green, blue, alpha);
}

D2D1_COLOR_F hex_color(std::string_view value, float alpha) {
    if (value.size() != 7 || value.front() != '#') return color(0.08f, 0.10f, 0.12f, alpha);
    const std::string token(value.substr(1));
    char* end = nullptr;
    const auto rgb = std::strtoul(token.c_str(), &end, 16);
    if (end == nullptr || *end != '\0') return color(0.08f, 0.10f, 0.12f, alpha);
    return color(static_cast<float>((rgb >> 16) & 0xff) / 255.0f,
        static_cast<float>((rgb >> 8) & 0xff) / 255.0f,
        static_cast<float>(rgb & 0xff) / 255.0f, alpha);
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
    ComPtr<ID2D1SolidColorBrush> close_background_brush;
    ComPtr<ID2D1SolidColorBrush> close_icon_brush;
    ComPtr<ID2D1Bitmap1> cpu_readback_bitmap;
    ComPtr<IWICImagingFactory> wic_factory;
    ComPtr<ID2D1Bitmap> background_bitmap;
    std::wstring background_bitmap_path;
    bool com_initialized{};
    HWND hwnd{};
    int width{};
    int height{};
    std::vector<Pixel> pixels;
#endif
    bool ready{};
};

CardRenderer::CardRenderer() : impl_(std::make_unique<Impl>()) {}

CardRenderer::~CardRenderer() = default;

bool CardRenderer::initialize(void* native_window, int width, int height) {
#ifdef _WIN32
    reset();
    if (native_window == nullptr || width <= 0 || height <= 0) return false;

    const auto com_result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(com_result) && com_result != RPC_E_CHANGED_MODE) return false;
    impl_->com_initialized = SUCCEEDED(com_result);
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

    result = CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&impl_->wic_factory));
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
    result = impl_->d2d_context->CreateSolidColorBrush(
        color(0.18f, 0.22f, 0.24f, 0.92f), &impl_->close_background_brush);
    if (FAILED(result)) return false;
    result = impl_->d2d_context->CreateSolidColorBrush(
        color(0.82f, 0.88f, 0.88f, 1.0f), &impl_->close_icon_brush);
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
    impl_->cpu_readback_bitmap.Reset();
    impl_->background_bitmap.Reset();
    impl_->background_bitmap_path.clear();
    impl_->pixels.clear();
    return true;
#else
    static_cast<void>(width);
    static_cast<void>(height);
    return false;
#endif
}

bool CardRenderer::draw(std::wstring_view title, std::wstring_view body, const VisualStyle& visual, bool capture_output) {
#ifdef _WIN32
    static_cast<void>(capture_output);
    if (!impl_->ready || !capture_offscreen(title, body, visual)) return false;
    return update_layered_window();
#else
    static_cast<void>(title);
    static_cast<void>(body);
    static_cast<void>(visual);
    static_cast<void>(capture_output);
    return false;
#endif
}

bool CardRenderer::update_layered_window() {
#ifdef _WIN32
    // Upload the premultiplied D2D readback as the single visible layer for this HWND.
    if (!impl_->ready || impl_->hwnd == nullptr || impl_->pixels.empty()
        || impl_->width <= 0 || impl_->height <= 0) {
        return false;
    }

    const auto screen_dc = GetDC(nullptr);
    if (screen_dc == nullptr) return false;
    const auto memory_dc = CreateCompatibleDC(screen_dc);
    if (memory_dc == nullptr) {
        ReleaseDC(nullptr, screen_dc);
        return false;
    }

    BITMAPINFO bitmap_info{};
    bitmap_info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bitmap_info.bmiHeader.biWidth = impl_->width;
    bitmap_info.bmiHeader.biHeight = -impl_->height;
    bitmap_info.bmiHeader.biPlanes = 1;
    bitmap_info.bmiHeader.biBitCount = 32;
    bitmap_info.bmiHeader.biCompression = BI_RGB;
    void* bits = nullptr;
    const auto bitmap = CreateDIBSection(
        screen_dc,
        &bitmap_info,
        DIB_RGB_COLORS,
        &bits,
        nullptr,
        0);
    if (bitmap == nullptr || bits == nullptr) {
        if (bitmap != nullptr) DeleteObject(bitmap);
        DeleteDC(memory_dc);
        ReleaseDC(nullptr, screen_dc);
        return false;
    }

    const auto previous = SelectObject(memory_dc, bitmap);
    auto* destination = static_cast<std::uint8_t*>(bits);
    for (int y = 0; y < impl_->height; ++y) {
        for (int x = 0; x < impl_->width; ++x) {
            const auto source_index = (static_cast<std::size_t>(y) * static_cast<std::size_t>(impl_->width))
                + static_cast<std::size_t>(x);
            const auto destination_index = source_index * 4;
            const auto& pixel = impl_->pixels[source_index];
            destination[destination_index + 0] = pixel.blue;
            destination[destination_index + 1] = pixel.green;
            destination[destination_index + 2] = pixel.red;
            destination[destination_index + 3] = pixel.alpha;
        }
    }

    RECT bounds{};
    if (GetWindowRect(impl_->hwnd, &bounds) == FALSE) {
        if (previous != nullptr) SelectObject(memory_dc, previous);
        DeleteObject(bitmap);
        DeleteDC(memory_dc);
        ReleaseDC(nullptr, screen_dc);
        return false;
    }
    POINT destination_point{bounds.left, bounds.top};
    POINT source_point{0, 0};
    SIZE size{impl_->width, impl_->height};
    BLENDFUNCTION blend{};
    blend.BlendOp = AC_SRC_OVER;
    blend.SourceConstantAlpha = 255;
    blend.AlphaFormat = AC_SRC_ALPHA;
    const auto updated = UpdateLayeredWindow(
        impl_->hwnd,
        screen_dc,
        &destination_point,
        &size,
        memory_dc,
        &source_point,
        0,
        &blend,
        ULW_ALPHA);

    if (previous != nullptr) SelectObject(memory_dc, previous);
    DeleteObject(bitmap);
    DeleteDC(memory_dc);
    ReleaseDC(nullptr, screen_dc);
    return updated != FALSE;
#else
    return false;
#endif
}

bool CardRenderer::load_background_bitmap(const VisualStyle& visual) {
#ifdef _WIN32
    if (!visual.specified || visual.background_asset_path.empty() || visual.background_asset_sha256.empty() || impl_->wic_factory == nullptr || impl_->d2d_context == nullptr) { impl_->background_bitmap.Reset(); impl_->background_bitmap_path.clear(); return false; }
    const auto path = std::wstring(visual.background_asset_path.begin(), visual.background_asset_path.end());
    if (impl_->background_bitmap != nullptr && impl_->background_bitmap_path == path) return true;
    { HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (file == INVALID_HANDLE_VALUE) return false;
        HCRYPTPROV provider{}; HCRYPTHASH hash{}; bool valid = false;
        if (CryptAcquireContextW(&provider, nullptr, nullptr, PROV_RSA_AES, CRYPT_VERIFYCONTEXT) && CryptCreateHash(provider, CALG_SHA_256, 0, 0, &hash)) {
            std::array<std::uint8_t, 8192> buffer{}; DWORD read = 0; bool read_ok = true;
            while (ReadFile(file, buffer.data(), static_cast<DWORD>(buffer.size()), &read, nullptr) && read > 0) if (!CryptHashData(hash, buffer.data(), read, 0)) { read_ok = false; break; }
            DWORD size = 32; std::array<std::uint8_t, 32> digest{};
            if (read_ok && CryptGetHashParam(hash, HP_HASHVAL, digest.data(), &size, 0)) {
                static constexpr char hex[] = "0123456789abcdef"; std::string actual; actual.reserve(64);
                for (const auto byte : digest) { actual.push_back(hex[byte >> 4]); actual.push_back(hex[byte & 15]); }
                auto expected = visual.background_asset_sha256; std::transform(expected.begin(), expected.end(), expected.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
                valid = actual == expected;
            }
            CryptDestroyHash(hash);
        }
        if (provider) CryptReleaseContext(provider, 0);
        CloseHandle(file);
        if (!valid) return false;
    }
    ComPtr<IWICBitmapDecoder> decoder;
    const auto decoder_result = impl_->wic_factory->CreateDecoderFromFilename(path.c_str(), nullptr, GENERIC_READ, WICDecodeMetadataCacheOnLoad, &decoder);
    if (FAILED(decoder_result)) return false;
    ComPtr<IWICBitmapFrameDecode> frame;
    if (FAILED(decoder->GetFrame(0, &frame))) return false;
    ComPtr<IWICFormatConverter> converter;
    if (FAILED(impl_->wic_factory->CreateFormatConverter(&converter))) return false;
    if (FAILED(converter->Initialize(frame.Get(), GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone, nullptr, 0.0, WICBitmapPaletteTypeCustom))) return false;
    ComPtr<ID2D1Bitmap> bitmap;
    const auto bitmap_result = impl_->d2d_context->CreateBitmapFromWicBitmap(converter.Get(), nullptr, &bitmap);
    if (FAILED(bitmap_result)) return false;
    impl_->background_bitmap = bitmap; impl_->background_bitmap_path = path; return true;
#else
    static_cast<void>(visual); return false;
#endif
}

bool CardRenderer::capture_offscreen(std::wstring_view title, std::wstring_view body, const VisualStyle& visual) {
#ifdef _WIN32
    if (!impl_->ready || impl_->d2d_context == nullptr) return false;

    const auto target_properties = D2D1::BitmapProperties1(
        D2D1_BITMAP_OPTIONS_TARGET,
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED));
    ComPtr<ID2D1Bitmap1> target;
    auto result = impl_->d2d_context->CreateBitmap(
        D2D1::SizeU(static_cast<UINT32>(impl_->width), static_cast<UINT32>(impl_->height)),
        nullptr,
        0,
        &target_properties,
        &target);
    if (FAILED(result)) return false;

    impl_->d2d_context->SetTarget(target.Get());
    impl_->d2d_context->BeginDraw();
    impl_->d2d_context->SetTransform(D2D1::Matrix3x2F::Identity());
    impl_->d2d_context->Clear(color(0.0f, 0.0f, 0.0f, 0.0f));

    const auto width = static_cast<float>(impl_->width);
    const auto height = static_cast<float>(impl_->height);
    auto bounds = card_bounds(width, height);
    if (visual.specified) {
        bounds.radius = static_cast<float>(visual.border_radius);
        if (visual.card_type == "danmaku") bounds.radius = (std::min)(bounds.radius, 12.0f);
        if (visual.card_type == "popup") bounds.radius = (std::max)(bounds.radius, 22.0f);
    }
    auto* surface_brush = impl_->surface_brush.Get();
    auto* accent_brush = impl_->accent_brush.Get();
    ComPtr<ID2D1SolidColorBrush> visual_surface_brush;
    ComPtr<ID2D1SolidColorBrush> visual_accent_brush;
    if (visual.specified) {
        const auto surface = visual.enabled
            ? hex_color(visual.background_color, visual.opacity)
            /* : (visual.preset == "critical" ? color(0.16f, 0.08f, 0.10f, 0.97f)
                : visual.preset == "warning" ? color(0.15f, 0.12f, 0.06f, 0.97f)
                : visual.preset == "accent" ? color(0.06f, 0.13f, 0.12f, 0.97f)
                : visual.preset == "soft" ? color(0.08f, 0.12f, 0.12f, 0.97f)
                : color(0.08f, 0.10f, 0.12f, 0.96f)) */
            : color(0.08f, 0.10f, 0.12f, 0.82f);
        const auto accent = visual.enabled
            ? (visual.preset == "critical" ? color(0.96f, 0.36f, 0.40f, 1.0f)
                : visual.preset == "warning" ? color(0.95f, 0.72f, 0.24f, 1.0f)
                : visual.preset == "accent" ? color(0.30f, 0.85f, 0.70f, 1.0f)
                : visual.preset == "soft" ? color(0.42f, 0.76f, 0.72f, 1.0f)
                : color(0.48f, 0.62f, 0.60f, 1.0f))
            : color(0.30f, 0.42f, 0.40f, 1.0f);
        if (FAILED(impl_->d2d_context->CreateSolidColorBrush(surface, &visual_surface_brush))
            || FAILED(impl_->d2d_context->CreateSolidColorBrush(accent, &visual_accent_brush))) return false;
        surface_brush = visual_surface_brush.Get();
        accent_brush = visual_accent_brush.Get();
    }
    impl_->d2d_context->FillRoundedRectangle(
        D2D1::RoundedRect(
            D2D1::RectF(bounds.left, bounds.top, (std::max)(20.0f, bounds.right), (std::max)(20.0f, bounds.bottom)),
            bounds.radius,
            bounds.radius),
        surface_brush);
    if (load_background_bitmap(visual)) {
        const auto bmp_size = impl_->background_bitmap->GetSize();
        const float pad = visual.background_padding;
        const float area_left = bounds.left + pad;
        const float area_top = bounds.top + pad;
        const float area_right = (std::max)(20.0f, bounds.right) - pad;
        const float area_bottom = (std::max)(20.0f, bounds.bottom) - pad;
        if (area_right <= area_left || area_bottom <= area_top) { return false; }
        const float card_w = area_right - area_left;
        const float card_h = area_bottom - area_top;
        const float img_w = bmp_size.width;
        const float img_h = bmp_size.height;
        D2D1_RECT_F dest = D2D1::RectF(area_left, area_top, area_right, area_bottom);
        if (visual.background_fit == "contain" && img_w > 0 && img_h > 0) {
            const float scale = (std::min)(card_w / img_w, card_h / img_h);
            const float out_w = img_w * scale;
            const float out_h = img_h * scale;
            dest = D2D1::RectF(area_left + (card_w - out_w) * 0.5f, area_top + (card_h - out_h) * 0.5f, area_left + (card_w + out_w) * 0.5f, area_top + (card_h + out_h) * 0.5f);
        } else if (visual.background_fit == "cover" && img_w > 0 && img_h > 0) {
            const float scale = (std::max)(card_w / img_w, card_h / img_h);
            const float out_w = img_w * scale;
            const float out_h = img_h * scale;
            dest = D2D1::RectF(area_left + (card_w - out_w) * 0.5f, area_top + (card_h - out_h) * 0.5f, area_left + (card_w + out_w) * 0.5f, area_top + (card_h + out_h) * 0.5f);
        }
        impl_->d2d_context->DrawBitmap(impl_->background_bitmap.Get(), dest, visual.opacity, D2D1_INTERPOLATION_MODE_LINEAR, nullptr);
    }
    if (visual.card_type == "danmaku") {
        impl_->d2d_context->FillRectangle(
            D2D1::RectF(bounds.left, bounds.bottom - 5.0f, (std::max)(20.0f, bounds.right), bounds.bottom),
            accent_brush);
    } else {
        impl_->d2d_context->FillRectangle(
            D2D1::RectF(bounds.left, bounds.top, bounds.left + (visual.card_type == "popup" ? 7.0f : 4.0f), (std::max)(20.0f, bounds.bottom)),
            accent_brush);
    }

    const auto close_button = close_button_bounds(width, height);
    const auto close_center_x = (close_button.left + close_button.right) * 0.5f;
    const auto close_center_y = (close_button.top + close_button.bottom) * 0.5f;
    const auto close_radius = (close_button.right - close_button.left) * 0.5f;
    impl_->d2d_context->FillEllipse(
        D2D1::Ellipse(D2D1::Point2F(close_center_x, close_center_y), close_radius, close_radius),
        impl_->close_background_brush.Get());
    constexpr float icon_padding = 8.0f;
    impl_->d2d_context->DrawLine(
        D2D1::Point2F(close_button.left + icon_padding, close_button.top + icon_padding),
        D2D1::Point2F(close_button.right - icon_padding, close_button.bottom - icon_padding),
        impl_->close_icon_brush.Get(), 1.5f);
    impl_->d2d_context->DrawLine(
        D2D1::Point2F(close_button.right - icon_padding, close_button.top + icon_padding),
        D2D1::Point2F(close_button.left + icon_padding, close_button.bottom - icon_padding),
        impl_->close_icon_brush.Get(), 1.5f);

    const float text_left = visual.card_type == "popup" ? 36.0f : 30.0f;
    const float title_top = visual.card_type == "danmaku" ? 18.0f : 24.0f;
    const float body_top = visual.card_type == "danmaku" ? 46.0f : 62.0f;
    impl_->d2d_context->DrawText(
        title.data(), static_cast<UINT32>(title.size()), impl_->title_format.Get(),
        D2D1::RectF(text_left, title_top, (std::max)(36.0f, close_button.left - 8.0f), body_top - 4.0f),
        impl_->title_brush.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
    impl_->d2d_context->DrawText(
        body.data(), static_cast<UINT32>(body.size()), impl_->body_format.Get(),
        D2D1::RectF(text_left, body_top, (std::max)(36.0f, width - 24.0f), (std::max)(72.0f, height - (visual.card_type == "danmaku" ? 18.0f : 22.0f))),
        impl_->body_brush.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);

    result = impl_->d2d_context->EndDraw();
    impl_->d2d_context->SetTarget(nullptr);
    if (FAILED(result)) return false;

    if (impl_->cpu_readback_bitmap == nullptr) {
        const auto readback_properties = D2D1::BitmapProperties1(
            D2D1_BITMAP_OPTIONS_CPU_READ | D2D1_BITMAP_OPTIONS_CANNOT_DRAW,
            D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED));
        result = impl_->d2d_context->CreateBitmap(
            D2D1::SizeU(static_cast<UINT32>(impl_->width), static_cast<UINT32>(impl_->height)),
            nullptr,
            0,
            &readback_properties,
            &impl_->cpu_readback_bitmap);
        if (FAILED(result)) return false;
    }
    result = impl_->cpu_readback_bitmap->CopyFromBitmap(nullptr, target.Get(), nullptr);
    if (FAILED(result)) return false;

    D2D1_MAPPED_RECT mapped{};
    result = impl_->cpu_readback_bitmap->Map(D2D1_MAP_OPTIONS_READ, &mapped);
    if (FAILED(result)) return false;
    impl_->pixels.resize(static_cast<std::size_t>(impl_->width) * static_cast<std::size_t>(impl_->height));
    for (int y = 0; y < impl_->height; ++y) {
        const auto* row = mapped.bits + (static_cast<std::size_t>(y) * mapped.pitch);
        for (int x = 0; x < impl_->width; ++x) {
            const auto* bgra = row + (x * 4);
            auto& pixel = impl_->pixels[(static_cast<std::size_t>(y) * static_cast<std::size_t>(impl_->width)) + static_cast<std::size_t>(x)];
            pixel = Pixel{bgra[2], bgra[1], bgra[0], bgra[3]};
        }
    }
    impl_->cpu_readback_bitmap->Unmap();
    return true;
#else
    static_cast<void>(title);
    static_cast<void>(body);
    return false;
#endif
}

bool CardRenderer::capture_pixels() const noexcept {
#ifdef _WIN32
    return impl_ != nullptr && !impl_->pixels.empty();
#else
    return false;
#endif
}

bool CardRenderer::sample_pixel(int x, int y, Pixel& pixel) const noexcept {
#ifdef _WIN32
    if (impl_ == nullptr || x < 0 || y < 0 || x >= impl_->width || y >= impl_->height) return false;
    const auto index = (static_cast<std::size_t>(y) * static_cast<std::size_t>(impl_->width)) + static_cast<std::size_t>(x);
    if (index >= impl_->pixels.size()) return false;
    pixel = impl_->pixels[index];
    return true;
#else
    static_cast<void>(x);
    static_cast<void>(y);
    static_cast<void>(pixel);
    return false;
#endif
}

void CardRenderer::reset() noexcept {
    if (impl_ == nullptr) return;
#ifdef _WIN32
    impl_->surface_brush.Reset();
    impl_->accent_brush.Reset();
    impl_->title_brush.Reset();
    impl_->body_brush.Reset();
    impl_->close_background_brush.Reset();
    impl_->close_icon_brush.Reset();
    impl_->title_format.Reset();
    impl_->body_format.Reset();
    impl_->d2d_context.Reset();
    impl_->d2d_device.Reset();
    impl_->d2d_factory.Reset();
    impl_->write_factory.Reset();
    impl_->dxgi_device.Reset();
    impl_->d3d_context.Reset();
    impl_->cpu_readback_bitmap.Reset();
    impl_->background_bitmap.Reset();
    impl_->background_bitmap_path.clear();
    impl_->wic_factory.Reset();
    if (impl_->com_initialized) { CoUninitialize(); impl_->com_initialized = false; }
    impl_->d3d_device.Reset();
    impl_->pixels.clear();
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
