#include "config.hpp"

#include <charconv>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <limits>
#include <sstream>
#include <string>
#include <unordered_set>

namespace notification_hub::config {
namespace {

bool is_space(char value) {
    return value == ' ' || value == '\t' || value == '\r' || value == '\n';
}

void skip_space(std::string_view input, std::size_t& position) {
    while (position < input.size() && is_space(input[position])) ++position;
}

bool consume(std::string_view input, std::size_t& position, char expected) {
    skip_space(input, position);
    if (position >= input.size() || input[position] != expected) return false;
    ++position;
    return true;
}

bool parse_string(std::string_view input, std::size_t& position, std::string& value) {
    skip_space(input, position);
    if (position >= input.size() || input[position] != '"') return false;
    ++position;
    value.clear();
    while (position < input.size()) {
        const char current = input[position++];
        if (current == '"') return true;
        if (current == '\\') {
            if (position >= input.size()) return false;
            const char escaped = input[position++];
            if (escaped != '"' && escaped != '\\' && escaped != '/' && escaped != 'n'
                && escaped != 'r' && escaped != 't') return false;
            value.push_back(escaped == 'n' ? '\n' : escaped == 'r' ? '\r' : escaped == 't' ? '\t' : escaped);
        } else {
            if (static_cast<unsigned char>(current) < 0x20) return false;
            value.push_back(current);
        }
    }
    return false;
}

bool parse_uint(std::string_view input, std::size_t& position, std::uint64_t& value) {
    skip_space(input, position);
    const auto begin = position;
    while (position < input.size() && input[position] >= '0' && input[position] <= '9') ++position;
    if (begin == position) return false;
    const auto parsed = std::from_chars(input.data() + begin, input.data() + position, value);
    return parsed.ec == std::errc{} && parsed.ptr == input.data() + position;
}

bool parse_number(std::string_view input, std::size_t& position, double& value) {
    skip_space(input, position);
    const auto begin = position;
    if (position < input.size() && (input[position] == '-' || input[position] == '+')) ++position;
    while (position < input.size() && input[position] >= '0' && input[position] <= '9') ++position;
    if (position < input.size() && input[position] == '.') {
        ++position;
        while (position < input.size() && input[position] >= '0' && input[position] <= '9') ++position;
    }
    if (position < input.size() && (input[position] == 'e' || input[position] == 'E')) {
        ++position;
        if (position < input.size() && (input[position] == '-' || input[position] == '+')) ++position;
        const auto exponent = position;
        while (position < input.size() && input[position] >= '0' && input[position] <= '9') ++position;
        if (exponent == position) return false;
    }
    if (begin == position) return false;
    const std::string token(input.substr(begin, position - begin));
    char* end = nullptr;
    value = std::strtod(token.c_str(), &end);
    return end == token.c_str() + token.size() && std::isfinite(value);
}

bool parse_bool(std::string_view input, std::size_t& position, bool& value) {
    skip_space(input, position);
    if (input.substr(position, 4) == "true") {
        position += 4;
        value = true;
        return true;
    }
    if (input.substr(position, 5) == "false") {
        position += 5;
        value = false;
        return true;
    }
    return false;
}

bool fail(std::string& code, std::string& message, std::string next_code, std::string next_message) {
    code = std::move(next_code);
    message = std::move(next_message);
    return false;
}

}  // namespace

bool parse_update_payload(std::string_view payload,
                          RuntimeConfig& config,
                          std::string& error_code,
                          std::string& error_message) {
    std::size_t position = 0;
    std::unordered_set<std::string> fields;
    bool seen_revision = false;
    bool seen_audio = false;
    bool seen_enabled = false;
    bool seen_volume = false;
    RuntimeConfig parsed{};

    if (!consume(payload, position, '{')) return fail(error_code, error_message, "RUNTIME_CONFIG_INVALID", "config.update payload must be an object");
    while (true) {
        skip_space(payload, position);
        if (consume(payload, position, '}')) break;
        if (!fields.empty() && !consume(payload, position, ',')) return fail(error_code, error_message, "RUNTIME_CONFIG_INVALID", "config.update payload requires commas between fields");
        std::string key;
        if (!parse_string(payload, position, key) || !consume(payload, position, ':')) return fail(error_code, error_message, "RUNTIME_CONFIG_INVALID", "config.update payload contains an invalid field");
        if (!fields.insert(key).second) return fail(error_code, error_message, "RUNTIME_CONFIG_INVALID", "config.update payload contains a duplicate field");
        if (key == "revision") {
            if (!parse_uint(payload, position, parsed.revision) || parsed.revision == 0) return fail(error_code, error_message, "RUNTIME_CONFIG_REVISION_INVALID", "config.update revision must be a positive integer");
            seen_revision = true;
        } else if (key == "audio") {
            if (!consume(payload, position, '{')) return fail(error_code, error_message, "RUNTIME_CONFIG_AUDIO_INVALID", "config.update audio must be an object");
            std::unordered_set<std::string> audio_fields;
            while (true) {
                skip_space(payload, position);
                if (consume(payload, position, '}')) break;
                if (!audio_fields.empty() && !consume(payload, position, ',')) return fail(error_code, error_message, "RUNTIME_CONFIG_AUDIO_INVALID", "audio requires commas between fields");
                std::string audio_key;
                if (!parse_string(payload, position, audio_key) || !consume(payload, position, ':')) return fail(error_code, error_message, "RUNTIME_CONFIG_AUDIO_INVALID", "audio contains an invalid field");
                if (!audio_fields.insert(audio_key).second) return fail(error_code, error_message, "RUNTIME_CONFIG_AUDIO_INVALID", "audio contains a duplicate field");
                if (audio_key == "enabled") {
                    if (!parse_bool(payload, position, parsed.audio.enabled)) return fail(error_code, error_message, "RUNTIME_CONFIG_AUDIO_INVALID", "audio.enabled must be boolean");
                    seen_enabled = true;
                } else if (audio_key == "volume") {
                    if (!parse_number(payload, position, parsed.audio.volume)
                        || parsed.audio.volume < 0.0 || parsed.audio.volume > 1.0) {
                        return fail(error_code, error_message, "RUNTIME_CONFIG_AUDIO_INVALID", "audio.volume must be between 0 and 1");
                    }
                    seen_volume = true;
                } else {
                    return fail(error_code, error_message, "RUNTIME_CONFIG_AUDIO_UNKNOWN_FIELD", "audio contains an unknown field");
                }
            }
            seen_audio = true;
        } else {
            return fail(error_code, error_message, "RUNTIME_CONFIG_UNKNOWN_FIELD", "config.update contains an unknown field");
        }
    }
    skip_space(payload, position);
    if (position != payload.size() || !seen_revision || !seen_audio || !seen_enabled || !seen_volume) {
        return fail(error_code, error_message, "RUNTIME_CONFIG_INVALID", "config.update requires revision and complete audio fields");
    }
    config = parsed;
    return true;
}

bool RuntimeConfigStore::apply_payload(std::string_view payload,
                                        std::string& error_code,
                                        std::string& error_message) {
    RuntimeConfig next{};
    if (!parse_update_payload(payload, next, error_code, error_message)) return false;
    if (has_config_ && next.revision < current_.revision) {
        return fail(error_code, error_message, "RUNTIME_CONFIG_REVISION_STALE", "config.update revision is older than the applied revision");
    }
    current_ = next;
    has_config_ = true;
    return true;
}

std::string RuntimeConfigStore::result_json(bool deduplicated) const {
    std::ostringstream output;
    output << std::setprecision(15)
           << "{\"status\":\"accepted\",\"deduplicated\":" << (deduplicated ? "true" : "false")
           << ",\"applied\":true,\"revision\":" << current_.revision
           << ",\"audio\":{\"enabled\":" << (current_.audio.enabled ? "true" : "false")
           << ",\"volume\":" << current_.audio.volume << "}}";
    return output.str();
}

bool config_self_test() {
    RuntimeConfigStore store;
    std::string code;
    std::string message;
    if (!store.apply_payload(R"({"revision":3,"audio":{"enabled":true,"volume":0.8}})", code, message)) return false;
    if (!store.has_config() || store.current().revision != 3 || !store.current().audio.enabled) return false;
    if (store.apply_payload(R"({"revision":2,"audio":{"enabled":false,"volume":0.2}})", code, message)
        || code != "RUNTIME_CONFIG_REVISION_STALE") return false;
    if (store.apply_payload(R"({"revision":4,"audio":{"enabled":true,"volume":2}})", code, message)
        || code != "RUNTIME_CONFIG_AUDIO_INVALID") return false;
    if (store.apply_payload(R"({"revision":4,"audio":{"enabled":true,"volume":0.4},"unknown":true})", code, message)
        || code != "RUNTIME_CONFIG_UNKNOWN_FIELD") return false;
    return store.result_json(false).find("\"revision\":3") != std::string::npos;
}

}  // namespace notification_hub::config
