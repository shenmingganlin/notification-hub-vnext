#pragma once

#include <string_view>

namespace notification_hub::transport {

int run_named_pipe_server(std::string_view pipe_name, bool drop_after_health = false);

}  // namespace notification_hub::transport
