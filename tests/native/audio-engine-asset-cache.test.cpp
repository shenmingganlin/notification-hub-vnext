#include "runtime/audio-engine/asset-cache.hpp"

#include <cassert>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <vector>

namespace {
void append16(std::vector<std::uint8_t>& bytes, std::uint16_t value) {
    bytes.push_back(static_cast<std::uint8_t>(value));
    bytes.push_back(static_cast<std::uint8_t>(value >> 8));
}
void append32(std::vector<std::uint8_t>& bytes, std::uint32_t value) {
    for (int i = 0; i < 4; ++i) bytes.push_back(static_cast<std::uint8_t>(value >> (i * 8)));
}
std::vector<std::uint8_t> wav() {
    std::vector<std::uint8_t> bytes;
    const std::vector<std::uint8_t> samples{0, 0, 0, 64, 0, 128, 0, 192};
    bytes.insert(bytes.end(), {'R', 'I', 'F', 'F'}); append32(bytes, 36 + samples.size()); bytes.insert(bytes.end(), {'W', 'A', 'V', 'E'});
    bytes.insert(bytes.end(), {'f', 'm', 't', ' '}); append32(bytes, 16); append16(bytes, 1); append16(bytes, 1); append32(bytes, 48000); append32(bytes, 96000); append16(bytes, 2); append16(bytes, 16);
    bytes.insert(bytes.end(), {'d', 'a', 't', 'a'}); append32(bytes, static_cast<std::uint32_t>(samples.size())); bytes.insert(bytes.end(), samples.begin(), samples.end());
    return bytes;
}
}

int main() {
    const auto path = std::filesystem::temp_directory_path() / "notification-hub-audio-engine-cache-test.wav";
    { std::ofstream output(path, std::ios::binary); const auto bytes = wav(); output.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size())); }
    notification_hub::audio_engine::AssetCache cache(1024, 1024);
    const auto loaded = cache.load("test.sound", path);
    assert(loaded.ok && loaded.asset);
    assert(loaded.asset->sample_rate == 48000 && loaded.asset->channels == 1);
    assert(loaded.asset->frame_count() == 4);
    assert(loaded.asset->samples[1] > 0.49f && loaded.asset->samples[2] < -0.99f);
    const auto again = cache.load("test.sound", path);
    assert(again.ok && again.asset == loaded.asset);
    assert(cache.size() == 1 && cache.cached_bytes() == loaded.asset->byte_size());
    assert(cache.unload("test.sound"));
    assert(!cache.find("test.sound"));
    std::filesystem::remove(path);
    return 0;
}
