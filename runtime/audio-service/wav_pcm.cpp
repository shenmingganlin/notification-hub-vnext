#include "wav_pcm.hpp"

#include <algorithm>
#include <cstring>
#include <string>

namespace notification_hub::audio {
namespace {
std::uint16_t u16(const std::uint8_t* p) { return static_cast<std::uint16_t>(p[0] | (p[1] << 8)); }
std::uint32_t u32(const std::uint8_t* p) { return static_cast<std::uint32_t>(p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24)); }
WavResult fail(std::string code, std::string message) { return {false, {}, std::move(code), std::move(message)}; }
}

bool is_pcm_subformat(const std::uint8_t* guid) {
    static constexpr std::uint8_t pcm_guid[16] = {0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00,
                                                   0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71};
    return std::memcmp(guid, pcm_guid, sizeof(pcm_guid)) == 0;
}

WavResult parse_wav_pcm(std::span<const std::uint8_t> bytes) {
    if (bytes.size() < 12 || std::memcmp(bytes.data(), "RIFF", 4) != 0 || std::memcmp(bytes.data() + 8, "WAVE", 4) != 0)
        return fail("AUDIO_WAV_INVALID", "file is not a RIFF/WAVE stream");
    PcmFormat format{}; bool have_fmt = false; std::span<const std::uint8_t> data{};
    std::size_t pos = 12;
    while (pos + 8 <= bytes.size()) {
        const auto size = static_cast<std::size_t>(u32(bytes.data() + pos + 4)); pos += 8;
        if (size > bytes.size() - pos) return fail("AUDIO_WAV_TRUNCATED", "WAV chunk exceeds input");
        const auto chunk = bytes.subspan(pos, size);
        if (std::memcmp(bytes.data() + pos - 8, "fmt ", 4) == 0) {
            if (size < 16) return fail("AUDIO_WAV_UNSUPPORTED", "WAV format chunk is too small");
            const auto format_tag = u16(chunk.data());
            const bool classic_pcm = format_tag == 1;
            const bool extensible_pcm = format_tag == 0xfffe && size >= 40 && u16(chunk.data() + 16) >= 22 && is_pcm_subformat(chunk.data() + 24);
            if (!classic_pcm && !extensible_pcm) return fail("AUDIO_WAV_UNSUPPORTED", "only PCM WAV audio is supported");
            format.channels = u16(chunk.data() + 2); format.sample_rate = u32(chunk.data() + 4);
            format.block_align = u16(chunk.data() + 12); format.bits_per_sample = u16(chunk.data() + 14); have_fmt = true;
        } else if (std::memcmp(bytes.data() + pos - 8, "data", 4) == 0) data = chunk;
        pos += size + (size & 1u);
    }
    if (!have_fmt || data.empty()) return fail("AUDIO_WAV_MISSING_CHUNK", "WAV needs fmt and data chunks");
    if (!format.channels || !format.sample_rate || format.bits_per_sample != 16 || !format.block_align || data.size() % format.block_align)
        return fail("AUDIO_WAV_UNSUPPORTED", "only aligned 16-bit PCM with a valid format is supported");
    return {true, {format, std::vector<std::uint8_t>(data.begin(), data.end())}, {}, {}};
}
}  // namespace notification_hub::audio
