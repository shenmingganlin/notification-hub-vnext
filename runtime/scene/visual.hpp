#pragma once

#include <string>
#include <string_view>

namespace notification_hub::scene {

struct VisualStyle {
    bool specified{};
    bool enabled{true};
    std::string preset{"minimal"};
    std::string intensity{"balanced"};
    std::string category;
    std::string card_type{"minimal"};
    std::string layout{"simple"};
    std::string boundary{"work-area"};
    std::string size{"medium"};
    std::string aspect_ratio{"default"};
    std::string background_color{"#0e1916"};
    int border_radius{16};
    float opacity{0.96f};
};

inline bool valid_visual_style(const VisualStyle& style) {
    if (!style.specified) return true;
    if (style.preset != "minimal" && style.preset != "soft" && style.preset != "accent"
        && style.preset != "warning" && style.preset != "critical") return false;
    if (style.intensity != "reduced" && style.intensity != "balanced" && style.intensity != "expressive") return false;
    if (!style.category.empty()
        && style.category != "chat" && style.category != "channel" && style.category != "tool"
        && style.category != "error" && style.category != "plugin" && style.category != "model_service") return false;
    if (style.card_type != "minimal") return false;
    if (style.layout != "simple" || style.boundary != "work-area") return false;
    if (style.size != "small" && style.size != "medium" && style.size != "large") return false;
    if (style.aspect_ratio != "default" && style.aspect_ratio != "square" && style.aspect_ratio != "wide") return false;
    if (style.background_color.size() != 7 || style.background_color[0] != '#') return false;
    for (std::size_t index = 1; index < style.background_color.size(); ++index) {
        const auto c = style.background_color[index];
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
    }
    if (style.border_radius < 0 || style.border_radius > 48) return false;
    if (style.opacity < 0.3f || style.opacity > 1.0f) return false;
    return true;
}

}  // namespace notification_hub::scene
