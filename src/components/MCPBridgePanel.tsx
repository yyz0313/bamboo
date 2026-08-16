import React, { useState, useEffect } from 'react';

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