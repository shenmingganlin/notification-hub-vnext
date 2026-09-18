#include "renderer.hpp"
#include "geometry.hpp"

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <d2d1.h>
#include <wincodec.h>
#include <dwrite.h>
#include <dwrite_3.h>
#include <windows.h>
#include <wrl/client.h>
#endif

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <condition_variable>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <vector>

namespace notification_hub::scene {

#ifdef _WIN32
namespace {

using Microsoft::WRL::ComPtr;

constexpr UINT kNhWallpaperReady = WM_APP + 0x4E49;
constexpr UINT kMaxWallpaperEdge = 2048;

struct WallpaperCpu {
    UINT width{};
    UINT height{};
    std::vector<std::uint8_t> bgra;
};

struct WallpaperSlot {
    enum class State { Empty, Loading, Ready, Failed };
    State state{State::Empty};
    WallpaperCpu cpu;
    std::vector<HWND> waiters;
};

std::mutex g_wallpaper_mutex;
std::condition_variable g_wallpaper_cv;
std::unordered_map<std::string, std::shared_ptr<WallpaperSlot>> g_wallpapers;

std::string wallpaper_cache_key(const std::string& sha256) {
    auto key = sha256;
    std::transform(key.begin(), key.end(), key.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return key;
}

bool decode_wallpaper_cpu(const std::wstring& path, WallpaperCpu& out) {
    ComPtr<IWICImagingFactory> factory;
    if (FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory)))) {
        return false;
    }
    ComPtr<IWICBitmapDecoder> decoder;
    if (FAILED(factory->CreateDecoderFromFilename(path.c_str(), nullptr, GENERIC_READ, WICDecodeMetadataCacheOnLoad, &decoder))) {
        return false;
    }
    ComPtr<IWICBitmapFrameDecode> frame;
    if (FAILED(decoder->GetFrame(0, &frame))) return false;
    ComPtr<IWICFormatConverter> converter;
    if (FAILED(factory->CreateFormatConverter(&converter))) return false;
    if (FAILED(converter->Initialize(frame.Get(), GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone, nullptr, 0.0, WICBitmapPaletteTypeCustom))) {
        return false;
    }
    UINT width = 0;
    UINT height = 0;
    if (FAILED(converter->GetSize(&width, &height)) || width == 0 || height == 0) return false;
    ComPtr<IWICBitmapSource> source = converter;
    if ((std::max)(width, height) > kMaxWallpaperEdge) {
        UINT scaled_w = width;
        UINT scaled_h = height;
        if (width >= height) {
            scaled_w = kMaxWallpaperEdge;
            scaled_h = (std::max)(1u, height * kMaxWallpaperEdge / width);
        } else {
            scaled_h = kMaxWallpaperEdge;
            scaled_w = (std::max)(1u, width * kMaxWallpaperEdge / height);
        }
        ComPtr<IWICBitmapScaler> scaler;
        if (FAILED(factory->CreateBitmapScaler(&scaler))) return false;
        if (FAILED(scaler->Initialize(converter.Get(), scaled_w, scaled_h, WICBitmapInterpolationModeFant))) return false;
        source = scaler;
        width = scaled_w;
        height = scaled_h;
    }
    out.width = width;
    out.height = height;
    out.bgra.assign(static_cast<std::size_t>(width) * static_cast<std::size_t>(height) * 4, 0);
    const auto stride = width * 4;
    return SUCCEEDED(source->CopyPixels(nullptr, stride, static_cast<UINT>(out.bgra.size()), out.bgra.data()));
}

void finish_wallpaper_slot(const std::shared_ptr<WallpaperSlot>& slot, const std::wstring& path) {
    WallpaperCpu cpu;
    const auto com = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    const bool uninit = com == S_OK;
    const bool ok = decode_wallpaper_cpu(path, cpu);
    std::vector<HWND> waiters;
    {
        std::lock_guard lock(g_wallpaper_mutex);
        if (ok) {
            slot->cpu = std::move(cpu);
            slot->state = WallpaperSlot::State::Ready;
        } else {
            slot->state = WallpaperSlot::State::Failed;
        }
        waiters.swap(slot->waiters);
    }
    g_wallpaper_cv.notify_all();
    for (const auto hwnd : waiters) {
        if (hwnd != nullptr && IsWindow(hwnd) != FALSE) {
            PostMessageW(hwnd, kNhWallpaperReady, 0, 0);
        }
    }
    if (uninit) CoUninitialize();
}

const WallpaperCpu* request_wallpaper(const std::wstring& path, const std::string& sha256, HWND hwnd, bool wait) {
    const auto key = wallpaper_cache_key(sha256);
    if (key.empty() || path.empty()) return nullptr;
    std::shared_ptr<WallpaperSlot> slot;
    {
        std::unique_lock lock(g_wallpaper_mutex);
        auto& entry = g_wallpapers[key];
        if (entry == nullptr) entry = std::make_shared<WallpaperSlot>();
        slot = entry;
        if (slot->state == WallpaperSlot::State::Ready) return &slot->cpu;
        if (slot->state == WallpaperSlot::State::Failed) return nullptr;
        if (hwnd != nullptr) slot->waiters.push_back(hwnd);
        if (slot->state == WallpaperSlot::State::Loading) {
            if (!wait) return nullptr;
            g_wallpaper_cv.wait(lock, [&] {
                return slot->state == WallpaperSlot::State::Ready || slot->state == WallpaperSlot::State::Failed;
            });
            return slot->state == WallpaperSlot::State::Ready ? &slot->cpu : nullptr;
        }
        slot->state = WallpaperSlot::State::Loading;
    }
    if (wait) {
        finish_wallpaper_slot(slot, path);
        return slot->state == WallpaperSlot::State::Ready ? &slot->cpu : nullptr;
    }
    std::thread(finish_wallpaper_slot, slot, path).detach();
    return nullptr;
}

void blit_wallpaper_dest(
    const WallpaperCpu& cpu,
    float dest_left,
    float dest_top,
    float dest_right,
    float dest_bottom,
    std::uint8_t* dst,
    int dst_w,
    int dst_h) {
    if (dst == nullptr || dst_w <= 0 || dst_h <= 0 || cpu.width == 0 || cpu.height == 0 || cpu.bgra.empty()) return;
    const float out_w = dest_right - dest_left;
    const float out_h = dest_bottom - dest_top;
    if (out_w <= 0.0f || out_h <= 0.0f) return;
    const auto src_w = static_cast<int>(cpu.width);
    const auto src_h = static_cast<int>(cpu.height);
    auto sample = [&](int x, int y) -> const std::uint8_t* {
        x = (std::max)(0, (std::min)(src_w - 1, x));
        y = (std::max)(0, (std::min)(src_h - 1, y));
        return cpu.bgra.data() + ((static_cast<std::size_t>(y) * static_cast<std::size_t>(src_w)) + static_cast<std::size_t>(x)) * 4;
    };
    for (int y = 0; y < dst_h; ++y) {
        for (int x = 0; x < dst_w; ++x) {
            const float u = ((static_cast<float>(x) + 0.5f) - dest_left) / out_w * static_cast<float>(cpu.width);
            const float v = ((static_cast<float>(y) + 0.5f) - dest_top) / out_h * static_cast<float>(cpu.height);
            if (u < 0.0f || v < 0.0f || u >= static_cast<float>(cpu.width) || v >= static_cast<float>(cpu.height)) continue;
            const auto x0 = static_cast<int>(std::floor(u));
            const auto y0 = static_cast<int>(std::floor(v));
            const float fu = u - static_cast<float>(x0);
            const float fv = v - static_cast<float>(y0);
            const auto* p00 = sample(x0, y0);
            const auto* p10 = sample(x0 + 1, y0);
            const auto* p01 = sample(x0, y0 + 1);
            const auto* p11 = sample(x0 + 1, y0 + 1);
            auto* pixel = dst + ((static_cast<std::size_t>(y) * static_cast<std::size_t>(dst_w)) + static_cast<std::size_t>(x)) * 4;
            for (int c = 0; c < 4; ++c) {
                const float top = static_cast<float>(p00[c]) + (static_cast<float>(p10[c]) - static_cast<float>(p00[c])) * fu;
                const float bottom = static_cast<float>(p01[c]) + (static_cast<float>(p11[c]) - static_cast<float>(p01[c])) * fu;
                pixel[c] = static_cast<std::uint8_t>(top + (bottom - top) * fv + 0.5f);
            }
        }
    }
}

D2D1_COLOR_F color(float red, float green, float blue, float alpha = 1.0f) {
    return D2D1::ColorF(red, green, blue, alpha);
}

float clamp_opacity(float opacity) {
    if (!(opacity > 0.0f)) return 0.0f;
    if (opacity > 1.0f) return 1.0f;
    return opacity;
}

// Layered windows ignore alpha=0 pixels. Keep the rounded plate hittable with a
// 1/255 veil so fill opacity 0 is visually clear but still receives clicks.
void lift_plate_hit_alpha(
    std::uint8_t* bits,
    int width,
    int height,
    int overflow,
    float hit_w,
    float hit_h) {
    if (bits == nullptr || width <= 0 || height <= 0) return;
    overflow = clamp_paint_overflow(overflow);
    for (int y = 0; y < height; ++y) {
        auto* row = bits + (static_cast<std::size_t>(y) * static_cast<std::size_t>(width) * 4);
        for (int x = 0; x < width; ++x) {
            auto* bgra = row + (x * 4);
            if (bgra[3] != 0) continue;
            const float hit_x = static_cast<float>(x) - static_cast<float>(overflow);
            const float hit_y = static_cast<float>(y) - static_cast<float>(overflow);
            if (!point_inside_card(hit_x, hit_y, hit_w, hit_h)) continue;
            bgra[3] = 1;
        }
    }
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

void draw_text_halo(
    ID2D1RenderTarget* context,
    std::wstring_view text,
    IDWriteTextFormat* format,
    const D2D1_RECT_F& rect,
    ID2D1Brush* stroke,
    float offset = 1.35f) {
    if (context == nullptr || format == nullptr || stroke == nullptr || text.empty()) return;
    if (!(offset > 0.0f)) offset = 1.35f;
    const float deltas[] = {-offset, 0.0f, offset};
    for (const auto dx : deltas) {
        for (const auto dy : deltas) {
            if (dx == 0.0f && dy == 0.0f) continue;
            context->DrawText(
                text.data(), static_cast<UINT32>(text.size()), format,
                D2D1::RectF(rect.left + dx, rect.top + dy, rect.right + dx, rect.bottom + dy),
                stroke, D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
        }
    }
}

void draw_outlined_text(
    ID2D1RenderTarget* context,
    std::wstring_view text,
    IDWriteTextFormat* format,
    const D2D1_RECT_F& rect,
    ID2D1Brush* fill,
    ID2D1Brush* stroke) {
    if (context == nullptr || format == nullptr || fill == nullptr || text.empty()) return;
    draw_text_halo(context, text, format, rect, stroke);
    context->DrawText(
        text.data(), static_cast<UINT32>(text.size()), format, rect,
        fill, D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
}

uint32_t fnv1a_text(std::wstring_view a, std::wstring_view b) {
    uint32_t hash = 2166136261u;
    const auto feed = [&](std::wstring_view value) {
        for (const auto unit : value) {
            hash ^= static_cast<uint32_t>(unit);
            hash *= 16777619u;
        }
    };
    feed(a);
    feed(b);
    return hash;
}

D2D1_COLOR_F cluster_hue(uint32_t seed, UINT32 index) {
    float hue = std::fmod(static_cast<float>(seed) * 2.3283064365386963e-10f + static_cast<float>(index) * 0.61803398875f, 1.0f);
    if (hue < 0.0f) hue += 1.0f;
    const float sector = hue * 6.0f;
    const auto bucket = static_cast<int>(sector);
    const float f = sector - static_cast<float>(bucket);
    const float q = 1.0f - f;
    float red = 1.0f;
    float green = 1.0f;
    float blue = 1.0f;
    switch (bucket % 6) {
        case 0: red = 1.0f; green = f; blue = 0.0f; break;
        case 1: red = q; green = 1.0f; blue = 0.0f; break;
        case 2: red = 0.0f; green = 1.0f; blue = f; break;
        case 3: red = 0.0f; green = q; blue = 1.0f; break;
        case 4: red = f; green = 0.0f; blue = 1.0f; break;
        default: red = 1.0f; green = 0.0f; blue = q; break;
    }
    return color(red, green, blue, 1.0f);
}

const wchar_t* family_wide(std::string_view family) {
    if (family == "heiti") return L"SimHei";
    if (family == "songti") return L"SimSun";
    if (family == "segoe") return L"Segoe UI";
    return L"Microsoft YaHei";
}

D2D1_RECT_F part_rect(const CardPart& part, int overflow = 0) {
    return D2D1::RectF(
        static_cast<float>(part.x + overflow),
        static_cast<float>(part.y + overflow),
        static_cast<float>(part.x + part.w + overflow),
        static_cast<float>(part.y + part.h + overflow));
}

float part_corner_radius(const CardPart& part) {
    const float half = (std::min)(static_cast<float>(part.w), static_cast<float>(part.h)) * 0.5f;
    if (part.radius_specified) {
        if (part.radius <= 0) return 0.0f;
        return (std::min)(static_cast<float>(part.radius), half);
    }
    if (part.kind == "close") return half;
    return 0.0f;
}

void stroke_rounded_rect(
    ID2D1RenderTarget* context,
    const D2D1_RECT_F& rect,
    float radius,
    ID2D1Brush* brush,
    float width) {
    if (context == nullptr || brush == nullptr || !(width > 0.0f)) return;
    if (radius > 0.0f) {
        context->DrawRoundedRectangle(D2D1::RoundedRect(rect, radius, radius), brush, width);
    } else {
        context->DrawRectangle(rect, brush, width);
    }
}

ComPtr<ID2D1LinearGradientBrush> make_rainbow_stroke_brush(ID2D1RenderTarget* context, const D2D1_RECT_F& rect) {
    ComPtr<ID2D1LinearGradientBrush> brush;
    if (context == nullptr) return brush;
    D2D1_GRADIENT_STOP stops[5]{};
    for (int index = 0; index < 5; ++index) {
        stops[index].position = static_cast<float>(index) / 4.0f;
        stops[index].color = cluster_hue(0x9e3779b9u, static_cast<UINT32>(index));
    }
    ComPtr<ID2D1GradientStopCollection> collection;
    if (FAILED(context->CreateGradientStopCollection(stops, 5, &collection)) || collection == nullptr) return brush;
    context->CreateLinearGradientBrush(
        D2D1::LinearGradientBrushProperties(
            D2D1::Point2F(rect.left, rect.top),
            D2D1::Point2F((std::max)(rect.left + 1.0f, rect.right), rect.top)),
        collection.Get(),
        &brush);
    return brush;
}

ID2D1Brush* stroke_paint_brush(
    ID2D1RenderTarget* context,
    const D2D1_RECT_F& rect,
    const std::string& paint,
    const std::string& hex,
    ComPtr<ID2D1SolidColorBrush>& solid,
    ComPtr<ID2D1LinearGradientBrush>& gradient) {
    if (paint == "gradient") {
        gradient = make_rainbow_stroke_brush(context, rect);
        if (gradient != nullptr) return gradient.Get();
    }
    if (valid_hex_color(hex) && SUCCEEDED(context->CreateSolidColorBrush(hex_color(hex, 1.0f), &solid))) {
        return solid.Get();
    }
    return nullptr;
}

void draw_part_box_stroke(ID2D1RenderTarget* context, const CardPart& part, int overflow) {
    if (context == nullptr || part.stroke_width <= 0) return;
    const auto radius = part_corner_radius(part);
    const auto rect = part_rect(part, overflow);
    ComPtr<ID2D1SolidColorBrush> solid;
    ComPtr<ID2D1LinearGradientBrush> gradient;
    ID2D1Brush* brush = stroke_paint_brush(context, rect, part.stroke_paint, part.stroke, solid, gradient);
    if (brush == nullptr) return;
    stroke_rounded_rect(context, rect, radius, brush, static_cast<float>(part.stroke_width));
}

std::string_view part_panel_color(const CardPart& part) {
    if (valid_hex_color(part.background)) return part.background;
    if (part.kind != "text" && valid_hex_color(part.fill)) return part.fill;
    return {};
}

float part_panel_opacity(const CardPart& part) {
    if (!(part.opacity > 0.0f)) return 0.0f;
    if (part.opacity > 1.0f) return 1.0f;
    return part.opacity;
}

void fill_part_box(ID2D1RenderTarget* context, const CardPart& part, int overflow) {
    const auto panel = part_panel_color(part);
    const auto opacity = part_panel_opacity(part);
    if (context == nullptr || !valid_hex_color(panel) || !(opacity > 0.0f)) return;
    ComPtr<ID2D1SolidColorBrush> fill_brush;
    if (FAILED(context->CreateSolidColorBrush(hex_color(panel, opacity), &fill_brush))) return;
    const auto radius = part_corner_radius(part);
    const auto rect = part_rect(part, overflow);
    if (radius > 0.0f) {
        context->FillRoundedRectangle(D2D1::RoundedRect(rect, radius, radius), fill_brush.Get());
    } else {
        context->FillRectangle(rect, fill_brush.Get());
    }
}

std::wstring_view part_text(const CardPart& part, std::wstring_view title, std::wstring_view body, std::wstring_view assistant_name) {
    if (part.binding == "title") return title;
    if (part.binding == "body") return body;
    if (part.binding == "assistantName") return assistant_name;
    return {};
}

D2D1_RECT_F wallpaper_dest_rect(const VisualStyle& visual, float img_w, float img_h, float box_w, float box_h, float origin_x, float origin_y) {
    if (img_w <= 0.0f || img_h <= 0.0f || box_w <= 0.0f || box_h <= 0.0f) {
        return D2D1::RectF(origin_x, origin_y, origin_x + box_w, origin_y + box_h);
    }
    const float scale = visual.background_transform_specified ? visual.background_scale : 1.0f;
    const float x = visual.background_transform_specified ? visual.background_x : 0.5f;
    const float y = visual.background_transform_specified ? visual.background_y : 0.5f;
    float left = 0.0f;
    float top = 0.0f;
    float out_w = box_w;
    float out_h = box_h;
    if (!visual.background_transform_specified && visual.background_fit == "contain") {
        const float used = (std::min)(box_w / img_w, box_h / img_h);
        out_w = img_w * used;
        out_h = img_h * used;
        left = (box_w - out_w) * 0.5f;
        top = (box_h - out_h) * 0.5f;
    } else {
        // fill/cover/底图调整都按卡面 cover，溢出只扩 clip，不再跟窗缩放。
        const float cover = (std::max)(box_w / img_w, box_h / img_h);
        const float used = cover * scale;
        out_w = img_w * used;
        out_h = img_h * used;
        left = (box_w - out_w) * x;
        top = (box_h - out_h) * y;
    }
    return D2D1::RectF(origin_x + left, origin_y + top, origin_x + left + out_w, origin_y + top + out_h);
}

void draw_part_image(ID2D1RenderTarget* context, HWND hwnd, const CardPart& part, int overflow, bool wait_for_wallpaper, bool chrome = true) {
    if (context == nullptr || part.w <= 0 || part.h <= 0) return;
    if (chrome) fill_part_box(context, part, overflow);
    if (!part.background_asset_path.empty() && !part.background_asset_sha256.empty()) {
        const auto path = std::wstring(part.background_asset_path.begin(), part.background_asset_path.end());
        const auto* cpu = request_wallpaper(path, part.background_asset_sha256, hwnd, wait_for_wallpaper);
        if (cpu != nullptr && cpu->width > 0 && cpu->height > 0) {
            VisualStyle fit{};
            fit.specified = true;
            fit.background_fit = part.background_fit.empty() ? "cover" : part.background_fit;
            fit.background_transform_specified = part.background_transform_specified;
            fit.background_scale = part.background_scale;
            fit.background_x = part.background_x;
            fit.background_y = part.background_y;
            const auto dest = wallpaper_dest_rect(
                fit,
                static_cast<float>(cpu->width),
                static_cast<float>(cpu->height),
                static_cast<float>(part.w),
                static_cast<float>(part.h),
                0.0f,
                0.0f);
            std::vector<std::uint8_t> pixels(static_cast<std::size_t>(part.w) * static_cast<std::size_t>(part.h) * 4, 0);
            blit_wallpaper_dest(*cpu, dest.left, dest.top, dest.right, dest.bottom, pixels.data(), part.w, part.h);
            const auto properties = D2D1::BitmapProperties(
                D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED));
            ComPtr<ID2D1Bitmap> bitmap;
            if (SUCCEEDED(context->CreateBitmap(
                D2D1::SizeU(static_cast<UINT32>(part.w), static_cast<UINT32>(part.h)),
                pixels.data(),
                static_cast<UINT32>(part.w) * 4,
                properties,
                &bitmap))) {
                ComPtr<ID2D1BitmapBrush> brush;
                if (SUCCEEDED(context->CreateBitmapBrush(bitmap.Get(), &brush))) {
                    const auto rect = part_rect(part, overflow);
                    brush->SetExtendModeX(D2D1_EXTEND_MODE_CLAMP);
                    brush->SetExtendModeY(D2D1_EXTEND_MODE_CLAMP);
                    brush->SetOpacity(part_panel_opacity(part));
                    brush->SetTransform(D2D1::Matrix3x2F::Translation(rect.left, rect.top));
                    const auto radius = part_corner_radius(part);
                    if (radius > 0.0f) {
                        context->FillRoundedRectangle(D2D1::RoundedRect(rect, radius, radius), brush.Get());
                    } else {
                        context->FillRectangle(rect, brush.Get());
                    }
                }
            }
        }
    }
    if (chrome) draw_part_box_stroke(context, part, overflow);
}

struct SharedGraphics {
    ComPtr<ID2D1Factory> factory;
    ComPtr<IDWriteFactory> write;
    ComPtr<IDWriteTextFormat> title_format;
    ComPtr<IDWriteTextFormat> body_format;
    std::unordered_map<std::string, ComPtr<IDWriteTextFormat>> formats;
    std::unordered_map<std::string, ComPtr<IDWriteFontCollection>> font_collections;
    int refs{};
};

SharedGraphics g_graphics;
std::mutex g_graphics_mutex;
HRESULT g_graphics_last_hr = S_OK;
const char* g_graphics_last_stage = "graphics";

std::string format_stage_error(const char* stage, HRESULT hr, DWORD win32) {
    char buf[192];
    std::snprintf(
        buf,
        sizeof(buf),
        "stage=%s win32=%lu hr=0x%08lX",
        stage,
        static_cast<unsigned long>(win32),
        static_cast<unsigned long>(hr));
    return buf;
}

bool acquire_shared_graphics() {
    std::lock_guard lock(g_graphics_mutex);
    if (g_graphics.refs > 0) {
        g_graphics.refs += 1;
        g_graphics_last_hr = S_OK;
        g_graphics_last_stage = "graphics.reuse";
        return true;
    }
    g_graphics_last_stage = "d2d.factory";
    g_graphics_last_hr = D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, IID_PPV_ARGS(&g_graphics.factory));
    if (FAILED(g_graphics_last_hr)) return false;
    g_graphics_last_stage = "dwrite.factory";
    g_graphics_last_hr = DWriteCreateFactory(
        DWRITE_FACTORY_TYPE_SHARED,
        __uuidof(IDWriteFactory),
        reinterpret_cast<IUnknown**>(g_graphics.write.GetAddressOf()));
    if (FAILED(g_graphics_last_hr)) {
        g_graphics.factory.Reset();
        return false;
    }
    g_graphics_last_stage = "dwrite.title_format";
    g_graphics_last_hr = g_graphics.write->CreateTextFormat(
        L"Segoe UI", nullptr, DWRITE_FONT_WEIGHT_SEMI_BOLD, DWRITE_FONT_STYLE_NORMAL,
        DWRITE_FONT_STRETCH_NORMAL, 20.0f, L"en-us", &g_graphics.title_format);
    if (FAILED(g_graphics_last_hr)) {
        g_graphics.write.Reset();
        g_graphics.factory.Reset();
        return false;
    }
    g_graphics_last_stage = "dwrite.body_format";
    g_graphics_last_hr = g_graphics.write->CreateTextFormat(
        L"Segoe UI", nullptr, DWRITE_FONT_WEIGHT_NORMAL, DWRITE_FONT_STYLE_NORMAL,
        DWRITE_FONT_STRETCH_NORMAL, 13.0f, L"en-us", &g_graphics.body_format);
    if (FAILED(g_graphics_last_hr)) {
        g_graphics.title_format.Reset();
        g_graphics.write.Reset();
        g_graphics.factory.Reset();
        return false;
    }
    g_graphics.title_format->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
    g_graphics.body_format->SetWordWrapping(DWRITE_WORD_WRAPPING_WRAP);
    g_graphics.refs = 1;
    return true;
}

void release_shared_graphics() noexcept {
    std::lock_guard lock(g_graphics_mutex);
    if (g_graphics.refs <= 0) return;
    g_graphics.refs -= 1;
    if (g_graphics.refs > 0) return;
    g_graphics.formats.clear();
    g_graphics.font_collections.clear();
    g_graphics.title_format.Reset();
    g_graphics.body_format.Reset();
    g_graphics.write.Reset();
    g_graphics.factory.Reset();
}

std::wstring utf8_to_wide(std::string_view value) {
    if (value.empty()) return {};
    const auto byte_count = static_cast<int>(value.size());
    const auto wide_count = MultiByteToWideChar(CP_UTF8, 0, value.data(), byte_count, nullptr, 0);
    if (wide_count <= 0) return std::wstring(value.begin(), value.end());
    std::wstring result(static_cast<std::size_t>(wide_count), L'\0');
    if (MultiByteToWideChar(CP_UTF8, 0, value.data(), byte_count, result.data(), wide_count) != wide_count) {
        return std::wstring(value.begin(), value.end());
    }
    return result;
}

std::string unescape_font_path(std::string value) {
    std::string result;
    result.reserve(value.size());
    for (std::size_t index = 0; index < value.size(); ++index) {
        if (value[index] == '\\' && index + 1 < value.size() && value[index + 1] == '\\') ++index;
        result.push_back(value[index]);
    }
    return result;
}

bool family_name_from_collection(IDWriteFontCollection* collection, std::wstring& name) {
    if (collection == nullptr || collection->GetFontFamilyCount() == 0) return false;
    ComPtr<IDWriteFontFamily> family;
    if (FAILED(collection->GetFontFamily(0, &family))) return false;
    ComPtr<IDWriteLocalizedStrings> names;
    if (FAILED(family->GetFamilyNames(&names)) || names == nullptr || names->GetCount() == 0) return false;
    UINT32 index = 0;
    BOOL exists = FALSE;
    if (FAILED(names->FindLocaleName(L"zh-cn", &index, &exists)) || !exists) {
        if (FAILED(names->FindLocaleName(L"en-us", &index, &exists)) || !exists) index = 0;
    }
    UINT32 length = 0;
    if (FAILED(names->GetStringLength(index, &length))) return false;
    name.assign(length + 1, L'\0');
    if (FAILED(names->GetString(index, name.data(), length + 1))) return false;
    while (!name.empty() && name.back() == L'\0') name.pop_back();
    return !name.empty();
}

IDWriteFontCollection* collection_for_font_asset(const CardPart& part) {
    if (part.font_asset_id.empty() || part.font_asset_path.empty() || g_graphics.write == nullptr) return nullptr;
    auto& slot = g_graphics.font_collections[part.font_asset_id];
    if (slot != nullptr) return slot.Get();
    ComPtr<IDWriteFactory5> factory5;
    if (FAILED(g_graphics.write.As(&factory5))) return nullptr;
    ComPtr<IDWriteFontSetBuilder1> builder;
    if (FAILED(factory5->CreateFontSetBuilder(&builder))) return nullptr;
    const auto path = utf8_to_wide(unescape_font_path(part.font_asset_path));
    if (path.empty()) return nullptr;
    ComPtr<IDWriteFontFile> file;
    if (FAILED(factory5->CreateFontFileReference(path.c_str(), nullptr, &file))) return nullptr;
    if (FAILED(builder->AddFontFile(file.Get()))) return nullptr;
    ComPtr<IDWriteFontSet> set;
    if (FAILED(builder->CreateFontSet(&set))) return nullptr;
    ComPtr<IDWriteFontCollection1> collection;
    if (FAILED(factory5->CreateFontCollectionFromFontSet(set.Get(), &collection))) return nullptr;
    slot = collection;
    return slot.Get();
}

ComPtr<IDWriteTextFormat> create_text_format(
    const wchar_t* family,
    float size,
    DWRITE_FONT_WEIGHT weight,
    DWRITE_FONT_STYLE style,
    bool wrap,
    IDWriteFontCollection* collection = nullptr) {
    ComPtr<IDWriteTextFormat> format;
    if (g_graphics.write == nullptr) return format;
    const auto try_create = [&](const wchar_t* name, IDWriteFontCollection* fonts) {
        format.Reset();
        return SUCCEEDED(g_graphics.write->CreateTextFormat(
            name, fonts, weight, style, DWRITE_FONT_STRETCH_NORMAL,
            size, L"zh-cn", &format));
    };
    if (collection != nullptr) {
        std::wstring private_family;
        if (family_name_from_collection(collection, private_family)
            && try_create(private_family.c_str(), collection)) {
            format->SetWordWrapping(wrap ? DWRITE_WORD_WRAPPING_WRAP : DWRITE_WORD_WRAPPING_NO_WRAP);
            format->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
            format->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_NEAR);
            return format;
        }
    }
    if (!try_create(family, nullptr) && !try_create(L"Microsoft YaHei", nullptr) && !try_create(L"Segoe UI", nullptr)) {
        format.Reset();
        return format;
    }
    format->SetWordWrapping(wrap ? DWRITE_WORD_WRAPPING_WRAP : DWRITE_WORD_WRAPPING_NO_WRAP);
    format->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
    format->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_NEAR);
    return format;
}

IDWriteTextFormat* format_for_part(const CardPart& part) {
    const bool body = part.binding == "body" || part.id == "body";
    int size = part.font_size;
    if (size < 8 || size > 72) size = body ? 13 : 20;
    const auto weight = part.font_bold ? DWRITE_FONT_WEIGHT_BOLD : DWRITE_FONT_WEIGHT_NORMAL;
    const auto style = part.font_italic ? DWRITE_FONT_STYLE_ITALIC : DWRITE_FONT_STYLE_NORMAL;
    const auto family = part.font_family.empty() ? "yahei" : part.font_family;
    const auto key = (part.font_asset_id.empty() ? family : ("asset:" + part.font_asset_id)) + "/" + std::to_string(size)
        + (body ? "/r" : "/s")
        + (part.font_bold ? "/b" : "/n")
        + (part.font_italic ? "/i" : "");
    std::lock_guard lock(g_graphics_mutex);
    auto& slot = g_graphics.formats[key];
    if (slot == nullptr) {
        auto* collection = collection_for_font_asset(part);
        slot = create_text_format(family_wide(family), static_cast<float>(size), weight, style, body, collection);
    }
    if (slot != nullptr) return slot.Get();
    return body ? g_graphics.body_format.Get() : g_graphics.title_format.Get();
}

void apply_text_lines(IDWriteTextLayout* layout, const CardPart& part, UINT32 length) {
    if (layout == nullptr || length == 0) return;
    const DWRITE_TEXT_RANGE range{0, length};
    if (part.font_underline) layout->SetUnderline(TRUE, range);
    if (part.font_strike) layout->SetStrikethrough(TRUE, range);
}

int fit_pad_px(const CardPart& part) {
    const int radius = (std::max)(0, part.radius);
    const int stroke = (std::max)(0, part.stroke_width);
    const int corner = static_cast<int>(std::ceil(static_cast<float>(radius) * 0.35f));
    return (std::max)({4, stroke, corner});
}

void apply_fit_width(CardPart& part, std::wstring_view text) {
    if (!part.fit_width) return;
    const int pad = fit_pad_px(part);
    int width = pad * 2;
    if (!text.empty() && g_graphics.write != nullptr) {
        IDWriteTextFormat* format = format_for_part(part);
        if (format != nullptr) {
            ComPtr<IDWriteTextLayout> layout;
            const float layout_h = (std::max)(1.0f, static_cast<float>(part.h > 0 ? part.h : pad * 2));
            if (SUCCEEDED(g_graphics.write->CreateTextLayout(
                    text.data(), static_cast<UINT32>(text.size()), format, 4096.0f, layout_h, &layout))
                && layout != nullptr) {
                layout->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
                apply_text_lines(layout.Get(), part, static_cast<UINT32>(text.size()));
                DWRITE_TEXT_METRICS metrics{};
                if (SUCCEEDED(layout->GetMetrics(&metrics))) {
                    float ink = metrics.width;
                    DWRITE_OVERHANG_METRICS overhang{};
                    if (SUCCEEDED(layout->GetOverhangMetrics(&overhang))) {
                        if (overhang.left > 0.0f) ink += overhang.left;
                        if (overhang.right > 0.0f) ink += overhang.right;
                    }
                    width = static_cast<int>(std::ceil(ink + static_cast<float>(pad * 2)));
                }
            }
        }
    }
    part.w = (std::max)(1, (std::min)(1920, width));
    if (part.fit_compensate) {
        part.x = (std::max)(0, part.x - pad);
    }
}

ComPtr<IDWriteTextLayout> make_part_layout(
    IDWriteFactory* write,
    IDWriteTextFormat* format,
    std::wstring_view text,
    const D2D1_RECT_F& rect,
    const CardPart& part) {
    ComPtr<IDWriteTextLayout> layout;
    if (write == nullptr || format == nullptr || text.empty()) return layout;
    const float width = (std::max)(1.0f, rect.right - rect.left);
    const float height = (std::max)(1.0f, rect.bottom - rect.top);
    if (FAILED(write->CreateTextLayout(
            text.data(), static_cast<UINT32>(text.size()), format, width, height, &layout)) || layout == nullptr) {
        layout.Reset();
        return layout;
    }
    apply_text_lines(layout.Get(), part, static_cast<UINT32>(text.size()));
    return layout;
}

float text_stroke_offset(const CardPart& part) {
    if (part.text_stroke_width > 0) return static_cast<float>(part.text_stroke_width);
    return 1.35f;
}

std::vector<ComPtr<ID2D1SolidColorBrush>> apply_cluster_hues(
    ID2D1RenderTarget* context,
    IDWriteTextLayout* layout,
    uint32_t seed) {
    std::vector<ComPtr<ID2D1SolidColorBrush>> brushes;
    if (context == nullptr || layout == nullptr) return brushes;
    UINT32 cluster_count = 0;
    layout->GetClusterMetrics(nullptr, 0, &cluster_count);
    std::vector<DWRITE_CLUSTER_METRICS> clusters(cluster_count);
    if (cluster_count > 0) {
        layout->GetClusterMetrics(clusters.data(), cluster_count, &cluster_count);
    }
    UINT32 position = 0;
    for (UINT32 index = 0; index < cluster_count; ++index) {
        const auto length = clusters[index].length;
        if (length == 0) continue;
        ComPtr<ID2D1SolidColorBrush> brush;
        if (FAILED(context->CreateSolidColorBrush(cluster_hue(seed, index), &brush)) || brush == nullptr) {
            position += length;
            continue;
        }
        layout->SetDrawingEffect(brush.Get(), DWRITE_TEXT_RANGE{position, length});
        brushes.push_back(std::move(brush));
        position += length;
    }
    return brushes;
}

void draw_text_halo_layout(
    ID2D1RenderTarget* context,
    IDWriteTextLayout* layout,
    const D2D1_RECT_F& rect,
    ID2D1Brush* stroke,
    float offset = 1.35f) {
    if (context == nullptr || layout == nullptr || stroke == nullptr) return;
    if (!(offset > 0.0f)) offset = 1.35f;
    const float deltas[] = {-offset, 0.0f, offset};
    for (const auto dx : deltas) {
        for (const auto dy : deltas) {
            if (dx == 0.0f && dy == 0.0f) continue;
            context->DrawTextLayout(
                D2D1::Point2F(rect.left + dx, rect.top + dy), layout, stroke,
                D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
        }
    }
}

void draw_rainbow_layout(
    ID2D1RenderTarget* context,
    IDWriteFactory* write,
    IDWriteTextFormat* format,
    std::wstring_view text,
    const D2D1_RECT_F& rect,
    uint32_t seed,
    const CardPart& part) {
    if (context == nullptr || write == nullptr || format == nullptr || text.empty()) return;
    const float width = (std::max)(1.0f, rect.right - rect.left);
    const float height = (std::max)(1.0f, rect.bottom - rect.top);
    ComPtr<IDWriteTextLayout> layout;
    if (FAILED(write->CreateTextLayout(
            text.data(), static_cast<UINT32>(text.size()), format, width, height, &layout)) || layout == nullptr) {
        return;
    }
    apply_text_lines(layout.Get(), part, static_cast<UINT32>(text.size()));
    auto brushes = apply_cluster_hues(context, layout.Get(), seed);
    (void)brushes;
    ComPtr<ID2D1SolidColorBrush> fallback;
    if (FAILED(context->CreateSolidColorBrush(color(1.0f, 1.0f, 1.0f, 1.0f), &fallback)) || fallback == nullptr) return;
    context->DrawTextLayout(
        D2D1::Point2F(rect.left, rect.top), layout.Get(), fallback.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
}

void draw_part_label(
    ID2D1RenderTarget* context,
    const CardPart& part,
    std::wstring_view text,
    std::wstring_view title,
    std::wstring_view body,
    ID2D1Brush* fill,
    ID2D1Brush* stroke,
    int overflow,
    bool outline) {
    if (context == nullptr || text.empty()) return;
    const auto box = part_rect(part, overflow);
    auto rect = box;
    if (part.fit_width) {
        const float pad = static_cast<float>(fit_pad_px(part));
        rect.left += pad;
        rect.right = (std::max)(rect.left + 1.0f, rect.right - pad);
    }
    context->PushAxisAlignedClip(box, D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
    IDWriteTextFormat* format = format_for_part(part);
    if (format == nullptr) {
        context->PopAxisAlignedClip();
        return;
    }
    auto layout = make_part_layout(g_graphics.write.Get(), format, text, rect, part);
    const auto seed = fnv1a_text(title, body);
    const auto halo = text_stroke_offset(part);
    std::vector<ComPtr<ID2D1SolidColorBrush>> stroke_hues;
    if (outline) {
        if (layout != nullptr && part.text_stroke_paint == "rainbow") {
            stroke_hues = apply_cluster_hues(context, layout.Get(), seed);
        }
        if (layout != nullptr) draw_text_halo_layout(context, layout.Get(), rect, stroke, halo);
        else draw_text_halo(context, text, format, rect, stroke, halo);
        if (layout != nullptr && !stroke_hues.empty() && part.text_paint != "rainbow") {
            UINT32 cluster_count = 0;
            layout->GetClusterMetrics(nullptr, 0, &cluster_count);
            std::vector<DWRITE_CLUSTER_METRICS> clusters(cluster_count);
            if (cluster_count > 0) layout->GetClusterMetrics(clusters.data(), cluster_count, &cluster_count);
            UINT32 position = 0;
            for (UINT32 index = 0; index < cluster_count; ++index) {
                const auto length = clusters[index].length;
                if (length == 0) continue;
                layout->SetDrawingEffect(nullptr, DWRITE_TEXT_RANGE{position, length});
                position += length;
            }
        }
    }
    if (part.text_paint == "rainbow") {
        draw_rainbow_layout(context, g_graphics.write.Get(), format, text, rect, seed, part);
    } else if (fill != nullptr) {
        if (layout != nullptr) {
            context->DrawTextLayout(
                D2D1::Point2F(rect.left, rect.top), layout.Get(), fill,
                D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
        } else {
            context->DrawText(
                text.data(), static_cast<UINT32>(text.size()), format, rect,
                fill, D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
        }
    }
    context->PopAxisAlignedClip();
}

void draw_star_icon(
    ID2D1RenderTarget* context,
    ID2D1Factory* factory,
    float cx,
    float cy,
    float radius,
    ID2D1Brush* brush) {
    if (context == nullptr || factory == nullptr || brush == nullptr) return;
    ComPtr<ID2D1PathGeometry> path;
    if (FAILED(factory->CreatePathGeometry(&path)) || path == nullptr) return;
    ComPtr<ID2D1GeometrySink> sink;
    if (FAILED(path->Open(&sink)) || sink == nullptr) return;
    constexpr float pi = 3.14159265f;
    for (int index = 0; index < 10; ++index) {
        const float ang = -pi / 2.0f + static_cast<float>(index) * pi / 5.0f;
        const float rad = (index % 2 == 0) ? radius : radius * 0.42f;
        const auto pt = D2D1::Point2F(cx + std::cos(ang) * rad, cy + std::sin(ang) * rad);
        if (index == 0) sink->BeginFigure(pt, D2D1_FIGURE_BEGIN_FILLED);
        else sink->AddLine(pt);
    }
    sink->EndFigure(D2D1_FIGURE_END_CLOSED);
    sink->Close();
    context->FillGeometry(path.Get(), brush);
}

void draw_close_glyph(
    ID2D1RenderTarget* context,
    const D2D1_RECT_F& rect,
    const CardPart* part,
    ID2D1Brush* fallback) {
    if (context == nullptr || fallback == nullptr) return;
    const std::string icon = part != nullptr && !part->close_icon.empty() ? part->close_icon : std::string("x");
    if (icon == "none") return;
    ComPtr<ID2D1SolidColorBrush> custom;
    ID2D1Brush* brush = fallback;
    if (part != nullptr && valid_hex_color(part->close_icon_color)
        && SUCCEEDED(context->CreateSolidColorBrush(hex_color(part->close_icon_color, 1.0f), &custom))) {
        brush = custom.Get();
    }
    constexpr float pad = 8.0f;
    const float left = rect.left + pad;
    const float top = rect.top + pad;
    const float right = rect.right - pad;
    const float bottom = rect.bottom - pad;
    const float cx = (rect.left + rect.right) * 0.5f;
    const float cy = (rect.top + rect.bottom) * 0.5f;
    const float span = (std::min)(right - left, bottom - top);
    if (!(span > 1.0f)) return;
    if (icon == "circle") {
        const auto ellipse = D2D1::Ellipse(D2D1::Point2F(cx, cy), span * 0.5f, span * 0.5f);
        context->DrawEllipse(ellipse, brush, 1.5f);
        return;
    }
    if (icon == "disc") {
        const auto ellipse = D2D1::Ellipse(D2D1::Point2F(cx, cy), span * 0.5f, span * 0.5f);
        context->FillEllipse(ellipse, brush);
        return;
    }
    if (icon == "minus") {
        context->DrawLine(D2D1::Point2F(left, cy), D2D1::Point2F(right, cy), brush, 1.5f);
        return;
    }
    if (icon == "plus") {
        context->DrawLine(D2D1::Point2F(left, cy), D2D1::Point2F(right, cy), brush, 1.5f);
        context->DrawLine(D2D1::Point2F(cx, top), D2D1::Point2F(cx, bottom), brush, 1.5f);
        return;
    }
    if (icon == "star") {
        draw_star_icon(context, g_graphics.factory.Get(), cx, cy, span * 0.5f, brush);
        return;
    }
    context->DrawLine(D2D1::Point2F(left, top), D2D1::Point2F(right, bottom), brush, 1.5f);
    context->DrawLine(D2D1::Point2F(right, top), D2D1::Point2F(left, bottom), brush, 1.5f);
}

}  // namespace
#endif

struct CardRenderer::Impl {
#ifdef _WIN32
    ComPtr<ID2D1DCRenderTarget> rt;
    ComPtr<IDWriteTextFormat> title_format;
    ComPtr<IDWriteTextFormat> body_format;
    ComPtr<ID2D1SolidColorBrush> surface_brush;
    ComPtr<ID2D1SolidColorBrush> accent_brush;
    ComPtr<ID2D1SolidColorBrush> title_brush;
    ComPtr<ID2D1SolidColorBrush> body_brush;
    ComPtr<ID2D1SolidColorBrush> close_background_brush;
    ComPtr<ID2D1SolidColorBrush> close_icon_brush;
    ComPtr<ID2D1SolidColorBrush> text_stroke_brush;
    ComPtr<ID2D1Bitmap> background_bitmap;
    std::wstring background_bitmap_path;
    std::string background_bitmap_sha;
    float background_dest_left{};
    float background_dest_top{};
    float background_dest_right{};
    float background_dest_bottom{};
    int background_bitmap_w{};
    int background_bitmap_h{};
    bool graphics_held{};
    HDC layered_memory_dc{};
    HBITMAP layered_dib{};
    HGDIOBJ layered_previous{};
    void* layered_bits{};
    int layered_width{};
    int layered_height{};
    bool com_initialized{};
    HWND hwnd{};
    int width{};
    int height{};
    int present_x{};
    int present_y{};
    bool present_valid{};
    std::vector<Pixel> pixels;
    void release_layered() noexcept {
        if (layered_memory_dc != nullptr && layered_previous != nullptr) {
            SelectObject(layered_memory_dc, layered_previous);
            layered_previous = nullptr;
        }
        if (layered_dib != nullptr) {
            DeleteObject(layered_dib);
            layered_dib = nullptr;
            layered_bits = nullptr;
        }
        if (layered_memory_dc != nullptr) {
            DeleteDC(layered_memory_dc);
            layered_memory_dc = nullptr;
        }
        layered_width = 0;
        layered_height = 0;
        present_valid = false;
    }
    bool ensure_layered(int next_width, int next_height, DWORD* win32_error = nullptr, const char** stage = nullptr) noexcept {
        if (layered_dib != nullptr && layered_memory_dc != nullptr && layered_bits != nullptr
            && layered_width == next_width && layered_height == next_height) return true;
        release_layered();
        SetLastError(0);
        layered_memory_dc = CreateCompatibleDC(nullptr);
        if (layered_memory_dc == nullptr) {
            if (win32_error != nullptr) *win32_error = GetLastError();
            if (stage != nullptr) *stage = "layered.dc";
            return false;
        }
        BITMAPINFO bitmap_info{};
        bitmap_info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        bitmap_info.bmiHeader.biWidth = next_width;
        bitmap_info.bmiHeader.biHeight = -next_height;
        bitmap_info.bmiHeader.biPlanes = 1;
        bitmap_info.bmiHeader.biBitCount = 32;
        bitmap_info.bmiHeader.biCompression = BI_RGB;
        SetLastError(0);
        layered_dib = CreateDIBSection(nullptr, &bitmap_info, DIB_RGB_COLORS, &layered_bits, nullptr, 0);
        if (layered_dib == nullptr || layered_bits == nullptr) {
            if (win32_error != nullptr) *win32_error = GetLastError();
            if (stage != nullptr) *stage = "layered.dib";
            release_layered();
            return false;
        }
        layered_previous = SelectObject(layered_memory_dc, layered_dib);
        layered_width = next_width;
        layered_height = next_height;
        return true;
    }
#endif
    bool ready{};
};

CardRenderer::CardRenderer() : impl_(std::make_unique<Impl>()) {}

CardRenderer::~CardRenderer() { reset(); }

bool CardRenderer::initialize(void* native_window, int width, int height) {
#ifdef _WIN32
    last_error_.clear();
    reset();
    auto fail = [this](const char* stage, HRESULT hr, DWORD win32) {
        last_error_ = format_stage_error(stage, hr, win32);
        reset();
        return false;
    };
    if (native_window == nullptr || width <= 0 || height <= 0) {
        return fail("args", S_OK, 0);
    }

    const auto com_result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(com_result) && com_result != RPC_E_CHANGED_MODE) {
        return fail("com_init", com_result, 0);
    }
    impl_->com_initialized = SUCCEEDED(com_result);
    impl_->hwnd = static_cast<HWND>(native_window);
    impl_->width = width;
    impl_->height = height;

    if (!acquire_shared_graphics()) {
        return fail(g_graphics_last_stage, g_graphics_last_hr, 0);
    }
    impl_->graphics_held = true;
    impl_->title_format = g_graphics.title_format;
    impl_->body_format = g_graphics.body_format;

    // DC targets already draw to a GDI DC. GDI_COMPATIBLE is documented as
    // incompatible with B8G8R8A8 + PREMULTIPLIED and made CreateDCRenderTarget
    // fail on some machines; BindDC does not need that usage flag.
    auto properties = D2D1::RenderTargetProperties(
        D2D1_RENDER_TARGET_TYPE_DEFAULT,
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED),
        96.0f,
        96.0f,
        D2D1_RENDER_TARGET_USAGE_NONE,
        D2D1_FEATURE_LEVEL_DEFAULT);
    auto result = g_graphics.factory->CreateDCRenderTarget(&properties, &impl_->rt);
    HRESULT dc_target_hr = result;
    if (FAILED(result)) {
        properties.type = D2D1_RENDER_TARGET_TYPE_SOFTWARE;
        result = g_graphics.factory->CreateDCRenderTarget(&properties, &impl_->rt);
        if (FAILED(result)) return fail("d2d.dc_target", result != S_OK ? result : dc_target_hr, 0);
    }
    DWORD layered_win32 = 0;
    const char* layered_stage = "layered";
    if (!impl_->ensure_layered(width, height, &layered_win32, &layered_stage)) {
        return fail(layered_stage, S_OK, layered_win32);
    }
    RECT bind{0, 0, width, height};
    result = impl_->rt->BindDC(impl_->layered_memory_dc, &bind);
    if (FAILED(result)) return fail("d2d.bind_dc", result, 0);

    result = impl_->rt->CreateSolidColorBrush(
        color(0.08f, 0.10f, 0.12f, 0.96f), &impl_->surface_brush);
    if (FAILED(result)) return fail("d2d.brush.surface", result, 0);
    result = impl_->rt->CreateSolidColorBrush(
        color(0.30f, 0.85f, 0.70f, 1.0f), &impl_->accent_brush);
    if (FAILED(result)) return fail("d2d.brush.accent", result, 0);
    result = impl_->rt->CreateSolidColorBrush(
        color(0.96f, 0.98f, 0.98f, 1.0f), &impl_->title_brush);
    if (FAILED(result)) return fail("d2d.brush.title", result, 0);
    result = impl_->rt->CreateSolidColorBrush(
        color(0.70f, 0.76f, 0.78f, 1.0f), &impl_->body_brush);
    if (FAILED(result)) return fail("d2d.brush.body", result, 0);
    result = impl_->rt->CreateSolidColorBrush(
        color(0.18f, 0.22f, 0.24f, 0.92f), &impl_->close_background_brush);
    if (FAILED(result)) return fail("d2d.brush.close_bg", result, 0);
    result = impl_->rt->CreateSolidColorBrush(
        color(0.82f, 0.88f, 0.88f, 1.0f), &impl_->close_icon_brush);
    if (FAILED(result)) return fail("d2d.brush.close_icon", result, 0);
    result = impl_->rt->CreateSolidColorBrush(
        color(0.04f, 0.05f, 0.05f, 0.92f), &impl_->text_stroke_brush);
    if (FAILED(result)) return fail("d2d.brush.text_stroke", result, 0);

    impl_->ready = true;
    return true;
#else
    static_cast<void>(native_window);
    static_cast<void>(width);
    static_cast<void>(height);
    last_error_ = "stage=unsupported win32=0 hr=0x00000000";
    return false;
#endif
}

bool CardRenderer::resize(int width, int height) {
#ifdef _WIN32
    if (!impl_->ready || width <= 0 || height <= 0) return false;
    if (impl_->width == width && impl_->height == height) return true;
    impl_->width = width;
    impl_->height = height;
    impl_->background_bitmap.Reset();
    impl_->background_bitmap_path.clear();
    impl_->background_bitmap_sha.clear();
    impl_->background_bitmap_w = 0;
    impl_->background_bitmap_h = 0;
    impl_->release_layered();
    impl_->pixels.clear();
    return true;
#else
    static_cast<void>(width);
    static_cast<void>(height);
    return false;
#endif
}

bool CardRenderer::draw(std::wstring_view title, std::wstring_view body, const VisualStyle& visual, bool capture_output, const std::vector<CardPart>& parts, bool hovered, std::wstring_view assistant_name) {
#ifdef _WIN32
    if (!impl_->ready || !capture_offscreen(title, body, visual, parts, hovered, capture_output, assistant_name)) return false;
    return update_layered_window();
#else
    static_cast<void>(title);
    static_cast<void>(body);
    static_cast<void>(visual);
    static_cast<void>(capture_output);
    static_cast<void>(parts);
    static_cast<void>(hovered);
    static_cast<void>(assistant_name);
    return false;
#endif
}

bool CardRenderer::draw_buffer(std::wstring_view title, std::wstring_view body, const VisualStyle& visual, bool capture_output, const std::vector<CardPart>& parts, bool hovered, std::wstring_view assistant_name) {
#ifdef _WIN32
    if (!impl_->ready || !capture_offscreen(title, body, visual, parts, hovered, capture_output, assistant_name)) return false;
    return impl_->layered_bits != nullptr && impl_->layered_width > 0 && impl_->layered_height > 0;
#else
    static_cast<void>(title);
    static_cast<void>(body);
    static_cast<void>(visual);
    static_cast<void>(capture_output);
    static_cast<void>(parts);
    static_cast<void>(hovered);
    static_cast<void>(assistant_name);
    return false;
#endif
}

bool CardRenderer::buffer_bits(const void*& bits, int& pitch, int& width, int& height) const noexcept {
#ifdef _WIN32
    if (impl_ == nullptr || impl_->layered_bits == nullptr || impl_->layered_width <= 0 || impl_->layered_height <= 0) {
        return false;
    }
    bits = impl_->layered_bits;
    width = impl_->layered_width;
    height = impl_->layered_height;
    pitch = impl_->layered_width * 4;
    return true;
#else
    static_cast<void>(bits);
    static_cast<void>(pitch);
    static_cast<void>(width);
    static_cast<void>(height);
    return false;
#endif
}

bool CardRenderer::update_layered_window() {
#ifdef _WIN32
    if (!impl_->ready || impl_->hwnd == nullptr || impl_->layered_memory_dc == nullptr
        || impl_->layered_bits == nullptr || impl_->width <= 0 || impl_->height <= 0) {
        return false;
    }

    RECT bounds{};
    if (GetWindowRect(impl_->hwnd, &bounds) == FALSE) return false;
    POINT destination_point{bounds.left, bounds.top};
    POINT source_point{0, 0};
    SIZE size{impl_->width, impl_->height};
    BLENDFUNCTION blend{};
    blend.BlendOp = AC_SRC_OVER;
    blend.SourceConstantAlpha = 255;
    blend.AlphaFormat = AC_SRC_ALPHA;
    const auto updated = UpdateLayeredWindow(
        impl_->hwnd,
        nullptr,
        &destination_point,
        &size,
        impl_->layered_memory_dc,
        &source_point,
        0,
        &blend,
        ULW_ALPHA);
    if (updated == FALSE) return false;
    impl_->present_x = destination_point.x;
    impl_->present_y = destination_point.y;
    impl_->present_valid = true;
    return true;
#else
    return false;
#endif
}

bool CardRenderer::present_layered() {
    return update_layered_window();
}

bool CardRenderer::layered_present_origin(int& x, int& y) const noexcept {
#ifdef _WIN32
    if (impl_ == nullptr || !impl_->present_valid) return false;
    x = impl_->present_x;
    y = impl_->present_y;
    return true;
#else
    static_cast<void>(x);
    static_cast<void>(y);
    return false;
#endif
}

bool CardRenderer::ensure_background_bitmap(const VisualStyle& visual, float dest_left, float dest_top, float dest_right, float dest_bottom, bool wait_for_wallpaper) {
#ifdef _WIN32
    if (!visual.specified || visual.background_asset_path.empty() || visual.background_asset_sha256.empty()
        || impl_->rt == nullptr || impl_->width <= 0 || impl_->height <= 0) {
        impl_->background_bitmap.Reset();
        impl_->background_bitmap_path.clear();
        impl_->background_bitmap_sha.clear();
        return false;
    }
    const auto path = std::wstring(visual.background_asset_path.begin(), visual.background_asset_path.end());
    auto expected = visual.background_asset_sha256;
    std::transform(expected.begin(), expected.end(), expected.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    if (impl_->background_bitmap != nullptr
        && impl_->background_bitmap_path == path
        && impl_->background_bitmap_sha == expected
        && impl_->background_bitmap_w == impl_->width
        && impl_->background_bitmap_h == impl_->height
        && impl_->background_dest_left == dest_left
        && impl_->background_dest_top == dest_top
        && impl_->background_dest_right == dest_right
        && impl_->background_dest_bottom == dest_bottom) {
        return true;
    }
    const auto* cpu = request_wallpaper(path, expected, impl_->hwnd, wait_for_wallpaper);
    if (cpu == nullptr) return false;
    std::vector<std::uint8_t> card(static_cast<std::size_t>(impl_->width) * static_cast<std::size_t>(impl_->height) * 4, 0);
    blit_wallpaper_dest(*cpu, dest_left, dest_top, dest_right, dest_bottom, card.data(), impl_->width, impl_->height);
    const auto properties = D2D1::BitmapProperties(
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED));
    ComPtr<ID2D1Bitmap> bitmap;
    if (FAILED(impl_->rt->CreateBitmap(
        D2D1::SizeU(static_cast<UINT32>(impl_->width), static_cast<UINT32>(impl_->height)),
        card.data(),
        static_cast<UINT32>(impl_->width) * 4,
        properties,
        &bitmap))) {
        return false;
    }
    impl_->background_bitmap = bitmap;
    impl_->background_bitmap_path = path;
    impl_->background_bitmap_sha = expected;
    impl_->background_bitmap_w = impl_->width;
    impl_->background_bitmap_h = impl_->height;
    impl_->background_dest_left = dest_left;
    impl_->background_dest_top = dest_top;
    impl_->background_dest_right = dest_right;
    impl_->background_dest_bottom = dest_bottom;
    return true;
#else
    static_cast<void>(visual);
    static_cast<void>(dest_left);
    static_cast<void>(dest_top);
    static_cast<void>(dest_right);
    static_cast<void>(dest_bottom);
    static_cast<void>(wait_for_wallpaper);
    return false;
#endif
}

bool CardRenderer::capture_offscreen(std::wstring_view title, std::wstring_view body, const VisualStyle& visual, const std::vector<CardPart>& parts, bool hovered, bool wait_for_wallpaper, std::wstring_view assistant_name) {
#ifdef _WIN32
    if (!impl_->ready || impl_->rt == nullptr) return false;
    if (!impl_->ensure_layered(impl_->width, impl_->height)) return false;
    RECT bind{0, 0, impl_->width, impl_->height};
    HRESULT result = impl_->rt->BindDC(impl_->layered_memory_dc, &bind);
    if (FAILED(result)) return false;

    impl_->rt->BeginDraw();
    impl_->rt->SetTransform(D2D1::Matrix3x2F::Identity());
    impl_->rt->Clear(color(0.0f, 0.0f, 0.0f, 0.0f));

    const int overflow = visual.specified ? clamp_paint_overflow(visual.paint_overflow) : 0;
    const auto width = static_cast<float>(impl_->width);
    const auto height = static_cast<float>(impl_->height);
    const auto hit_w = (std::max)(1.0f, width - static_cast<float>(overflow * 2));
    const auto hit_h = (std::max)(1.0f, height - static_cast<float>(overflow * 2));
    auto bounds = card_bounds(hit_w, hit_h);
    bounds.left += static_cast<float>(overflow);
    bounds.top += static_cast<float>(overflow);
    bounds.right += static_cast<float>(overflow);
    bounds.bottom += static_cast<float>(overflow);
    if (visual.specified) {
        bounds.radius = static_cast<float>(visual.border_radius);
        if (visual.card_type == "danmaku" || visual.ticker_specified) bounds.radius = (std::min)(bounds.radius, 12.0f);
        if (visual.card_type == "popup") bounds.radius = (std::max)(bounds.radius, 22.0f);
    }
    const CardPart* root_part = nullptr;
    for (const auto& part : parts) {
        if (part.id == "root") {
            root_part = &part;
            break;
        }
    }
    auto* surface_brush = impl_->surface_brush.Get();
    ComPtr<ID2D1SolidColorBrush> visual_surface_brush;
    const bool hover_on = hovered && visual.specified && visual.hover_highlight;
    bool has_wallpaper = visual.specified && !visual.background_asset_path.empty() && !visual.background_asset_sha256.empty();
    if (root_part != nullptr && !root_part->background_asset_path.empty() && !root_part->background_asset_sha256.empty()) {
        has_wallpaper = true;
    }
    if (visual.specified) {
        auto plate_fill = visual.background_color;
        if (root_part != nullptr && valid_hex_color(root_part->fill)) {
            plate_fill = root_part->fill;
        }
        auto surface = visual.enabled
            ? hex_color(plate_fill, clamp_opacity(visual.opacity))
            : color(0.08f, 0.10f, 0.12f, 0.82f);
        if (hover_on && !has_wallpaper) {
            surface.r = surface.r + (1.0f - surface.r) * 0.22f;
            surface.g = surface.g + (1.0f - surface.g) * 0.22f;
            surface.b = surface.b + (1.0f - surface.b) * 0.22f;
        }
        if (FAILED(impl_->rt->CreateSolidColorBrush(surface, &visual_surface_brush))) return false;
        surface_brush = visual_surface_brush.Get();
    }
    impl_->rt->FillRoundedRectangle(
        D2D1::RoundedRect(
            D2D1::RectF(bounds.left, bounds.top, bounds.right, bounds.bottom),
            bounds.radius,
            bounds.radius),
        surface_brush);
    VisualStyle wallpaper = visual;
    if (root_part != nullptr) {
        if (!root_part->background_asset_path.empty() && !root_part->background_asset_sha256.empty()) {
            wallpaper.background_asset_path = root_part->background_asset_path;
            wallpaper.background_asset_sha256 = root_part->background_asset_sha256;
            wallpaper.background_asset_id = root_part->background_asset_id;
        }
        if (!root_part->background_fit.empty()) {
            wallpaper.background_fit = root_part->background_fit;
        }
        if (root_part->background_transform_specified) {
            wallpaper.background_transform_specified = true;
            wallpaper.background_scale = root_part->background_scale;
            wallpaper.background_x = root_part->background_x;
            wallpaper.background_y = root_part->background_y;
        }
    }
    if (wallpaper.specified && !wallpaper.background_asset_path.empty() && !wallpaper.background_asset_sha256.empty()) {
        const auto path = std::wstring(wallpaper.background_asset_path.begin(), wallpaper.background_asset_path.end());
        const auto* cpu = request_wallpaper(path, wallpaper.background_asset_sha256, impl_->hwnd, wait_for_wallpaper);
        if (cpu != nullptr && cpu->width > 0 && cpu->height > 0) {
            const auto box_w = (std::max)(1.0f, bounds.right - bounds.left);
            const auto box_h = (std::max)(1.0f, bounds.bottom - bounds.top);
            const auto dest = wallpaper_dest_rect(
                wallpaper,
                static_cast<float>(cpu->width),
                static_cast<float>(cpu->height),
                box_w,
                box_h,
                bounds.left,
                bounds.top);
            if (ensure_background_bitmap(wallpaper, dest.left, dest.top, dest.right, dest.bottom, wait_for_wallpaper)) {
                ComPtr<ID2D1BitmapBrush> wallpaper_brush;
                if (SUCCEEDED(impl_->rt->CreateBitmapBrush(impl_->background_bitmap.Get(), &wallpaper_brush))) {
                    wallpaper_brush->SetOpacity(1.0f);
                    wallpaper_brush->SetExtendModeX(D2D1_EXTEND_MODE_CLAMP);
                    wallpaper_brush->SetExtendModeY(D2D1_EXTEND_MODE_CLAMP);
                    const auto paint_radius = overflow > 0
                        ? bounds.radius + static_cast<float>(overflow) * 0.35f
                        : bounds.radius;
                    impl_->rt->FillRoundedRectangle(
                        D2D1::RoundedRect(
                            D2D1::RectF(
                                bounds.left - static_cast<float>(overflow),
                                bounds.top - static_cast<float>(overflow),
                                bounds.right + static_cast<float>(overflow),
                                bounds.bottom + static_cast<float>(overflow)),
                            paint_radius,
                            paint_radius),
                        wallpaper_brush.Get());
                }
            }
        }
    }
    if (hover_on && has_wallpaper) {
        ComPtr<ID2D1SolidColorBrush> hover_wash;
        if (SUCCEEDED(impl_->rt->CreateSolidColorBrush(color(1.0f, 1.0f, 1.0f, 0.18f), &hover_wash))) {
            const auto paint_radius = overflow > 0
                ? bounds.radius + static_cast<float>(overflow) * 0.35f
                : bounds.radius;
            impl_->rt->FillRoundedRectangle(
                D2D1::RoundedRect(
                    D2D1::RectF(
                        bounds.left - static_cast<float>(overflow),
                        bounds.top - static_cast<float>(overflow),
                        bounds.right + static_cast<float>(overflow),
                        bounds.bottom + static_cast<float>(overflow)),
                    paint_radius,
                    paint_radius),
                hover_wash.Get());
        }
    }
    const bool ticker_card = visual.ticker_specified || visual.card_type == "danmaku";
    auto stroke_width = visual.border_width;
    auto stroke_color = visual.border_color;
    std::string stroke_paint;
    if (root_part != nullptr && root_part->stroke_width > 0) {
        stroke_width = root_part->stroke_width;
        if (valid_hex_color(root_part->stroke)) stroke_color = root_part->stroke;
        stroke_paint = root_part->stroke_paint;
    }
    if (hover_on && stroke_width <= 0) {
        stroke_width = 2;
        stroke_color = "#62d0a8";
    }
    if (visual.specified && stroke_width > 0 && (stroke_paint == "gradient" || valid_hex_color(stroke_color))) {
        const auto stroke_px = static_cast<float>(stroke_width);
        const auto inset = stroke_px * 0.5f;
        const auto stroke_left = bounds.left + inset;
        const auto stroke_top = bounds.top + inset;
        const auto stroke_right = bounds.right - inset;
        const auto stroke_bottom = bounds.bottom - inset;
        const auto stroke_radius = (std::max)(0.0f, bounds.radius - inset);
        if (stroke_right > stroke_left && stroke_bottom > stroke_top) {
            const auto stroke_rect = D2D1::RectF(stroke_left, stroke_top, stroke_right, stroke_bottom);
            ComPtr<ID2D1SolidColorBrush> border_brush;
            ComPtr<ID2D1LinearGradientBrush> border_gradient;
            ID2D1Brush* brush = nullptr;
            if (stroke_paint == "gradient") {
                border_gradient = make_rainbow_stroke_brush(impl_->rt.Get(), stroke_rect);
                if (border_gradient != nullptr) brush = border_gradient.Get();
            }
            if (brush == nullptr && valid_hex_color(stroke_color)) {
                auto stroke = hex_color(stroke_color, 1.0f);
                if (hover_on) {
                    stroke.r = stroke.r + (1.0f - stroke.r) * 0.18f;
                    stroke.g = stroke.g + (1.0f - stroke.g) * 0.18f;
                    stroke.b = stroke.b + (1.0f - stroke.b) * 0.18f;
                }
                if (SUCCEEDED(impl_->rt->CreateSolidColorBrush(stroke, &border_brush))) brush = border_brush.Get();
            }
            if (brush != nullptr) {
                stroke_rounded_rect(impl_->rt.Get(), stroke_rect, stroke_radius, brush, stroke_px);
            }
        }
    }

    const bool use_part_text = !parts.empty();
    impl_->rt->PushAxisAlignedClip(
        D2D1::RectF(bounds.left, bounds.top, bounds.right, bounds.bottom),
        D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
    if (ticker_card) {
        if (use_part_text) {
            for (const auto& part : parts) {
                if (part.id == "root") continue;
                if (part.kind == "image") {
                    draw_part_image(impl_->rt.Get(), impl_->hwnd, part, overflow, wait_for_wallpaper);
                    continue;
                }
                if (part.kind != "text") continue;
                CardPart drawn = part;
                const auto text = part_text(part, title, body, assistant_name);
                apply_fit_width(drawn, text);
                fill_part_box(impl_->rt.Get(), drawn, overflow);
                draw_part_image(impl_->rt.Get(), impl_->hwnd, drawn, overflow, wait_for_wallpaper, false);
                ID2D1Brush* text_brush = drawn.binding == "body" ? impl_->body_brush.Get() : impl_->title_brush.Get();
                ComPtr<ID2D1SolidColorBrush> custom_text;
                if (drawn.text_paint != "rainbow" && valid_hex_color(drawn.fill)
                    && SUCCEEDED(impl_->rt->CreateSolidColorBrush(hex_color(drawn.fill, 1.0f), &custom_text))) {
                    text_brush = custom_text.Get();
                }
                ID2D1Brush* outline_brush = impl_->text_stroke_brush.Get();
                ComPtr<ID2D1SolidColorBrush> custom_outline;
                if (drawn.text_stroke && valid_hex_color(drawn.text_stroke_color)
                    && SUCCEEDED(impl_->rt->CreateSolidColorBrush(hex_color(drawn.text_stroke_color, 1.0f), &custom_outline))
                    && custom_outline != nullptr) {
                    outline_brush = custom_outline.Get();
                }
                draw_part_label(
                    impl_->rt.Get(), drawn, text, title, body,
                    text_brush, outline_brush, overflow, drawn.text_stroke);
                draw_part_box_stroke(impl_->rt.Get(), drawn, overflow);
            }
        } else {
            const float text_left = bounds.left + 14.0f;
            const float text_right = (std::max)(text_left + 24.0f, bounds.right - 14.0f);
            const float inner_h = bounds.bottom - bounds.top;
            const bool two_lines = !body.empty() && inner_h >= 48.0f;
            if (two_lines) {
                const float title_bottom = bounds.top + (std::min)(28.0f, inner_h * 0.45f);
                if (impl_->title_format && impl_->title_brush && !title.empty()) {
                    impl_->rt->DrawText(
                        title.data(), static_cast<UINT32>(title.size()), impl_->title_format.Get(),
                        D2D1::RectF(text_left, bounds.top + 4.0f, text_right, title_bottom),
                        impl_->title_brush.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
                }
                if (impl_->body_format && impl_->title_brush && !body.empty()) {
                    impl_->rt->DrawText(
                        body.data(), static_cast<UINT32>(body.size()), impl_->body_format.Get(),
                        D2D1::RectF(text_left, title_bottom, text_right, bounds.bottom - 4.0f),
                        impl_->title_brush.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
                }
            } else {
                const auto& line = title.empty() ? body : title;
                if (impl_->title_format && impl_->title_brush && !line.empty()) {
                    impl_->rt->DrawText(
                        line.data(), static_cast<UINT32>(line.size()), impl_->title_format.Get(),
                        D2D1::RectF(text_left, bounds.top + 8.0f, text_right, bounds.bottom - 8.0f),
                        impl_->title_brush.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
                }
            }
        }
    } else {
        auto close_button = close_button_bounds(hit_w, hit_h);
        close_button.left += static_cast<float>(overflow);
        close_button.top += static_cast<float>(overflow);
        close_button.right += static_cast<float>(overflow);
        close_button.bottom += static_cast<float>(overflow);
        const auto draw_close = [&](float left, float top, float right, float bottom, const CardPart* part) {
            const auto rect = D2D1::RectF(left, top, right, bottom);
            const auto close_radius = part != nullptr
                ? part_corner_radius(*part)
                : (std::min)(right - left, bottom - top) * 0.5f;
            const bool has_part_image = part != nullptr
                && !part->background_asset_path.empty()
                && !part->background_asset_sha256.empty();
            ID2D1Brush* fill_brush = nullptr;
            ComPtr<ID2D1SolidColorBrush> custom_fill;
            if (part != nullptr) {
                const auto panel = part_panel_color(*part);
                const auto opacity = part_panel_opacity(*part);
                if (valid_hex_color(panel) && opacity > 0.0f
                    && SUCCEEDED(impl_->rt->CreateSolidColorBrush(hex_color(panel, opacity), &custom_fill))) {
                    fill_brush = custom_fill.Get();
                }
            }
            if (fill_brush == nullptr && !has_part_image) {
                fill_brush = impl_->close_background_brush.Get();
            }
            if (fill_brush != nullptr) {
                impl_->rt->FillRoundedRectangle(D2D1::RoundedRect(rect, close_radius, close_radius), fill_brush);
            }
            if (part != nullptr) {
                draw_part_image(impl_->rt.Get(), impl_->hwnd, *part, overflow, wait_for_wallpaper, false);
            }
            draw_close_glyph(impl_->rt.Get(), rect, part, impl_->close_icon_brush.Get());
            if (part != nullptr && part->stroke_width > 0) {
                ComPtr<ID2D1SolidColorBrush> stroke_solid;
                ComPtr<ID2D1LinearGradientBrush> stroke_gradient;
                ID2D1Brush* stroke_brush = stroke_paint_brush(
                    impl_->rt.Get(), rect, part->stroke_paint, part->stroke, stroke_solid, stroke_gradient);
                if (stroke_brush != nullptr) {
                    stroke_rounded_rect(
                        impl_->rt.Get(), rect, close_radius, stroke_brush, static_cast<float>(part->stroke_width));
                }
            }
        };

        if (use_part_text) {
            for (const auto& part : parts) {
                if (part.kind == "text") {
                    CardPart drawn = part;
                    const auto text = part_text(part, title, body, assistant_name);
                    apply_fit_width(drawn, text);
                    fill_part_box(impl_->rt.Get(), drawn, overflow);
                    draw_part_image(impl_->rt.Get(), impl_->hwnd, drawn, overflow, wait_for_wallpaper, false);
                    if (text.empty()) continue;
                    const bool is_body = drawn.binding == "body";
                    ID2D1Brush* text_brush = is_body ? impl_->body_brush.Get() : impl_->title_brush.Get();
                    ComPtr<ID2D1SolidColorBrush> custom_text;
                    if (drawn.text_paint != "rainbow" && valid_hex_color(drawn.fill)
                        && SUCCEEDED(impl_->rt->CreateSolidColorBrush(hex_color(drawn.fill, 1.0f), &custom_text))) {
                        text_brush = custom_text.Get();
                    }
                    ID2D1Brush* outline_brush = impl_->text_stroke_brush.Get();
                    ComPtr<ID2D1SolidColorBrush> custom_outline;
                    if (drawn.text_stroke && valid_hex_color(drawn.text_stroke_color)
                        && SUCCEEDED(impl_->rt->CreateSolidColorBrush(hex_color(drawn.text_stroke_color, 1.0f), &custom_outline))
                        && custom_outline != nullptr) {
                        outline_brush = custom_outline.Get();
                    }
                    draw_part_label(
                        impl_->rt.Get(), drawn, text, title, body,
                        text_brush, outline_brush, overflow, drawn.text_stroke);
                    draw_part_box_stroke(impl_->rt.Get(), drawn, overflow);
                    continue;
                }
                if (part.kind == "close") {
                    draw_close(
                        static_cast<float>(part.x + overflow), static_cast<float>(part.y + overflow),
                        static_cast<float>(part.x + part.w + overflow), static_cast<float>(part.y + part.h + overflow),
                        &part);
                    continue;
                }
                if (part.kind == "image") {
                    draw_part_image(impl_->rt.Get(), impl_->hwnd, part, overflow, wait_for_wallpaper);
                    continue;
                }
                if (part.id == "root") continue;
                fill_part_box(impl_->rt.Get(), part, overflow);
                draw_part_box_stroke(impl_->rt.Get(), part, overflow);
            }
        } else {
            const bool show_close = visual.dismiss_mode == "closeButton" || visual.dismiss_mode == "buttonOnly";
            if (show_close) {
                draw_close(close_button.left, close_button.top, close_button.right, close_button.bottom, nullptr);
            }
            const float text_left = (visual.card_type == "popup" ? 36.0f : 30.0f) + static_cast<float>(overflow);
            const float title_top = 24.0f + static_cast<float>(overflow);
            const float body_top = 62.0f + static_cast<float>(overflow);
            const float title_right = show_close
                ? (std::max)(36.0f, close_button.left - 8.0f)
                : (std::max)(36.0f, static_cast<float>(hit_w - 24) + static_cast<float>(overflow));
            const float body_bottom = (std::max)(body_top + 8.0f, static_cast<float>(overflow) + static_cast<float>(hit_h - 22));
            impl_->rt->DrawText(
                title.data(), static_cast<UINT32>(title.size()), impl_->title_format.Get(),
                D2D1::RectF(text_left, title_top, title_right, body_top - 4.0f),
                impl_->title_brush.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
            impl_->rt->DrawText(
                body.data(), static_cast<UINT32>(body.size()), impl_->body_format.Get(),
                D2D1::RectF(text_left, body_top, (std::max)(36.0f, static_cast<float>(hit_w - 24) + static_cast<float>(overflow)), body_bottom),
                impl_->body_brush.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
        }
    }
    impl_->rt->PopAxisAlignedClip();

    result = impl_->rt->EndDraw();
    if (FAILED(result)) return false;
    lift_plate_hit_alpha(
        static_cast<std::uint8_t*>(impl_->layered_bits),
        impl_->width,
        impl_->height,
        overflow,
        hit_w,
        hit_h);
    if (!wait_for_wallpaper || impl_->layered_bits == nullptr) {
        impl_->pixels.clear();
        return true;
    }
    const auto* source = static_cast<const std::uint8_t*>(impl_->layered_bits);
    impl_->pixels.resize(static_cast<std::size_t>(impl_->width) * static_cast<std::size_t>(impl_->height));
    for (int y = 0; y < impl_->height; ++y) {
        const auto* row = source + (static_cast<std::size_t>(y) * static_cast<std::size_t>(impl_->width) * 4);
        for (int x = 0; x < impl_->width; ++x) {
            const auto* bgra = row + (x * 4);
            impl_->pixels[(static_cast<std::size_t>(y) * static_cast<std::size_t>(impl_->width)) + static_cast<std::size_t>(x)] =
                Pixel{bgra[2], bgra[1], bgra[0], bgra[3]};
        }
    }
    return true;
#else
    static_cast<void>(title);
    static_cast<void>(body);
    static_cast<void>(visual);
    static_cast<void>(parts);
    static_cast<void>(hovered);
    static_cast<void>(wait_for_wallpaper);
    static_cast<void>(assistant_name);
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
    impl_->rt.Reset();
    impl_->background_bitmap.Reset();
    impl_->background_bitmap_path.clear();
    impl_->background_bitmap_sha.clear();
    impl_->background_bitmap_w = 0;
    impl_->background_bitmap_h = 0;
    impl_->release_layered();
    if (impl_->graphics_held) {
        release_shared_graphics();
        impl_->graphics_held = false;
    }
    if (impl_->com_initialized) { CoUninitialize(); impl_->com_initialized = false; }
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
