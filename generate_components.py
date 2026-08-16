#!/usr/bin/env python3
"""自动生成前端组件"""

from pathlib import Path

# 要创建的组件
components = {
    'ArchivePanel': r'''import React, { useState, useEffect } from 'react';

export const ArchivePanel: React.FC = () => {
  const [sessions, setSessions] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/archive/list');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError('加载会话失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUnarchive = async (sessionId) => {
    try {
      await fetch('/api/archive/unarchive', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ sessionId })
      });
      loadSessions();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (sessionId) => {
    if (window.confirm('确定要删除此会话吗？此操作不可恢复。')) {
      try {
        await fetch('/api/archive/delete', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ sessionId })
        });
        loadSessions();
      } catch (err) {
        console.error(err);
      }
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
      />
      
      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="session-list">
          {sessions.filter(s => 
            s.title?.includes(filter) || s.id?.includes(filter)
          ).map(session => (
            <div key={session.id} className="session-item">
              <div className="session-info">
                <strong>{session.title || '无标题'}</strong>
                <span className="session-id">({session.id})</span>
                <span className={"status " + session.status}>{session.status}</span>
              </div>
              <div className="session-actions">
                <button onClick={() => handleUnarchive(session.id)}>恢复</button>
                <button className="delete-btn" onClick={() => handleDelete(session.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
''',
    'MCPBridgePanel': r'''import React, { useState, useEffect } from 'react';

interface MCPServer {
  name: string;
  status: 'online' | 'offline' | 'error';
}

interface MCPTool {
  name: string;
  description: string;
}

export const MCPBridgePanel: React.FC = () => {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState('');

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mcp/servers');
      const data = await res.json();
      setServers(data.servers || []);
    } catch (error) {
      console.error('加载 MCP 服务器失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTools = async (serverName: string) => {
    try {
      const res = await fetch(`/api/mcp/servers/${serverName}/tools`);
      const data = await res.json();
      setTools(data.tools || []);
      setSelectedServer(serverName);
    } catch (error) {
      console.error('加载工具失败:', error);
    }
  };

  const callTool = async (toolName: string) => {
    try {
      const res = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server: selectedServer,
          tool: toolName
        })
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setResponse('Error: ' + String(error));
    }
  };

  return (
    <div className="mcp-bridge-panel">
      <h3>MCP 服务器</h3>
      
      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="servers-list">
          {servers.map(server => (
            <button
              key={server.name}
              className={server.name === selectedServer ? 'active' : ''}
              onClick={() => loadTools(server.name)}
            >
              {server.name}
              <span className={server.status === 'online' ? 'online' : 'offline'}>
                {server.status === 'online' ? '✓' : '✗'}
              </span>
            </button>
          ))}
        </div>
      )}

      {tools.length > 0 && selectedServer && (
        <div className="tool-section">
          <h4>工具: {selectedServer}</h4>
          
          {tools.map(tool => (
            <div key={tool.name} className="tool-item">
              <h5>{tool.name}</h5>
              <p>{tool.description}</p>
              <button onClick={() => callTool(tool.name)}>调用</button>
            </div>
          ))}

          {response && (
            <pre className="response"><code>{response}</code></pre>
          )}
        </div>
      )}
    </div>
  );
};
''',
    'DocumentSkillsPanel': r'''import React, { useState } from 'react';

type DocumentType = 'docx' | 'pdf' | 'pptx';
type CoverRecipe = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';

export const DocumentSkillsPanel: React.FC = () => {
  const [documentType, setDocumentType] = useState<DocumentType>('docx');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverRecipe, setCoverRecipe] = useState<CoverRecipe>('R1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateDocument = async () => {
    if (!title.trim() || !content.trim()) {
      setError('标题和内容不能为空');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/document/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: documentType,
          title,
          content,
          coverRecipe,
          metadata: { author: 'Bamboo', version: '1.0.0' }
        })
      });
      
      const result = await res.json();

      if (result.success) {
        const blob = new Blob([result.content], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || title + '.docx';
        a.click();
      } else {
        setError(result.error || '生成失败');
      }
    } catch (err) {
      setError('未知错误');
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
      />

      <textarea
        placeholder="文档内容（支持 Markdown 格式）"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
      />

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

      {error && <div className="error-message" style={{color: 'red'}}>{error}</div>}

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
}

# 写入组件文件
components_dir = Path('/c/Users/yyz20/WorkBuddy/bamboo/src/components')
components_dir.mkdir(exist_ok=True)

for name, code in components.items():
    file_path = components_dir / (name + '.tsx')
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(code)
    print('✅ 创建:', file_path)

print('✅ 所有组件创建完成')