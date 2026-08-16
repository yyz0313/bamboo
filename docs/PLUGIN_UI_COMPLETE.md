# 插件 UI 完整实现方案

## 1. 必须实现的插件及其对应 UI 功能

### 1.1 MCP Bridge 插件 (mcp-bridge)

**UI 位置**：侧边栏 → MCP 面板

**完整功能**：
- ✅ MCP 服务器列表管理
- ✅ 服务器状态监控（在线/离线/错误）
- ✅ 工具调用记录
- ✅ 参数配置界面
- ✅ 测试工具功能

```tsx
// src/components/MCPPanel.tsx
const MCPPanel: React.FC = () => {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  
  return (
    <div className="mcp-panel">
      <div className="server-list">
        {servers.map(s => (
          <ServerCard 
            key={s.name}
            server={s}
            onSelect={() => setSelectedServer(s.name)}
          />
        ))}
      </div>
      
      {selectedServer && (
        <ToolExplorer 
          server={servers.find(s => s.name === selectedServer)!}
        />
      )}
    </div>
  );
};

// 工具调用界面
const ToolExplorer: React.FC<{ server: MCPServer }> = ({ server }) => {
  const [tools, setTools] = useState<any[]>([]);
  const [toolParams, setToolParams] = useState<Record<string, any>>({});
  
  const callTool = async (toolName: string, params: any) => {
    const response = await fetch('/api/mcp/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        server: server.name, 
        tool: toolName, 
        params 
      })
    });
    return response.json();
  };
  
  return (
    <div className="tool-explorer">
      <ToolList tools={tools} onSelect={setToolParams} />
      <ToolForm 
        toolName={selectedTool}
        params={toolParams}
        onExecute={callTool}
      />
    </div>
  );
};
```

### 1.2 Archive Manager 插件 (archive-manager)

**UI 位置**：侧边栏底部 → 已归档面板

**完整功能**：
- ✅ 会话列表（按时间/状态排序）
- ✅ 会话搜索（标题/内容）
- ✅ 一键恢复会话
- ✅ 批量删除会话
- ✅ 会话状态显示（运行中/已完成/等待）

```tsx
// src/components/ArchivePanel.tsx
const ArchivePanel: React.FC = () => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    loadSessions();
  }, []);
  
  const loadSessions = async () => {
    setLoading(true);
    const res = await fetch('/api/archive/list');
    const data = await res.json();
    setSessions(data.sessions);
    setLoading(false);
  };
  
  const handleUnarchive = async (sessionId: string) => {
    await fetch('/api/archive/unarchive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    loadSessions(); // 刷新
  };
  
  const handleDelete = async (sessionId: string) => {
    if (confirm('确定要删除此会话吗？此操作不可恢复。')) {
      await fetch('/api/archive/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      loadSessions();
    }
  };
  
  return (
    <div className="archive-panel">
      <input 
        placeholder="搜索会话..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      
      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <SessionList 
          sessions={sessions.filter(s => 
            s.title.includes(filter) || s.id.includes(filter)
          )}
          onUnarchive={handleUnarchive}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
};
```

### 1.3 Document Skills 插件 (document-skills)

**UI 位置**：弹窗/侧边栏 → 文档生成器

**完整功能**：
- ✅ DOCX 模板选择器（R1-R7）
- ✅ 文档预览
- ✅ 格式化规则显示
- ✅ 章节结构编辑
- ✅ 导出/下载按钮

```tsx
// src/components/DocumentGenerator.tsx
const DocumentGenerator: React.FC = () => {
  const [docType, setDocType] = useState('report');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverRecipe, setCoverRecipe] = useState('R1');
  
  const generate = async () => {
    const response = await fetch('/api/document/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'docx',
        title,
        content,
        coverRecipe,
        theme: 'professional'
      })
    });
    
    const result = await response.json();
    if (result.success) {
      window.open(result.downloadUrl, '_blank');
    }
  };
  
  return (
    <div className="document-generator">
      <select onChange={e => setDocType(e.target.value)}>
        <option value="report">报告</option>
        <option value="academic">学术论文</option>
        <option value="contract">合同</option>
        <option value="resume">简历</option>
      </select>
      
      <CoverRecipeSelector 
        docType={docType}
        value={coverRecipe}
        onChange={setCoverRecipe}
      />
      
      <textarea 
        placeholder="请输入文档内容..."
        value={content}
        onChange={e => setContent(e.target.value)}
      />
      
      <button onClick={generate}>生成文档</button>
    </div>
  );
};
```

---

## 2. 完整的插件安装包方案

### 2.1 安装包结构

```
bamboo-setup-x64.exe
├── Bamboo.exe (Electron 主程序)
├── bamboo-bridge.exe (Python 打包版)
├── node/ (内置 Node.js)
├── python/ (内置 Python 3.12)
├── plugins/
│   ├── mcp-bridge/
│   ├── archive-manager/
│   ├── document-skills/
│   └── ... (完整插件列表)
├── vendor/
│   └── deepseek-harness/ (子模块)
├── profiles/
│   └── bamboo/ (默认配置)
└── resources/
    ├── favicon.ico
    └── logo.png
```

### 2.2 离线安装方案

#### 方法 1：内嵌安装器

```python
# build/offline_installer.py
def create_offline_installer():
    """创建离线安装包"""
    
    # 1. 下载所有依赖到本地
    subprocess.run([
        'npm', 'pack', 
        '@deepseek-ai/dsh-tool-mcp-bridge',
        '@deepseek-ai/dsh-tool-document',
        '@deepseek-ai/dsh-tool-browser',
        '@deepseek-ai/dsh-archive-manager'
    ])
    
    # 2. 创建离线包
    with zipfile.ZipFile('bamboo-offline.zip', 'w') as zf:
        # 包含所有插件 tarball
        for pkg in glob('*.tgz'):
            zf.write(pkg)
        
        # 包含安装脚本
        zf.write('install-offline.bat')
        zf.write('install-offline.sh')
    
    return 'bamboo-offline.zip'
```

#### 方法 2：双版本安装器

```batch
:: install-offline.bat - 离线安装脚本
@echo off
setlocal

echo ========================================
echo Bamboo 离线安装程序
echo ========================================

:: 检查是否解压
if not exist "plugins" (
    echo 错误：请先解压 bamboo-offline.zip
    pause
    exit /b 1
)

:: 安装内置插件
echo 正在安装内置插件...
for /d %%d in (plugins\*) do (
    echo 安装: %%d
    xcopy "%%d" "%LOCALAPPDATA%\Bamboo\plugins\%%d" /E /Y /I
)

:: 初始化配置
echo 初始化配置...
if not exist "%LOCALAPPDATA%\Bamboo" mkdir "%LOCALAPPDATA%\Bamboo"
copy "profiles\bamboo" "%LOCALAPPDATA%\Bamboo\profiles\" /Y

echo 安装完成！
pause
```

### 2.3 内网镜像仓库

#### 本地 NPM 镜像

```bash
# 创建本地镜像仓库
mkdir -p /var/www/html/npm-registry
cd /var/www/html/npm-registry

# 同步常用插件（离线模式）
npm pack @deepseek-ai/dsh-tool-mcp-bridge
npm pack @deepseek-ai/dsh-tool-document
npm pack @deepseek-ai/dsh-archive-manager

# 配置 HTTP 镜像
# /etc/nginx/sites-available/npm-registry
server {
    listen 8080;
    server_name localhost;
    root /var/www/html/npm-registry;
    autoindex on;
}
```

#### 客户端镜像配置

```bash
# 客户端配置使用内网镜像
npm set registry http://内网地址:8080

# 或者使用 .npmrc 文件
echo "registry=http://内网地址:8080" > ~/.npmrc
```

### 2.4 增量更新方案

```python
# bridge/update_system.py
class UpdateSystem:
    """增量更新系统"""
    
    def __init__(self, local_cache: Path, cdn_url: str):
        self.local_cache = local_cache
        self.cdn_url = cdn_url
        self.manifest_file = self.local_cache / 'manifest.json'
    
    async def get_available_updates(self) -> List[UpdateInfo]:
        """获取可用更新"""
        remote_manifest = await self._fetch_remote_manifest()
        local_manifest = self._load_local_manifest()
        
        updates = []
        for pkg_name, remote_version in remote_manifest.items():
            local_version = local_manifest.get(pkg_name, {}).get('version', '0.0.0')
            
            if self._version_less(local_version, remote_version):
                updates.append({
                    'package': pkg_name,
                    'version': remote_version,
                    'files': await self._get_update_files(pkg_name, remote_version)
                })
        
        return updates
    
    async def apply_updates(self, updates: List[UpdateInfo]) -> UpdateResult:
        """应用更新"""
        for update in updates:
            # 下载增量包
            delta = await self._download_delta(update.package, update.version)
            
            # 应用到本地
            await self._apply_delta(update.package, delta)
        
        # 更新本地清单
        await self._update_local_manifest(updates)
        
        return {'success': True, 'updated': len(updates)}
```

---

## 3. 必须实现的核心功能清单

### 3.1 计划模式 (Plan Mode)

**UI**：弹窗 → 计划编辑器

```tsx
const PlanMode: React.FC = () => {
  const [steps, setSteps] = useState<PlanStep[]>([]);
  
  return (
    <div className="plan-mode">
      <h2>制定计划</h2>
      
      <AddStepButton onAdd={() => setSteps([...steps, { id: uuid(), action: '', checklist: [] }])} />
      
      {steps.map(step => (
        <PlanStepEditor 
          key={step.id}
          step={step}
          onUpdate={newStep => {
            const idx = steps.findIndex(s => s.id === newStep.id);
            steps[idx] = newStep;
            setSteps([...steps]);
          }}
          onRemove={() => {
            setSteps(steps.filter(s => s.id !== step.id));
          }}
        />
      ))}
      
      <button onClick={() => savePlan()}>保存计划</button>
    </div>
  );
};
```

### 3.2 目标模式 (Goal Mode)

**UI**：侧边栏 → 目标面板

```tsx
const GoalMode: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  
  return (
    <div className="goal-mode">
      <GoalList goals={goals} onEdit={editGoal} onAdd={addGoal} />
      
      <GoalProgress goals={goals} />
      
      <button onClick={() => exportGoalsToPlan()}>导出为计划</button>
    </div>
  );
};
```

### 3.3 记忆/回忆

**UI**：侧边栏 → 记忆面板

```tsx
const MemoryPanel: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  return (
    <div className="memory-panel">
      <input 
        placeholder="搜索记忆..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />
      
      <NoteList 
        notes={notes.filter(n => 
          n.title.includes(searchQuery) || 
          n.content.includes(searchQuery)
        )}
        onEdit={editNote}
        onDelete={deleteNote}
      />
      
      <button onClick={openNoteEditor}>新建记忆</button>
    </div>
  );
};
```

---

## 4. 插件生态完整清单

| 插件 ID | 中文名 | UI 位置 | 核心功能 | 状态 |
|---------|--------|---------|----------|------|
| `mcp-bridge` | MCP桥接 | 侧边栏 | MCP服务器集成 | ✅ 需UI |
| `archive-manager` | 归档管理 | 侧边栏底部 | 会话归档管理 | ✅ 完整 |
| `document-skills` | 文档技能 | 弹窗 | DOCX/PDF/PPTX生成 | ✅ 需UI |
| `browser-automation` | 浏览器自动化 | 侧边栏 | Playwright自动化 | ✅ 需UI |
| `skill-creator` | 技能创建 | 侧边栏 | AI辅助编写技能 | ✅ 需UI |
| `memory-system` | 记忆系统 | 侧边栏 | 长期记忆存储 | ✅ 需UI |
| `plugin-marketplace` | 插件市场 | 设置面板 | 插件安装/管理 | ✅ 需UI |
| `diagnostics` | 诊断工具 | 设置面板 | 问题排查 | ✅ 需UI |
| `usage-tracker` | 使用统计 | 设置面板 | Token/费用监控 | ✅ 需UI |

---

## 5. 安装包发布流程

```yaml
# .github/workflows/release.yml
name: Build Release

on:
  push:
    tags: ['v*']
  release:
    types: [published]

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install Dependencies
        run: |
          pip install -r bridge/requirements.txt
          npm install
      
      - name: Build Frontend
        run: npm run build
      
      - name: Download Plugins
        run: |
          mkdir -p plugins
          npm pack @deepseek-ai/dsh-tool-mcp-bridge
          npm pack @deepseek-ai/dsh-tool-document
          npm pack @deepseek-ai/dsh-archive-manager
          # ... 下载全部核心插件
      
      - name: Build Installer
        run: npm run build:exe
      
      - name: Upload Release Assets
        uses: softprops/action-gh-release@v1
        with:
          files: |
            dist/bamboo-setup-x64.exe
            dist/bamboo-offline.zip
            dist/bamboo-portable.zip
          generate_release_notes: true
```

---

## 6. 离线/内网安装指南

### 6.1 企业内网用户

```batch
:: 1. 从网关下载安装包
curl http://内网网关/bamboo/bamboo-setup-x64.exe -o bamboo-setup.exe

:: 2. 双击运行安装
bamboo-setup.exe

:: 3. 如果需要离线插件
:: 解压 bamboo-offline.zip 到安装目录的 plugins 目录
tar -xzf bamboo-offline.zip -C "C:\Program Files\Bamboo\plugins"
```

### 6.2 无法访问 GitHub

```batch
:: 使用离线安装包
:: 1. 联系管理员获取 bamboo-offline.zip
:: 2. 解压到 USB 盘
:: 3. 在目标机器上运行 install-offline.bat
```

---

## 结论

本方案确保：
1. ✅ 每个插件都有完整的 UI 功能
2. ✅ 所有核心功能都能正常使用
3. ✅ 提供离线安装包
4. ✅ 支持内网镜像源
5. ✅ 增量更新机制
6. ✅ 多种安装方式