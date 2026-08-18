#pragma once

#include "wav_pcm.hpp"
#include <memory>
#include <string>

namespace notification_hub::audio {

class WasapiOutput {
public:
    WasapiOutput();
    ~WasapiOutput();
    bool start(std::string& error);
    void stop();
    bool play(const PcmAsset& asset, float volume, std::string& error);
    bool available() const noexcept;
private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace notification_hub::audio
