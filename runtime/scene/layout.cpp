#include "layout.hpp"

#include <cmath>
#include <limits>
#include <string>
#include <utility>

namespace notification_hub::scene {
namespace {

StackLayoutResult failure(
    std::string code,
    std::string message,
    std::string card_id = {}) {
    return StackLayoutResult{false, std::move(code), std::move(message), std::move(card_id), {}};
}

int scale_logical(int value, float dpi_scale) {
    return static_cast<int>(std::lround(static_cast<float>(value) * dpi_scale));
}

bool anchor_is_right(StackAnchor anchor) {
    return anchor == StackAnchor::TopRight || anchor == StackAnchor::BottomRight;
}

bool anchor_is_bottom(StackAnchor anchor) {
    return anchor == StackAnchor::BottomLeft || anchor == StackAnchor::BottomRight;
}

bool placement_inside_work_area(const StackCardPlacement& placement, const StackLayoutOptions& options) {
    return placement.x >= 0
        && placement.y >= 0
        && placement.x <= options.work_area_width - placement.width
        && placement.y <= options.work_area_height - placement.height;
}

}  // namespace

StackLayoutResult layout_stack(
    const std::vector<StackCardInput>& cards,
    const StackLayoutOptions& options) {
    if (options.dpi_scale <= 0.0f || !std::isfinite(options.dpi_scale)) {
        return failure("LAYOUT_DPI_INVALID", "Stack layout DPI scale must be finite and greater than zero");
    }
    if (options.work_area_width <= 0 || options.work_area_height <= 0) {
        return failure("LAYOUT_WORK_AREA_INVALID", "Stack layout work area must have positive dimensions");
    }
    if (options.spacing < 0) {
        return failure("LAYOUT_SPACING_INVALID", "Stack layout spacing cannot be negative");
    }

    const auto spacing = scale_logical(options.spacing, options.dpi_scale);
    StackLayoutResult result{true, {}, {}, {}, {}};
    result.placements.reserve(cards.size());

    struct ScaledCard {
        const StackCardInput* input;
        int width;
        int height;
    };
    std::vector<ScaledCard> scaled_cards;
    scaled_cards.reserve(cards.size());
    const auto horizontal = options.direction == StackDirection::Right
        || options.direction == StackDirection::Left;
    long long total_extent = 0;
    for (const auto& card : cards) {
        if (card.width <= 0 || card.height <= 0) {
            return failure("LAYOUT_CARD_INVALID", "Stack card dimensions must be positive", card.id);
        }
        const auto width = scale_logical(card.width, options.dpi_scale);
        const auto height = scale_logical(card.height, options.dpi_scale);
        if (width <= 0 || height <= 0) {
            return failure("LAYOUT_CARD_INVALID", "Stack card dimensions must remain positive after DPI scaling", card.id);
        }
        scaled_cards.push_back(ScaledCard{&card, width, height});
        total_extent += horizontal ? width : height;
        if (scaled_cards.size() > 1) total_extent += spacing;
    }
    const auto work_extent = horizontal ? options.work_area_width : options.work_area_height;
    if (total_extent > work_extent) {
        const auto& failing_card = scaled_cards.empty() ? StackCardInput{} : *scaled_cards.back().input;
        return failure(
            "LAYOUT_CARD_OUT_OF_BOUNDS",
            "Stack cards exceed the work area extent",
            failing_card.id);
    }

    int cursor = 0;
    for (const auto& scaled : scaled_cards) {
        const auto& card = *scaled.input;
        const auto width = scaled.width;
        const auto height = scaled.height;
        if (card.width <= 0 || card.height <= 0) {
            return failure("LAYOUT_CARD_INVALID", "Stack card dimensions must be positive", card.id);
        }
        StackCardPlacement placement{card.id, 0, 0, width, height};
        if (horizontal) {
            if (options.direction == StackDirection::Right) {
                placement.x = anchor_is_right(options.anchor)
                    ? options.work_area_width - static_cast<int>(total_extent) + cursor
                    : cursor;
            } else {
                placement.x = anchor_is_right(options.anchor)
                    ? options.work_area_width - cursor - width
                    : static_cast<int>(total_extent) - cursor - width;
            }
            placement.y = anchor_is_bottom(options.anchor)
                ? options.work_area_height - height
                : 0;
            cursor += width + spacing;
        } else {
            placement.x = anchor_is_right(options.anchor)
                ? options.work_area_width - width
                : 0;
            if (options.direction == StackDirection::Down) {
                placement.y = anchor_is_bottom(options.anchor)
                    ? options.work_area_height - static_cast<int>(total_extent) + cursor
                    : cursor;
            } else {
                placement.y = anchor_is_bottom(options.anchor)
                    ? options.work_area_height - cursor - height
                    : static_cast<int>(total_extent) - cursor - height;
            }
            cursor += height + spacing;
        }

        if (!placement_inside_work_area(placement, options)) {
            return failure(
                "LAYOUT_CARD_OUT_OF_BOUNDS",
                "Stack card placement exceeds the work area",
                card.id);
        }
        placement.x += options.work_area_left;
        placement.y += options.work_area_top;
        result.placements.push_back(std::move(placement));
    }
    return result;
}

StackLayoutResult layout_shelf(
    const std::vector<StackCardInput>& cards,
    const StackLayoutOptions& options) {
    if (options.direction != StackDirection::Right && options.direction != StackDirection::Left) {
        return failure(
            "LAYOUT_SHELF_DIRECTION_INVALID",
            "Shelf layout direction must be right or left");
    }

    auto shelf_options = options;
    shelf_options.mode = LayoutMode::Shelf;
    auto result = layout_stack(cards, shelf_options);
    if (!result.ok && result.code == "LAYOUT_CARD_OUT_OF_BOUNDS") {
        result.code = "LAYOUT_SHELF_OUT_OF_BOUNDS";
        result.message = "Shelf cards exceed the work area width";
    }
    return result;
}

}  // namespace notification_hub::scene
