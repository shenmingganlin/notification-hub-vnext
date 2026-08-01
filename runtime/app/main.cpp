#include "../diagnostics/event.hpp"
#include "../protocol/message.hpp"

#include <iostream>
#include <string_view>

namespace {

using notification_hub::diagnostics::create_event;
using notification_hub::diagnostics::serialize_jsonl;
using notification_hub::protocol::Message;
using notification_hub::protocol::parse_message;
using notification_hub::protocol::serialize_ack;

constexpr std::string_view kTimestamp = "2026-08-01T00:00:00.000Z";

bool expect_valid(std::string_view input, std::string_view expected_type) {
    const auto result = parse_message(input);
    if (!result.ok || result.message.type != expected_type) {
        std::cerr << "expected valid message of type " << expected_type << "\n";
        return false;
    }
    return true;
}

bool expect_rejected(std::string_view input, std::string_view expected_code) {
    const auto result = parse_message(input);
    if (result.ok || result.error.code != expected_code) {
        std::cerr << "expected rejection code " << expected_code << "\n";
        return false;
    }
    return true;
}

bool protocol_self_test() {
    constexpr std::string_view hello =
        R"({"protocolVersion":1,"requestId":"req-test","traceId":"trace-test","type":"hello","timestamp":"2026-08-01T00:00:00.000Z","payload":{"clientVersion":"test"}})";
    constexpr std::string_view health =
        R"({"protocolVersion":1,"requestId":"req-health","traceId":"trace-health","type":"health","timestamp":"2026-08-01T00:00:00.000Z","payload":{}})";

    if (!expect_valid(hello, "hello") || !expect_valid(health, "health")) return false;
    if (!expect_rejected(R"({})", "PROTOCOL_MISSING_FIELD")) return false;
    if (!expect_rejected(
            R"({"protocolVersion":1,"requestId":"req","traceId":"trace","type":"health","timestamp":"2026-08-01T00:00:00.000Z","payload":{},"future":true})",
            "PROTOCOL_UNKNOWN_FIELD")) return false;
    if (!expect_rejected(
            R"({"protocolVersion":2,"requestId":"req","traceId":"trace","type":"health","timestamp":"2026-08-01T00:00:00.000Z","payload":{}})",
            "PROTOCOL_VERSION_UNSUPPORTED")) return false;
    if (!expect_rejected(
            R"({"protocolVersion":1,"requestId":"req","traceId":"trace","type":"unknown","timestamp":"2026-08-01T00:00:00.000Z","payload":{}})",
            "PROTOCOL_UNKNOWN_TYPE")) return false;
    if (!expect_rejected(
            R"({"protocolVersion":1,"requestId":"req","traceId":"trace","type":"health","timestamp":"2026-08-01T00:00:00.000Z","payload":[]})",
            "PROTOCOL_INVALID_PAYLOAD")) return false;
    if (!expect_rejected(
            R"({"protocolVersion":1,"requestId":"req","traceId":"trace","type":"health","timestamp":"2026-08-01T00:00:00.000Z","payload":{"x":}})",
            "PROTOCOL_INVALID_PAYLOAD")) return false;

    const auto parsed = parse_message(hello);
    const auto ack = serialize_ack(parsed.message, R"({"status":"healthy"})");
    if (ack.find("\"type\":\"ack\"") == std::string::npos ||
        ack.find("\"requestId\":\"req-test\"") == std::string::npos) {
        std::cerr << "ack correlation failed\n";
        return false;
    }

    const auto event = create_event(
        "trace-test", "runtime-accepted", "PROTOCOL_INVALID_MESSAGE", "error", true,
        "Rejected protocol message", std::string(kTimestamp), R"({"source":"self-test"})");
    const auto jsonl = serialize_jsonl(event);
    if (jsonl.back() != '\n' || jsonl.find("\"traceId\":\"trace-test\"") == std::string::npos) {
        std::cerr << "diagnostic serialization failed\n";
        return false;
    }

    return true;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc > 1 && std::string_view(argv[1]) == "--self-test") {
        std::cout << "notification-hub-runtime self-test: ok\n";
        return 0;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--protocol-self-test") {
        const bool passed = protocol_self_test();
        std::cout << "notification-hub-runtime protocol self-test: " << (passed ? "ok" : "failed") << "\n";
        return passed ? 0 : 1;
    }

    std::cout << "notification-hub-runtime " << NOTIFICATION_HUB_VERSION << "\n";
    return 0;
}
