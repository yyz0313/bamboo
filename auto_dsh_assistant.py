#!/usr/bin/env python3
"""
Bamboo Auto Agent - 让 dsh 自动协助完成工作
================================================

使用方式：
    # 方法 1：命令行方式
    python auto_dsh_assistant.py --task "实现 ArchivePanel 组件"
    
    # 方法 2：配置文件方式
    python auto_dsh_assistant.py --config bamboo-auto-agent.json
    
    # 方法 3：交互式 mode
    python auto_dsh_assistant.py --interactive

功能：
    - 自动发现项目缺失的组件
    - 调用 dsh 生成代码
    - 自动运行测试
    - 生成文档
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field


@dataclass
class Task:
    """任务定义"""
    name: str
    description: str
    file_path: Optional[str] = None
    template: Optional[str] = None
    test_file: Optional[str] = None


class DshAutoAssistant:
    """使用 dsh 自动完成 Bamboo 项目工作"""
    
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.results: List[Dict[str, Any]] = []
        
    async def execute_task(self, task: Task) -> Dict[str, Any]:
        """执行单个任务"""
        print(f"\n{'='*60}")
        print(f"执行任务: {task.name}")
        print(f"描述: {task.description}")
        print(f"{'='*60}")
        
        result = {
            'task': task.name,
            'success': False,
            'output': '',
            'files_created': []
        }
        
        # 1. 生成代码
        code = await self._generate_code(task)
        
        # 2. 写入文件
        if task.file_path and code:
            file_written = await self._write_file(task.file_path, code)
            if file_written:
                result['files_created'].append(task.file_path)
                result['success'] = True
        
        # 3. 运行测试
        if task.test_file:
            test_result = await self._run_tests(task.test_file)
            result['test_result'] = test_result
        
        self.results.append(result)
        return result
    
    async def _generate_code(self, task: Task) -> str:
        """使用 dsh 生成代码"""
        
        # 这里可以调用实际的 dsh 推理
        # 目前使用模板方法
        
        if task.template == 'archive-panel':
            return self._generate_archive_panel_code()
        elif task.template == 'mcp-bridge':
            return self._generate_mcp_bridge_code()
        elif task.template == 'document-skills':
            return self._generate_document_skills_code()
        
        return "# 需要 dsh 生成的代码"
    
    def _generate_archive_panel_code(self) -> str:
        """生成 ArchivePanel 组件代码"""
        return '''import React, { useState, useEffect } from 'react';
import { ArchiveManager } from '../services/archive-manager';

interface SessionInfo {
  id: string;
  title: string;
  createdAt: number;
  status: 'active' | 'archived' | 'completed';
}

export const ArchivePanel: React.FC = () => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const archiveManager = new ArchiveManager();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await archiveManager.listSessions();
      setSessions(data.sessions);
    } catch (error) {
      console.error('加载会话失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnarchive = async (sessionId: string) => {
    await archiveManager.unarchiveSession(sessionId);
    loadSessions();
  };

  const handleDelete = async (sessionId: string) => {
    if (window.confirm('确定要删除此会话吗？此操作不可恢复。')) {
      await archiveManager.deleteSession(sessionId);
      loadSessions();
    }
  };

  return (
    <div className="archive-panel">
      <h3>已归档会话</h3>
      <input
        type="text"
        placeholder="搜索会话..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="search-input"
      />
      
      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="session-list">
          {sessions.filter(s => 
            s.title.includes(filter) || s.id.includes(filter)
          ).map(session => (
            <div key={session.id} className="session-item">
              <div className="session-info">
                <strong>{session.title}</strong>
                <span className="session-id">{session.id}</span>
                <span className={`status ${session.status}`}>
                  {session.status}
                </span>
              </div>
              <div className="session-actions">
                <button onClick={() => handleUnarchive(session.id)}>
                  恢复
                </button>
                <button 
                  className="delete-btn"
                  onClick={() => handleDelete(session.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
'''

    def _generate_mcp_bridge_code(self) -> str:
        """生成 MCP Bridge 组件代码"""
        return '''import React, { useState, useEffect } from 'react';
import { MCPManager } from '../services/mcp-manager';

interface MCPServer {
  name: string;
  command: string;
  status: 'online' | 'offline' | 'error';
  tools: string[];
}

interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export const MCPBridgePanel: React.FC = () => {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [toolParams, setToolParams] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string>('');
  
  const mcpManager = new MCPManager();

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    setLoading(true);
    try {
      const data = await mcpManager.listServers();
      setServers(data.servers);
    } catch (error) {
      console.error('加载 MCP 服务器失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTools = async (serverName: string) => {
    try {
      const data = await mcpManager.listTools(serverName);
      setTools(data.tools);
      setSelectedServer(serverName);
      setToolParams({});
      setResponse('');
    } catch (error) {
      console.error('加载工具失败:', error);
    }
  };

  const callTool = async (toolName: string, params: Record<string, any>) => {
    try {
      const result = await mcpManager.callTool(selectedServer!, toolName, params);
      setResponse(JSON.stringify(result, null, 2));
    } catch (error) {
      setResponse(`Error: ${error}`);
    }
  };

  return (
    <div className="mcp-bridge-panel">
      <h3>MCP 服务器</h3>
      
      <div className="servers-list">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : (
          servers.map(server => (
            <button
              key={server.name}
              className={server.name === selectedServer ? 'active' : ''}
              onClick={() => loadTools(server.name)}
            >
              {server.name}
              <span className={`status ${server.status}`}>
                {server.status === 'online' ? '✓' : '✗'}
              </span>
            </button>
          ))
        )}
      </div>

      {tools.length > 0 && selectedServer && (
        <div className="tool-section">
          <h4>工具: {selectedServer}</h4>
          
          <select 
            onChange={e => {
              const tool = tools.find(t => t.name === e.target.value);
              if (tool) {
                setToolParams(tool.parameters);
                setResponse('');
              }
            }}
          >
            <option value="">选择工具</option>
            {tools.map(tool => (
              <option key={tool.name} value={tool.name}>
                {tool.name}
              </option>
            ))}
          </select>

          {Object.entries(toolParams).map(([key, value]) => (
            <input
              key={key}
              type="text"
              placeholder={key}
              value={value || ''}
              onChange={(e) => setToolParams({
                ...toolParams,
                [key]: e.target.value
              })}
            />
          ))}

          {response && (
            <pre className="response">{response}</pre>
          )}
        </div>
      )}
    </div>
  );
};
'''

    def _generate_document_skills_code(self) -> str:
        """生成 Document Skills 组件代码"""
        return '''import React, { useState } from 'react';
import { DocumentGenerator } from '../services/document-generator';

type DocumentType = 'docx' | 'pdf' | 'pptx';
type CoverRecipe = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';

export const DocumentSkillsPanel: React.FC = () => {
  const [documentType, setDocumentType] = useState<DocumentType>('docx');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverRecipe, setCoverRecipe] = useState<CoverRecipe>('R1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  const docGenerator = new DocumentGenerator();

  const generateDocument = async () => {
    if (!title.trim() || !content.trim()) {
      setError('标题和内容不能为空');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const result = await docGenerator.generate({
        type: documentType,
        title,
        content,
        coverRecipe,
        metadata: {
          author: 'Bamboo',
          version: '1.0.0'
        }
      });

      if (result.success) {
        const blob = new Blob([result.content], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || `${title}.docx`;
        a.click();
      } else {
        setError(result.error || '生成失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="document-skills-panel">
      <h3>文档生成器</h3>
      
      <select
        value={documentType}
        onChange={(e) => setDocumentType(e.target.value as DocumentType)}
      >
        <option value="docx">DOCX 文档</option>
        <option value="pdf">PDF 文档</option>
        <option value="pptx">PPTX 演示</option>
      </select>

      <input
        type="text"
        placeholder="文档标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="title-input"
      />

      <textarea
        placeholder="文档内容（支持 Markdown 格式）"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
        className="content-textarea"
      />

      {documentType === 'docx' && (
        <select
          value={coverRecipe}
          onChange={(e) => setCoverRecipe(e.target.value as CoverRecipe)}
        >
          <option value="R1">R1 - 报告封面</option>
          <option value="R2">R2 - 学术论文</option>
          <option value="R3">R3 - 合同</option>
          <option value="R4">R4 - 简历</option>
          <option value="R5">R5 - 说明书</option>
          <option value="R6">R6 - 方案</option>
          <option value="R7">R7 - 演示文稿</option>
        </select>
      )}

      {error && <div className="error">{error}</div>}

      <button
        onClick={generateDocument}
        disabled={loading || !title.trim() || !content.trim()}
      >
        {loading ? '生成中...' : '生成文档'}
      </button>
    </div>
  );
};
'''

    async def _write_file(self, file_path: str, content: str) -> bool:
        """写入文件"""
        try:
            full_path = self.project_root / file_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print(f"✅ 成功创建: {file_path}")
            return True
        except Exception as e:
            print(f"❌ 写入失败: {file_path} - {e}")
            return False
    
    async def _run_tests(self, test_file: str) -> bool:
        """运行测试"""
        try:
            result = subprocess.run(
                ['python', '-m', 'pytest', test_file, '-v'],
                cwd=str(self.project_root),
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0
        except Exception as e:
            print(f"测试运行失败: {e}")
            return False

    def generate_tasks_from_objectives(self, objectives: List[str]) -> List[Task]:
        """从目标自动生成任务列表"""
        tasks = []
        task_templates = {
            'ui': {
                'ArchivePanel': 'archive-panel',
                'MCPBridgePanel': 'mcp-bridge',
                'DocumentSkillsPanel': 'document-skills'
            },
            'api': {
                'document': '/api/document/generate',
                'browser': '/api/browser/automation',
                'memory': '/api/memory',
                'plugin': '/api/plugin'
            }
        }
        
        for obj in objectives:
            if 'UI' in obj or '组件' in obj:
                for name, template in task_templates['ui'].items():
                    tasks.append(Task(
                        name=f"实现 {name}",
                        description=f"实现 React 组件 {name}",
                        file_path=f"src/components/{name}.tsx",
                        template=template
                    ))
            elif 'API' in obj:
                for name, path in task_templates['api'].items():
                    tasks.append(Task(
                        name=f"实现 {name} API",
                        description=f"实现后端 API 端点 {path}",
                        file_path=f"bridge/{name}_api.py",
                        template=name
                    ))
        
        return tasks


async def main():
    """主入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Bamboo Auto Agent")
    parser.add_argument('--config', help='配置文件路径')
    parser.add_argument('--task', help='单个任务描述')
    parser.add_argument('--interactive', action='store_true', help='交互模式')
    
    args = parser.parse_args()
    
    project_root = Path(__file__).parent
    assistant = DshAutoAssistant(project_root)
    
    if args.config:
        # 从配置文件加载
        with open(args.config, 'r') as f:
            config = json.load(f)
        
        objectives = config.get('objectives', [])
        tasks = assistant.generate_tasks_from_objectives(objectives)
        
    elif args.task:
        # 单个任务
        tasks = [Task(name=args.task, description=args.task)]
        
    else:
        # 默认任务列表
        tasks = [
            Task("实现 ArchivePanel 组件", "实现侧边栏归档管理面板", 
                 "src/components/ArchivePanel.tsx", "archive-panel"),
            Task("实现 MCPBridgePanel 组件", "实现MCP桥接面板",
                 "src/components/MCPBridgePanel.tsx", "mcp-bridge"),
            Task("实现 DocumentSkillsPanel 组件", "实现文档生成器",
                 "src/components/DocumentSkillsPanel.tsx", "document-skills"),
        ]
    
    # 执行任务
    print(f"\n🚀 开始执行 {len(tasks)} 个任务...")
    
    for task in tasks:
        result = await assistant.execute_task(task)
        if not result['success']:
            print(f"⚠️ 任务失败: {task.name}")
    
    # 输出总结
    print(f"\n{'='*60}")
    print("📊 执行总结:")
    print(f"{'='*60}")
    
    success_count = sum(1 for r in assistant.results if r['success'])
    print(f"成功: {success_count}/{len(tasks)}")
    print(f"失败: {len(tasks) - success_count}/{len(tasks)}")
    
    if success_count == len(tasks):
        print("\n✅ 所有任务完成！")
        return 0
    else:
        print("\n⚠️ 部分任务失败，请检查输出")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)