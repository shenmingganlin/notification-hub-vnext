#pragma once

#include <string_view>

namespace notification_hub::transport {

int run_named_pipe_server(std::string_view pipe_name);

}  // namespace notification_hub::transport
