import React, { useState, useEffect } from 'react';

export const ArchivePanel: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
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

  const handleUnarchive = async (sessionId: string) => {
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

  const handleDelete = async (sessionId: string) => {
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