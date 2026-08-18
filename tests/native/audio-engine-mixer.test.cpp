#include "runtime/audio-engine/mixer.hpp"

#include <cassert>
#include <cmath>
#include <memory>
#include <vector>

using notification_hub::audio_engine::Mixer;
using notification_hub::audio_engine::PcmAsset;

namespace {
std::shared_ptr<const PcmAsset> asset(const char* id, std::vector<float> samples, std::uint16_t channels = 1) {
    auto value = std::make_shared<PcmAsset>();
    value->sound_id = id;
    value->sample_rate = 48000;
    value->channels = channels;
    value->samples = std::move(samples);
    return value;
}
}

int main() {
    Mixer mixer(4);
    const auto first = mixer.play(asset("first", {0.25f, 0.5f, 0.75f}), "voice-a", 1.0f);
    const auto second = mixer.play(asset("second", {0.25f, 0.25f, 0.25f}), "voice-b", 0.5f);
    assert(first.ok && second.ok && first.voice_id != second.voice_id);
    std::vector<float> output(3);
    assert(mixer.mix(output.data(), 3, 1) == 3);
    assert(std::fabs(output[0] - 0.375f) < 0.0001f);
    assert(std::fabs(output[1] - 0.625f) < 0.0001f);
    assert(std::fabs(output[2] - 0.875f) < 0.0001f);
    const auto finished = mixer.collect_finished();
    assert(finished.size() == 2);
    assert(mixer.active_voice_count() == 0);

    const auto long_voice = mixer.play(asset("long", {0.1f, 0.2f, 0.3f, 0.4f}), "voice-c", 1.0f);
    assert(long_voice.ok);
    std::vector<float> short_output(2);
    mixer.mix(short_output.data(), 2, 1);
    assert(mixer.active_voice_count() == 1);
    assert(mixer.stop("voice-c").ok);
    assert(mixer.collect_finished().size() == 1);

    Mixer limited(1);
    assert(limited.play(asset("a", {0.1f}), "one", 1.0f).ok);
    assert(limited.play(asset("b", {0.1f}), "two", 1.0f).code == "AUDIO_VOICE_LIMIT_REACHED");
    return 0;
}
