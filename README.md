# Bamboo — 基于 DeepSeek Harness 的 Codex 风味桌面端

> **🎋 Bamboo 是 DeepSeek Harness (dsh) 的二开项目**，在 dsh 官方 Agent 内核之上，为它套了一层 Codex 风格的桌面 UI，并封装了 Python Bridge 实现前端与 dsh 的无缝对接。

## 一句话定位

```
dsh (官方 Agent 内核)  +  Bridge (Python JSON-RPC 桥接)  +  React UI (Codex 风格)
         ↓                                      ↓                        ↓
   DeepSeek 智能体核心                    协议适配层                  三栏对话界面
```

## 架构关系

```
┌─────────────────────────────────────────────────────────────────┐
│                      Bamboo Desktop                              │
│  ┌─────────────┐  ┌───────────────────┐  ┌───────────────────┐  │
│  │  Sidebar    │  │   Chat Area       │  │  Tool Panel       │  │
│  │  (会话列表)  │  │   (对话流)         │  │  (工具/模型/状态)  │  │
│  └──────┬──────┘  └────────┬──────────┘  └────────┬──────────┘  │
│         │                  │                       │             │
│         └──────────────────┼───────────────────────┘             │
│                            ▼                                     │
│              ┌───────────────────────┐                           │
│              │   React UI (Vite)      │  ← Codex 风格配色 + 三栏布局  │
│              │   :1420 / /api proxy  │                           │
│              └───────────┬───────────┘                           │
│                          │ HTTP + SSE                            │
│              ┌───────────┴───────────┐                           │
│              │  Python Bridge        │  ← 协议转换层（不魔改 dsh）  │
│              │  FastAPI + uvicorn    │                             │
│              │  :18720               │                             │
│              └───────────┬───────────┘                           │
│                          │ JSON-RPC over stdio                    │
│              ┌───────────┴───────────┐                           │
│              │  DeepSeek Harness     │  ← 官方内核，保持纯净        │
│              │  (dsh vendor)         │                             │
│              │  dsh-jsonrpc-agent    │                             │
│              └───────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

### 三层职责清晰划分

| 层 | 归属 | 职责 | 是否修改 |
|----|------|------|----------|
| **UI 层** | Bamboo 自研 | React 组件、Codex 风格布局、SSE 事件流处理 | ✅ 完整自研 |
| **Bridge 层** | Bamboo 自研 | Python FastAPI 服务，将 HTTP/SSE 转为 dsh JSON-RPC | ✅ 完整自研 |
| **Agent 层** | dsh 官方 | `dsh-jsonrpc-agent` 子进程，处理 agent loop / tool / compaction | ❌ **零修改** |

## 基于 dsh 的二开内容

### 我们在 dsh 之外做了什么

1. **Python Bridge**（`bridge/main.py`）
   - 独立子进程管理 `dsh-jsonrpc-agent`，不侵入 dsh 源码
   - 通过 dsh 官方 JSON-RPC 协议通信（`session/run`、`session/create` 等）
   - 支持 mock 模式，无需 API Key 即可演示 UI

2. **React UI**（`src/`）
   - Codex 风格三栏布局：左侧会话树 + 中间对话流 + 右侧工具面板
   - SSE 流式事件接收（`reasoning-delta`、`text-delta`、`tool-call`）
   - 深色主题配色方案直接借鉴 Codex Desktop 规范

3. **model-router 插件**（`plugins/bamboo-model-router/`）
   - 作为 dsh Cordis 插件加载，复用 `ctx.llm` seam
   - 实现多 key/多供应商 failover，Buffered Stream 策略
   - 对 agent loop 完全透明，用户无感知切换

4. **Tauri 桌面壳**（`src-tauri/`）
   - 替代 Electron，打包为原生 exe
   - 进程管理：启动时拉起 bridge，关闭时优雅退出

### 我们**没有**做的

- ❌ 没有修改 dsh 的任何一行源代码
- ❌ 没有 fork dsh 仓库
- ❌ 没有绕过 dsh 的公开接口
- ❌ 没有魔改 agent loop / tool / compaction 逻辑

## 技术栈

| 层次 | 技术 | 来源 |
|------|------|------|
| UI 框架 | React 19 + Vite 6 | 自研 |
| 桌面壳 | Tauri 2 | 自研（计划打包用） |
| Bridge | Python 3.10 + FastAPI + uvicorn | 自研 |
| Agent 内核 | DeepSeek Harness (dsh) | [官方仓库](https://github.com/deepseek-ai/deepseek-harness) |
| 协议 | dsh JSON-RPC over stdio | 官方协议，未修改 |
| 插件系统 | dsh Cordis | 官方插件机制 |
| Failover | model-router (Buffered Stream) | 自研 dsh 插件 |

## 运行方式

### 前置条件
```bash
# Python 依赖
pip install fastapi uvicorn httpx

# Node.js 依赖（已在 src/node_modules/）
cd src && npm install
```

### Mock 模式（无需 API Key，演示用）
```bash
set BAMBOO_MOCK=1
python bridge/main.py --port 18720
# 另一个终端
cd src && npx vite dev --port 1420
# 打开 http://localhost:1420
```

### 真实模式（连接 dsh）
```bash
set DEEPSEEK_API_KEY=sk-xxx
python bridge/main.py --port 18720 --config bridge/cordis.yml
cd src && npx vite dev --port 1420
```

### Windows 一键启动
```bash
.\launch.bat
```

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DEEPSEEK_API_KEY` | dsh 调用的 API key | 真实模式必填 |
| `DEEPSEEK_BASE_URL` | API 基础 URL | 可选 |
| `DSH_RUNTIME_BIN` | 手动指定 dsh-jsonrpc-agent exe 路径 | 可选 |
| `BAMBOO_MOCK=1` | 强制 mock 模式（无网络，有 demo 效果） | 可选 |
| `DSH_CORDIS_CONFIG` | 自定义 Cordis 配置文件路径 | 可选 |

## 目录结构

```
bamboo/
├── bridge/                 # Python Bridge（自研，不修改 dsh）
│   └── main.py            # FastAPI 服务 + JSON-RPC over stdio 客户端
├── src/                   # React UI（自研，Codex 风格）
│   ├── components/
│   │   ├── ChatArea.tsx    # 对话流，SSE 事件渲染
│   │   ├── Sidebar.tsx     # 会话列表
│   │   └── ToolPanel.tsx   # 工具调用 + 模型信息
│   ├── types/
│   │   └── bridge.ts       # 类型定义 + runOnBridge()
│   ├── styles/             # Codex 风格深色 CSS
│   ├── App.tsx             # 主组件
│   └── dist/               # Vite 构建产物
├── src-tauri/             # Tauri 桌面壳（自研）
│   ├── src/main.rs         # 启动 bridge 子进程 + 加载 UI
│   ├── Cargo.toml
│   └── tauri.conf.json
├── plugins/
│   └── bamboo-model-router/  # dsh 插件（自研，挂入 dsh Cordis）
│       ├── src/index.ts    # ModelRouterAdapter
│       ├── src/buffered-stream.ts  # Buffered Stream 实现
│       └── cordis.patch.yml  # Cordis 配置补丁
├── profiles/
│   └── bamboo/
│       └── profile.yml     # dsh profile 配置
├── vendor/
│   └── deepseek-harness/   # dsh git submodule（官方仓库，未修改）
│       ├── python/sdk/     # 官方 Python SDK
│       └── python/sdk-runtime/  # 官方运行时
├── scripts/
│   ├── dev.cjs            # 开发启动器（bridge + vite）
│   └── build.cjs          # 生产构建
├── launch.bat             # Windows 一键启动
├── README.md
└── .github/workflows/build.yml  # CI：构建 Windows exe
```

## 与 dsh 的关系声明

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   🎋 Bamboo is built ON TOP OF DeepSeek Harness (dsh)   │
│                                                         │
│   dsh (官方) ── 提供 Agent 内核、JSON-RPC 协议、Cordis    │
│   ┌─────────────────────────────────────────────────┐   │
│   │ 我们的贡献：                                      │   │
│   │  • Python Bridge（协议转换层）                     │   │
│   │  • React UI（Codex 风格桌面端）                    │   │
│   │  • model-router 插件（多 key failover）            │   │
│   │  • Tauri 桌面壳 + CI 打包                         │   │
│   └─────────────────────────────────────────────────┘   │
│                                                         │
│   dsh 代码：零修改，零 fork，仅通过官方 JSON-RPC 接口调用 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## License

MIT（UI / Bridge / 插件部分）
dsh 部分保留原仓库 License
