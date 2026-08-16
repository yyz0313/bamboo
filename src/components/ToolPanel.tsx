/**
 * ToolPanel — right-side panel
 * Shows: model info, agent preset selector, mode switcher,
 * active tool list, terminal output, architecture info.
 */
import type { DshEvent } from '../types/bridge'

interface Props {
  events: DshEvent[]
  currentPreset: string
  currentMode: 'plan' | 'code' | 'standard'
  onPresetChange: (preset: string) => void
  onModeChange: (mode: 'plan' | 'code' | 'standard') => void
}

export function ToolPanel({ events, currentPreset, currentMode, onPresetChange, onModeChange }: Props) {
  // Extract active tool names from tool-call-delta events
  const activeTools = new Set<string>()
  for (const e of events) {
    if (e.type !== 'assistant/chunk') continue
    const c = (e as { data: { chunk: { type: string; name?: string } } }).data?.chunk
    if (c?.type === 'tool-call-delta' && c.name) activeTools.add(c.name)
  }

  // Extract terminal outputs
  const terminals: string[] = []
  for (const e of events) {
    if (e.type !== 'assistant/chunk') continue
    const c = (e as { data: { chunk: { type: string; block?: { text?: string } } } }).data?.chunk
    if (c?.type === 'block-end' && c.block?.type === 'terminal' && c.block.text) {
      terminals.push(c.block.text)
    }
  }

  // Plan mode active?
  const planActive = events.some(e => e.type === 'plan/mode')

  return (
    <aside className="tool-panel">
      {/* ── Mode Switcher ── */}
      <div className="panel-section">
        <h3 className="panel-title">模式</h3>
        <div className="mode-tabs">
          {([
            { key: 'standard', label: '标准', icon: '🔷' },
            { key: 'plan', label: '计划', icon: '📋' },
            { key: 'code', label: '编码', icon: '💻' },
          ] as const).map(m => (
            <button
              key={m.key}
              className={`mode-tab ${currentMode === m.key ? 'active' : ''}`}
              onClick={() => onModeChange(m.key)}
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Agent Preset ── */}
      <div className="panel-section">
        <h3 className="panel-title">Agent 预设</h3>
        <select
          className="preset-select"
          value={currentPreset}
          onChange={e => onPresetChange(e.target.value)}
        >
          <option value="minimal">Minimal — 基础 agent</option>
          <option value="standard">Standard — 完整编码 agent</option>
          <option value="code">Code — Code Mode (SDK)</option>
          <option value="cordis">Cordis — 自修改 harness</option>
        </select>
        <p className="text-xs text-muted" style={{ marginTop: 6 }}>
          基于 dsh 官方 agent-preset 配置
        </p>
      </div>

      {/* ── Active Tools ── */}
      <div className="panel-section">
        <h3 className="panel-title">活跃工具</h3>
        {activeTools.size === 0 ? (
          <p className="text-muted text-sm">暂无活跃工具</p>
        ) : (
          <div className="tool-list">
            {Array.from(activeTools).map(name => (
              <div key={name} className="tool-item active">
                <span className="tool-name">🔧 {name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Terminal ── */}
      {terminals.length > 0 && (
        <div className="panel-section">
          <h3 className="panel-title">终端</h3>
          {terminals.map((t, i) => (
            <div key={i} className="terminal-block">
              <pre>{t}</pre>
            </div>
          ))}
        </div>
      )}

      {/* ── Model Info ── */}
      <div className="panel-section">
        <h3 className="panel-title">模型</h3>
        <div className="model-info">
          <div className="model-row">
            <span className="text-muted">Provider</span>
            <span className="font-mono text-sm">bamboo-failover</span>
          </div>
          <div className="model-row">
            <span className="text-muted">Model</span>
            <span className="font-mono text-sm">deepseek-v4-flash</span>
          </div>
          <div className="model-row">
            <span className="text-muted">Backends</span>
            <span className="badge badge-success">1 个</span>
          </div>
        </div>
      </div>

      {/* ── Architecture ── */}
      <div className="panel-section">
        <h3 className="panel-title">架构</h3>
        <div className="arch-info">
          <div className="arch-row"><span className="text-muted">UI</span><span>React + Vite</span></div>
          <div className="arch-row"><span className="text-muted">Bridge</span><span>Python FastAPI</span></div>
          <div className="arch-row"><span className="text-muted">Agent</span><span>dsh (JSON-RPC)</span></div>
          <div className="arch-row"><span className="text-muted">Failover</span><span>Buffered Stream</span></div>
        </div>
      </div>

      {/* ── dsh Attribution ── */}
      <div className="panel-footer">
        <span className="text-xs text-muted">基于 dsh 二开 · Codex 风味</span>
        <a href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noreferrer"
           className="text-xs" style={{ color: '#6ee7b7', textDecoration: 'none' }}>
          GitHub
        </a>
      </div>
    </aside>
  )
}
