#include "runtime/audio-engine/asset-cache.hpp"
#include "runtime/audio-engine/device-output.hpp"
#include "runtime/audio-engine/mixer.hpp"

#include <cassert>
#include <chrono>
#include <iostream>
#include <thread>

namespace {
constexpr int kEnvironmentUnavailable = 77;
}

int main() {
    notification_hub::audio_engine::Mixer mixer;
    notification_hub::audio_engine::DeviceOutput output;
    std::string error;
    const bool started = output.start(mixer, error);
#ifdef _WIN32
    if (!started) {
        std::cerr << "ENVIRONMENT_UNAVAILABLE: default audio output device is unavailable"
                  << (error.empty() ? "" : ": " + error) << "\n";
        return kEnvironmentUnavailable;
    }
    assert(output.available());
    assert(output.buffer_frames() > 0);
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
    output.stop();
    assert(!output.running());
#else
    assert(!started);
    assert(!error.empty());
    std::cerr << "ENVIRONMENT_UNAVAILABLE: WASAPI is only available on Windows\n";
    return kEnvironmentUnavailable;
#endif
    return 0;
}
