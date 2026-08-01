#pragma once

#include <memory>
#include <string_view>

namespace notification_hub::scene {

class CardRenderer {
public:
    CardRenderer();
    ~CardRenderer();

    CardRenderer(const CardRenderer&) = delete;
    CardRenderer& operator=(const CardRenderer&) = delete;

    bool initialize(void* native_window, int width, int height);
    bool resize(int width, int height);
    bool draw(std::wstring_view title, std::wstring_view body);
    void reset() noexcept;
    bool is_ready() const noexcept;

private:
    struct Impl;
    bool create_composition_surface(int width, int height);
    std::unique_ptr<Impl> impl_;
};

}  // namespace notification_hub::scene
