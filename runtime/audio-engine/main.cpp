#include "engine.hpp"

#include <iostream>
#include <string_view>

int main(int argc, char** argv) {
    if (argc > 1 && std::string_view(argv[1]) == "--self-test") {
        const bool ok = notification_hub::audio_engine::audio_engine_self_test();
        std::cout << "notification-hub-audio-engine self-test: " << (ok ? "ok" : "failed") << "\n";
        return ok ? 0 : 1;
    }
    if (argc > 2 && std::string_view(argv[1]) == "--pipe-server") {
        return notification_hub::audio_engine::run_audio_engine(argv[2]);
    }
    std::cout << "notification-hub-audio-engine (resident WASAPI mixer)\n";
    return 0;
}
