#pragma once

#include <cstdint>
#include <span>
#include <string>
#include <vector>

namespace notification_hub::audio {

struct PcmFormat {
    std::uint16_t channels{};
    std::uint32_t sample_rate{};
    std::uint16_t bits_per_sample{};
    std::uint16_t block_align{};
};

struct PcmAsset {
    PcmFormat format;
    std::vector<std::uint8_t> samples;
};

struct WavResult {
    bool ok{};
    PcmAsset asset;
    std::string code;
    std::string message;
};

WavResult parse_wav_pcm(std::span<const std::uint8_t> bytes);

}  // namespace notification_hub::audio
