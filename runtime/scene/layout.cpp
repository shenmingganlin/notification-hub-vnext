#include "layout.hpp"

#include <algorithm>
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

bool anchor_is_right(StackAnchor anchor) {
    return anchor == StackAnchor::TopRight || anchor == StackAnchor::BottomRight;
}

bool anchor_is_bottom(StackAnchor anchor) {
    return anchor == StackAnchor::BottomLeft || anchor == StackAnchor::BottomRight;
}

StackDirection opposite_direction(StackDirection direction) {
    if (direction == StackDirection::Down) return StackDirection::Up;
    if (direction == StackDirection::Up) return StackDirection::Down;
    if (direction == StackDirection::Right) return StackDirection::Left;
    return StackDirection::Right;
}

StackAnchor flip_primary_anchor(StackAnchor anchor, bool horizontal) {
    if (horizontal) {
        if (anchor == StackAnchor::TopLeft) return StackAnchor::TopRight;
        if (anchor == StackAnchor::TopRight) return StackAnchor::TopLeft;
        if (anchor == StackAnchor::BottomLeft) return StackAnchor::BottomRight;
        return StackAnchor::BottomLeft;
    }
    if (anchor == StackAnchor::TopLeft) return StackAnchor::BottomLeft;
    if (anchor == StackAnchor::TopRight) return StackAnchor::BottomRight;
    if (anchor == StackAnchor::BottomLeft) return StackAnchor::TopLeft;
    return StackAnchor::TopRight;
}

bool placement_inside_work_area(const StackCardPlacement& placement, const StackLayoutOptions& options) {
    return placement.x >= 0
        && placement.y >= 0
        && placement.x <= options.work_area_width - placement.width
        && placement.y <= options.work_area_height - placement.height;
}

}  // namespace

namespace {

StackLayoutResult layout_linear(
    const std::vector<StackCardInput>& cards,
    const StackLayoutOptions& options,
    LayoutMode mode) {
    const bool shelf = mode == LayoutMode::Shelf;
    if (shelf && options.direction != StackDirection::Right && options.direction != StackDirection::Left) {
        return failure(
            "LAYOUT_SHELF_DIRECTION_INVALID",
            "Shelf layout direction must be right or left");
    }
    if (options.dpi_scale <= 0.0f || !std::isfinite(options.dpi_scale)) {
        return failure(
            "LAYOUT_DPI_INVALID",
            shelf
                ? "Shelf layout DPI scale must be finite and greater than zero"
                : "Stack layout DPI scale must be finite and greater than zero");
    }
    if (options.work_area_width <= 0 || options.work_area_height <= 0) {
        return failure(
            "LAYOUT_WORK_AREA_INVALID",
            shelf
                ? "Shelf layout work area must have positive dimensions"
                : "Stack layout work area must have positive dimensions");
    }
    if (options.spacing < 0) {
        return failure(
            "LAYOUT_SPACING_INVALID",
            shelf
                ? "Shelf layout spacing cannot be negative"
                : "Stack layout spacing cannot be negative");
    }
    if (options.margin_left < 0 || options.margin_right < 0
        || options.margin_top < 0 || options.margin_bottom < 0) {
        return failure(
            "LAYOUT_MARGIN_INVALID",
            shelf
                ? "Shelf layout margins cannot be negative"
                : "Stack layout margins cannot be negative");
    }
    if (options.margin_left + options.margin_right >= options.work_area_width
        || options.margin_top + options.margin_bottom >= options.work_area_height) {
        return failure(
            "LAYOUT_WORK_AREA_INVALID",
            shelf
                ? "Shelf layout work area must have positive dimensions"
                : "Stack layout work area must have positive dimensions");
    }

    StackLayoutOptions area = options;
    area.work_area_width = options.work_area_width - options.margin_left - options.margin_right;
    area.work_area_height = options.work_area_height - options.margin_top - options.margin_bottom;
    area.work_area_left = options.work_area_left + options.margin_left;
    area.work_area_top = options.work_area_top + options.margin_top;

    // Work-area and card geometry are already physical pixels under the
    // Runtime's Per-Monitor V2 contract. DPI remains metadata for the
    // provider snapshot and must not scale geometry a second time.
    const auto spacing = area.spacing;
    StackLayoutResult result{true, {}, {}, {}, {}};
    result.placements.reserve(cards.size());

    std::vector<const StackCardInput*> scaled_cards;
    scaled_cards.reserve(cards.size());
    const auto horizontal = shelf || area.direction == StackDirection::Right
        || area.direction == StackDirection::Left;
    long long total_extent = 0;
    for (const auto& card : cards) {
        if (card.width <= 0 || card.height <= 0) {
            return failure(
                "LAYOUT_CARD_INVALID",
                shelf ? "Shelf card dimensions must be positive" : "Stack card dimensions must be positive",
                card.id);
        }
        scaled_cards.push_back(&card);
        total_extent += horizontal ? card.width : card.height;
        if (scaled_cards.size() > 1) total_extent += spacing;
    }
    const auto work_extent = horizontal ? area.work_area_width : area.work_area_height;
    if (total_extent > work_extent) {
        const auto& failing_card = scaled_cards.empty() ? StackCardInput{} : *scaled_cards.back();
        return failure(
            shelf ? "LAYOUT_SHELF_OUT_OF_BOUNDS" : "LAYOUT_CARD_OUT_OF_BOUNDS",
            shelf ? "Shelf cards exceed the work area width" : "Stack cards exceed the work area extent",
            failing_card.id);
    }

    int cursor = 0;
    for (const auto* card_input : scaled_cards) {
        const auto& card = *card_input;
        const auto width = card.width;
        const auto height = card.height;
        StackCardPlacement placement{card.id, 0, 0, width, height};
        if (horizontal) {
            if (area.direction == StackDirection::Right) {
                placement.x = anchor_is_right(area.anchor)
                    ? area.work_area_width - static_cast<int>(total_extent) + cursor
                    : cursor;
            } else {
                placement.x = anchor_is_right(area.anchor)
                    ? area.work_area_width - cursor - width
                    : static_cast<int>(total_extent) - cursor - width;
            }
            placement.y = anchor_is_bottom(area.anchor)
                ? area.work_area_height - height
                : 0;
            cursor += width + spacing;
        } else {
            placement.x = anchor_is_right(area.anchor)
                ? area.work_area_width - width
                : 0;
            if (area.direction == StackDirection::Down) {
                placement.y = anchor_is_bottom(area.anchor)
                    ? area.work_area_height - static_cast<int>(total_extent) + cursor
                    : cursor;
            } else {
                placement.y = anchor_is_bottom(area.anchor)
                    ? area.work_area_height - cursor - height
                    : static_cast<int>(total_extent) - cursor - height;
            }
            cursor += height + spacing;
        }

        if (!placement_inside_work_area(placement, area)) {
            return failure(
                shelf ? "LAYOUT_SHELF_OUT_OF_BOUNDS" : "LAYOUT_CARD_OUT_OF_BOUNDS",
                shelf ? "Shelf card placement exceeds the work area" : "Stack card placement exceeds the work area",
                card.id);
        }
        placement.x += area.work_area_left;
        placement.y += area.work_area_top;
        result.placements.push_back(std::move(placement));
    }
    return result;
}

StackLayoutResult layout_snake_wrap(
    const std::vector<StackCardInput>& cards,
    const StackLayoutOptions& options,
    const StackLayoutResult& fitted) {
    StackLayoutOptions inner = options;
    inner.work_area_width = options.work_area_width - options.margin_left - options.margin_right;
    inner.work_area_height = options.work_area_height - options.margin_top - options.margin_bottom;
    inner.work_area_left = options.work_area_left + options.margin_left;
    inner.work_area_top = options.work_area_top + options.margin_top;
    if (inner.work_area_width <= 0 || inner.work_area_height <= 0) return fitted;

    const bool horizontal = options.direction == StackDirection::Right
        || options.direction == StackDirection::Left;
    const int primary_work = horizontal ? inner.work_area_width : inner.work_area_height;
    const int cross_work = horizontal ? inner.work_area_height : inner.work_area_width;
    const int spacing = options.spacing;

    struct Run {
        std::vector<StackCardInput> items;
        int cross{};
    };
    std::vector<Run> runs;
    int index = 0;
    const int count = static_cast<int>(cards.size());
    while (index < count) {
        Run run;
        int used = 0;
        while (index < count) {
            const auto& card = cards[static_cast<std::size_t>(index)];
            const int extent = horizontal ? card.width : card.height;
            const int cross = horizontal ? card.height : card.width;
            const int need = run.items.empty() ? extent : used + spacing + extent;
            if (need > primary_work) break;
            run.items.push_back(card);
            used = need;
            run.cross = std::max(run.cross, cross);
            index += 1;
        }
        if (run.items.empty()) return fitted;
        runs.push_back(std::move(run));
    }

    long long wrap_used = 0;
    for (std::size_t i = 0; i < runs.size(); ++i) {
        if (i > 0) wrap_used += spacing;
        wrap_used += runs[i].cross;
    }
    if (wrap_used > cross_work) return fitted;

    const bool wrap_from_right = !horizontal && anchor_is_right(options.anchor);
    const bool wrap_from_bottom = horizontal && anchor_is_bottom(options.anchor);
    int wrap_cursor = 0;
    StackLayoutResult result{true, {}, {}, {}, {}};
    result.placements.reserve(cards.size());
    for (std::size_t i = 0; i < runs.size(); ++i) {
        const auto& run = runs[i];
        const bool reverse = (i % 2) == 1;
        StackLayoutOptions run_options = options;
        run_options.margin_left = 0;
        run_options.margin_right = 0;
        run_options.margin_top = 0;
        run_options.margin_bottom = 0;
        run_options.spacing = spacing;
        run_options.dpi_scale = options.dpi_scale;
        run_options.direction = reverse ? opposite_direction(options.direction) : options.direction;
        run_options.anchor = reverse ? flip_primary_anchor(options.anchor, horizontal) : options.anchor;
        run_options.wrap = StackWrap::Off;
        if (horizontal) {
            run_options.work_area_width = inner.work_area_width;
            run_options.work_area_height = run.cross;
            run_options.work_area_left = inner.work_area_left;
            run_options.work_area_top = wrap_from_bottom
                ? inner.work_area_top + inner.work_area_height - wrap_cursor - run.cross
                : inner.work_area_top + wrap_cursor;
        } else {
            run_options.work_area_width = run.cross;
            run_options.work_area_height = inner.work_area_height;
            run_options.work_area_left = wrap_from_right
                ? inner.work_area_left + inner.work_area_width - wrap_cursor - run.cross
                : inner.work_area_left + wrap_cursor;
            run_options.work_area_top = inner.work_area_top;
        }
        const auto part = layout_linear(run.items, run_options, LayoutMode::Stack);
        if (!part.ok) return part;
        for (auto& placement : part.placements) result.placements.push_back(std::move(placement));
        wrap_cursor += run.cross + spacing;
    }
    return result;
}

enum class CoilHug {
    Left,
    Right,
    Top,
    Bottom
};

StackDirection coil_wrap_axis(StackAnchor anchor, StackDirection grow) {
    if (grow == StackDirection::Up || grow == StackDirection::Down) {
        return anchor_is_right(anchor) ? StackDirection::Left : StackDirection::Right;
    }
    return anchor_is_bottom(anchor) ? StackDirection::Up : StackDirection::Down;
}

CoilHug coil_hug_from_anchor_grow(StackAnchor anchor, StackDirection grow) {
    if (grow == StackDirection::Up || grow == StackDirection::Down) {
        return anchor_is_right(anchor) ? CoilHug::Right : CoilHug::Left;
    }
    return anchor_is_bottom(anchor) ? CoilHug::Bottom : CoilHug::Top;
}

CoilHug coil_far_hug(StackDirection dir) {
    if (dir == StackDirection::Down) return CoilHug::Bottom;
    if (dir == StackDirection::Up) return CoilHug::Top;
    if (dir == StackDirection::Right) return CoilHug::Right;
    return CoilHug::Left;
}

void coil_shrink_rect(int& left, int& top, int& width, int& height, CoilHug hug, int consume) {
    if (hug == CoilHug::Left) {
        left += consume;
        width -= consume;
        return;
    }
    if (hug == CoilHug::Right) {
        width -= consume;
        return;
    }
    if (hug == CoilHug::Top) {
        top += consume;
        height -= consume;
        return;
    }
    height -= consume;
}

StackLayoutResult layout_coil_wrap(
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
    if (options.margin_left < 0 || options.margin_right < 0
        || options.margin_top < 0 || options.margin_bottom < 0) {
        return failure("LAYOUT_MARGIN_INVALID", "Stack layout margins cannot be negative");
    }
    if (options.margin_left + options.margin_right >= options.work_area_width
        || options.margin_top + options.margin_bottom >= options.work_area_height) {
        return failure("LAYOUT_WORK_AREA_INVALID", "Stack layout work area must have positive dimensions");
    }

    int left = options.margin_left;
    int top = options.margin_top;
    int width = options.work_area_width - options.margin_left - options.margin_right;
    int height = options.work_area_height - options.margin_top - options.margin_bottom;
    if (width <= 0 || height <= 0) {
        return failure("LAYOUT_WORK_AREA_INVALID", "Stack layout work area must have positive dimensions");
    }

    const StackDirection grow = options.newest == StackNewest::Next
        ? options.direction
        : opposite_direction(options.direction);
    const StackDirection wrap_axis = coil_wrap_axis(options.anchor, grow);
    const StackDirection dirs[4] = {
        grow,
        wrap_axis,
        opposite_direction(grow),
        opposite_direction(wrap_axis)
    };
    CoilHug hug = coil_hug_from_anchor_grow(options.anchor, grow);
    const int spacing = options.spacing;
    const int count = static_cast<int>(cards.size());
    const bool newest_first = options.newest != StackNewest::Next;

    auto card_at = [&](int packed_index) -> const StackCardInput& {
        const int source = newest_first ? (count - 1 - packed_index) : packed_index;
        return cards[static_cast<std::size_t>(source)];
    };

    StackLayoutResult result{true, {}, {}, {}, {}};
    result.placements.reserve(cards.size());
    int packed = 0;
    int dir_index = 0;
    while (packed < count) {
        const StackDirection dir = dirs[dir_index % 4];
        const bool horizontal = dir == StackDirection::Left || dir == StackDirection::Right;
        const int span = horizontal ? width : height;
        std::vector<int> run;
        int used = 0;
        int cross = 0;
        while (packed + static_cast<int>(run.size()) < count) {
            const auto& card = card_at(packed + static_cast<int>(run.size()));
            const int extent = horizontal ? card.width : card.height;
            const int need = run.empty() ? extent : used + spacing + extent;
            if (need > span) break;
            run.push_back(packed + static_cast<int>(run.size()));
            used = need;
            cross = std::max(cross, horizontal ? card.height : card.width);
        }
        if (run.empty()) {
            const auto& failing = card_at(packed);
            return failure("LAYOUT_CARD_OUT_OF_BOUNDS", "Card does not fit in work area", failing.id);
        }
        int cursor = 0;
        if (dir == StackDirection::Down) cursor = top;
        else if (dir == StackDirection::Up) cursor = top + height;
        else if (dir == StackDirection::Right) cursor = left;
        else cursor = left + width;
        for (int packed_index : run) {
            const auto& card = card_at(packed_index);
            StackCardPlacement placement;
            placement.id = card.id;
            placement.width = card.width;
            placement.height = card.height;
            if (dir == StackDirection::Down) {
                placement.y = cursor;
                cursor += card.height + spacing;
            } else if (dir == StackDirection::Up) {
                placement.y = cursor - card.height;
                cursor = placement.y - spacing;
            } else if (dir == StackDirection::Right) {
                placement.x = cursor;
                cursor += card.width + spacing;
            } else {
                placement.x = cursor - card.width;
                cursor = placement.x - spacing;
            }
            if (horizontal) {
                placement.y = hug == CoilHug::Bottom ? top + height - card.height : top;
            } else {
                placement.x = hug == CoilHug::Right ? left + width - card.width : left;
            }
            if (!placement_inside_work_area(placement, options)) {
                return failure("LAYOUT_CARD_OUT_OF_BOUNDS", "Card does not fit in work area", card.id);
            }
            placement.x += options.work_area_left;
            placement.y += options.work_area_top;
            result.placements.push_back(std::move(placement));
        }
        packed += static_cast<int>(run.size());
        if (packed >= count) break;
        coil_shrink_rect(left, top, width, height, hug, cross + spacing);
        hug = coil_far_hug(dir);
        dir_index += 1;
    }
    return result;
}

}  // namespace

StackLayoutResult layout_stack(
    const std::vector<StackCardInput>& cards,
    const StackLayoutOptions& options) {
    if (options.wrap == StackWrap::Coil) {
        return layout_coil_wrap(cards, options);
    }
    const auto fitted = layout_linear(cards, options, LayoutMode::Stack);
    if (options.wrap == StackWrap::Off) return fitted;
    if (fitted.ok || fitted.code != "LAYOUT_CARD_OUT_OF_BOUNDS" || cards.empty()) {
        return fitted;
    }
    if (options.wrap == StackWrap::Snake) {
        return layout_snake_wrap(cards, options, fitted);
    }

    StackLayoutOptions inner = options;
    inner.work_area_width = options.work_area_width - options.margin_left - options.margin_right;
    inner.work_area_height = options.work_area_height - options.margin_top - options.margin_bottom;
    inner.work_area_left = options.work_area_left + options.margin_left;
    inner.work_area_top = options.work_area_top + options.margin_top;
    if (inner.work_area_width <= 0 || inner.work_area_height <= 0) return fitted;

    const bool horizontal = options.direction == StackDirection::Right
        || options.direction == StackDirection::Left;
    const int primary_work = horizontal ? inner.work_area_width : inner.work_area_height;
    const int cross_work = horizontal ? inner.work_area_height : inner.work_area_width;
    const int spacing = options.spacing;

    struct Column {
        std::vector<StackCardInput> items;
        int cross{};
    };
    std::vector<Column> columns;
    int index = static_cast<int>(cards.size()) - 1;
    while (index >= 0) {
        Column column;
        int used = 0;
        while (index >= 0) {
            const auto& card = cards[static_cast<std::size_t>(index)];
            const int extent = horizontal ? card.width : card.height;
            const int cross = horizontal ? card.height : card.width;
            const int need = column.items.empty() ? extent : used + spacing + extent;
            if (need > primary_work) break;
            column.items.insert(column.items.begin(), card);
            used = need;
            column.cross = std::max(column.cross, cross);
            index -= 1;
        }
        if (column.items.empty()) return fitted;
        columns.push_back(std::move(column));
    }

    long long wrap_used = 0;
    for (std::size_t i = 0; i < columns.size(); ++i) {
        if (i > 0) wrap_used += spacing;
        wrap_used += columns[i].cross;
    }
    if (wrap_used > cross_work) return fitted;

    const bool wrap_from_right = !horizontal && anchor_is_right(options.anchor);
    const bool wrap_from_bottom = horizontal && anchor_is_bottom(options.anchor);
    int wrap_cursor = 0;
    StackLayoutResult result{true, {}, {}, {}, {}};
    result.placements.reserve(cards.size());
    for (const auto& column : columns) {
        StackLayoutOptions column_options = options;
        column_options.margin_left = 0;
        column_options.margin_right = 0;
        column_options.margin_top = 0;
        column_options.margin_bottom = 0;
        column_options.spacing = spacing;
        column_options.dpi_scale = options.dpi_scale;
        column_options.direction = options.direction;
        column_options.anchor = options.anchor;
        if (horizontal) {
            column_options.work_area_width = inner.work_area_width;
            column_options.work_area_height = column.cross;
            column_options.work_area_left = inner.work_area_left;
            column_options.work_area_top = wrap_from_bottom
                ? inner.work_area_top + inner.work_area_height - wrap_cursor - column.cross
                : inner.work_area_top + wrap_cursor;
        } else {
            column_options.work_area_width = column.cross;
            column_options.work_area_height = inner.work_area_height;
            column_options.work_area_left = wrap_from_right
                ? inner.work_area_left + inner.work_area_width - wrap_cursor - column.cross
                : inner.work_area_left + wrap_cursor;
            column_options.work_area_top = inner.work_area_top;
        }
        const auto part = layout_linear(column.items, column_options, LayoutMode::Stack);
        if (!part.ok) return part;
        for (auto& placement : part.placements) result.placements.push_back(std::move(placement));
        wrap_cursor += column.cross + spacing;
    }
    return result;
}

StackLayoutResult layout_shelf(
    const std::vector<StackCardInput>& cards,
    const StackLayoutOptions& options) {
    return layout_linear(cards, options, LayoutMode::Shelf);
}

}  // namespace notification_hub::scene
