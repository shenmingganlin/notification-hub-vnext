#pragma once

#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace notification_hub::audio_engine {

struct PcmAsset {
    std::string sound_id;
    std::uint32_t sample_rate{};
    std::uint16_t channels{};
    std::uint16_t bits_per_sample{};
    std::vector<float> samples;
    std::uint64_t fingerprint{};

    std::uint64_t frame_count() const noexcept {
        return channels == 0 ? 0 : samples.size() / channels;
    }
    std::size_t byte_size() const noexcept { return samples.size() * sizeof(float); }
};

struct CacheResult {
    bool ok{};
    std::string code;
    std::string message;
    std::shared_ptr<const PcmAsset> asset;
};

class AssetCache {
public:
    explicit AssetCache(std::size_t max_cached_bytes = 64u * 1024u * 1024u,
                        std::size_t max_asset_bytes = 16u * 1024u * 1024u);

    CacheResult load(const std::string& sound_id, const std::filesystem::path& path);
    CacheResult load_decoded(const std::string& sound_id, std::uint32_t sample_rate, std::uint16_t channels, std::vector<float> samples, std::uint64_t source_fingerprint = 0);
    std::shared_ptr<const PcmAsset> find(const std::string& sound_id) const;
    bool unload(const std::string& sound_id);
    void clear();
    std::size_t cached_bytes() const noexcept { return cached_bytes_; }
    std::size_t size() const noexcept { return assets_.size(); }

private:
    std::size_t max_cached_bytes_;
    std::size_t max_asset_bytes_;
    std::size_t cached_bytes_{};
    std::unordered_map<std::string, std::shared_ptr<const PcmAsset>> assets_;
};

}  // namespace notification_hub::audio_engine
