#pragma once

#include <string>
#include <string_view>

namespace notification_hub::diagnostics {

struct Event {
    std::string diagnostic_id;
    std::string trace_id;
    std::string notification_id;
    std::string stage;
    std::string code;
    std::string severity;
    bool recoverable{};
    std::string message;
    std::string timestamp;
    std::string context_json{"{}"};
};

Event create_event(std::string trace_id,
                   std::string stage,
                   std::string code,
                   std::string severity,
                   bool recoverable,
                   std::string message,
                   std::string timestamp,
                   std::string context_json = "{}");

std::string serialize_jsonl(const Event& event);

}  // namespace notification_hub::diagnostics
