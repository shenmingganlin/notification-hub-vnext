#pragma once
#include <string_view>
namespace notification_hub::audio { int run_audio_service(std::string_view pipe_name); bool audio_self_test(); }
