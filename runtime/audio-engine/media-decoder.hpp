#pragma once

#include "asset-cache.hpp"

#include <filesystem>
#include <string>

namespace notification_hub::audio_engine {

struct MediaDecodeResult {
    bool ok{};
    std::string code;
    std::string message;
    std::uint32_t sample_rate{};
    std::uint16_t channels{};
    std::vector<float> samples;
};

MediaDecodeResult decode_media_file(const std::filesystem::path& path);

} // namespace notification_hub::audio_engine
