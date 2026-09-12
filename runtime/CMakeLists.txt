# Keep Release binaries small without changing runtime behavior. These flags apply only
# to MSVC Release builds; tests and non-MSVC toolchains retain their normal settings.
function(notification_hub_enable_size_optimization target)
  if (MSVC)
    target_compile_options(${target} PRIVATE $<$<CONFIG:Release>:/O1 /GL>)
    target_link_options(${target} PRIVATE $<$<CONFIG:Release>:/LTCG /OPT:REF /OPT:ICF>)
  endif()
endfunction()

# Native tests must keep evaluating assert expressions in every configuration.
# This is deliberately target-scoped so production Release builds retain NDEBUG.
function(notification_hub_enable_test_assertions target)
  if (MSVC)
    target_compile_options(${target} PRIVATE /UNDEBUG)
  else()
    target_compile_options(${target} PRIVATE -UNDEBUG)
  endif()
endfunction()

add_executable(notification-hub-audio-engine-asset-cache-test
  ../tests/native/audio-engine-asset-cache.test.cpp
  audio-engine/asset-cache.cpp
  audio-engine/wav-pcm.cpp
)
target_include_directories(notification-hub-audio-engine-asset-cache-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_SOURCE_DIR})
target_compile_features(notification-hub-audio-engine-asset-cache-test PRIVATE cxx_std_20)
notification_hub_enable_test_assertions(notification-hub-audio-engine-asset-cache-test)
add_test(NAME audio_engine_asset_cache COMMAND notification-hub-audio-engine-asset-cache-test)

add_executable(notification-hub-audio-engine-mixer-test
  ../tests/native/audio-engine-mixer.test.cpp
  audio-engine/mixer.cpp
)
target_include_directories(notification-hub-audio-engine-mixer-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_SOURCE_DIR})
target_compile_features(notification-hub-audio-engine-mixer-test PRIVATE cxx_std_20)
notification_hub_enable_test_assertions(notification-hub-audio-engine-mixer-test)
add_test(NAME audio_engine_mixer COMMAND notification-hub-audio-engine-mixer-test)

add_executable(notification-hub-audio-engine-device-output-test
  ../tests/native/audio-engine-device-output.test.cpp
  audio-engine/device-output.cpp
  audio-engine/mixer.cpp
)
target_include_directories(notification-hub-audio-engine-device-output-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_SOURCE_DIR})
target_compile_features(notification-hub-audio-engine-device-output-test PRIVATE cxx_std_20)
notification_hub_enable_test_assertions(notification-hub-audio-engine-device-output-test)
if (WIN32)
  target_link_libraries(notification-hub-audio-engine-device-output-test PRIVATE ole32 mmdevapi avrt)
endif()
add_test(NAME audio_engine_device_output COMMAND notification-hub-audio-engine-device-output-test)
set_tests_properties(audio_engine_device_output PROPERTIES SKIP_RETURN_CODE 77)

add_executable(notification-hub-audio-engine
  audio-engine/main.cpp
  audio-engine/engine.cpp
  audio-engine/asset-cache.cpp
  audio-engine/media-decoder.cpp
  audio-engine/mixer.cpp
  audio-engine/device-output.cpp
  audio-engine/wav-pcm.cpp
  protocol/message.cpp
  transport/frame.cpp
)
target_include_directories(notification-hub-audio-engine PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_features(notification-hub-audio-engine PRIVATE cxx_std_20)
if (WIN32)
  target_link_libraries(notification-hub-audio-engine PRIVATE ole32 mmdevapi avrt mfplat mfreadwrite mfuuid)
endif()
notification_hub_enable_size_optimization(notification-hub-audio-engine)
add_test(NAME audio_engine_self_test COMMAND notification-hub-audio-engine --self-test)

add_executable(notification-hub-runtime
  app/main.cpp
  diagnostics/event.cpp
  config/config.cpp
  protocol/message.cpp
  transport/frame.cpp
  transport/named_pipe.cpp
  scene/window.cpp
  scene/renderer.cpp
  scene/layout.cpp
  scene/work_area.cpp
  scene/controller.cpp
)

target_include_directories(notification-hub-runtime PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
)

target_compile_features(notification-hub-runtime PRIVATE cxx_std_20)

target_compile_definitions(notification-hub-runtime PRIVATE
  NOTIFICATION_HUB_VERSION="${PROJECT_VERSION}"
)

if (WIN32)
  target_link_libraries(notification-hub-runtime PRIVATE user32 gdi32 d2d1 dwrite d3d11 dxgi)
endif()
notification_hub_enable_size_optimization(notification-hub-runtime)

add_test(NAME runtime_smoke COMMAND notification-hub-runtime --self-test)
add_test(NAME runtime_protocol_self_test COMMAND notification-hub-runtime --protocol-self-test)
add_test(NAME runtime_config_self_test COMMAND notification-hub-runtime --config-self-test)
add_test(NAME runtime_transport_self_test COMMAND notification-hub-runtime --transport-self-test)
add_test(NAME runtime_window_self_test COMMAND notification-hub-runtime --window-self-test)
add_test(NAME runtime_render_self_test COMMAND notification-hub-runtime --render-self-test)
add_test(NAME runtime_hit_test_self_test COMMAND notification-hub-runtime --hit-test-self-test)
add_test(NAME runtime_close_interaction_self_test COMMAND notification-hub-runtime --close-interaction-self-test)
add_test(NAME runtime_unicode_text_self_test COMMAND notification-hub-runtime --unicode-text-self-test)
add_test(NAME runtime_drag_interaction_self_test COMMAND notification-hub-runtime --drag-interaction-self-test)
add_test(NAME runtime_visual_self_test COMMAND notification-hub-runtime --visual-self-test)
add_test(NAME runtime_desktop_visual_self_test COMMAND notification-hub-runtime --desktop-visual-self-test)
add_test(NAME runtime_desktop_hit_test_self_test COMMAND notification-hub-runtime --desktop-hit-test-self-test)
add_test(NAME runtime_dpi_self_test COMMAND notification-hub-runtime --dpi-self-test)
add_test(NAME runtime_dpi_transition_self_test COMMAND notification-hub-runtime --dpi-transition-self-test)
add_test(NAME runtime_scene_controller_self_test COMMAND notification-hub-runtime --scene-controller-self-test)
add_test(NAME runtime_controller_desktop_visual_self_test COMMAND notification-hub-runtime --controller-desktop-visual-self-test)
add_test(NAME runtime_layout_self_test COMMAND notification-hub-runtime --layout-self-test)
add_test(NAME runtime_work_area_self_test COMMAND notification-hub-runtime --work-area-self-test)

find_program(NODE_EXECUTABLE node)
if (NODE_EXECUTABLE)
  add_test(
    NAME runtime_named_pipe_smoke
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tests/node/named-pipe-smoke.test.mjs" "$<TARGET_FILE:notification-hub-runtime>"
  )
  add_test(
    NAME runtime_named_pipe_config_update_smoke
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tests/node/named-pipe-config-update.test.mjs" "$<TARGET_FILE:notification-hub-runtime>"
  )
  add_test(
    NAME runtime_named_pipe_multi_client_smoke
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tests/node/named-pipe-multi-client.test.mjs" "$<TARGET_FILE:notification-hub-runtime>"
  )
  add_test(
    NAME runtime_named_pipe_scene_event_smoke
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tests/node/named-pipe-scene-event.test.mjs" "$<TARGET_FILE:notification-hub-runtime>"
  )
  add_test(
    NAME runtime_named_pipe_behavior_channel_smoke
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tests/node/named-pipe-behavior-channel.test.mjs" "$<TARGET_FILE:notification-hub-runtime>"
  )
  add_test(
    NAME runtime_process_manager_smoke
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tests/node/runtime-process-manager-smoke.test.mjs" "$<TARGET_FILE:notification-hub-runtime>"
  )
  add_test(
    NAME runtime_scene_state_persistence_smoke
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tests/node/scene-state-persistence-runtime-smoke.test.mjs" "$<TARGET_FILE:notification-hub-runtime>"
  )
  add_test(
    NAME runtime_host_adapter_smoke
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tests/node/host-adapter-runtime-smoke.test.mjs" "$<TARGET_FILE:notification-hub-runtime>"
  )
  add_test(
    NAME runtime_host_adapter_restart_smoke
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_SOURCE_DIR}/tests/node/host-adapter-restart-runtime-smoke.test.mjs" "$<TARGET_FILE:notification-hub-runtime>"
  )
  set_tests_properties(runtime_named_pipe_smoke runtime_named_pipe_config_update_smoke runtime_named_pipe_multi_client_smoke runtime_named_pipe_scene_event_smoke runtime_named_pipe_behavior_channel_smoke runtime_process_manager_smoke runtime_scene_state_persistence_smoke runtime_host_adapter_smoke runtime_host_adapter_restart_smoke PROPERTIES
    WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}"
  )
endif()
