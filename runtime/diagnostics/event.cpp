#include "event.hpp"

#include <atomic>
#include <sstream>

namespace notification_hub::diagnostics {
namespace {

std::atomic<unsigned long long> next_id{1};

std::string escape_json_string(std::string_view value) {
    std::string result;
    result.reserve(value.size() + 8);
    for (const char ch : value) {
        switch (ch) {
        case '"': result += "\\\""; break;
        case '\\': result += "\\\\"; break;
        case '\n': result += "\\n"; break;
        case '\r': result += "\\r"; break;
        case '\t': result += "\\t"; break;
        default: result.push_back(ch); break;
        }
    }
    return result;
}

}  // namespace

Event create_event(std::string trace_id,
                   std::string stage,
                   std::string code,
                   std::string severity,
                   bool recoverable,
                   std::string message,
                   std::string timestamp,
                   std::string context_json) {
    Event event;
    event.diagnostic_id = "diag-runtime-" + std::to_string(next_id.fetch_add(1));
    event.trace_id = std::move(trace_id);
    event.stage = std::move(stage);
    event.code = std::move(code);
    event.severity = std::move(severity);
    event.recoverable = recoverable;
    event.message = std::move(message);
    event.timestamp = std::move(timestamp);
    event.context_json = std::move(context_json);
    return event;
}

std::string serialize_jsonl(const Event& event) {
    std::ostringstream output;
    output << "{\"diagnosticId\":\"" << escape_json_string(event.diagnostic_id)
           << "\",\"traceId\":\"" << escape_json_string(event.trace_id)
           << "\",\"stage\":\"" << escape_json_string(event.stage)
           << "\",\"code\":\"" << escape_json_string(event.code)
           << "\",\"severity\":\"" << escape_json_string(event.severity)
           << "\",\"recoverable\":" << (event.recoverable ? "true" : "false")
           << ",\"message\":\"" << escape_json_string(event.message)
           << "\",\"timestamp\":\"" << escape_json_string(event.timestamp)
           << "\",\"context\":" << (event.context_json.empty() ? "{}" : event.context_json) << "}\n";
    return output.str();
}

}  // namespace notification_hub::diagnostics
