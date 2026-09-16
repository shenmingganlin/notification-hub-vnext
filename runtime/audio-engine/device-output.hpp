#pragma once

#include "mixer.hpp"

#include <atomic>
#include <cstddef>
#include <memory>
#include <string>
#include <thread>

namespace notification_hub::audio_engine {

class DeviceOutput {
public:
    DeviceOutput();
    ~DeviceOutput();

    bool start(Mixer& mixer, std::string& error);
    void stop();
    bool available() const noexcept;
    bool running() const noexcept;
    std::size_t buffer_frames() const noexcept;
    std::string last_error() const;
    std::string current_device_id() const;
    void request_reopen();

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace notification_hub::audio_engine
