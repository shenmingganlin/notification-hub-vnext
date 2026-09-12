#include "named_pipe.hpp"

#include "../config/config.hpp"
#include "../diagnostics/event.hpp"
#include "../protocol/message.hpp"
#include "../scene/controller.hpp"
#include "frame.hpp"

#include <charconv>
#include <cstdint>
#include <chrono>
#include <cmath>
#include <cctype>
#include <cstdlib>
#include <ctime>
#include <exception>
#include <iomanip>
#include <limits>
#include <iostream>
#include <regex>
#include <array>
#include <sstream>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#include <wincrypt.h>
#endif

namespace notification_hub::transport {
namespace {

bool parse_visual_assets_config_payload(std::string_view payload, std::size_t& asset_count, std::vector<scene::VisualAssetRecord>& assets, std::string& root_dir, std::string& error_code, std::string& error_message) {
    if (payload.find("\"version\":1") == std::string_view::npos) { error_code = "VISUAL_ASSET_MANIFEST_VERSION_INVALID"; error_message = "visual asset manifest version must be 1"; return false; }
    if (payload.find("..") != std::string_view::npos || payload.find("http") != std::string_view::npos) { error_code = "VISUAL_ASSET_MANIFEST_PATH_INVALID"; error_message = "visual asset manifest contains an unsafe path"; return false; }
    if (payload.find("\"assets\":[") == std::string_view::npos) { error_code = "VISUAL_ASSET_MANIFEST_INVALID"; error_message = "visual asset manifest assets must be an array"; return false; }
    const std::regex root_pattern(R"(\"rootDir\"\s*:\s*\"([A-Za-z]:\\\\[^\"]+)\")");
    const std::string text(payload);
    std::smatch root_match;
    if (!std::regex_search(text, root_match, root_pattern) || root_match[1].str().find("..") != std::string::npos) { error_code = "VISUAL_ASSET_ROOT_INVALID"; error_message = "visual asset manifest rootDir must be a safe absolute Windows path"; return false; }
    root_dir = root_match[1].str();
    asset_count = 0;
    assets.clear();
    const std::regex asset_pattern(R"(\"assetId\"\s*:\s*\"([A-Za-z0-9][A-Za-z0-9._-]{0,79})\"\s*,\s*\"format\"\s*:\s*\"(png|webp|jpg)\"\s*,\s*\"relativePath\"\s*:\s*\"([^\"]+)\"\s*,\s*\"sha256\"\s*:\s*\"([A-Fa-f0-9]{64})\"\s*,\s*\"enabled\"\s*:\s*(true|false))");
    for (std::sregex_iterator it(text.begin(), text.end(), asset_pattern), end; it != end; ++it) {
        scene::VisualAssetRecord asset{(*it)[1].str(), (*it)[2].str(), (*it)[3].str(), (*it)[4].str(), (*it)[5].str() == "true"};
        const auto extension = asset.format == "jpg" ? ".jpg" : "." + asset.format;
        if (asset.relative_path.find("..") != std::string::npos || asset.relative_path.find('\\\\') != std::string::npos || asset.relative_path.find("http") != std::string::npos || asset.relative_path.rfind(asset.asset_id + extension) != asset.relative_path.size() - asset.asset_id.size() - extension.size()) { error_code = "VISUAL_ASSET_MANIFEST_PATH_INVALID"; error_message = "visual asset manifest record path is invalid"; return false; }
        assets.push_back(std::move(asset)); ++asset_count;
    }
    if (asset_count == 0 && payload.find("\"assets\":[]") == std::string_view::npos) { error_code = "VISUAL_ASSET_MANIFEST_INVALID"; error_message = "visual asset manifest record is invalid"; return false; }
    if (asset_count > 1000) { error_code = "VISUAL_ASSET_MANIFEST_TOO_LARGE"; error_message = "visual asset manifest contains too many assets"; return false; }
    { std::unordered_set<std::string> asset_ids, sha256s; asset_ids.reserve(asset_count); sha256s.reserve(asset_count);
        for (const auto& asset : assets) { std::string lower_sha(asset.sha256); std::transform(lower_sha.begin(), lower_sha.end(), lower_sha.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); }); if (!asset_ids.insert(asset.asset_id).second || !sha256s.insert(lower_sha).second) { error_code = "VISUAL_ASSET_MANIFEST_DUPLICATE"; error_message = "visual asset manifest contains duplicate assetId or sha256"; return false; } } }
    return true;
}

#ifdef _WIN32

std::wstring to_wide_ascii(std::string_view value) {
    return std::wstring(value.begin(), value.end());
}

std::string unescape_json_path(std::string value) {
    std::string result;
    result.reserve(value.size());
    for (std::size_t index = 0; index < value.size(); ++index) {
        if (value[index] == '\\\\' && index + 1 < value.size() && value[index + 1] == '\\\\') ++index;
        result.push_back(value[index]);
    }
    return result;
}

bool verify_asset_file(std::string_view root_dir, const scene::VisualAssetRecord& asset) {
    const auto root = to_wide_ascii(unescape_json_path(std::string(root_dir)));
    const auto relative = to_wide_ascii(asset.relative_path);
    std::wstring candidate = root;
    if (!candidate.empty() && candidate.back() != L'\\\\') candidate += L'\\\\';
    candidate += relative;
    wchar_t full_root[32768]{};
    wchar_t full_candidate[32768]{};
    if (!GetFullPathNameW(root.c_str(), static_cast<DWORD>(std::size(full_root)), full_root, nullptr)
        || !GetFullPathNameW(candidate.c_str(), static_cast<DWORD>(std::size(full_candidate)), full_candidate, nullptr)) return false;
    std::wstring root_prefix(full_root);
    if (!root_prefix.empty() && root_prefix.back() != L'\\\\') root_prefix += L'\\\\';
    if (std::wstring(full_candidate).rfind(root_prefix, 0) != 0) return false;
    const auto attributes = GetFileAttributesW(full_candidate);
    if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0) return false;
    HANDLE file = CreateFileW(full_candidate, GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    HCRYPTPROV provider{}; HCRYPTHASH hash{}; bool valid = false;
    if (CryptAcquireContextW(&provider, nullptr, nullptr, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)
        && CryptCreateHash(provider, CALG_SHA_256, 0, 0, &hash)) {
        std::array<std::uint8_t, 8192> buffer{}; DWORD read = 0; bool read_ok = true;
        while (ReadFile(file, buffer.data(), static_cast<DWORD>(buffer.size()), &read, nullptr) && read > 0) {
            if (!CryptHashData(hash, buffer.data(), read, 0)) { read_ok = false; break; }
        }
        DWORD digest_size = 32; std::array<std::uint8_t, 32> digest{};
        if (read_ok && CryptGetHashParam(hash, HP_HASHVAL, digest.data(), &digest_size, 0)) {
            static constexpr char hex[] = "0123456789abcdef"; std::string actual; actual.reserve(64);
            for (const auto byte : digest) { actual.push_back(hex[byte >> 4]); actual.push_back(hex[byte & 0x0f]); }
            auto expected = asset.sha256; std::transform(expected.begin(), expected.end(), expected.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
            valid = actual == expected;
        }
        CryptDestroyHash(hash);
    }
    if (provider) CryptReleaseContext(provider, 0);
    CloseHandle(file);
    return valid;
}

bool write_all(HANDLE pipe, const std::vector<std::uint8_t>& bytes) {
    size_t offset = 0;
    while (offset < bytes.size()) {
        const auto remaining = bytes.size() - offset;
        const auto chunk = static_cast<DWORD>(remaining > 0xffffffffu ? 0xffffffffu : remaining);
        DWORD written = 0;
        if (!WriteFile(pipe, bytes.data() + offset, chunk, &written, nullptr) || written == 0) return false;
        offset += written;
    }
    return true;
}

bool send_payload(HANDLE pipe, std::string_view payload) {
    const auto encoded = encode_frame(payload);
    return encoded.ok && write_all(pipe, encoded.bytes);
}

std::string runtime_timestamp() {
    const auto now = std::chrono::system_clock::now();
    const auto time = std::chrono::system_clock::to_time_t(now);
    std::tm utc{};
    gmtime_s(&utc, &time);
    const auto milliseconds = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;
    std::ostringstream output;
    output << std::put_time(&utc, "%Y-%m-%dT%H:%M:%S")
           << '.' << std::setfill('0') << std::setw(3) << milliseconds.count() << 'Z';
    return output.str();
}

void close_pipe(HANDLE pipe) {
    FlushFileBuffers(pipe);
    DisconnectNamedPipe(pipe);
    CloseHandle(pipe);
}

using SceneState = scene::SceneWindowState;

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

bool parse_json_string_token(std::string_view payload, size_t& position, std::string& value) {
    if (position >= payload.size() || payload[position] != '"') return false;
    ++position;
    value.clear();
    while (position < payload.size()) {
        const char ch = payload[position++];
        if (ch == '"') return true;
        if (ch == '\\') {
            if (position >= payload.size()) return false;
            const char escaped = payload[position++];
            if (escaped == '"' || escaped == '\\' || escaped == '/') value.push_back(escaped);
            else if (escaped == 'b') value.push_back('\b');
            else if (escaped == 'f') value.push_back('\f');
            else if (escaped == 'n') value.push_back('\n');
            else if (escaped == 'r') value.push_back('\r');
            else if (escaped == 't') value.push_back('\t');
            else if (escaped == 'u') {
                if (position + 4 > payload.size()) return false;
                std::uint32_t code_point = 0;
                for (size_t index = 0; index < 4; ++index) {
                    const int digit = hex_digit(payload[position + index]);
                    if (digit < 0) return false;
                    code_point = (code_point << 4) | static_cast<std::uint32_t>(digit);
                }
                position += 4;
                if (code_point >= 0xd800 && code_point <= 0xdbff) {
                    if (position + 6 > payload.size() || payload[position] != '\\' || payload[position + 1] != 'u') return false;
                    std::uint32_t low = 0;
                    for (size_t index = 0; index < 4; ++index) {
                        const int digit = hex_digit(payload[position + 2 + index]);
                        if (digit < 0) return false;
                        low = (low << 4) | static_cast<std::uint32_t>(digit);
                    }
                    if (low < 0xdc00 || low > 0xdfff) return false;
                    position += 6;
                    code_point = 0x10000 + ((code_point - 0xd800) << 10) + (low - 0xdc00);
                } else if (code_point >= 0xdc00 && code_point <= 0xdfff) {
                    return false;
                }
                append_utf8(value, code_point);
            } else return false;
        } else {
            if (static_cast<unsigned char>(ch) < 0x20) return false;
            value.push_back(ch);
        }
    }
    return false;
}

bool parse_json_bool_token(std::string_view payload, size_t& position, bool& value) {
    if (payload.substr(position, 4) == "true") {
        position += 4;
        value = true;
        return true;
    }
    if (payload.substr(position, 5) == "false") {
        position += 5;
        value = false;
        return true;
    }
    return false;
}

bool parse_visual_style(std::string_view payload, size_t& position, scene::VisualStyle& visual) {
    const auto skip = [&]() { while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position; };
    const auto consume = [&](char expected) { skip(); if (position >= payload.size() || payload[position] != expected) return false; ++position; return true; };
    const auto parse_number = [&](double& value) {
        skip(); const auto start = position;
        while (position < payload.size() && (std::isdigit(static_cast<unsigned char>(payload[position])) || payload[position] == '-' || payload[position] == '+' || payload[position] == '.')) ++position;
        if (start == position) return false;
        try { const std::string token(payload.substr(start, position - start)); std::size_t used = 0; value = std::stod(token, &used); return used == token.size(); } catch (...) { return false; }
    };
    const auto parse_object = [&](const auto& parser) {
        if (!consume('{')) return false;
        while (true) { skip(); if (position < payload.size() && payload[position] == '}') { ++position; return true; } std::string key; if (!parse_json_string_token(payload, position, key) || !consume(':') || !parser(key)) return false; skip(); if (position < payload.size() && payload[position] == ',') { ++position; continue; } if (position < payload.size() && payload[position] == '}') { ++position; return true; } return false; }
    };
    if (!consume('{')) return false;
    bool seen_enabled = false, seen_preset = false, seen_intensity = false, seen_category = false, seen_card_type = false, seen_behavior = false, seen_appearance = false, seen_interaction = false;
    visual.specified = true;
    while (true) {
        skip(); if (position < payload.size() && payload[position] == '}') { ++position; break; }
        std::string key; if (!parse_json_string_token(payload, position, key) || !consume(':')) return false;
        if (key == "enabled" && !seen_enabled) { if (!parse_json_bool_token(payload, position, visual.enabled)) return false; seen_enabled = true; }
        else if (key == "preset" && !seen_preset) { if (!parse_json_string_token(payload, position, visual.preset)) return false; seen_preset = true; }
        else if (key == "intensity" && !seen_intensity) { if (!parse_json_string_token(payload, position, visual.intensity)) return false; seen_intensity = true; }
        else if (key == "category" && !seen_category) { skip(); if (payload.substr(position, 4) == "null") { position += 4; visual.category.clear(); } else if (!parse_json_string_token(payload, position, visual.category)) return false; seen_category = true; }
        else if (key == "cardType" && !seen_card_type) { if (!parse_json_string_token(payload, position, visual.card_type)) return false; seen_card_type = true; }
        else if (key == "behavior" && !seen_behavior) {
            if (!parse_object([&](const std::string& nested) { if (nested == "layout") return parse_json_string_token(payload, position, visual.layout); if (nested == "boundary") return parse_json_string_token(payload, position, visual.boundary); return false; })) return false; seen_behavior = true;
        } else if (key == "appearance" && !seen_appearance) {
            if (!parse_object([&](const std::string& nested) { double number{}; if (nested == "size") return parse_json_string_token(payload, position, visual.size); if (nested == "aspectRatio") return parse_json_string_token(payload, position, visual.aspect_ratio); if (nested == "backgroundColor") return parse_json_string_token(payload, position, visual.background_color); if (nested == "backgroundAssetId") return parse_json_string_token(payload, position, visual.background_asset_id); if (nested == "backgroundFit") return parse_json_string_token(payload, position, visual.background_fit); if (nested == "backgroundPadding") { if (!parse_number(number)) return false; visual.background_padding = static_cast<float>(number); return true; } if (nested == "borderRadius") { if (!parse_number(number)) return false; visual.border_radius = static_cast<int>(number); return true; } if (nested == "opacity") { if (!parse_number(number)) return false; visual.opacity = static_cast<float>(number); return true; } return false; })) return false; seen_appearance = true;
        } else if (key == "interaction" && !seen_interaction) {
            if (!parse_object([&](const std::string& nested) { double number{}; if (nested == "dismissMode") return parse_json_string_token(payload, position, visual.dismiss_mode); if (nested == "closeButtonPosition") return parse_json_string_token(payload, position, visual.close_button_position); if (nested == "timeoutMs") { if (!parse_number(number)) return false; visual.dismiss_timeout_ms = static_cast<int>(number); return true; } return false; })) return false; seen_interaction = true;
        } else return false;
        skip(); if (position < payload.size() && payload[position] == ',') { ++position; continue; } if (position < payload.size() && payload[position] == '}') { ++position; break; } return false;
    }
    return seen_enabled && seen_preset && seen_intensity && seen_category && valid_visual_style(visual);
}

bool parse_scene_update_payload(std::string_view payload, SceneState& state) {
    size_t position = 0;
    const auto skip_whitespace = [&]() {
        while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    };
    const auto consume = [&](char expected) {
        skip_whitespace();
        if (position >= payload.size() || payload[position] != expected) return false;
        ++position;
        return true;
    };
    if (!consume('{')) return false;

    bool seen_x = false;
    bool seen_y = false;
    bool seen_width = false;
    bool seen_height = false;
    while (true) {
        skip_whitespace();
        if (position < payload.size() && payload[position] == '}') {
            ++position;
            break;
        }
        if (position >= payload.size() || payload[position] != '"') return false;
        ++position;
        const auto key_start = position;
        while (position < payload.size() && payload[position] != '"') ++position;
        if (position >= payload.size()) return false;
        const std::string_view key = payload.substr(key_start, position - key_start);
        ++position;
        if (!consume(':')) return false;
        skip_whitespace();
        const auto number_start = position;
        if (position < payload.size() && payload[position] == '-') ++position;
        const auto digits_start = position;
        while (position < payload.size() && std::isdigit(static_cast<unsigned char>(payload[position]))) ++position;
        if (digits_start == position) return false;
        int value = 0;
        const auto parsed = std::from_chars(
            payload.data() + number_start,
            payload.data() + position,
            value);
        if (parsed.ec != std::errc{} || parsed.ptr != payload.data() + position) return false;
        if (key == "x" && !seen_x) {
            state.x = value;
            seen_x = true;
        } else if (key == "y" && !seen_y) {
            state.y = value;
            seen_y = true;
        } else if (key == "width" && !seen_width) {
            state.width = value;
            seen_width = true;
        } else if (key == "height" && !seen_height) {
            state.height = value;
            seen_height = true;
        } else {
            return false;
        }
        skip_whitespace();
        if (position < payload.size() && payload[position] == ',') {
            ++position;
            continue;
        }
        if (position < payload.size() && payload[position] == '}') {
            ++position;
            break;
        }
        return false;
    }
    skip_whitespace();
    return position == payload.size()
        && seen_x && seen_y && seen_width && seen_height
        && state.width > 0 && state.width <= 10000
        && state.height > 0 && state.height <= 10000;
}

bool parse_scene_card_payload(std::string_view payload, scene::SceneCardState& card) {
    size_t position = 0;
    const auto skip = [&]() {
        while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    };
    const auto consume = [&](char expected) {
        skip();
        if (position >= payload.size() || payload[position] != expected) return false;
        ++position;
        return true;
    };
    if (!consume('{')) return false;
    auto parse_presentation = [&]() {
        if (!consume('{')) return false;
        bool seen_event_id = false;
        bool seen_category_id = false;
        bool seen_event_type_id = false;
        bool seen_visual_profile_id = false;
        while (true) {
            skip();
            if (position < payload.size() && payload[position] == '}') { ++position; break; }
            std::string key;
            if (!parse_json_string_token(payload, position, key) || !consume(':')) return false;
            std::string value;
            if (!parse_json_string_token(payload, position, value) || value.empty()) return false;
            if (key == "eventId" && !seen_event_id) { card.event_id = std::move(value); seen_event_id = true; }
            else if (key == "categoryId" && !seen_category_id) { card.category_id = std::move(value); seen_category_id = true; }
            else if (key == "eventTypeId" && !seen_event_type_id) { card.event_type_id = std::move(value); seen_event_type_id = true; }
            else if (key == "visualProfileId" && !seen_visual_profile_id) { card.visual_profile_id = std::move(value); seen_visual_profile_id = true; }
            else return false;
            skip();
            if (position < payload.size() && payload[position] == ',') { ++position; continue; }
            if (position < payload.size() && payload[position] == '}') { ++position; break; }
            return false;
        }
        card.presentation_specified = true;
        return seen_event_id && seen_category_id && seen_event_type_id && seen_visual_profile_id;
    };
    auto parse_behavior = [&]() {
        if (!consume('{')) return false;
        bool seen_profile_id = false;
        bool seen_channel_id = false;
        while (true) {
            skip();
            if (position < payload.size() && payload[position] == '}') { ++position; break; }
            std::string key;
            if (!parse_json_string_token(payload, position, key) || !consume(':')) return false;
            std::string value;
            if (!parse_json_string_token(payload, position, value) || value.empty()) return false;
            if (key == "behaviorProfileId" && !seen_profile_id) { card.behavior_profile_id = std::move(value); seen_profile_id = true; }
            else if (key == "behaviorChannelId" && !seen_channel_id) { card.behavior_channel_id = std::move(value); seen_channel_id = true; }
            else return false;
            skip();
            if (position < payload.size() && payload[position] == ',') { ++position; continue; }
            if (position < payload.size() && payload[position] == '}') { ++position; break; }
            return false;
        }
        card.behavior_specified = true;
        return seen_profile_id && seen_channel_id;
    };
    bool seen_id = false;
    bool seen_title = false;
    bool seen_body = false;
    bool seen_x = false;
    bool seen_y = false;
    bool seen_width = false;
    bool seen_height = false;
    bool seen_presentation = false;
    bool seen_behavior = false;
    while (true) {
        skip();
        if (position < payload.size() && payload[position] == '}') {
            ++position;
            break;
        }
        std::string key;
        if (!parse_json_string_token(payload, position, key) || !consume(':')) return false;
        skip();
        if (key == "id" || key == "title" || key == "body") {
            std::string value;
            if (!parse_json_string_token(payload, position, value)) return false;
            if (key == "id" && !seen_id) { card.id = std::move(value); seen_id = true; }
            else if (key == "title" && !seen_title) { card.title = std::move(value); seen_title = true; }
            else if (key == "body" && !seen_body) { card.body = std::move(value); seen_body = true; }
            else return false;
        } else if (key == "visual") {
            if (card.visual.specified || !parse_visual_style(payload, position, card.visual)) return false;
        } else if (key == "presentation") {
            if (seen_presentation || !parse_presentation()) return false;
            seen_presentation = true;
        } else if (key == "behavior") {
            if (seen_behavior || !parse_behavior()) return false;
            seen_behavior = true;
        } else if (key == "x" || key == "y" || key == "width" || key == "height") {
            const auto start = position;
            if (position < payload.size() && payload[position] == '-') ++position;
            const auto digits = position;
            while (position < payload.size() && std::isdigit(static_cast<unsigned char>(payload[position]))) ++position;
            if (digits == position) return false;
            int value = 0;
            const auto parsed = std::from_chars(payload.data() + start, payload.data() + position, value);
            if (parsed.ec != std::errc{} || parsed.ptr != payload.data() + position) return false;
            if (key == "x" && !seen_x) { card.window.x = value; seen_x = true; }
            else if (key == "y" && !seen_y) { card.window.y = value; seen_y = true; }
            else if (key == "width" && !seen_width) { card.window.width = value; seen_width = true; }
            else if (key == "height" && !seen_height) { card.window.height = value; seen_height = true; }
            else return false;
        } else return false;
        skip();
        if (position < payload.size() && payload[position] == ',') { ++position; continue; }
        if (position < payload.size() && payload[position] == '}') { ++position; break; }
        return false;
    }
    skip();
    return position == payload.size() && seen_id && seen_title && seen_x && seen_y && seen_width && seen_height
        && !card.id.empty() && !card.title.empty()
        && card.window.width > 0 && card.window.width <= 10000
        && card.window.height > 0 && card.window.height <= 10000;
}

bool parse_scene_mode_payload(std::string_view payload, scene::StackLayoutOptions& options) {
    size_t position = 0;
    const auto skip = [&]() {
        while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    };
    const auto consume = [&](char expected) {
        skip();
        if (position >= payload.size() || payload[position] != expected) return false;
        ++position;
        return true;
    };
    const auto parse_number = [&](double& value) {
        skip();
        const auto start = position;
        if (position < payload.size() && (payload[position] == '-' || payload[position] == '+')) ++position;
        while (position < payload.size() && std::isdigit(static_cast<unsigned char>(payload[position]))) ++position;
        if (position < payload.size() && payload[position] == '.') {
            ++position;
            while (position < payload.size() && std::isdigit(static_cast<unsigned char>(payload[position]))) ++position;
        }
        if (start == position) return false;
        const std::string token(payload.substr(start, position - start));
        char* end = nullptr;
        value = std::strtod(token.c_str(), &end);
        return end == token.c_str() + token.size();
    };
    if (!consume('{')) return false;
    bool seen_layout = false;
    bool seen_direction = false;
    bool seen_anchor = false;
    bool seen_spacing = false;
    bool seen_work_area_width = false;
    bool seen_work_area_height = false;
    bool seen_dpi_scale = false;
    std::string layout;
    std::string direction;
    std::string anchor;
    while (true) {
        skip();
        if (position < payload.size() && payload[position] == '}') {
            ++position;
            break;
        }
        std::string key;
        if (!parse_json_string_token(payload, position, key) || !consume(':')) return false;
        if (key == "layout" || key == "direction" || key == "anchor") {
            std::string value;
            if (!parse_json_string_token(payload, position, value)) return false;
            if (key == "layout" && !seen_layout) { layout = std::move(value); seen_layout = true; }
            else if (key == "direction" && !seen_direction) { direction = std::move(value); seen_direction = true; }
            else if (key == "anchor" && !seen_anchor) { anchor = std::move(value); seen_anchor = true; }
            else return false;
        } else if (key == "spacing" || key == "workAreaWidth" || key == "workAreaHeight" || key == "dpiScale") {
            double numeric = 0.0;
            if (!parse_number(numeric)) return false;
            if (key != "dpiScale"
                && (std::floor(numeric) != numeric
                    || numeric < static_cast<double>((std::numeric_limits<int>::min)())
                    || numeric > static_cast<double>((std::numeric_limits<int>::max)()))) return false;
            if (key == "spacing" && !seen_spacing) { options.spacing = static_cast<int>(numeric); seen_spacing = true; }
            else if (key == "workAreaWidth" && !seen_work_area_width) { options.work_area_width = static_cast<int>(numeric); seen_work_area_width = true; }
            else if (key == "workAreaHeight" && !seen_work_area_height) { options.work_area_height = static_cast<int>(numeric); seen_work_area_height = true; }
            else if (key == "dpiScale" && !seen_dpi_scale) { options.dpi_scale = static_cast<float>(numeric); seen_dpi_scale = true; }
            else return false;
        } else return false;
        skip();
        if (position < payload.size() && payload[position] == ',') { ++position; continue; }
        if (position < payload.size() && payload[position] == '}') { ++position; break; }
        return false;
    }
    skip();
    const bool any_work_area_override = seen_work_area_width || seen_work_area_height || seen_dpi_scale;
    const bool complete_work_area_override = seen_work_area_width
        && seen_work_area_height
        && seen_dpi_scale;
    if (position != payload.size() || !seen_layout || !seen_direction || !seen_anchor
        || !seen_spacing || (any_work_area_override && !complete_work_area_override)
        || (layout != "stack" && layout != "shelf")) return false;
    if (direction == "down") options.direction = scene::StackDirection::Down;
    else if (direction == "up") options.direction = scene::StackDirection::Up;
    else if (direction == "right") options.direction = scene::StackDirection::Right;
    else if (direction == "left") options.direction = scene::StackDirection::Left;
    else return false;
    options.mode = layout == "shelf" ? scene::LayoutMode::Shelf : scene::LayoutMode::Stack;
    if (anchor == "top-left") options.anchor = scene::StackAnchor::TopLeft;
    else if (anchor == "top-right") options.anchor = scene::StackAnchor::TopRight;
    else if (anchor == "bottom-left") options.anchor = scene::StackAnchor::BottomLeft;
    else if (anchor == "bottom-right") options.anchor = scene::StackAnchor::BottomRight;
    else return false;
    return true;
}

bool parse_scene_dismiss_payload(std::string_view payload, std::string& id) {
    size_t position = 0;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    if (position >= payload.size() || payload[position++] != '{') return false;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    std::string key;
    if (!parse_json_string_token(payload, position, key) || key != "id") return false;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    if (position >= payload.size() || payload[position++] != ':') return false;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    if (!parse_json_string_token(payload, position, id) || id.empty()) return false;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    if (position >= payload.size() || payload[position++] != '}') return false;
    while (position < payload.size() && std::isspace(static_cast<unsigned char>(payload[position]))) ++position;
    return position == payload.size();
}

#endif

}  // namespace

int run_named_pipe_server(std::string_view pipe_name, bool drop_after_health, bool exit_after_health) {
#ifndef _WIN32
    static_cast<void>(pipe_name);
    static_cast<void>(drop_after_health);
    static_cast<void>(exit_after_health);
    std::cerr << "TRANSPORT_PIPE_UNSUPPORTED: Named Pipe server requires Windows\n";
    return 2;
#else
    const auto wide_name = to_wide_ascii(pipe_name);
    bool injected_drop = false;
    bool shutdown_requested = false;
    std::unordered_map<std::string, std::string> idempotency_cache;
    scene::RuntimeSceneController scene_controller;
    config::RuntimeConfigStore runtime_config;
    std::uint64_t scene_event_sequence = 0;

    while (!shutdown_requested) {
        HANDLE pipe = CreateNamedPipeW(
            wide_name.c_str(),
            PIPE_ACCESS_DUPLEX,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
            1,
            64 * 1024,
            64 * 1024,
            5000,
            nullptr);
        if (pipe == INVALID_HANDLE_VALUE) {
            std::cerr << "TRANSPORT_PIPE_CREATE_FAILED: " << GetLastError() << "\n";
            return 3;
        }

        std::cout << "notification-hub-runtime named pipe ready: " << pipe_name << "\n" << std::flush;
        const BOOL connected = ConnectNamedPipe(pipe, nullptr)
            ? TRUE
            : (GetLastError() == ERROR_PIPE_CONNECTED ? TRUE : FALSE);
        if (!connected) {
            const auto error = GetLastError();
            std::cerr << "TRANSPORT_PIPE_CONNECT_FAILED: " << error << "\n";
            CloseHandle(pipe);
            return 4;
        }

        FrameDecoder decoder;
        std::vector<char> read_buffer(16 * 1024);
        bool session_finished = false;
        while (!session_finished && !shutdown_requested) {
            if (scene_controller.pump_messages()) {
                ++scene_event_sequence;
                const auto sequence = std::to_string(scene_event_sequence);
                try {
                    const auto change_metadata = scene_controller.consume_change_metadata_json();
                    const auto event_payload = std::string("{\"sceneStateSnapshot\":")
                        + scene_controller.scene_state_snapshot_json()
                        + ",\"change\":" + change_metadata + "}";
                    const auto event = protocol::serialize_event(
                        "scene.changed",
                        "evt-runtime-scene-" + sequence,
                        "trace-runtime-scene-" + sequence,
                        runtime_timestamp(),
                        event_payload);
                    std::cerr << "RUNTIME_SCENE_EVENT_DETECTED sequence=" << sequence
                              << " snapshotBytes=" << event_payload.size() << "\n";
                    if (!send_payload(pipe, event)) {
                        std::cerr << "RUNTIME_SCENE_EVENT_SEND_FAILED sequence=" << sequence
                                  << " win32Error=" << GetLastError() << "\n";
                        close_pipe(pipe);
                        return 8;
                    }
                    std::cerr << "RUNTIME_SCENE_EVENT_SENT sequence=" << sequence << "\n";
                } catch (const std::exception& error) {
                    std::cerr << "RUNTIME_SCENE_EVENT_SERIALIZE_FAILED sequence=" << sequence
                              << " message=" << error.what() << "\n";
                    close_pipe(pipe);
                    return 12;
                }
            }
            DWORD bytes_available = 0;
            if (!PeekNamedPipe(pipe, nullptr, 0, nullptr, &bytes_available, nullptr)) {
                const auto error = GetLastError();
                if (error != ERROR_BROKEN_PIPE && error != ERROR_NO_DATA) {
                    std::cerr << "TRANSPORT_PIPE_PEEK_FAILED: " << error << "\n";
                    close_pipe(pipe);
                    return 5;
                }
                session_finished = true;
                break;
            }
            if (bytes_available == 0) {
                Sleep(1);
                continue;
            }
            DWORD bytes_read = 0;
            const auto bytes_to_read = std::min<DWORD>(
                static_cast<DWORD>(read_buffer.size()), bytes_available);
            if (!ReadFile(pipe, read_buffer.data(), bytes_to_read, &bytes_read, nullptr)) {
                const auto error = GetLastError();
                if (error != ERROR_BROKEN_PIPE && error != ERROR_NO_DATA) {
                    std::cerr << "TRANSPORT_PIPE_READ_FAILED: " << error << "\n";
                    close_pipe(pipe);
                    return 5;
                }
                session_finished = true;
                break;
            }
            if (bytes_read == 0) {
                session_finished = true;
                break;
            }
            decoder.append(std::string_view(read_buffer.data(), bytes_read));

            while (!session_finished && !shutdown_requested) {
                const auto frame = decoder.next();
                if (frame.status == FrameStatus::NeedMoreData) break;
                if (frame.status == FrameStatus::Rejected) {
                    const auto event = diagnostics::create_event(
                        "pipe-trace", "transport-sent", frame.code, "error", true,
                        frame.message, "2026-08-01T00:00:00.000Z");
                    std::cerr << diagnostics::serialize_jsonl(event);
                    protocol::ProtocolError error{frame.code, frame.message, {}, {}};
                    if (!send_payload(pipe, protocol::serialize_error(error))) {
                        session_finished = true;
                    }
                    continue;
                }

                const auto parsed = protocol::parse_message(frame.payload);
                if (!parsed.ok) {
                    const auto event = diagnostics::create_event(
                        "pipe-trace", "runtime-accepted", parsed.error.code, "error", true,
                        parsed.error.message, "2026-08-01T00:00:00.000Z");
                    std::cerr << diagnostics::serialize_jsonl(event);
                    if (!send_payload(pipe, protocol::serialize_error(parsed.error))) {
                        session_finished = true;
                    }
                    continue;
                }

                scene::SceneWindowState requested_scene_state{};
                scene::SceneCardState requested_card{};
                scene::StackLayoutOptions requested_layout_options{};
                std::string requested_dismiss_id;
                const bool is_card_update = parsed.message.type == "scene.update"
                    && parsed.message.payload_json.find("\"id\"") != std::string::npos;
                const bool is_card_command = parsed.message.type == "scene.create"
                    || is_card_update
                    || parsed.message.type == "scene.dismiss";
                const bool is_layout_command = parsed.message.type == "scene.set-mode";
                const bool is_config_command = parsed.message.type == "config.update";
                const bool is_visual_assets_command = parsed.message.type == "visual-assets.configure";
                std::size_t requested_visual_asset_count = 0;
                std::vector<scene::VisualAssetRecord> requested_visual_assets;
                std::string requested_visual_asset_root;
                std::string visual_manifest_error_code;
                std::string visual_manifest_error_message;
                if (is_visual_assets_command && !parse_visual_assets_config_payload(parsed.message.payload_json, requested_visual_asset_count, requested_visual_assets, requested_visual_asset_root, visual_manifest_error_code, visual_manifest_error_message)) {
                    protocol::ProtocolError error{visual_manifest_error_code, visual_manifest_error_message, parsed.message.request_id, parsed.message.trace_id, parsed.message.type};
                    if (!send_payload(pipe, protocol::serialize_error(error))) { close_pipe(pipe); return 11; }
                    continue;
                }
                bool payload_valid = true;
                if (parsed.message.type == "scene.update" && !is_card_update) {
                    payload_valid = parse_scene_update_payload(parsed.message.payload_json, requested_scene_state);
                } else if (parsed.message.type == "scene.create" || is_card_update) {
                    payload_valid = parse_scene_card_payload(parsed.message.payload_json, requested_card);
                } else if (parsed.message.type == "scene.dismiss") {
                    payload_valid = parse_scene_dismiss_payload(parsed.message.payload_json, requested_dismiss_id);
                } else if (is_layout_command) {
                    payload_valid = parse_scene_mode_payload(parsed.message.payload_json, requested_layout_options);
                }
                if (!payload_valid) {
                    protocol::ProtocolError error{
                        is_card_command
                            ? "RUNTIME_SCENE_CARD_INVALID"
                            : (is_layout_command ? "LAYOUT_INVALID" : "RUNTIME_SCENE_STATE_INVALID"),
                        is_card_command
                            ? "scene card payload is invalid"
                            : (is_layout_command
                                ? "scene.set-mode requires a valid stack or shelf layout payload"
                                : "scene.update requires integer x, y, width, and height"),
                        parsed.message.request_id,
                        parsed.message.trace_id,
                        parsed.message.type
                    };
                    if (!send_payload(pipe, protocol::serialize_error(error))) {
                        close_pipe(pipe);
                        return 10;
                    }
                    continue;
                }

                bool deduplicated = false;
                if (!parsed.message.idempotency_key.empty()) {
                    const auto fingerprint = parsed.message.type + "|" + parsed.message.payload_json;
                    const auto existing = idempotency_cache.find(parsed.message.idempotency_key);
                    if (existing != idempotency_cache.end()) {
                        if (existing->second != fingerprint) {
                            protocol::ProtocolError error{
                                "TRANSPORT_IDEMPOTENCY_CONFLICT",
                                "idempotencyKey was already used for a different request",
                                parsed.message.request_id,
                                parsed.message.trace_id,
                                parsed.message.type
                            };
                            if (!send_payload(pipe, protocol::serialize_error(error))) {
                                close_pipe(pipe);
                                return 9;
                            }
                            continue;
                        }
                        deduplicated = true;
                    }
                }
                if (!deduplicated && is_visual_assets_command) {
#ifdef _WIN32
                    for (auto& asset : requested_visual_assets) if (asset.enabled && !verify_asset_file(requested_visual_asset_root, asset)) asset.enabled = false;
#endif
                    scene_controller.configure_visual_assets(requested_visual_assets, requested_visual_asset_root);
                }
                if (!deduplicated && is_layout_command) {
                    std::string apply_error_code;
                    std::string apply_error_message;
                    if (!scene_controller.apply_stack_layout(
                            requested_layout_options,
                            apply_error_code,
                            apply_error_message)) {
                        protocol::ProtocolError error{
                            apply_error_code,
                            apply_error_message,
                            parsed.message.request_id,
                            parsed.message.trace_id,
                            parsed.message.type
                        };
                        if (!send_payload(pipe, protocol::serialize_error(error))) {
                            close_pipe(pipe);
                            return 11;
                        }
                        continue;
                    }
                } else if (!deduplicated && parsed.message.type == "scene.update" && !is_card_update) {
                    std::string apply_error_code;
                    std::string apply_error_message;
                    if (!scene_controller.apply_window_state(
                            requested_scene_state,
                            apply_error_code,
                            apply_error_message)) {
                        protocol::ProtocolError error{
                            apply_error_code,
                            apply_error_message,
                            parsed.message.request_id,
                            parsed.message.trace_id,
                            parsed.message.type
                        };
                        if (!send_payload(pipe, protocol::serialize_error(error))) {
                            close_pipe(pipe);
                            return 11;
                        }
                        continue;
                    }
                } else if (!deduplicated && parsed.message.type == "scene.create") {
                    std::string apply_error_code;
                    std::string apply_error_message;
                    if (!scene_controller.create_card(
                            requested_card,
                            apply_error_code,
                            apply_error_message)) {
                        protocol::ProtocolError error{
                            apply_error_code,
                            apply_error_message,
                            parsed.message.request_id,
                            parsed.message.trace_id,
                            parsed.message.type
                        };
                        if (!send_payload(pipe, protocol::serialize_error(error))) {
                            close_pipe(pipe);
                            return 11;
                        }
                        continue;
                    }
                } else if (!deduplicated && is_card_update) {
                    std::string apply_error_code;
                    std::string apply_error_message;
                    if (!scene_controller.update_card(
                            requested_card,
                            apply_error_code,
                            apply_error_message)) {
                        protocol::ProtocolError error{
                            apply_error_code,
                            apply_error_message,
                            parsed.message.request_id,
                            parsed.message.trace_id,
                            parsed.message.type
                        };
                        if (!send_payload(pipe, protocol::serialize_error(error))) {
                            close_pipe(pipe);
                            return 11;
                        }
                        continue;
                    }
                } else if (!deduplicated && parsed.message.type == "scene.dismiss") {
                    std::string apply_error_code;
                    std::string apply_error_message;
                    if (!scene_controller.dismiss_card(
                            requested_dismiss_id,
                            apply_error_code,
                            apply_error_message)) {
                        protocol::ProtocolError error{
                            apply_error_code,
                            apply_error_message,
                            parsed.message.request_id,
                            parsed.message.trace_id,
                            parsed.message.type
                        };
                        if (!send_payload(pipe, protocol::serialize_error(error))) {
                            close_pipe(pipe);
                            return 11;
                        }
                        continue;
                    }
                } else if (!deduplicated && is_config_command) {
                    std::string apply_error_code;
                    std::string apply_error_message;
                    if (!runtime_config.apply_payload(
                            parsed.message.payload_json,
                            apply_error_code,
                            apply_error_message)) {
                        protocol::ProtocolError error{
                            apply_error_code,
                            apply_error_message,
                            parsed.message.request_id,
                            parsed.message.trace_id,
                            parsed.message.type
                        };
                        if (!send_payload(pipe, protocol::serialize_error(error))) {
                            close_pipe(pipe);
                            return 11;
                        }
                        continue;
                    }
                }
                if (!parsed.message.idempotency_key.empty() && !deduplicated) {
                    const auto fingerprint = parsed.message.type + "|" + parsed.message.payload_json;
                    idempotency_cache.emplace(parsed.message.idempotency_key, fingerprint);
                }
                const auto generic_result = deduplicated
                    ? "{\"status\":\"accepted\",\"deduplicated\":true}"
                    : "{\"status\":\"accepted\",\"deduplicated\":false}";
                std::string result_json;
                if (is_config_command) result_json = runtime_config.result_json(deduplicated);
                else if (is_visual_assets_command) result_json = std::string("{\"status\":\"accepted\",\"deduplicated\":") + (deduplicated ? "true" : "false") + ",\"applied\":true,\"assetCount\":" + std::to_string(requested_visual_asset_count) + "}";
                else if (parsed.message.type == "scene.update" && !is_card_update) result_json = scene_controller.state_result_json(deduplicated);
                else if (parsed.message.type == "scene.dismiss") result_json = scene_controller.dismiss_result_json(deduplicated, requested_dismiss_id);
                else if (parsed.message.type == "scene.create" || is_card_update || is_layout_command) result_json = scene_controller.cards_result_json(deduplicated);
                else if (parsed.message.type == "health") result_json = std::string("{\"status\":\"accepted\",\"deduplicated\":") + (deduplicated ? "true" : "false") + ",\"sceneState\":" + scene_controller.state_json() + ",\"sceneCards\":" + scene_controller.cards_json() + ",\"sceneStateSnapshot\":" + scene_controller.scene_state_snapshot_json() + ",\"layout\":" + scene_controller.layout_json() + ",\"workArea\":" + scene_controller.work_area_json() + "}";
                else result_json = generic_result;
                if (!send_payload(pipe, protocol::serialize_ack(parsed.message, result_json))) {
                    std::cerr << "TRANSPORT_PIPE_WRITE_FAILED: " << GetLastError() << "\n";
                    close_pipe(pipe);
                    return 8;
                }
                if (parsed.message.type == "shutdown") {
                    shutdown_requested = true;
                    session_finished = true;
                    break;
                }
                if (drop_after_health && !injected_drop && parsed.message.type == "health") {
                    injected_drop = true;
                    session_finished = true;
                    break;
                }
                if (exit_after_health && parsed.message.type == "health") {
                    shutdown_requested = true;
                    session_finished = true;
                    break;
                }
            }
        }

        close_pipe(pipe);
    }

    return 0;
#endif
}

}  // namespace notification_hub::transport
