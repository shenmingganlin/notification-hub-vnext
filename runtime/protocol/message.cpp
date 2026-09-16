#include "message.hpp"

#include <cctype>
#include <cstdint>
#include <charconv>
#include <sstream>
#include <regex>
#include <unordered_set>
#include <vector>

namespace notification_hub::protocol {
namespace {

int hex_digit(char value) {
    if (value >= '0' && value <= '9') return value - '0';
    if (value >= 'a' && value <= 'f') return value - 'a' + 10;
    if (value >= 'A' && value <= 'F') return value - 'A' + 10;
    return -1;
}

void append_utf8(std::string& output, std::uint32_t code_point) {
    if (code_point <= 0x7f) {
        output.push_back(static_cast<char>(code_point));
    } else if (code_point <= 0x7ff) {
        output.push_back(static_cast<char>(0xc0 | (code_point >> 6)));
        output.push_back(static_cast<char>(0x80 | (code_point & 0x3f)));
    } else if (code_point <= 0xffff) {
        output.push_back(static_cast<char>(0xe0 | (code_point >> 12)));
        output.push_back(static_cast<char>(0x80 | ((code_point >> 6) & 0x3f)));
        output.push_back(static_cast<char>(0x80 | (code_point & 0x3f)));
    } else {
        output.push_back(static_cast<char>(0xf0 | (code_point >> 18)));
        output.push_back(static_cast<char>(0x80 | ((code_point >> 12) & 0x3f)));
        output.push_back(static_cast<char>(0x80 | ((code_point >> 6) & 0x3f)));
        output.push_back(static_cast<char>(0x80 | (code_point & 0x3f)));
    }
}

constexpr std::string_view kCommands[] = {
    "hello", "health", "capabilities", "scene.create", "scene.update",
    "scene.dismiss", "scene.drag", "scene.set-mode", "scene.set-charter", "config.update", "visual-assets.configure", "font-assets.configure", "agent-avatars.configure",
    "diagnostic.subscribe", "shutdown", "audio.health", "audio.cue", "audio.load", "audio.play", "audio.stop", "audio.stop_all", "audio.unload", "audio.shutdown"
};
constexpr std::string_view kMessageTypes[] = {
    "hello", "health", "capabilities", "scene.create", "scene.update",
    "scene.dismiss", "scene.drag", "scene.set-mode", "scene.set-charter", "config.update", "visual-assets.configure", "font-assets.configure", "agent-avatars.configure",
    "diagnostic.subscribe", "shutdown", "audio.health", "audio.cue", "audio.load", "audio.play", "audio.stop", "audio.stop_all", "audio.unload", "audio.shutdown", "ack", "error", "event"
};
constexpr std::string_view kEventTypes[] = { "scene.changed", "audio.voice_finished" };

bool is_leap_year(int year) {
    return year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
}

bool is_iso8601_timestamp(std::string_view value) {
    static const std::regex pattern(R"(^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$)");
    if (value.empty() || !std::regex_match(value.begin(), value.end(), pattern)) return false;
    const auto number = [&](size_t offset, size_t length) { return std::stoi(std::string(value.substr(offset, length))); };
    const int year = number(0, 4);
    const int month = number(5, 2);
    const int day = number(8, 2);
    const int hour = number(11, 2);
    const int minute = number(14, 2);
    const int second = number(17, 2);
    const auto days_in_month = (month == 2) ? (is_leap_year(year) ? 29 : 28)
        : ((month == 4 || month == 6 || month == 9 || month == 11) ? 30 : 31);
    const size_t zone_offset = value.find_first_of("Z+-", 19);
    const int zone_hour = value[zone_offset] == 'Z' ? 0 : number(zone_offset + 1, 2);
    const int zone_minute = value[zone_offset] == 'Z' ? 0 : number(zone_offset + 4, 2);
    return month >= 1 && month <= 12 && day >= 1 && day <= days_in_month
        && hour <= 23 && minute <= 59 && second <= 59
        && zone_hour <= 23 && zone_minute <= 59;
}

class Parser {
public:
    explicit Parser(std::string_view input) : input_(input) {}

    ParseResult run() {
        ParseResult result;
        skip_ws();
        if (!consume('{')) return fail("PROTOCOL_INVALID_MESSAGE", "message must be a JSON object");

        std::unordered_set<std::string> fields;
        bool first = true;
        while (true) {
            skip_ws();
            if (consume('}')) break;
            if (!first && !consume(',')) return fail("PROTOCOL_INVALID_MESSAGE", "expected comma between fields");
            first = false;

            std::string name;
            if (!parse_string(name)) return fail("PROTOCOL_INVALID_MESSAGE", "field name must be a JSON string");
            if (!fields.insert(name).second) return fail("PROTOCOL_INVALID_MESSAGE", "duplicate protocol field");
            skip_ws();
            if (!consume(':')) return fail("PROTOCOL_INVALID_MESSAGE", "expected colon after field name");

            if (name == "protocolVersion") {
                if (!parse_integer(result.message.protocol_version)) return fail("PROTOCOL_INVALID_MESSAGE", "protocolVersion must be an integer");
            } else if (name == "requestId") {
                if (!parse_string(result.message.request_id)) return fail("PROTOCOL_INVALID_MESSAGE", "requestId must be a string");
                request_id_ = result.message.request_id;
            } else if (name == "traceId") {
                if (!parse_string(result.message.trace_id)) return fail("PROTOCOL_INVALID_MESSAGE", "traceId must be a string");
                trace_id_ = result.message.trace_id;
            } else if (name == "type") {
                if (!parse_string(result.message.type)) return fail("PROTOCOL_INVALID_MESSAGE", "type must be a string");
            } else if (name == "timestamp") {
                if (!parse_string(result.message.timestamp)) return fail("PROTOCOL_INVALID_MESSAGE", "timestamp must be a string");
            } else if (name == "idempotencyKey") {
                if (!parse_string(result.message.idempotency_key)) return fail("PROTOCOL_INVALID_MESSAGE", "idempotencyKey must be a string");
            } else if (name == "payload") {
                if (!parse_raw_value(result.message.payload_json)) return fail("PROTOCOL_INVALID_PAYLOAD", "payload must be valid JSON");
            } else {
                return fail("PROTOCOL_UNKNOWN_FIELD", "unknown protocol field: " + name);
            }
        }

        skip_ws();
        if (position_ != input_.size()) return fail("PROTOCOL_INVALID_MESSAGE", "trailing data after JSON object");
        for (const auto required : {"protocolVersion", "requestId", "traceId", "type", "timestamp", "payload"}) {
            if (!fields.contains(required)) return fail("PROTOCOL_MISSING_FIELD", "missing protocol field: " + std::string(required));
        }
        if (result.message.protocol_version != kProtocolVersion) {
            return fail("PROTOCOL_VERSION_UNSUPPORTED", "unsupported protocol version");
        }
        if (result.message.request_id.empty() || result.message.trace_id.empty()) {
            return fail("PROTOCOL_INVALID_MESSAGE", "requestId and traceId must be non-empty");
        }
        if (!is_iso8601_timestamp(result.message.timestamp)) return fail("PROTOCOL_INVALID_MESSAGE", "timestamp must be an ISO-8601 date-time string");
        if (!result.message.idempotency_key.empty() && result.message.idempotency_key.find_first_not_of(" \t\r\n") == std::string::npos) {
            return fail("PROTOCOL_INVALID_MESSAGE", "idempotencyKey must be non-empty");
        }
        if (!contains(kMessageTypes, result.message.type)) return fail("PROTOCOL_UNKNOWN_TYPE", "unknown message type: " + result.message.type);
        if (result.message.payload_json.empty() || result.message.payload_json.front() != '{') {
            return fail("PROTOCOL_INVALID_PAYLOAD", "payload must be an object");
        }
        if (result.message.type == "event") {
            const auto event_marker = result.message.payload_json.find("\"eventType\":\"");
            if (event_marker == std::string::npos) return fail("PROTOCOL_MISSING_FIELD", "event payload requires eventType");
            const auto start = event_marker + 13;
            const auto end = result.message.payload_json.find('"', start);
            if (end == std::string::npos || !contains(kEventTypes, std::string_view(result.message.payload_json).substr(start, end - start))) {
                return fail("PROTOCOL_UNKNOWN_TYPE", "unknown event type");
            }
        }

        result.ok = true;
        return result;
    }

private:
    template <size_t N>
    static bool contains(const std::string_view (&values)[N], std::string_view value) {
        for (const auto candidate : values) if (candidate == value) return true;
        return false;
    }

    ParseResult fail(std::string code, std::string message) const {
        ParseResult result;
        result.error = {
            std::move(code),
            std::move(message),
            request_id_,
            trace_id_,
            result.message.type.empty() ? "unknown" : result.message.type
        };
        return result;
    }

    void skip_ws() {
        while (position_ < input_.size() && std::isspace(static_cast<unsigned char>(input_[position_]))) ++position_;
    }

    bool consume(char expected) {
        if (position_ < input_.size() && input_[position_] == expected) {
            ++position_;
            return true;
        }
        return false;
    }

    bool parse_integer(int& value) {
        skip_ws();
        const auto start = position_;
        if (position_ < input_.size() && input_[position_] == '-') ++position_;
        const auto digits = position_;
        while (position_ < input_.size() && std::isdigit(static_cast<unsigned char>(input_[position_]))) ++position_;
        if (digits == position_) return false;
        const auto parsed = std::from_chars(input_.data() + start, input_.data() + position_, value);
        return parsed.ec == std::errc{} && parsed.ptr == input_.data() + position_;
    }

    bool parse_string(std::string& value) {
        skip_ws();
        if (!consume('"')) return false;
        value.clear();
        while (position_ < input_.size()) {
            const char ch = input_[position_++];
            if (ch == '"') return true;
            if (ch == '\\') {
                if (position_ >= input_.size()) return false;
                const char escaped = input_[position_++];
                switch (escaped) {
                case '"': value.push_back('"'); break;
                case '\\': value.push_back('\\'); break;
                case '/': value.push_back('/'); break;
                case 'b': value.push_back('\b'); break;
                case 'f': value.push_back('\f'); break;
                case 'n': value.push_back('\n'); break;
                case 'r': value.push_back('\r'); break;
                case 't': value.push_back('\t'); break;
                case 'u': {
                    if (position_ + 4 > input_.size()) return false;
                    std::uint32_t code_point = 0;
                    for (size_t index = 0; index < 4; ++index) {
                        const int digit = hex_digit(input_[position_ + index]);
                        if (digit < 0) return false;
                        code_point = (code_point << 4) | static_cast<std::uint32_t>(digit);
                    }
                    position_ += 4;
                    if (code_point >= 0xd800 && code_point <= 0xdbff) {
                        if (position_ + 6 > input_.size() || input_[position_] != '\\' || input_[position_ + 1] != 'u') return false;
                        std::uint32_t low = 0;
                        for (size_t index = 0; index < 4; ++index) {
                            const int digit = hex_digit(input_[position_ + 2 + index]);
                            if (digit < 0) return false;
                            low = (low << 4) | static_cast<std::uint32_t>(digit);
                        }
                        if (low < 0xdc00 || low > 0xdfff) return false;
                        position_ += 6;
                        code_point = 0x10000 + ((code_point - 0xd800) << 10) + (low - 0xdc00);
                    } else if (code_point >= 0xdc00 && code_point <= 0xdfff) {
                        return false;
                    }
                    append_utf8(value, code_point);
                    break;
                }
                default: return false;
                }
            } else {
                if (static_cast<unsigned char>(ch) < 0x20) return false;
                value.push_back(ch);
            }
        }
        return false;
    }

    bool parse_raw_value(std::string& raw) {
        skip_ws();
        const auto start = position_;
        if (!parse_value()) return false;
        raw = std::string(input_.substr(start, position_ - start));
        while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.back()))) raw.pop_back();
        return !raw.empty();
    }

    bool parse_value() {
        skip_ws();
        if (position_ >= input_.size()) return false;
        switch (input_[position_]) {
        case '"': {
            std::string ignored;
            return parse_string(ignored);
        }
        case '{': return parse_object();
        case '[': return parse_array();
        case 't': return parse_literal("true");
        case 'f': return parse_literal("false");
        case 'n': return parse_literal("null");
        default: return parse_number();
        }
    }

    bool parse_object() {
        if (!consume('{')) return false;
        skip_ws();
        if (consume('}')) return true;
        while (true) {
            std::string key;
            if (!parse_string(key)) return false;
            skip_ws();
            if (!consume(':') || !parse_value()) return false;
            skip_ws();
            if (consume('}')) return true;
            if (!consume(',')) return false;
            skip_ws();
        }
    }

    bool parse_array() {
        if (!consume('[')) return false;
        skip_ws();
        if (consume(']')) return true;
        while (true) {
            if (!parse_value()) return false;
            skip_ws();
            if (consume(']')) return true;
            if (!consume(',')) return false;
            skip_ws();
        }
    }

    bool parse_literal(std::string_view literal) {
        if (input_.substr(position_, literal.size()) != literal) return false;
        position_ += literal.size();
        return true;
    }

    bool parse_number() {
        skip_ws();
        const auto start = position_;
        if (position_ < input_.size() && input_[position_] == '-') ++position_;
        if (position_ >= input_.size() || !std::isdigit(static_cast<unsigned char>(input_[position_]))) return false;
        if (input_[position_] == '0') {
            ++position_;
        } else {
            while (position_ < input_.size() && std::isdigit(static_cast<unsigned char>(input_[position_]))) ++position_;
        }
        if (position_ < input_.size() && input_[position_] == '.') {
            ++position_;
            const auto fraction = position_;
            while (position_ < input_.size() && std::isdigit(static_cast<unsigned char>(input_[position_]))) ++position_;
            if (fraction == position_) return false;
        }
        if (position_ < input_.size() && (input_[position_] == 'e' || input_[position_] == 'E')) {
            ++position_;
            if (position_ < input_.size() && (input_[position_] == '+' || input_[position_] == '-')) ++position_;
            const auto exponent = position_;
            while (position_ < input_.size() && std::isdigit(static_cast<unsigned char>(input_[position_]))) ++position_;
            if (exponent == position_) return false;
        }
        return position_ > start;
    }

    std::string_view input_;
    size_t position_{};
    std::string request_id_;
    std::string trace_id_;
};

}  // namespace

ParseResult parse_message(std::string_view serialized) {
    return Parser(serialized).run();
}

std::string escape_json_string(std::string_view value) {
    std::string result;
    result.reserve(value.size() + 8);
    for (const char ch : value) {
        switch (ch) {
        case '"': result += "\\\""; break;
        case '\\': result += "\\\\"; break;
        case '\b': result += "\\b"; break;
        case '\f': result += "\\f"; break;
        case '\n': result += "\\n"; break;
        case '\r': result += "\\r"; break;
        case '\t': result += "\\t"; break;
        default:
            if (static_cast<unsigned char>(ch) < 0x20) {
                constexpr char hex[] = "0123456789abcdef";
                result += "\\u00";
                result.push_back(hex[(static_cast<unsigned char>(ch) >> 4) & 0x0f]);
                result.push_back(hex[static_cast<unsigned char>(ch) & 0x0f]);
            } else {
                result.push_back(ch);
            }
            break;
        }
    }
    return result;
}

std::string serialize_ack(const Message& request, std::string_view result_json) {
    std::ostringstream output;
    output << "{\"protocolVersion\":1,\"requestId\":\"" << escape_json_string(request.request_id)
           << "\",\"traceId\":\"" << escape_json_string(request.trace_id)
           << "\",\"type\":\"ack\",\"timestamp\":\"" << escape_json_string(request.timestamp)
           << "\",\"payload\":{\"requestType\":\"" << escape_json_string(request.type)
           << "\",\"accepted\":true,\"result\":" << result_json << "}}";
    return output.str();
}

std::string serialize_event(
    std::string_view event_type,
    std::string_view request_id,
    std::string_view trace_id,
    std::string_view timestamp,
    std::string_view result_json) {
    std::ostringstream output;
    output << "{\"protocolVersion\":1,\"requestId\":\"" << escape_json_string(request_id)
           << "\",\"traceId\":\"" << escape_json_string(trace_id)
           << "\",\"type\":\"event\",\"timestamp\":\"" << escape_json_string(timestamp)
           << "\",\"payload\":{\"eventType\":\"" << escape_json_string(event_type)
           << "\",\"result\":" << result_json << "}}";
    return output.str();
}

std::string serialize_error(const ProtocolError& error) {
    std::ostringstream output;
    output << "{\"protocolVersion\":1,\"requestId\":\"" << escape_json_string(error.request_id)
           << "\",\"traceId\":\"" << escape_json_string(error.trace_id)
           << "\",\"type\":\"error\",\"timestamp\":\"1970-01-01T00:00:00.000Z\",\"payload\":{\"requestType\":\""
           << escape_json_string(error.request_type.empty() ? "unknown" : error.request_type)
           << "\",\"accepted\":false,\"code\":\"" << escape_json_string(error.code)
           << "\",\"message\":\"" << escape_json_string(error.message)
           << "\",\"retryable\":" << (error.retryable ? "true" : "false")
           << ",\"details\":" << (error.details_json.empty() ? "{}" : error.details_json) << "}}";
    return output.str();
}

}  // namespace notification_hub::protocol
