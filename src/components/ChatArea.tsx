/**
 * ChatArea — main conversation surface
 * Renders full dsh JSONL event stream: reasoning, tool-calls, terminal,
 * text responses, plan mode, todos, goals, sub-agents.
 */
import { useRef, useCallback, useEffect, useState } from 'react'
import { runOnBridge, type RunRequest } from '../types/bridge'
import type {
  DshEvent, DshAssistantChunk, DshToolResult,
  DshPlanModeEvent, DshSubagentEvent,
} from '../types/bridge'

interface Props {
  events: DshEvent[]
  isRunning: boolean
  onSend: (req: RunRequest) => void
  onEventStream: (events: DshEvent[]) => void
}

/** Accumulate assistant chunk stream into coherent blocks */
interface ChunkAccumulator {
  reasoning: string
  textBlocks: string[]
  toolCalls: Array<{ id: string; name: string; args: string; result?: string }>
  terminals: string[]
  error: string
}

export function ChatArea({ events, isRunning, onSend, onEventStream }: Props) {
  const [input, setInput] = useState('')
  const [planMode, setPlanMode] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Push new events to parent for state aggregation
  useEffect(() => {
    if (events.length > 0) {
      onEventStream(events)
    }
  }, [events, onEventStream])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  // Derive accumulated view from raw events
  const accumulator: ChunkAccumulator = {
    reasoning: '',
    textBlocks: [],
    toolCalls: [],
    terminals: [],
    error: '',
  }
  const currentToolCall = new Map<string, { id: string; name: string; args: string; result?: string }>()
  let currentBlockType: string | null = null
  let currentBlockId = ''
  let currentBlockText = ''

  for (const evt of events) {
    if (evt.type === 'assistant/chunk') {
      const c = evt as DshAssistantChunk
      const ch = c.data.chunk
      if (ch.type === 'block-start') {
        currentBlockType = ch.blockType
        currentBlockId = ''
        currentBlockText = ''
      } else if (ch.type === 'text-delta') {
        currentBlockText += ch.text
      } else if (ch.type === 'reasoning-delta') {
        currentBlockText += ch.text
      } else if (ch.type === 'tool-call-delta') {
        currentToolCall.set(ch.id, {
          id: ch.id, name: ch.name, args: ch.argumentsDelta || '', result: undefined,
        })
      } else if (ch.type === 'terminal-delta') {
        currentBlockText += ch.text
      } else if (ch.type === 'block-end') {
        const block = ch.block
        if (block.type === 'reasoning') {
          accumulator.reasoning = block.text || currentBlockText
        } else if (block.type === 'text') {
          accumulator.textBlocks.push(block.text || currentBlockText)
        } else if (block.type === 'tool-call') {
          const tc = currentToolCall.get(block.id!)
          if (tc) {
            tc.args = block.arguments || tc.args
            accumulator.toolCalls.push(tc)
          }
        } else if (block.type === 'terminal') {
          accumulator.terminals.push(block.text || currentBlockText)
        }
        currentBlockType = null
      }
    } else if (evt.type === 'tool/result') {
      const tr = evt as DshToolResult
      const tc = currentToolCall.get(tr.data.toolCallId)
      if (tc) tc.result = tr.data.result
    } else if (evt.type === 'run/finished') {
      // nothing extra
    }
  }

  const message = accumulator.textBlocks.join('')
  const reasoning = accumulator.reasoning
  const hasAnswer = events.some(e => e.type === 'run/finished')

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isRunning) return
    onSend({ prompt: text, planMode })
    setInput('')
  }, [input, isRunning, onSend, planMode])

  return (
    <div className="chat-area">
      <div className="chat-messages">
        {events.length === 0 && (
          <div className="chat-empty">
            <div className="empty-logo">🎋</div>
            <div className="empty-title">Bamboo</div>
            <div className="empty-hint">基于 dsh 的 Codex 风味 AI 编程助手</div>
            <div className="empty-hint">
              输入任务，支持 Plan / Code / Standard 模式切换
            </div>
          </div>
        )}

        {/* Plan mode indicator */}
        {planMode && (
          <div className="msg plan-banner">
            📋 计划模式已开启 — 探索代码库，生成方案后等待审批
          </div>
        )}

        {/* Reasoning block */}
        {reasoning && (
          <div className="msg reasoning">
            <div className="msg-header">🧠 思考中</div>
            <div className="msg-body">{reasoning}</div>
          </div>
        )}

        {/* Tool calls */}
        {accumulator.toolCalls.map((tc, i) => (
          <div key={i} className="msg tool-call">
            <div className="msg-header">🔧 {tc.name}</div>
            <div className="msg-body code">
              {tc.args && <pre>{tc.args}</pre>}
              {tc.result && (
                <div className="tool-result">
                  <span className="text-muted">→ {tc.result}</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Terminal output */}
        {accumulator.terminals.map((t, i) => (
          <div key={i} className="msg terminal">
            <div className="msg-header">⌨️ 终端</div>
            <div className="msg-body terminal-text">
              <pre>{t}</pre>
            </div>
          </div>
        ))}

        {/* Response text */}
        {message && (
          <div className="msg assistant">
            <div className="msg-header">✅ 助手</div>
            <div className="msg-body markdown">{message}</div>
          </div>
        )}

        {hasAnswer && (
          <div className="msg finished">✅ 任务完成</div>
        )}

        {isRunning && events.length > 0 && !hasAnswer && (
          <div className="msg running">
            <span className="dot-animation">◉</span> 处理中...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="输入任务（如：帮我写一个 HTTP 服务器）— 支持 /plan /code /standard 模式"
          rows={2}
          disabled={isRunning}
        />
        <button type="submit" disabled={isRunning || !input.trim()}>
          {isRunning ? '运行中…' : '发送'}
        </button>
      </form>
    </div>
  )
}
