add_executable(notification-hub-runtime
  app/main.cpp
  diagnostics/event.cpp
  protocol/message.cpp
  transport/frame.cpp
  transport/named_pipe.cpp
  scene/window.cpp
  scene/renderer.cpp
)

target_include_directories(notification-hub-runtime PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
)

target_compile_features(notification-hub-runtime PRIVATE cxx_std_20)

target_compile_definitions(notification-hub-runtime PRIVATE
  NOTIFICATION_HUB_VERSION="0.1.0-alpha.1"
)

if (WIN32)
  target_link_libraries(notification-hub-runtime PRIVATE user32 gdi32 d2d1 dwrite dcomp d3d11 dxgi)
endif()

add_test(NAME runtime_smoke COMMAND notification-hub-runtime --self-test)
add_test(NAME runtime_protocol_self_test COMMAND notification-hub-runtime --protocol-self-test)
add_test(NAME runtime_transport_self_test COMMAND notification-hub-runtime --transport-self-test)
add_test(NAME runtime_window_self_test COMMAND notification-hub-runtime --window-self-test)
add_test(NAME runtime_render_self_test COMMAND notification-hub-runtime --render-self-test)

find_program(NODE_EXECUTABLE node)
if (NODE_EXECUTABLE)
  add_test(
    NAME runtime_named_pipe_smoke
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tests/node/named-pipe-smoke.test.mjs" "$<TARGET_FILE:notification-hub-runtime>"
  )
  add_test(
    NAME runtime_process_manager_smoke
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tests/node/runtime-process-manager-smoke.test.mjs" "$<TARGET_FILE:notification-hub-runtime>"
  )
  set_tests_properties(runtime_named_pipe_smoke runtime_process_manager_smoke PROPERTIES
    WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}"
  )
endif()
