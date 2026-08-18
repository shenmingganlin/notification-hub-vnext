#pragma once

#include "asset-cache.hpp"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace notification_hub::audio_engine {

struct Voice {
    std::string voice_id;
    std::string sound_id;
    std::shared_ptr<const PcmAsset> asset;
    std::uint64_t frame_position{};
    float volume{1.0f};
};

struct VoiceFinished {
    std::string voice_id;
    std::string sound_id;
    std::string reason;
};

struct MixerResult {
    bool ok{};
    std::string code;
    std::string message;
    std::string voice_id;
};

class Mixer {
public:
    explicit Mixer(std::size_t max_active_voices = 256);

    MixerResult play(std::shared_ptr<const PcmAsset> asset, std::string voice_id, float volume);
    MixerResult stop(const std::string& voice_id);
    std::size_t mix(float* output, std::size_t frames, std::uint32_t output_channels);
    std::vector<VoiceFinished> collect_finished();
    std::size_t active_voice_count() const noexcept { return voices_.size(); }

private:
    std::size_t max_active_voices_;
    std::unordered_map<std::string, Voice> voices_;
    std::vector<VoiceFinished> finished_;
};

}  // namespace notification_hub::audio_engine
