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
    assert(!output.current_device_id().empty());
    const auto first_device = output.current_device_id();
    output.request_reopen();
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(1500);
    while (std::chrono::steady_clock::now() < deadline) {
        if (output.available() && output.current_device_id() == first_device && output.buffer_frames() > 0) break;
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    assert(output.available());
    assert(output.buffer_frames() > 0);
    assert(output.current_device_id() == first_device);
    output.stop();
    assert(!output.running());
    assert(output.current_device_id().empty());
#else
    assert(!started);
    assert(!error.empty());
    std::cerr << "ENVIRONMENT_UNAVAILABLE: WASAPI is only available on Windows\n";
    return kEnvironmentUnavailable;
#endif
    return 0;
}
