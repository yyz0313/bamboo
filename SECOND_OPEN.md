# Bamboo 二开声明

## 本项目与 DeepSeek Harness (dsh) 的关系

**Bamboo 是基于 DeepSeek Harness (dsh) 的二开项目。**

我们**没有修改 dsh 的任何源代码**，而是：

1. 将 dsh 作为 git submodule 引入（锁定官方版本）
2. 通过 dsh 官方 JSON-RPC over stdio 协议与其通信
3. 在 dsh 之外独立实现了 Python Bridge、React UI、model-router 插件

## dsh 官方地址

- GitHub: https://github.com/deepseek-ai/deepseek-harness
- Python SDK: `deepseek-harness-sdk` (PyPI)
- 协议文档: 见 dsh 仓库 `python/sdk-runtime/README.md`

## 我们的贡献范围

| 模块 | 说明 | 是否修改 dsh |
|------|------|-------------|
| `bridge/main.py` | Python FastAPI 服务，HTTP↔JSON-RPC 转换 | ❌ 否 |
| `src/` | React UI（Codex 风格三栏布局） | ❌ 否 |
| `plugins/bamboo-model-router/` | 多 key failover 插件（dsh Cordis 插件） | ❌ 否，仅加载到 dsh |
| `src-tauri/` | Tauri 桌面壳 | ❌ 否 |
| `vendor/deepseek-harness/` | dsh 官方仓库 submodule | ✅ 完全保持原样 |

## 协议

- Bamboo 自研部分：MIT
- dsh 部分：遵循 dsh 原仓库 License
