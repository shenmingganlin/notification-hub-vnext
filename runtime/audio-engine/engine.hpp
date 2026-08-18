#pragma once

#include <string_view>

namespace notification_hub::audio_engine {

int run_audio_engine(std::string_view pipe_name);
bool audio_engine_self_test();

}  // namespace notification_hub::audio_engine
