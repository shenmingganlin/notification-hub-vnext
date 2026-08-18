#include "mixer.hpp"

#include <algorithm>
#include <cmath>
#include <utility>

namespace notification_hub::audio_engine {
namespace {
MixerResult fail(std::string code, std::string message) { return {false, std::move(code), std::move(message), {}}; }
float clamp_volume(float value) { return std::max(0.0f, std::min(1.0f, value)); }
}

Mixer::Mixer(std::size_t max_active_voices) : max_active_voices_(max_active_voices) {}

MixerResult Mixer::play(std::shared_ptr<const PcmAsset> asset, std::string voice_id, float volume) {
    if (!asset || asset->channels == 0 || asset->samples.empty()) return fail("AUDIO_ASSET_NOT_LOADED", "PCM asset is not loaded");
    if (voice_id.empty()) return fail("AUDIO_VOICE_ID_INVALID", "voice_id must not be empty");
    if (!std::isfinite(volume) || volume < 0.0f || volume > 1.0f) return fail("AUDIO_VOLUME_INVALID", "volume must be between 0 and 1");
    if (voices_.contains(voice_id)) return fail("AUDIO_VOICE_ID_CONFLICT", "voice_id is already active");
    if (voices_.size() >= max_active_voices_) return fail("AUDIO_VOICE_LIMIT_REACHED", "active voice limit reached");
    const auto accepted_id = voice_id;
    voices_.emplace(accepted_id, Voice{accepted_id, asset->sound_id, std::move(asset), 0, volume});
    return {true, {}, {}, accepted_id};
}

MixerResult Mixer::stop(const std::string& voice_id) {
    const auto it = voices_.find(voice_id);
    if (it == voices_.end()) return fail("AUDIO_VOICE_NOT_FOUND", "voice_id is not active");
    finished_.push_back({it->second.voice_id, it->second.sound_id, "stopped"});
    voices_.erase(it);
    return {true, {}, {}, voice_id};
}

std::size_t Mixer::mix(float* output, std::size_t frames, std::uint32_t output_channels) {
    if (!output || output_channels == 0 || frames == 0) return 0;
    std::fill(output, output + frames * output_channels, 0.0f);
    std::vector<std::string> completed;
    std::size_t mixed_frames = 0;
    for (auto& [voice_id, voice] : voices_) {
        const auto source_channels = voice.asset->channels;
        const auto available = static_cast<std::size_t>(voice.asset->frame_count() - voice.frame_position);
        const auto count = std::min(frames, available);
        for (std::size_t frame = 0; frame < count; ++frame) {
            for (std::uint32_t channel = 0; channel < output_channels; ++channel) {
                const auto source_channel = std::min<std::uint32_t>(channel, source_channels - 1);
                output[frame * output_channels + channel] += voice.asset->samples[(voice.frame_position + frame) * source_channels + source_channel] * voice.volume;
            }
        }
        voice.frame_position += count;
        mixed_frames = std::max(mixed_frames, count);
        if (voice.frame_position >= voice.asset->frame_count()) completed.push_back(voice_id);
    }
    for (const auto& voice_id : completed) {
        const auto it = voices_.find(voice_id);
        if (it == voices_.end()) continue;
        finished_.push_back({it->second.voice_id, it->second.sound_id, "completed"});
        voices_.erase(it);
    }
    for (std::size_t index = 0; index < frames * output_channels; ++index) {
        output[index] = std::max(-1.0f, std::min(1.0f, output[index]));
    }
    return mixed_frames;
}

std::vector<VoiceFinished> Mixer::collect_finished() {
    auto result = std::move(finished_);
    finished_.clear();
    return result;
}

}  // namespace notification_hub::audio_engine
