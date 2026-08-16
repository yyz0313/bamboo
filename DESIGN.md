# Bamboo 设计文档

## 1. 架构总览

```text
┌────────────────────────────────────────────────────────────┐
│                        Bamboo 桌面端                       │
│  React + TypeScript UI（仿 Codex 交互）                     │
│  会话列表 │ 对话流 │ 工具卡片 │ Diff │ Key 池 │ 插件面板      │
└──────────────────────────┬─────────────────────────────────┘
                           │ Tauri command / WebSocket / stdio
┌──────────────────────────▼─────────────────────────────────┐
│                      bridge (Node/TS)                     │
│  - 启动/守护 dsh 进程                                       │
│  - 统一事件协议（JSON Lines）                                │
│  - CLI 与桌面端共用                                         │
└──────────────────────────┬─────────────────────────────────┘
                           │ dsh CLI / API
┌──────────────────────────▼─────────────────────────────────┐
│              dsh（DeepSeek Harness 官方内核）               │
│  Agent Loop / Session / Tool Registry / Approval / Plugin  │
└───────┬───────────────────────────────┬────────────────────┘
        │                               │
  官方插件生态                     自研插件（官方规范）
  ┌──────────────┐            ┌──────────────────────────┐
  │ llm-deepseek │            │ bamboo-model-router      │
  │ tool-bash    │            │ 多 Key / 多供应商 failover│
  │ tool-fs      │            └──────────────────────────┘
  └──────────────┘
```

## 2. 为什么这样选

| 决定 | 理由 |
|---|---|
| dsh 为内核 | 官方维护 Agent loop、工具、会话、热插拔，避免重复造轮子 |
| Node/TS bridge | dsh 本身是 Node/TS，官方插件 API 可直接复用，升级成本低 |
| Tauri 2 | 长期产品包体小、内存低、Rust 适合做 sidecar 进程管理 |
| React + TypeScript | 最接近 Codex 桌面端生态，长期维护资料多 |
| Codex 只做参考 | 避免深度依赖上游每日迭代，降低维护成本 |
| CLI 与桌面端共用 bridge | 两套入口行为一致，减少双实现 |

## 3. 热插拔设计

- 完全使用 dsh 官方 `cordis.patch.yml` / plugin 机制。
- 自研插件以 `@bamboo/*` 命名，按官方 bundle/plugin 结构发布。
- 桌面端只负责“发现、展示、启停”，不另造插件框架。
- `bamboo plugin list|load|unload|reload` 是对 dsh 官方命令的薄封装。

## 4. 事件协议（bridge <-> UI）

所有事件使用 JSON Lines（`\n` 分隔）。

核心事件：

```jsonc
{ "type": "session.started", "sessionId": "abc", "ts": "..." }
{ "type": "agent.message", "sessionId": "abc", "content": "..." }
{ "type": "tool.call_started", "sessionId": "abc", "tool": "bash", "args": { "command": "ls" } }
{ "type": "tool.call_finished", "sessionId": "abc", "tool": "bash", "result": { "exitCode": 0 } }
{ "type": "model.failover", "from": "deepseek-official", "to": "backup-1", "reason": "insufficient_quota" }
{ "type": "plugin.loaded", "plugin": "bamboo-model-router", "version": "0.1.0" }
```

## 5. Codex 维护边界

- `vendor/codex` 以 submodule 方式保存上游源码，仅用于阅读/参考/截图对比。
- `docs/codex-reference.md` 记录每次 Codex 更新中值得借鉴的 UI/交互/工具设计。
- 不直接 import Codex 内部 Rust/TS 代码。
- 如果未来要复用部分 Codex UI，通过独立 `patches/` 管理，并保持最小改动。

## 6. dsh 维护边界

- `vendor/deepseek-harness` 以 submodule 方式锁定上游版本。
- bridge 只依赖 dsh 的 CLI 稳定入口和官方插件 API。
- 上游升级流程：更新 submodule → 跑兼容测试 → 修 bridge → 发布。
