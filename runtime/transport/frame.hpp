#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace notification_hub::transport {

inline constexpr std::uint32_t kFrameHeaderBytes = 4;
inline constexpr std::uint32_t kMaxFramePayloadBytes = 1024 * 1024;

enum class FrameStatus {
    NeedMoreData,
    Ready,
    Rejected
};

struct FrameResult {
    FrameStatus status{FrameStatus::NeedMoreData};
    std::string payload;
    std::string code;
    std::string message;
};

struct EncodeResult {
    bool ok{};
    std::vector<std::uint8_t> bytes;
    std::string code;
    std::string message;
};

EncodeResult encode_frame(std::string_view payload);

class FrameDecoder {
public:
    void append(std::string_view bytes);
    FrameResult next();
    FrameResult finish();
    void reset();

private:
    std::vector<std::uint8_t> buffer_;
};

}  // namespace notification_hub::transport
