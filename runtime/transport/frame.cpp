#include "frame.hpp"

#include <algorithm>

namespace notification_hub::transport {
namespace {

FrameResult rejected(std::string code, std::string message) {
    return FrameResult{FrameStatus::Rejected, {}, std::move(code), std::move(message)};
}

std::uint32_t read_length(const std::vector<std::uint8_t>& buffer) {
    return static_cast<std::uint32_t>(buffer[0]) |
           (static_cast<std::uint32_t>(buffer[1]) << 8) |
           (static_cast<std::uint32_t>(buffer[2]) << 16) |
           (static_cast<std::uint32_t>(buffer[3]) << 24);
}

}  // namespace

EncodeResult encode_frame(std::string_view payload) {
    if (payload.empty()) {
        return {false, {}, "TRANSPORT_FRAME_EMPTY", "frame payload must not be empty"};
    }
    if (payload.size() > kMaxFramePayloadBytes) {
        return {false, {}, "TRANSPORT_FRAME_TOO_LARGE", "frame payload exceeds the configured limit"};
    }

    const auto length = static_cast<std::uint32_t>(payload.size());
    std::vector<std::uint8_t> bytes(kFrameHeaderBytes + payload.size());
    bytes[0] = static_cast<std::uint8_t>(length & 0xffu);
    bytes[1] = static_cast<std::uint8_t>((length >> 8) & 0xffu);
    bytes[2] = static_cast<std::uint8_t>((length >> 16) & 0xffu);
    bytes[3] = static_cast<std::uint8_t>((length >> 24) & 0xffu);
    std::copy(payload.begin(), payload.end(), bytes.begin() + kFrameHeaderBytes);
    return {true, std::move(bytes), {}, {}};
}

void FrameDecoder::append(std::string_view bytes) {
    buffer_.insert(buffer_.end(), bytes.begin(), bytes.end());
}

FrameResult FrameDecoder::next() {
    if (buffer_.size() < kFrameHeaderBytes) {
        return {FrameStatus::NeedMoreData, {}, {}, {}};
    }

    const auto length = read_length(buffer_);
    if (length == 0) {
        reset();
        return rejected("TRANSPORT_FRAME_EMPTY", "frame length must be greater than zero");
    }
    if (length > kMaxFramePayloadBytes) {
        reset();
        return rejected("TRANSPORT_FRAME_TOO_LARGE", "frame length exceeds the configured limit");
    }

    const auto frame_bytes = static_cast<std::size_t>(kFrameHeaderBytes) + length;
    if (buffer_.size() < frame_bytes) {
        return {FrameStatus::NeedMoreData, {}, {}, {}};
    }

    std::string payload(buffer_.begin() + kFrameHeaderBytes, buffer_.begin() + frame_bytes);
    buffer_.erase(buffer_.begin(), buffer_.begin() + frame_bytes);
    return {FrameStatus::Ready, std::move(payload), {}, {}};
}

FrameResult FrameDecoder::finish() {
    if (buffer_.empty()) {
        return {FrameStatus::NeedMoreData, {}, {}, {}};
    }
    reset();
    return rejected("TRANSPORT_FRAME_TRUNCATED", "stream ended before a complete frame arrived");
}

void FrameDecoder::reset() {
    buffer_.clear();
}

}  // namespace notification_hub::transport
