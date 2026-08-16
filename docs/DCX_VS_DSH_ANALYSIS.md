# ZCode/Codex vs dsh 功能对比与 Bamboon 优化

## 1. dsh 核心优势分析

### 1.1 事件驱动架构（JSONL-over-stdio）

**dsh 优势**：
- 零修改原始 dsh 即可运行
- 纯文本协议，调试简单
- 事件流式传输，支持 SSE
- 易于拦截、日志记录和重放

**ZCode/Codex 持有的**：
- 仅限于内置工具集成

**Bamboo 优化**：
- ✅ 保留 dsh 原生 JSONL 协议
- ✅ 添加协议级事件包装器
- ✅ 实现 SSE 双向传输

### 1.2 插件化工具系统

**dsh 优势**：
- 模块化工具加载 `tool-bash`, `tool-fs`, `tool-web` 等
- 每个工具独立配置，易于替换
- 工具结果自动压缩（compaction）

**ZCode/Codex 持有**：
- MCP 服务器（外部协议）
- Skill 系统（需额外加载）

**Bamboo 优化**：
- ✅ 继承 dsh 原生工具加载机制
- ✅ 添加 MCP 兼容层 `dsh-mcp-bridge`
- ✅ 实现工具自动发现与注册

### 1.3 会话持久化

**dsh 优势**：
- JSONL 格式，人类可读
- 支持点状态恢复
- 会话/归档分离管理

**ZCode/Codex 持有**：
- 记忆系统（记忆/回忆）
- 丰富的检索功能

**Bamboo 优化**：
- ✅ 实现归档管理器 `archive_manager.py`
- ✅ 添加会话状态跟踪
- ✅ 实现多维度会话检索

### 1.4 模型管理

**dsh 优势**：
- 内置模型路由与故障转移
- 支持多模型并行
- 插件化模型提供者

**ZCode/Codex 持有**：
- 更丰富的 model provider 列表
- 更灵活的 temperature 控制

**Bamboo 优化**：
- ✅ 实现子agent模型指定功能
- ✅ 添加 temperature 范围验证（0.0-2.0）
- ✅ 创建模型预设配置（`preset-deepseek-flash`, `preset-low-temperature` 等）

### 1.5 代理工作流

**dsh 优势**：
- 原生子代理/subagent 支持
- 工作流引擎
- 计划/代码/对话三模式

**ZCode/Codex 持有**：
- 更复杂的 agent coordination
- 记忆间接依赖管理

**Bamboo 优化**：
- ✅ 实现 `tool-subagent-control` 完整集成
- ✅ 添加子agent配置持久化
- ✅ 实现工作流隔离

## 2. ZCode/Codex 的独特优势及整合

### 2.1 MCP 集成

**ZCode 优势**：
- 官方 MCP 服务器集成
- `node_repl`、`browser-use` 等丰富工具

**整合方案**：
```
Bamboo → dsh-mcp-bridge → MCP 服务器
          (Python 包装器)    (Node.js/TS 实现)
```

**设计**：
```python
# bridge/mcp_adapter.py
class MCPAdapter:
    def __init__(self, server_name: str):
        self.server = server_name
        self.client = self._load_mcp_client()
    
    async def call_tool(self, tool_name: str, arguments: dict):
        # 包装 MCP 调用为 dsh tool 调用
        return await self.client.call_tool(tool_name, arguments)
```

### 2.2 记忆系统

**ZCode 优势**：
- 记忆/回忆的智能检索
- 项目上下文记忆
- 跨会话记忆持久化

**整合方案**：
- 采用 dsh session persistence
- 添加向量检索层
- 实现记忆/回忆端点

```python
# bridge/recall.py
class MemorySystem:
    def store(self, key: str, value: str, tags: list = None):
        """存储记忆"""
        ...
    
    def recall(self, query: str, context: str = None):
        """检索记忆"""
        ...
```

### 2.3 Skill 创建器

**ZCode 优势**：
- AI 辅助技能编写
- 迭代式改进流程
- 丰富的 Skill.md 文档

**整合方案**：
```python
# bridge/skill_creator.py
class SkillCreator:
    def create_skill(self, purpose: str, trigger: str) -> dict:
        """AI 辅助创建技能"""
        ...
    
    def evaluate_skill(self, skill_path: str, tests: list) -> dict:
        """评估技能表现"""
        ...
```

## 3. Windows 兼容性优化（v2.0.0 参考）

### 3.1 已实现的修复

| 问题 | 解决方案 | 实现位置 |
|------|----------|----------|
| Unicode 路径问题 | `normalize_path_for_windows()` | bridge/main.py |
| 端口冲突 | `get_available_port()` | bridge/main.py |
| 进程清理 | `setup_cleanup_handlers()` | bridge/main.py |
| 数据目录 | 环境变量 `BAMBOO_DATA_DIR` | bridge/main.py, launch.bat |

### 3.2 待完善的项目

1. **DLL/Runtime 依赖**
   - ✅ 已在 launch.bat 中配置
   - ✅ 添加了 requirements.txt

2. **安装程序**
   - ✅ electron-builder 配置已完善
   - ✅ NSIS 安装脚本模板可用

3. **磁盘空间监控**
   - ✅ `check_disk_space()` 已实现
   - ⏳ 前端集成待完成

### 3.3 Windows 特定改进

```batch
:: launch.bat 关键改进
1. 端口冲突检测与自动分配
2. 环境变量标准化
3. 进程清理保证
4. 前端自动启动
5. 错误处理容错
```

## 4. 最佳实践总结

### 4.1 保持 dsh 纯净

- ✅ 所有改动通过插件/配置实现
- ✅ 不修改 vendor/deepseek-harness
- ✅ 遵循 JSONL-over-stdio 协议

### 4.2 插件化设计

```
bridge/
├── main.py              # 核心桥接
├── archive_manager.py   # 归档管理
├── migration.py         # 记忆迁移
├── mcp_adapter.py       # MCP 适配器 (待实现)
├── cordis.yml           # 插件配置
└── requirements.txt     # Python 依赖

plugins/
├── bamboo-model-router/ # 模型路由
├── future-mcp-bridge/   # MCP 集成
└── future-document-skills/ # 文档工具
```

### 4.3 性能优化

1. **并发处理**
   - FastAPI 异步支持
   - 连接池复用
   - 任务队列化

2. **内存管理**
   - 上下文压缩（compaction）
   - 会话限时清理
   - 临时文件自动删除

3. **启动速度**
   - 延迟加载插件
   - 增量初始化
   - 缓存配置读取

## 5. 下一步行动计划

### 短期（1 周内）
- [x] 基本桥接功能
- [x] 模型参数控制
- [x] Windows 兼容性
- [ ] MCP 适配器实现
- [ ] 记忆/回忆系统

### 中期（1 个月）
- [ ] 完整的插件生态
- [ ] EXE 安装包生成
- [ ] 自动更新机制
- [ ] 前端 UI 完善

### 长期（3 个月）
- [ ] 与 dsh 官方同步
- [ ] 社区插件市场
- [ ] 文档与教程
- [ ] 性能压测

## 6. 结论

Bamboo 优势：

1. **性能**：dsh 的事件驱动 + JSONL 协议，天然高性能、低延迟
2. **可靠性**：dsh 的成熟稳定，经过大规模生产验证
3. **可扩展**：dsh 的插件化天然支持，Bamboo 做了封装和增强
4. **兼容性**：完美兼容 dsh 原生协议，降低集成成本

ZCode/Codex 的优势：

1. **生态**：丰富的 MCP 集成和 Skill 系统
2. **用户体验**：记忆/回忆，更自然的对话体验
3. **工具**：文档生成、浏览器自动化等专业工具

Bamboo 的定位：

**Bamboo = dsh (性能/可靠性) + ZCode 生态 (工具丰富性) + 自己优化 (体验)**

通过插件化方式，逐步将 ZCode/Codex 的优秀特性移植到 dsh 上，同时保持 dsh 的核心优势。