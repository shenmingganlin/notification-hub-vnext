#pragma once

#include <cstdint>
#include <string>
#include <string_view>

namespace notification_hub::config {

struct AudioConfig {
    bool enabled{};
    double volume{};
};

struct RuntimeConfig {
    std::uint64_t revision{};
    AudioConfig audio{};
};

class RuntimeConfigStore {
public:
    bool apply_payload(std::string_view payload,
                       std::string& error_code,
                       std::string& error_message);
    std::string result_json(bool deduplicated) const;
    const RuntimeConfig& current() const { return current_; }
    bool has_config() const { return has_config_; }

private:
    RuntimeConfig current_{};
    bool has_config_{};
};

bool parse_update_payload(std::string_view payload,
                          RuntimeConfig& config,
                          std::string& error_code,
                          std::string& error_message);

bool config_self_test();

}  // namespace notification_hub::config
