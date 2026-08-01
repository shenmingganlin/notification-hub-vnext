#pragma once

#include <string>
#include <string_view>

namespace notification_hub::protocol {

inline constexpr int kProtocolVersion = 1;

struct Message {
    int protocol_version{};
    std::string request_id;
    std::string trace_id;
    std::string type;
    std::string timestamp;
    std::string payload_json;
};

struct ProtocolError {
    std::string code;
    std::string message;
    std::string request_id;
    std::string trace_id;
};

struct ParseResult {
    bool ok{};
    Message message;
    ProtocolError error;
};

ParseResult parse_message(std::string_view serialized);
std::string serialize_ack(const Message& request, std::string_view result_json = "{}");
std::string serialize_error(const ProtocolError& error);
std::string escape_json_string(std::string_view value);

}  // namespace notification_hub::protocol
