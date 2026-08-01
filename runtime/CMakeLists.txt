add_executable(notification-hub-runtime
  app/main.cpp
)

target_compile_features(notification-hub-runtime PRIVATE cxx_std_20)

target_compile_definitions(notification-hub-runtime PRIVATE
  NOTIFICATION_HUB_VERSION="0.1.0-alpha.1"
)

add_test(NAME runtime_smoke COMMAND notification-hub-runtime --self-test)
