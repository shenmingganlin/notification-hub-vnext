# Phase 0/1 状态

日期：2026-08-01

## 已完成

- vNext Git 仓库已在工作区初始化。
- 旧版已复制到 `legacy-reference/notification-hub-0.2.1`，作为隔离参考。
- 建立 `plugin`、`runtime`、`schemas`、`tests`、`docs` 目录边界。
- 建立 Node.js package、CMake、CTest 和版本文件。
- 建立最小 Node.js smoke test。
- `npm run check` 通过。
- `npm test` 通过。

## 当前阻塞

- 当前 shell 未发现 CMake。
- 当前 shell 未发现 MSVC `cl` 或 Visual Studio Developer Command Prompt 环境。
- Windows SDK 已发现：`10.0.26100.0`。

因此 C++ Runtime 目前只有可追踪的源码入口，尚未完成实际编译验证。

## 下一步

工具链就绪后，运行：

```powershell
cmake --preset debug
cmake --build --preset debug
ctest --preset debug
```

随后进入 Phase 2：版本化协议和结构化诊断模型。
