#include "asset-cache.hpp"

#include "../audio-service/wav_pcm.hpp"

#include <fstream>
#include <iterator>
#include <limits>
#include <utility>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace notification_hub::audio_engine {
namespace {
CacheResult fail(std::string code, std::string message) { return {false, std::move(code), std::move(message), nullptr}; }

std::filesystem::path utf8_path(const std::string& value) {
#ifdef _WIN32
    if (value.empty()) return {};
    const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
    if (length <= 0) return std::filesystem::path(value);
    std::wstring wide(static_cast<std::size_t>(length), L'\\0');
    if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), wide.data(), length) <= 0) return std::filesystem::path(value);
    return std::filesystem::path(std::move(wide));
#else
    return std::filesystem::path(value);
#endif
}

std::uint64_t fingerprint(const std::vector<std::uint8_t>& bytes) {
    // FNV-1a is used only to detect a changed cache source, not for security.
    std::uint64_t hash = 1469598103934665603ull;
    for (const auto byte : bytes) {
        hash ^= byte;
        hash *= 1099511628211ull;
    }
    return hash;
}

std::vector<float> to_float(const notification_hub::audio::PcmAsset& source) {
    const auto bytes_per_sample = source.format.bits_per_sample == 24 ? 3u : 2u;
    const auto count = source.samples.size() / bytes_per_sample;
    std::vector<float> samples(count);
    for (std::size_t index = 0; index < count; ++index) {
        const auto offset = index * bytes_per_sample;
        if (bytes_per_sample == 3u) {
            std::int32_t value = static_cast<std::int32_t>(source.samples[offset]) |
                (static_cast<std::int32_t>(source.samples[offset + 1]) << 8) |
                (static_cast<std::int32_t>(source.samples[offset + 2]) << 16);
            if ((value & 0x00800000) != 0) value |= static_cast<std::int32_t>(0xff000000);
            samples[index] = static_cast<float>(value) / 8388608.0f;
        } else {
            const auto value = static_cast<std::int16_t>(static_cast<std::uint16_t>(source.samples[offset]) |
                (static_cast<std::uint16_t>(source.samples[offset + 1]) << 8));
            samples[index] = static_cast<float>(value) / 32768.0f;
        }
    }
    return samples;
}
}

AssetCache::AssetCache(std::size_t max_cached_bytes, std::size_t max_asset_bytes)
    : max_cached_bytes_(max_cached_bytes), max_asset_bytes_(max_asset_bytes) {}

CacheResult AssetCache::load(const std::string& sound_id, const std::filesystem::path& path) {
    if (sound_id.empty()) return fail("AUDIO_SOUND_ID_INVALID", "sound_id must not be empty");
    const auto path_text = path.string();
    const auto resolved_path = utf8_path(path_text);
    std::ifstream input(resolved_path, std::ios::binary);
    if (!input) return fail("AUDIO_ASSET_OPEN_FAILED", "audio asset could not be opened: " + path_text);
    std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
    if (bytes.empty()) return fail("AUDIO_ASSET_EMPTY", "audio asset is empty");
    const auto parsed = notification_hub::audio::parse_wav_pcm(bytes);
    if (!parsed.ok) return fail(parsed.code, parsed.message);
    const auto bytes_per_sample = parsed.asset.format.bits_per_sample == 24 ? 3u : 2u;
    const auto float_bytes = parsed.asset.samples.size() / bytes_per_sample * sizeof(float);
    if (float_bytes > max_asset_bytes_) return fail("AUDIO_ASSET_LIMIT_REACHED", "audio asset exceeds the per-asset cache limit");
    const auto existing = assets_.find(sound_id);
    const auto source_fingerprint = fingerprint(bytes);
    if (existing != assets_.end() && existing->second->fingerprint == source_fingerprint) return {true, {}, {}, existing->second};
    const auto existing_bytes = existing == assets_.end() ? 0u : existing->second->byte_size();
    if (cached_bytes_ - existing_bytes + float_bytes > max_cached_bytes_) return fail("AUDIO_CACHE_LIMIT_REACHED", "audio cache limit reached");
    auto asset = std::make_shared<PcmAsset>();
    asset->sound_id = sound_id;
    asset->sample_rate = parsed.asset.format.sample_rate;
    asset->channels = parsed.asset.format.channels;
    asset->bits_per_sample = parsed.asset.format.bits_per_sample;
    asset->samples = to_float(parsed.asset);
    asset->fingerprint = source_fingerprint;
    cached_bytes_ = cached_bytes_ - existing_bytes + asset->byte_size();
    assets_[sound_id] = asset;
    return {true, {}, {}, std::move(asset)};
}

std::shared_ptr<const PcmAsset> AssetCache::find(const std::string& sound_id) const {
    const auto it = assets_.find(sound_id);
    return it == assets_.end() ? nullptr : it->second;
}

bool AssetCache::unload(const std::string& sound_id) {
    const auto it = assets_.find(sound_id);
    if (it == assets_.end()) return false;
    cached_bytes_ -= it->second->byte_size();
    assets_.erase(it);
    return true;
}

void AssetCache::clear() {
    assets_.clear();
    cached_bytes_ = 0;
}

}  // namespace notification_hub::audio_engine
