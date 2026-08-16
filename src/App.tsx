// Bamboo 主入口 — 三栏布局：Sidebar + ChatArea + ToolPanel
import { useState, useCallback, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import { ToolPanel } from './components/ToolPanel'
import type { DshEvent, SessionContext } from './types/bridge'
import { runOnBridge } from './types/bridge'

type AgentMode = 'plan' | 'code' | 'standard'
type AgentPreset = 'minimal' | 'standard' | 'code' | 'cordis'

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  preset: AgentPreset
  mode: AgentMode
}

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  // Per-session events
  const [eventsMap, setEventsMap] = useState<Record<string, DshEvent[]>>({})
  const [isRunning, setIsRunning] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState<'unknown' | 'ok' | 'error'>('unknown')

  // Defaults
  const [currentPreset, setCurrentPreset] = useState<AgentPreset>('standard')
  const [currentMode, setCurrentMode] = useState<AgentMode>('standard')

  // Active session state
  const activeEvents = activeSessionId ? (eventsMap[activeSessionId] || []) : []
  const activeSession = sessions.find(s => s.id === activeSessionId)

  /** Check bridge health */
  const checkBridge = useCallback(async () => {
    try {
      const resp = await fetch('/api/health', { signal: AbortSignal.timeout(2000) })
      setBridgeStatus(resp.ok ? 'ok' : 'error')
    } catch {
      setBridgeStatus('error')
    }
  }, [])

  useEffect(() => {
    checkBridge()
    const timer = setInterval(checkBridge, 5000)
    return () => clearInterval(timer)
  }, [checkBridge])

  /** Handle incoming dsh events for active session */
  const handleEventStream = useCallback((newEvents: DshEvent[]) => {
    if (!activeSessionId) return
    setEventsMap(prev => ({
      ...prev,
      [activeSessionId]: [...(prev[activeSessionId] || []), ...newEvents],
    }))
  }, [activeSessionId])

  /** Send task to bridge */
  const sendTask = useCallback(async (req: { prompt: string; planMode?: boolean }) => {
    if (!req.prompt.trim() || isRunning) return
    setIsRunning(true)

    // Ensure session exists
    let sid = activeSessionId
    if (!sid) {
      const newSession: Session = {
        id: `session-${Date.now()}`,
        title: req.prompt.slice(0, 30),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preset: currentPreset,
        mode: req.planMode ? 'plan' : currentMode,
      }
      setSessions(prev => [newSession, ...prev])
      sid = newSession.id
      setActiveSessionId(sid)
      setEventsMap(prev => ({ ...prev, [sid]: [] }))
    } else {
      setSessions(prev => prev.map(s =>
        s.id === sid ? { ...s, updatedAt: Date.now() } : s
      ))
    }

    // Try real bridge first
    let connected = false
    try {
      const health = await fetch('/api/health', { signal: AbortSignal.timeout(2000) })
      if (health.ok) connected = true
    } catch { /* bridge unavailable */ }

    if (!connected) {
      setBridgeStatus('error')
      // Mock fallback with full dsh-style events
      for await (const evt of mockStream(req.prompt)) {
        handleEventStream([evt])
      }
      setIsRunning(false)
      return
    }

    try {
      for await (const evt of runOnBridge(req.prompt)) {
        handleEventStream([evt])
      }
    } catch (err) {
      handleEventStream([{
        type: 'assistant/chunk',
        seq: 999, time: Date.now(),
        data: { turn: 1, step: 1, chunk: {
          type: 'block-end', index: 99,
          block: { type: 'error', text: String(err) },
        }},
      }])
    } finally {
      setIsRunning(false)
    }
  }, [isRunning, handleEventStream, activeSessionId, currentPreset, currentMode])

  const handleNewSession = useCallback(() => {
    const newSession: Session = {
      id: `session-${Date.now()}`,
      title: '新会话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      preset: currentPreset,
      mode: currentMode,
    }
    setSessions(prev => [newSession, ...prev])
    setActiveSessionId(newSession.id)
    setEventsMap(prev => ({ ...prev, [newSession.id]: [] }))
  }, [currentPreset, currentMode])

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id)
  }, [])

  return (
    <div className="app-layout">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        bridgeStatus={bridgeStatus}
      />
      <ChatArea
        events={activeEvents}
        isRunning={isRunning}
        onSend={sendTask}
        onEventStream={handleEventStream}
      />
      <ToolPanel
        events={activeEvents}
        currentPreset={currentPreset}
        currentMode={currentMode}
        onPresetChange={setCurrentPreset}
        onModeChange={setCurrentMode}
      />
    </div>
  )
}

/** Full dsh-style mock stream for UI testing */
async function* mockStream(prompt: string): AsyncGenerator<DshEvent> {
  const now = Date.now()
  let seq = 0
  const emit = (obj: Record<string, unknown>) => {
    obj.seq = seq++
    obj.time = now + seq * 10
    return obj as DshEvent
  }

  yield emit({ type: 'session', version: 0, id: `mock-${now}`,
    createdAt: now, cwd: process.cwd(), agentPreset: 'standard' })
  yield emit({ type: 'turn/start', data: { turn: 1, trigger: { kind: 'message', source: { kind: 'user' } } } })
  yield emit({ type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: prompt }],
    source: { kind: 'user' }, surfaceOp: 'append' } })
  yield emit({ type: 'session/title', data: { title: prompt.slice(0, 40), messageSeqs: [seq - 1], source: { kind: 'fallback' } } })
  yield emit({ type: 'step/start', data: { turn: 1, step: 1 } })

  // Simulate tool call
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'tool-call' } } })
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'tool-call-delta', index: 0, id: 'call_test', name: 'pwsh', argumentsDelta: '{"script":"echo hello"}' } } })
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_test', name: 'pwsh', arguments: '{"script":"echo hello"}' } } } })
  yield emit({ type: 'tool/result', data: { toolCallId: 'call_test', name: 'pwsh', result: 'hello', isError: false } })

  // Reasoning
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'block-start', index: 1, blockType: 'reasoning' } } })
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 1, text: '正在分析任务...' } } })
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'block-end', index: 1, block: { type: 'reasoning', text: '正在分析任务...' } } } })

  // Text response
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'block-start', index: 2, blockType: 'text' } } })
  const response = `已收到任务：${prompt}\n\n这是 Bamboo bridge 的标准模式输出。\n\n支持的工具：pwsh、fs、fs-search、skill、goal、plan、subagent、workflow 等。`
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 2, text: response } } })
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'block-end', index: 2, block: { type: 'text', text: response } } } })

  // Terminal
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'block-start', index: 3, blockType: 'terminal' } } })
  const term = '$ pwsh -Command echo hello\nhello\n'
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'terminal-delta', index: 3, text: term } } })
  yield emit({ type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'block-end', index: 3, block: { type: 'terminal', text: term } } } })

  yield emit({ type: 'run/finished', data: { finishReason: 'completed' } })
}
export default App
