/**
 * Sidebar — session list sidebar
 */
import { useState, useEffect, useCallback } from 'react'
import type { Session } from '../App'

interface Props {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  bridgeStatus?: 'unknown' | 'ok' | 'error'
}

interface UpdateInfo {
  current: string
  dsh_latest_tag: string
  has_update: boolean
}

export function Sidebar({ sessions, activeSessionId, onSelectSession, onNewSession, bridgeStatus = 'unknown' }: Props) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)

  const checkUpdate = useCallback(async () => {
    setChecking(true)
    try {
      const resp = await fetch('/api/update/check')
      if (resp.ok) setUpdateInfo(await resp.json())
    } catch {} finally { setChecking(false) }
  }, [])

  useEffect(() => { checkUpdate() }, [checkUpdate])

  const applyUpdate = useCallback(async () => {
    setChecking(true)
    try {
      const resp = await fetch('/api/update/apply', { method: 'POST' })
      if (resp.ok) {
        const data = await resp.json()
        setUpdateInfo(prev => prev ? { ...prev, dsh_latest_tag: data.dsh_latest_tag } : null)
        await checkUpdate()
      }
    } catch {} finally { setChecking(false) }
  }, [checkUpdate])

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">
          🎋 Bamboo
          <span className={`status-dot ${bridgeStatus === 'ok' ? 'ok' : bridgeStatus === 'error' ? 'error' : ''}`}
                title={bridgeStatus === 'ok' ? 'bridge 已连接' : bridgeStatus === 'error' ? 'mock 模式' : ''} />
        </span>
        <button className="btn btn-primary" onClick={onNewSession} title="新建会话">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"/>
          </svg>
          新建
        </button>
      </div>

      <div className="session-list">
        {sessions.length === 0 && (
          <div className="empty-state">
            <p>暂无会话</p>
            <span className="text-xs text-muted">点击「新建」开始</span>
          </div>
        )}
        {sessions.map(session => (
          <div
            key={session.id}
            className={`session-item ${session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            <span className="session-title">{session.title}</span>
            <span className="session-time">{formatTime(session.updatedAt)}</span>
          </div>
        ))}
      </div>

      {/* 更新状态区 */}
      <div className="sidebar-footer">
        {updateInfo && (
          <div className="update-check" onClick={applyUpdate} >
            <span className="text-xs">
              Bamboo v{updateInfo.current}
              {updateInfo.dsh_latest_tag !== 'unknown' && ` · dsh ${updateInfo.dsh_latest_tag}`}
            </span>
            {!checking && updateInfo.has_update && (
              <span className="badge badge-info" style={{marginLeft: 6}}>检查更新</span>
            )}
          </div>
        )}
        <span className="text-xs text-muted" style={{opacity: 0.5}}>基于 dsh 二开 · Codex 风味</span>
      </div>
    </aside>
  )
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
