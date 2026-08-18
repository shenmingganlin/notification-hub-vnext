#include "runtime/audio-engine/asset-cache.hpp"
#include "runtime/audio-engine/device-output.hpp"
#include "runtime/audio-engine/mixer.hpp"

#include <cassert>
#include <chrono>
#include <thread>

int main() {
    notification_hub::audio_engine::Mixer mixer;
    notification_hub::audio_engine::DeviceOutput output;
    std::string error;
    const bool started = output.start(mixer, error);
#ifdef _WIN32
    if (!started) return 0; // A headless/disabled audio device is an environment result, not a compile failure.
    assert(output.available());
    assert(output.buffer_frames() > 0);
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
    output.stop();
    assert(!output.running());
#else
    assert(!started);
    assert(!error.empty());
#endif
    return 0;
}
