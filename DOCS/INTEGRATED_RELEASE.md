# Bamboo 整合发布方案

## 1. 傻瓜式安装（打包 exe）

### 方案 A：GitHub Releases + Install Script

```powershell
# 安装脚本：install-bamboo.ps1
param(
    [string]$InstallDir = "$env:USERPROFILE\Bamboo",
    [switch]$Force
)

$ReleaseUrl = "https://github.com/yyz0313/bamboo/releases/latest"
$ExeName = "bamboo-setup-x64.exe"

Write-Host "🍀 正在下载 Bamboo 安装包..." -ForegroundColor Green

# 创建安装目录
if (Test-Path $InstallDir) {
    if ($Force) {
        Remove-Item -Recurse -Force $InstallDir
    } else {
        Write-Host "目录已存在，使用 $InstallDir" -ForegroundColor Yellow
    }
}
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# 下载最新 release
$LatestRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/yyz0313/bamboo/releases/latest"
$Asset = $LatestRelease.assets | Where-Object { $_.name -eq $ExeName }

if (-not $Asset) {
    # 下载 zip 包
    $Asset = $LatestRelease.assets | Where-Object { $_.name -like "*.zip" } | Select-Object -First 1
}

$DownloadUrl = $Asset.browser_download_url
$ZipPath = "$env:TEMP\bamboo.zip"

Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath

# 解压
if ($Asset.name -like "*.exe") {
    # 直接执行安装程序
    Start-Process -FilePath $ZipPath -ArgumentList "/S","/D=$InstallDir" -Wait
} else {
    # 解压 zip
    Expand-Archive -Path $ZipPath -DestinationPath $InstallDir -Force
}

# 安装 dsh submodule
Push-Location $InstallDir
Write-Host "🔧 初始化 dsh 依赖..." -ForegroundColor Cyan
git submodule update --init --recursive 2>$null

# 创建快捷方式
$TargetPath = "$InstallDir\launch.bat"
$ShortcutPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Bamboo.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = "/c `"$TargetPath`""
$Shortcut.IconLocation = "$InstallDir\src\dist\favicon.ico"
$Shortcut.Save()

Write-Host "✅ 安装完成！" -ForegroundColor Green
Write-Host "启动方式：" -ForegroundColor Cyan
Write-Host "  - 双击 start menu 中的 'Bamboo' 快捷方式"
Write-Host "  - 或运行 $InstallDir\launch.bat"
```

### 方案 B：单文件可执行程序（Node.js 打包）

```javascript
// build/exe-builder.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function buildExe() {
    // 1. 构建前端
    execSync('cd src && npm run build', { stdio: 'inherit' });
    
    // 2. 打包 Python 依赖
    execSync('pip install -r requirements.txt --target dist/python-deps', { stdio: 'inherit' });
    
    // 3. 使用 pkg 打包 Node.js
    execSync('pkg . --targets node20-win-x64 --output dist/bamboo.exe', { stdio: 'inherit' });
    
    // 4. 打包 Python 为单文件
    execSync('pyinstaller --onefile --name bamboo-bridge dist/bridge/main.py', { stdio: 'inherit' });
    
    // 5. 创建安装包
    execSync('electron-builder --win.nsis', { stdio: 'inherit' });
}
```

### electron-builder 配置

```json
// package.json additions
{
  "build": {
    "appId": "com.yyz20.bamboo",
    "productName": "Bamboo",
    "directories": {
      "output": "dist"
    },
    "win": {
      "target": ["nsis", "zip"],
      "icon": "src/dist/favicon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    },
    "files": [
      "src/**/*",
      "bridge/**/*",
      "plugins/**/*",
      "profiles/**/*",
      "vendor/**/*",
      "!node_modules/**/*"
    ]
  }
}
```

---

## 2. 插件 UI 集成方案

### 2.1 UI 架构设计

```
Bamboo Desktop App
├── 主窗口
│   ├── 侧边栏
│   │   ├── 会话列表 (Archive Manager)
│   │   ├── 插件面板
│   │   │   ├── MCP Bridge 配置
│   │   │   ├── Document Skills 设置
│   │   │   ├── Browser Automation
│   │   │   ├── Skill Creator
│   │   │   └── Diagnostics
│   │   └── 记忆/回忆
│   ├── 主聊天区域
│   └── 底部工具栏
│       ├── 模型选择
│       ├── 温度调节
│       ├── 子agent配置
│       └── 快速工具栏
│
├── 设置面板
│   ├── 数据目录设置
│   ├── 插件管理
│   │   ├── 启用/禁用
│   │   ├── 配置参数
│   │   └── 更新检测
│   ├── 模型配置
│   │   ├── DeepSeek API Key
│   │   ├── OpenAI  compatible
│   │   └── Ollama 本地模型
│   └── 进阶设置
│       ├── 迁移工具
│       └── 更新设置
│
└── 设置向导
    ├── 首次安装向导
    ├── 记忆迁移向导
    └── 数据目录迁移向导
```

### 2.2 插件配置面板组件

```tsx
// src/components/PluginConfigPanel.tsx
import React, { useState, useEffect } from 'react';

interface PluginConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  config: Record<string, any>;
}

const PluginConfigPanel: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginConfig[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadPlugins();
  }, []);
  
  const loadPlugins = async () => {
    try {
      const response = await fetch('/api/plugins');
      const data = await response.json();
      setPlugins(data.plugins);
    } catch (error) {
      console.error('Failed to load plugins:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const updatePlugin = async (pluginId: string, config: any) => {
    await fetch('/api/plugins/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId, config })
    });
  };
  
  return (
    <div className="plugin-config-panel">
      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="plugin-list">
          {plugins.map(plugin => (
            <PluginCard 
              key={plugin.id}
              plugin={plugin}
              onUpdate={updatePlugin}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// 插件卡片组件
const PluginCard: React.FC<{ 
  plugin: PluginConfig; 
  onUpdate: (id: string, config: any) => void; 
}> = ({ plugin, onUpdate }) => {
  const [enabled, setEnabled] = useState(plugin.enabled);
  
  const handleSave = () => {
    onUpdate(plugin.id, { enabled });
  };
  
  return (
    <divclassName="plugin-card">
      <div className="plugin-header">
        <h3>{plugin.name}</h3>
        <label className="switch">
          <input 
            type="checkbox" 
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="slider"></span>
        </label>
      </div>
      
      <p className="plugin-description">{plugin.description}</p>
      
      <PluginConfigForm 
        config={plugin.config}
        onSave={(config) => onUpdate(plugin.id, config)}
      />
    </div>
  );
};
```

---

## 3. 归档管理 UI

```tsx
// src/components/ArchivePanel.tsx
const ArchivePanel: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  
  const loadSessions = async () => {
    const response = await fetch('/api/archive/list');
    const data = await response.json();
    setSessions(data.sessions);
  };
  
  const unarchiveSession = async (sessionId: string) => {
    await fetch('/api/archive/unarchive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    loadSessions(); // 刷新列表
  };
  
  const deleteSession = async (sessionId: string) => {
    if (confirm('确定要彻底删除此会话吗？此操作不可恢复。')) {
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
      <div className="panel-header">
        <h2>已归档会话</h2>
        <input 
          type="text" 
          placeholder="搜索..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      
      <div className="session-list">
        {sessions.filter(s => 
          s.title.includes(filter) || s.id.includes(filter)
        ).map(session => (
          <ArchiveSessionItem
            key={session.id}
            session={session}
            onUnarchive={unarchiveSession}
            onDelete={deleteSession}
          />
        ))}
      </div>
    </div>
  );
};
```

---

## 4. 迁移工具 UI

```tsx
// src/components/MigrationWizard.tsx
const MigrationWizard: React.FC = () => {
  const [step, setStep] = useState<'source' | 'scan' | 'confirm' | 'import' | 'done'>(
    'source'
  );
  const [sourceType, setSourceType] = useState<'zcode' | 'workbuddy' | 'codex'>('zcode');
  const [scanResults, setScanResults] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  
  const scanMigration = async () => {
    setIsRunning(true);
    const response = await fetch('/api/migrate/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: sourceType })
    });
    setScanResults(await response.json());
    setIsRunning(false);
    setStep('confirm');
  };
  
  const runMigration = async () => {
    setIsRunning(true);
    const response = await fetch('/api/migrate/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        source: sourceType,
        target: './'
      })
    });
    setIsRunning(false);
    setStep('done');
  };
  
  return (
    <div className="migration-wizard">
      {step === 'source' && (
        <SourceSelection 
          selected={sourceType}
          onChange={setSourceType}
          onNext={scanMigration}
        />
      )}
      
      {step === 'scan' && isRunning && (
        <ScanningScreen />
      )}
      
      {step === 'confirm' && (
        <ScanResults 
          results={scanResults}
          onImport={runMigration}
          onCancel={() => setStep('source')}
        />
      )}
      
      {step === 'done' && (
        <MigrationComplete />
      )}
    </div>
  );
};
```

---

## 5. 数据目录迁移 UI

```tsx
// src/components/DataDirMigration.tsx
const DataDirMigration: React.FC = () => {
  const [currentDir, setCurrentDir] = useState<string>('');
  const [newDir, setNewDir] = useState<string>(getDefaultDataDir());
  const [size, setSize] = useState<{used: number, available: number}>({used: 0, available: 0});
  
  const getDefaultDataDir = () => {
    const dAvailable = checkDriveAvailable('D:');
    return dAvailable ? 'D:/Bamboo/Data' : '$env:USERPROFILE/Bamboo/Data';
  };
  
  const checkDataDirUsage = (dir: string) => {
    // 调用后台 API 获取目录大小
    fetch(`/api/data-dir/usage?path=${encodeURIComponent(dir)}`)
      .then(r => r.json())
      .then(data => setSize(data));
  };
  
  const migrateDataDir = async () => {
    if (!confirm(`即将迁移数据到 ${newDir}?\n\n注意：迁移过程中请确保 Bamboo 已关闭`)) {
      return;
    }
    
    const response = await fetch('/api/data-dir/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        newDir,
        keepOriginal: false
      })
    });
    
    // 重启引导
    window.location.reload();
  };
  
  return (
    <div className="data-dir-migration">
      <h2>数据目录设置</h2>
      
      <div className="current-dir">
        <label>当前位置：</label>
        <code>{currentDir}</code>
      </div>
      
      <div className="new-dir">
        <label>目标位置：</label>
        <input
          type="text"
          value={newDir}
          onChange={(e) => setNewDir(e.target.value)}
        />
        <button onClick={() => navigator.mediaSession} className="browse-btn">
          浏览...
        </button>
      </div>
      
      <div className="disk-space">
        <h3>磁盘空间</h3>
        <div className="space-info">
          <span>已用: {formatBytes(size.used)}</span>
          <span>可用: {formatBytes(size.available)}</span>
        </div>
      </div>
      
      <button className="migrate-btn" onClick={migrateDataDir}>
        迁移到新位置
      </button>
    </div>
  );
};
```

---

## 6. 更新检查和自动更新

### 更新检查器

```typescript
// src/services/updateChecker.ts
import { autoUpdater } from 'electron-updater';

export class UpdateChecker {
  private autoUpdater: typeof autoUpdater;
  
  constructor() {
    this.autoUpdater = autoUpdater;
    this.setupAutoUpdate();
  }
  
  private setupAutoUpdate() {
    // 检查更新
    this.autoUpdater.checkForUpdatesAndNotify();
    
    // 更新事件
    this.autoUpdater.on('update-available', (info) => {
      this.showUpdateNotification(info);
    });
    
    this.autoUpdater.on('update-downloaded', (info) => {
      this.showDownloadComplete(info);
    });
  }
  
  private async checkForUpdates() {
    const response = await fetch('https://api.github.com/repos/yyz0313/bamboo/releases/latest');
    const release = await response.json();
    const currentVersion = app.getVersion();
    
    return {
      latest: release.tag_name,
      current: currentVersion,
      available: release.tag_name !== currentVersion,
      releaseNotes: release.body
    };
  }
  
  public async showUpdateDialog() {
    const updateInfo = await this.checkForUpdates();
    
    if (updateInfo.available) {
      const dialogResult = await dialog.showMessageBox({
        title: '更新可用',
        message: `Bamboo v${updateInfo.latest} 可用`,
        detail: `当前版本: v${updateInfo.current}\n\n${updateInfo.releaseNotes.substring(0, 500)}...`,
        buttons: ['立即更新', '稍后再说'],
        defaultId: 0
      });
      
      if (dialogResult.response === 0) {
        this.autoUpdater.askToInstallUpgrade();
      }
    } else {
      dialog.showMessageBox({
        title: '已是最新版本',
        message: 'Bamboo 已是最新版本！'
      });
    }
  }
}
```

### 设置页面集成

```tsx
// src/components/Settings/UpdateSettings.tsx
const UpdateSettings: React.FC = () => {
  const [updateInterval, setUpdateInterval] = useState('daily');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  
  const checkNow = async () => {
    // 调用 API 检查更新
    const response = await fetch('/api/update/check');
    const data = await response.json();
    setLastCheck(new Date());
    // 显示结果
  };
  
  return (
    <div className="update-settings">
      <h3>更新设置</h3>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(e) => setAutoUpdate(e.target.checked)}
          />
          自动检查更新
        </label>
      </div>
      
      <div className="setting-group">
        <label>检查频率：</label>
        <select 
          value={updateInterval}
          onChange={(e) => setUpdateInterval(e.target.value)}
        >
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
          <option value="monthly">每月</option>
        </select>
      </div>
      
      <div className="last-check">
        {lastCheck ? `上次检查: ${lastCheck.toLocaleString()}` : '未检查'}
      </div>
      
      <button onClick={checkNow}>立即检查</button>
    </div>
  );
};
```

---

## 7. 安装包内容结构

```
bamboo-setup.exe (或 bamboo-setup-x64.exe)
├── 安装程序
│   ├── Bamboo.exe (主程序)
│   ├── bamboo-bridge.exe (Python 桥接)
│   ├── vite-plugin.exe (前端构建)
│   └── 所有依赖文件
│
├── 集成的 dsh submodule
│   ├── vendor/deepseek-harness/
│   │   ├── python/sdk-runtime/
│   │   └── ... (完整 dsh 源码)
│
├── 默认配置文件
│   ├── bridge/cordis.yml (插件配置)
│   ├── profiles/ (记忆/技能)
│   └── plugins/ (默认插件)
│
└── 启动脚本
    ├── launch.bat (Windows 启动)
    └── bamboo.command (macOS/Linux 启动)
```

---

## 8. 使用流程

### 首次安装
1. 下载 `bamboo-setup-x64.exe`
2. 双击运行，选择安装目录（默认 C:\Users\用户名\Bamboo）
3. 点击 "安装" 完成
4. 安装完成后自动启动设置向导

### 设置向导步骤
1. **语言选择**：中英文自动检测
2. **数据目录**：默认 D 盘（如果可用），否则 C 盘用户目录
3. **API Key**：配置 DeepSeek API Key
4. **模型选择**：选择默认模型和温度
5. **插件选择**：启用默认插件（Archive Manager 等）
6. **记忆迁移**：从 ZCode/Codex 导入记忆（可选）

### 日常使用
- 从开始菜单创建桌面快捷方式
- 首次启动自动检查更新
- 使用侧边栏的 "已归档" 查看历史会话
- 在 "插件" 面板配置各功能

---

## 9. 持续集成/发布流程

### GitHub Actions 工作流

```yaml
# .github/workflows/build-release.yml
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
      
      - name: Install Python deps
        run: pip install -r requirements.txt
      
      - name: Build frontend
        run: |
          cd src
          npm install
          npm run build
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - name: Install Node deps
        run: npm install
      
      - name: Build exe
        run: npm run build:exe
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            dist/bamboo-setup.exe
            dist/bamboo-portable.zip
          generate_release_notes: true
```