# dsh-archive-manager 集成 + 记忆迁移解决方案

## 1. dsh-archive-manager 集成方案

### 作用
为 Bamboo 提供完整的归档会话管理：
- 查看已归档的会话
- 恢复会话到侧边栏
- 安全删除会话记录
- 按工作区分组显示

### 集成方式

#### 方法 A：作为外部插件加载
```bash
# 安装到 Bamboo 项目
cd /c/Users/yyz20/WorkBuddy/bamboo
git submodule add https://github.com/jasonrale/dsh-archive-manager vendor/archive-manager

# 在 bridge/cordis.yml 中注册
- id: archive-manager
  name: '@deepseek-ai/dsh-archive-manager'
  config:
    # 自动加载归档管理器
    enableArchiveBrowser: true
```

#### 方法 B：集成到 bridge 内置
将 archive-manager 的核心功能（AgentHandle.dispose 捕获、归档管理）集成到 `bridge/main.py`：

```python
# 在 Bridge 类中集成
class Bridge:
    def __init__(self, ...):
        ...
        # 集成归档管理器
        self.agent_disposers = {}
        
    async def _capture_agent_disposer(self, agent_id: str, disposer):
        """捕获 agent 销毁函数，用于安全删除会话"""
        self.agent_disposers[agent_id] = disposer
        
    async def unarchive_session(self, session_id: str):
        """从归档中恢复会话"""
        ...
        
    async def delete_session(self, session_id: str):
        """安全删除会话（含完整清理）"""
        disposer = self.agent_disposers.get(session_id)
        if disposer:
            await disposer()
        # 删除磁盘记录
        ...
```

---

## 2. 无痛搬家（记忆/配置迁移）方案

### 2.1 迁移目标
从 ZCode、Work Buddy、Codex 等搬迁到 Bamboo：

| 项目 | ZCode 路径 | Work Buddy 路径 | 迁移目标 |
|------|-----------|-----------------|----------|
| 记忆 | `.agents/notes/` | `.agents/notes/` | `.agents/notes/` |
| 项目 | `.zcode/projects/` | `work-buddy/` | `profiles/` |
| 技能 | `.agents/skills/` | `.agents/skills/` | `plugins/` |
| 模型 | `.env` + config | `.env` + config | `profiles/config.yml` |
| 会话 | `.sessions/` | `.sessions/` | `.sessions/` |

### 2.2 迁移脚本设计

```python
# migration.py - Bamboo 记忆迁移工具

import json
import shutil
from pathlib import Path
from typing import Dict, List, Optional

class MemoryMigrator:
    """从其他 agent 迁移记忆和配置到 Bamboo"""
    
    MIGRATION_SOURCES = {
        'zcode': {
            'memory': '.agents/notes/',
            'skills': '.agents/skills/',
            'projects': '.zcode/projects/',
            'sessions': '.sessions/'
        },
        'workbuddy': {
            'memory': '.agents/notes/',
            'skills': '.agents/skills/',
            'projects': 'work-buddy/projects/',
            'sessions': '.sessions/'
        },
        'codex': {
            'memory': '.codex/notes/',
            'projects': 'codex/projects/',
            'sessions': '.codex/sessions/'
        }
    }
    
    def migrate(self, source: str, target: Path, options: Dict = None):
        """迁移记忆和配置"""
        if source not in self.MIGRATION_SOURCES:
            raise ValueError(f"Unsupported source: {source}")
        
        configs = self.MIGRATION_SOURCES[source]
        
        # 1. 记忆迁移（notes）
        if 'memory' in configs:
            src_memory = target.parent / configs['memory']
            if src_memory.exists():
                self._migrate_memory(src_memory, target / '.agents' / 'notes')
        
        # 2. 技能迁移
        if 'skills' in configs:
            self._migrate_skills(target / configs['skills'], target / 'plugins/')
        
        # 3. 项目/配置迁移
        if 'projects' in configs:
            self._migrate_configs(target / configs['projects'], target / 'profiles/')
        
        # 4. 会话迁移
        if 'sessions' in configs:
            self._migrate_sessions(target / configs['sessions'], target / '.sessions/')
    
    def _migrate_memory(self, src: Path, dst: Path):
        """迁移记忆文件，更新引用路径"""
        dst.mkdir(parents=True, exist_ok=True)
        
        for note_file in src.rglob('*.md'):
            rel_path = note_file.relative_to(src)
            dst_file = dst / rel_path
            dst_file.parent.mkdir(parents=True, exist_ok=True)
            
            # 读取并更新内容
            content = note_file.read_text(encoding='utf-8')
            
            # 更新路径引用（相对路径转换）
            content = self._update_path_references(content, str(src), str(dst))
            
            dst_file.write_text(content, encoding='utf-8')
            print(f"Migrated: {note_file.name}")
    
    def _update_path_references(self, content: str, old_base: str, new_base: str) -> str:
        """更新文件中的路径引用"""
        import re
        
        # 更新相对路径引用
        content = content.replace(old_base, new_base)
        
        # 更新代码中的路径
        patterns = [
            r'["\'](/[A-Za-z0-9./_-]+)["\']',
            r'["\']([A-Z]:\\[A-Za-z0-9\\./_-]+)["\']'
        ]
        for pattern in patterns:
            def replacer(m):
                old_path = m.group(1)
                # 转换为新路径格式
                return f'"{old_path}"'
            content = re.sub(pattern, replacer, content)
        
        return content
    
    def _migrate_skills(self, src: Path, dst: Path):
        """迁移技能文件"""
        if not src.exists():
            return
            
        dst.mkdir(parents=True, exist_ok=True)
        
        for skill_dir in src.iterdir():
            if skill_dir.is_dir():
                # 复制技能目录
                dst_skill = dst / skill_dir.name
                if dst_skill.exists():
                    shutil.rmtree(dst_skill)
                shutil.copytree(skill_dir, dst_skill)
                print(f"Migrated skill: {skill_dir.name}")
    
    def _migrate_configs(self, src: Path, dst: Path):
        """迁移配置文件"""
        dst.mkdir(parents=True, exist_ok=True)
        
        for config_file in src.rglob('*.yml'):
            rel_path = config_file.relative_to(src)
            dst_file = dst / rel_path
            
            try:
                content = config_file.read_text(encoding='utf-8')
                # 更新模型配置
                content = self._update_model_configs(content)
                dst_file.parent.mkdir(parents=True, exist_ok=True)
                dst_file.write_text(content, encoding='utf-8')
                print(f"Migrated config: {config_file.name}")
            except Exception as e:
                print(f"Failed to migrate {config_file}: {e}")
    
    def _update_model_configs(self, content: str) -> str:
        """更新模型配置以匹配 Bamboo 的 dsh 格式"""
        import re
        
        # 更新模型名称
        renames = {
            'gpt-4': 'deepseek-v4',
            'gpt-3.5-turbo': 'deepseek-v4-flash',
            'claude': 'deepseek-v4',
            'moonshot': 'deepseek-moongroup'
        }
        
        for old, new in renames.items():
            content = content.replace(f'"{old}"', f'"{new}"')
            content = content.replace(f"'{old}'", f"'{new}'")
        
        return content
    
    def _migrate_sessions(self, src: Path, dst: Path):
        """迁移会话记录"""
        dst.mkdir(parents=True, exist_ok=True)
        
        for session_file in src.rglob('*.jsonl'):
            rel_path = session_file.relative_to(src)
            dst_file = dst / rel_path
            dst_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(session_file, dst_file)
            print(f"Migrated session: {session_file.name}")


# CLI 命令
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Bamboo 记忆迁移工具")
    parser.add_argument("--source", choices=['zcode', 'workbuddy', 'codex'], 
                       help="源目录类型")
    parser.add_argument("--target", default=".", 
                       help="目标目录（默认当前目录）")
    parser.add_argument("--dry-run", action="store_true",
                       help="演示模式，不实际修改")
    
    args = parser.parse_args()
    
    if args.dry_run:
        print("演示模式 - 将要执行的迁移操作：")
        print(f"  来源: {args.source}")
        print(f"  目标: {args.target}")
    else:
        migrator = MemoryMigrator()
        migrator.migrate(args.source, Path(args.target))
        print("迁移完成！")
```

### 2.3 前端迁移界面

在 Bamboo UI 中添加迁移向导：

```tsx
// src/components/MigrationWizard.tsx
const MigrationWizard: React.FC = () => {
  const [step, setStep] = useState<'source' | 'scan' | 'confirm' | 'import' | 'done'>(
    'source'
  );
  
  const [sourceType, setSourceType] = useState<'zcode' | 'workbuddy' | 'codex'>('zcode');
  const [detectedFiles, setDetectedFiles] = useState<{type: string, count: number}[]>([]);
  
  // 扫描迁移来源
  const scanSource = async () => {
    // 调用后端 /api/migrate/scan 接口
    const response = await fetch('/api/migrate/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: sourceType })
    });
    const data = await response.json();
    setDetectedFiles(data.files);
    setStep('confirm');
  };
  
  return (
    <div className="migration-wizard">
      {step === 'source' && (
        <SourceSelection 
          onSelect={setSourceType}
          onContinue={scanSource}
        />
      )}
      {step === 'scan' && <ScanningIndicator />}
      {step === 'confirm' && (
        <ConfirmMigration 
          files={detectedFiles}
          onImport={() => setStep('import')}
          onCancel={() => setStep('source')}
        />
      )}
      {step === 'import' && <ImportProgressBar />}
      {step === 'done' && <MigrationComplete />}
    </div>
  );
};
```

---

## 3. 数据迁移到 D 盘方案

### 3.1 环境变量配置

```bash
# 设置 Bamboo 数据目录为 D 盘
setx BAMBOO_DATA_DIR "D:\Bamboo\Data"
setx BAMBOO_SESSION_DIR "D:\Bamboo\essions"
setx BAMBOO_CACHE_DIR "D:\Bamboo\Cache"
```

### 3.2 bridge/main.py 修改

```python
# 修改 resolve_runtime() 函数
def get_data_dir() -> Path:
    """获取 Bamboo 的数据目录（优先从环境变量读取）"""
    # 优先检查环境变量
    data_dir = os.environ.get("BAMBOO_DATA_DIR")
    if data_dir:
        return Path(data_dir)
    
    # 检查 D 盘是否可用
    d_drive = Path("D:/Bamboo/Data")
    if d_drive.parent.exists() and d_drive.parent.stat().st_size > 0:
        return d_drive
    
    # 回退到 C 盘
    return Path.home() / ".bamboo" / "data"

# 修改配置路径
DATA_DIR = get_data_dir()
SESSION_DIR = DATA_DIR / "sessions"
CONFIG_DIR = DATA_DIR / "config"
CACHE_DIR = DATA_DIR / "cache"

def get_config_path() -> Path:
    return CONFIG_DIR / "bamboo.yml"

def get_session_root() -> Path:
    return SESSION_DIR
```

### 3.3 launch.bat 修改

```batch
@echo off
:: bamboo-launch.bat - 优化启动脚本

:: 设置数据目录到 D 盘（如果可用）
if not exist "D:\Bamboo" (
    echo 创建 D 盘 Bamboo 目录...
    mkdir "D:\Bamboo" 2>nul
)

:: 设置环境变量
set BAMBOO_DATA_DIR=D:\Bamboo\Data
set BAMBOO_SESSION_DIR=D:\Bamboo\Sessions
set BAMBOO_CACHE_DIR=D:\Bamboo\Cache

:: 创建目录
if not exist "%BAMBOO_DATA_DIR%" mkdir "%BAMBOO_DATA_DIR%"
if not exist "%BAMBOO_SESSION_DIR%" mkdir "%BAMBOO_SESSION_DIR%"
if not exist "%BAMBOO_CACHE_DIR%" mkdir "%BAMBOO_CACHE_DIR%"

:: 设置 Python 路径
set PYTHONPATH=%~dp0bridge;%PYTHONPATH%

:: 启动桥接服务
echo 启动 Bamboo Bridge...
python "%~dp0bridge\main.py" --port 18720 --config "%~dp0bridge\cordis.yml" &

:: 等待桥接启动
timeout /t 2 /nobreak >nul

:: 启动前端
echo 启动前端 UI...
cd "%~dp0src"
npx vite --port 5173 --host 127.0.0.1

pause
```

### 3.4 前端配置

```tsx
// src/config/data-paths.ts
export const DATA_PATHS = {
  // 数据目录
  get dataDir(): string {
    return process.env.BAMBOO_DATA_DIR || 
           (this.isWindows && this.isDDriveAvailable() ? 
            'D:/Bamboo/Data' : 
            this.getDefaultDataDir());
  },
  
  get sessionDir(): string {
    return process.env.BAMBOO_SESSION_DIR || `${this.dataDir}/sessions`;
  },
  
  get configDir(): string {
    return process.env.BAMBOO_CONFIG_DIR || `${this.dataDir}/config`;
  },
  
  get cacheDir(): string {
    return process.env.BAMBOO_CACHE_DIR || `${this.dataDir}/cache`;
  },
  
  private isWindows(): boolean {
    return navigator.platform.includes('Win');
  },
  
  private isDDriveAvailable(): boolean {
    // 检查 D 盘是否可用
    return this.isWindows && navigator.userAgent.includes('Windows');
  },
  
  private getDefaultDataDir(): string {
    // C 盘默认路径
    return process.env.HOME ? 
      `${process.env.HOME}/.bamboo` : 
      '/tmp/bamboo';
  }
};

// 迁移到 D 盘
export async function migrateToDDrive() {
  const newDir = 'D:/Bamboo/Data';
  
  // 确认迁移
  const confirm = await confirm(
    '即将迁移数据到 D 盘\n' +
    '源目录: ' + DATA_PATHS.dataDir + '\n' +
    '目标目录: ' + newDir + '\n' +
    '是否继续？'
  );
  
  if (!confirm) return false;
  
  // 执行迁移
  const success = await copyDirectory(DATA_PATHS.dataDir, newDir);
  
  if (success) {
    // 更新配置
    await updateConfig({
      dataDir: newDir,
      sessionDir: `${newDir}/sessions`,
      cacheDir: `${newDir}/cache`
    });
    
    // 设置环境变量
    localStorage.setItem('bamboo_data_dir', newDir);
    
    return true;
  }
  
  return false;
}
```

---

## 4. 集成步骤总结

### 步骤 1：集成 archive-manager
```bash
# 克隆并集成
git clone https://github.com/jasonrale/dsh-archive-manager vendor/archive-manager
git add vendor/archive-manager

# 更新 cordis.yml
```

### 步骤 2：部署迁移工具
```bash
# 添加迁移命令到 bridge
cp bridge/migration.py bridge/

# 在 bridge/main.py 添加 API 端点
@app.post("/api/migrate")
async def migrate(request: Request):
    ...
```

### 步骤 3：更新数据目录配置
```bash
# 创建迁移脚本
copy D盘迁移脚本
```

### 步骤 4：前端集成
```tsx
// 添加迁移向导组件
// 更新设置页面
// 添加数据目录迁移按钮
```

---

## 5. 使用示例

### 迁移记忆
```bash
python script/migrate.py --source zcode --target ~/bamboo
python script/migrate.py --source workbuddy --target ~/bamboo --dry-run
```

### 迁移数据到 D 盘
```bash
# 通过前端界面
# 或命令行
python bridge/migration.py --migrate-data --to D:/Bamboo/Data
```

### 使用归档管理器
```bash
# 浏览已归档会话
# 在侧边栏点击 "已归档" 进入归档面板

# 恢复会话
# 点击任意会话即可继续聊天

# 删除会话
# 点击会话右侧的删除图标，确认后彻底清除
```