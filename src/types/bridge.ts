/**
 * Bamboo 事件类型 — 完整对齐 dsh JSONL 协议
 *
 * dsh 事件流包含以下核心类型：
 *   session / command / plan / permission / sandbox
 *   turn / step / user / assistant
 *   tool-call / tool-result / terminal / bash-output
 *   todo / goal / subagent / workflow / skill
 *   compaction / max-tokens / model-settings
 *   request / response / finish
 */

// ──────────────────────────────────────────────
// Raw dsh event shape (one JSON object per line)
// ──────────────────────────────────────────────

/** Session metadata emitted at the start of every run */
export interface DshSessionEvent {
  type: 'session'
  version: number
  id: string
  createdAt: number
  cwd: string
  agentPreset?: string   // e.g. "standard" | "code" | "minimal" | "cordis"
}

/** User issued a slash command: /plan, /goal, /permission, etc. */
export interface DshCommandEvent {
  type: 'command/run'
  seq: number
  time: number
  data: {
    commandId: string
    name: 'plan' | 'goal' | 'permission' | string
    args: string
    source: { kind: 'user' | string }
  }
}

/** Plan mode toggled on/off */
export interface DshPlanModeEvent {
  type: 'plan/mode'
  seq: number
  time: number
  data: { active: boolean }
}

/** Permission preset changed (read-only / workspace-write / etc.) */
export interface DshPermissionEvent {
  type: 'permission/preset'
  seq: number
  time: number
  data: { preset: string }
}

/** Sandbox mode changed */
export interface DshSandboxEvent {
  type: 'sandbox/mode'
  seq: number
  time: number
  data: { mode: string }
}

/** Approval policy changed (ask / auto / etc.) */
export interface DshApprovalEvent {
  type: 'approval/policy'
  seq: number
  time: number
  data: { policy: string }
}

/** New turn begins */
export interface DshTurnStart {
  type: 'turn/start'
  seq: number
  time: number
  data: {
    turn: number
    trigger?: { kind: string; source?: { kind: string } }
  }
}

/** User message */
export interface DshUserMessage {
  type: 'user/message'
  seq: number
  time: number
  data: {
    role: 'user'
    content: Array<{ type: string; text?: string }>
    source: { kind: string }
    id?: string
    surfaceOp?: string
  }
}

/** Session title auto-generated */
export interface DshSessionTitle {
  type: 'session/title'
  seq: number
  time: number
  data: { title: string; messageSeqs: number[]; source: { kind: string } }
}

/** Step (tool-call cycle) starts */
export interface DshStepStart {
  type: 'step/start'
  seq: number
  time: number
  data: { turn: number; step: number }
}

/** Incoming LLM request header (model, provider, tools catalog) */
export interface DshRequestHeader {
  type: 'request/header'
  seq: number
  time: number
  data: {
    header: {
      config: { provider: string; model: string; reasoningEffort?: string }
      system: string
      tools: string  // JSON string of tool catalog
    }
    reason: string
  }
}

/** Assistant response chunk (streaming) */
export type DshAssistantChunk =
  | { type: 'assistant/chunk'; seq: number; time: number; data: {
      turn: number; step: number;
      chunk: {
        type: 'block-start'
        index: number
        blockType: 'reasoning' | 'text' | 'tool-call' | 'terminal' | 'error'
      }
    } }
  | { type: 'assistant/chunk'; seq: number; time: number; data: {
      turn: number; step: number;
      chunk: {
        type: 'text-delta'
        index: number
        text: string
      }
    } }
  | { type: 'assistant/chunk'; seq: number; time: number; data: {
      turn: number; step: number;
      chunk: {
        type: 'reasoning-delta'
        index: number
        text: string
      }
    } }
  | { type: 'assistant/chunk'; seq: number; time: number; data: {
      turn: number; step: number;
      chunk: {
        type: 'tool-call-delta'
        index: number
        id: string
        name: string
        argumentsDelta: string
      }
    } }
  | { type: 'assistant/chunk'; seq: number; time: number; data: {
      turn: number; step: number;
      chunk: {
        type: 'terminal-delta'
        index: number
        text: string
      }
    } }
  | { type: 'assistant/chunk'; seq: number; time: number; data: {
      turn: number; step: number;
      chunk: {
        type: 'block-end'
        index: number
        block: {
          type: 'text' | 'reasoning' | 'tool-call' | 'terminal' | 'error'
          text?: string
          id?: string
          name?: string
          arguments?: string
        }
      }
    } }

/** Completed assistant message (non-streaming summary) */
export interface DshAssistantMessage {
  type: 'assistant/message'
  seq: number
  time: number
  data: {
    turn: number; step: number
    message: {
      role: 'assistant'
      content: Array<{ type: string; text?: string }>
      source: { kind: string; provider?: string; model?: string }
      id?: string
    }
    usage?: { inputTokens: number; outputTokens: number }
  }
}

/** Tool execution result */
export interface DshToolResult {
  type: 'tool/result'
  seq: number
  time: number
  data: {
    toolCallId: string
    name: string
    result: string
    isError?: boolean
  }
}

/** Command finished (plan/goal/permission) */
export interface DshCommandDone {
  type: 'command/done'
  seq: number
  time: number
  data: {
    commandId: string
    kind: 'success' | 'error' | 'cancelled'
    text?: string
  }
}

/** Max tokens warning */
export interface DshMaxTokensNotice {
  type: 'max-tokens/notice'
  seq: number
  time: number
  data: { remainingTokens: number; maxTokens: number }
}

/** Model settings change */
export interface DshModelSettings {
  type: 'model/settings'
  seq: number
  time: number
  data: { provider: string; model: string; reasoningEffort?: string }
}

/** Sub-agent activity */
export interface DshSubagentEvent {
  type: 'subagent/activity'
  seq: number
  time: number
  data: {
    subagentId: string
    action: 'started' | 'running' | 'finished' | 'interrupted'
    status?: string
  }
}

/** Workflow run started/progress */
export interface DshWorkflowEvent {
  type: 'workflow/run'
  seq: number
  time: number
  data: {
    workflowId: string
    action: 'started' | 'step' | 'finished'
    step?: number
    totalSteps?: number
  }
}

/** Completion */
export interface DshRunFinished {
  type: 'run/finished'
  seq: number
  time: number
  data: { finishReason: string }
}

/** Catch-all for unknown event types */
export interface DshUnknownEvent {
  type: string
  seq: number
  time: number
  data: unknown
}

// ──────────────────────────────────────────────
// Union of all events
// ──────────────────────────────────────────────

export type DshEvent =
  | DshSessionEvent
  | DshCommandEvent
  | DshPlanModeEvent
  | DshPermissionEvent
  | DshSandboxEvent
  | DshApprovalEvent
  | DshTurnStart
  | DshUserMessage
  | DshSessionTitle
  | DshStepStart
  | DshRequestHeader
  | DshAssistantChunk
  | DshAssistantMessage
  | DshToolResult
  | DshCommandDone
  | DshMaxTokensNotice
  | DshModelSettings
  | DshSubagentEvent
  | DshWorkflowEvent
  | DshRunFinished
  | DshUnknownEvent

// ──────────────────────────────────────────────
// Aggregated UI state derived from events
// ──────────────────────────────────────────────

/** A single chat turn (collection of steps) */
export interface ChatTurn {
  turn: number
  userMessage: string
  reasoning: string
  steps: ChatStep[]
  finished: boolean
  error?: string
}

/** One tool-call cycle within a turn */
export interface ChatStep {
  step: number
  toolCalls: ToolCallEntry[]
  terminalOutputs: TerminalOutput[]
  textBlocks: string[]
}

export interface ToolCallEntry {
  id: string
  name: string
  arguments: string
  result?: string
  isError?: boolean
}

export interface TerminalOutput {
  text: string
}

/** Plan mode state */
export interface PlanState {
  active: boolean
  planMarkdown?: string
  approved: boolean
}

/** Todo list entries */
export interface TodoEntry {
  id: string
  text: string
  done: boolean
}

/** Goal state */
export interface GoalState {
  description: string
  turnsCompleted: number
  totalTurns?: number
  status: 'active' | 'completed' | 'cancelled'
}

/** Session context */
export interface SessionContext {
  sessionId: string
  createdAt: number
  cwd: string
  agentPreset: string
  mode: 'plan' | 'code' | 'standard'
  model: string
  provider: string
}

// ──────────────────────────────────────────────
// Bridge API types
// ──────────────────────────────────────────────

export interface BridgeHealth {
  status: 'ok'
  mode: 'mock' | 'real'
  version: string
  dshVersion: string
}

export interface UpdateInfo {
  current: string
  dshLatestTag: string
  hasUpdate: boolean
}

/** Parameters for /api/run */
export interface RunRequest {
  prompt: string
  /** Override agent preset: "standard" | "code" | "minimal" | "cordis" */
  preset?: string
  /** Override model */
  model?: string
  /** Override provider */
  provider?: string
  /** Enable plan mode */
  planMode?: boolean
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Parse a single line of dsh JSONL into a DshEvent */
export function parseDshLine(line: string): DshEvent | null {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.startsWith('{')) return null
  try {
    return JSON.parse(trimmed) as DshEvent
  } catch {
    return null
  }
}

/** Collect all SSE data lines into an array of DshEvent */
export function parseSseBuffer(raw: string): DshEvent[] {
  const events: DshEvent[] = []
  let buffer = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) {
      const payload = line.slice(6).trim()
      if (!payload) continue
      buffer += payload
      // Try to parse; if incomplete, wait for next line
      const evt = parseDshLine(buffer)
      if (evt) {
        events.push(evt)
        buffer = ''
      }
    } else if (line === '') {
      // Empty line = SSE record delimiter; flush any leftover
      if (buffer) {
        const evt = parseDshLine(buffer)
        if (evt) events.push(evt)
        buffer = ''
      }
    }
  }
  return events
}


/** Call the bridge /api/run endpoint and stream DshEvents */
export async function* runOnBridge(prompt: string, preset?: string): AsyncGenerator<DshEvent> {
  const resp = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, preset: preset ?? 'standard' }),
  })
  if (!resp.ok) {
    yield { type: 'run/finished', seq: 0, time: Date.now(), data: { finishReason: 'error' } }
    return
  }
  const reader = resp.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      for (const line of buf.split('\n')) {
        buf = ''
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (!payload) continue
        const evt = parseDshLine(payload)
        if (evt) yield evt
      }
    }
  } finally { reader.releaseLock() }
}
