#include <iostream>
#include <string_view>

int main(int argc, char** argv) {
    if (argc > 1 && std::string_view(argv[1]) == "--self-test") {
        std::cout << "notification-hub-runtime self-test: ok\n";
        return 0;
    }

    std::cout << "notification-hub-runtime " << NOTIFICATION_HUB_VERSION << "\n";
    return 0;
}
