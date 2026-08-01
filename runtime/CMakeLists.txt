add_executable(notification-hub-runtime
  app/main.cpp
  diagnostics/event.cpp
  protocol/message.cpp
  transport/frame.cpp
)

target_include_directories(notification-hub-runtime PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
)

target_compile_features(notification-hub-runtime PRIVATE cxx_std_20)

target_compile_definitions(notification-hub-runtime PRIVATE
  NOTIFICATION_HUB_VERSION="0.1.0-alpha.1"
)

add_test(NAME runtime_smoke COMMAND notification-hub-runtime --self-test)
add_test(NAME runtime_protocol_self_test COMMAND notification-hub-runtime --protocol-self-test)
add_test(NAME runtime_transport_self_test COMMAND notification-hub-runtime --transport-self-test)
