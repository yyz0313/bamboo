// index.ts
// @bamboo/model-router — 多 Key/多供应商故障转移 LLM Adapter
//
// 实现 DSH 的 `ctx.llm` seam，注册为单一路由（如 'bamboo-failover'），
// agent loop / tool / compaction 完全无感知。
//
// 关键设计：Buffered Stream
//   - strict 模式：所有 chunk 先缓存，后端成功完成才一次性 flush 给用户
//     → 中途失败（余额耗尽等）自动换后端，用户永远看到完整响应
//   - hybrid 模式：前 N 个 chunk 缓存后实时 yield，延迟更低但极端情况可能残缺
//   - stream 模式：完全不缓存，只处理首 token 前失败（原有行为）
//
// 对接 DSH 真实类型时取消注释 import，删除本地占位定义。

import { Service } from 'cordis'
import type { Context } from 'cordis'
import type { FailoverConfig, FailoverBackend } from './config.js'
import { BufferedStream } from './buffered-stream.js'

// ---- 真实 DSH 类型导入（接入 DSH 仓库时取消注释，删除下方占位） ----
// import { LlmAdapter, type GenerateOptions, type StreamChunk, LlmError } from '@deepseek-ai/dsh-llm'

// ---- 占位类型（骨架阶段本地声明，与 DSH 官方对齐） ----
export interface GenerateOptions {
  provider: string
  model: string
  messages: unknown[]
  system?: string
  tools?: unknown[]
  temperature?: number
  maxTokens?: number
  reasoningEffort?: unknown
  signal?: AbortSignal
  sessionId?: unknown
  purpose?: string
  [k: string]: unknown
}

export type StreamChunk =
  | { type: 'block-start'; index: number; blockType: string; [k: string]: unknown }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: string; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: unknown }
  | { type: 'usage'; usage: unknown }
  | { type: 'finish'; reason: { kind: string; failure?: unknown }; replayState?: unknown }

export class LlmError extends Error {
  readonly failure: { message: string; code: string; status?: number }
  constructor(msg: string, code: string, options?: { status?: number }) {
    super(msg)
    this.name = 'LlmError'
    this.failure = { message: msg, code, status: options?.status }
  }
}

abstract class LlmAdapter extends Service {
  constructor(ctx: Context, name?: string) {
    super(ctx, name ?? 'llm-adapter')
  }
  abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
// ---- 占位结束 ----

/* ------------------------------------------------------------------ */
/* 工具函数                                                          */
/* ------------------------------------------------------------------ */

/** 判断 chunk 是否为错误终态 */
function isErrorFinish(chunk: StreamChunk): boolean {
  if (chunk.type !== 'finish') return false
  const reason = (chunk as any).reason
  if (!reason || typeof reason !== 'object') return false
  return reason.kind === 'error' || reason.kind === 'aborted'
}

/** 从错误 finish chunk 中提取可读原因 */
function getFailReason(chunk: StreamChunk): string {
  if (!isErrorFinish(chunk)) return 'unknown'
  const failure = (chunk as any).reason?.failure as any
  if (failure?.message) return String(failure.message)
  if (failure?.code) return String(failure.code)
  return 'unknown'
}

/** 判断是否属于可切换错误（AUTH/RATE_LIMIT/QUOTA/TRANSPORT/SERVER） */
function isSwitchableFailure(chunk: StreamChunk): boolean {
  if (!isErrorFinish(chunk)) return false
  const failure = (chunk as any).reason?.failure as any
  const code = failure?.code || ''
  const status = failure?.status
  if (status !== undefined) {
    if (status === 401 || status === 403 || status === 429) return true
    if (status >= 500 && status < 600) return true
  }
  if (/^(AUTH|RATE_LIMIT|QUOTA|TRANSPORT|SERVER|INSUFFICIENT_QUOTA|CONTEXT_LENGTH)$/i.test(code)) return true
  return false
}

/* ------------------------------------------------------------------ */
/* Model Router Adapter                                               */
/* ------------------------------------------------------------------ */

export class ModelRouterAdapter extends LlmAdapter {
  constructor(
    ctx: Context,
    private backends: FailoverBackend[],
    private allowStepRetry = true,
    private bufferMode: 'strict' | 'hybrid' | 'stream' = 'strict',
    private warmupChunks = 3,
    private maxBufferedChunks = 1000,
    private logLevel: 'silent' | 'normal' | 'verbose' = 'normal',
  ) {
    super(ctx, 'model-router')
  }

  private log(...args: unknown[]): void {
    if (this.logLevel === 'verbose' || this.logLevel === 'normal') {
      console.log(`[model-router] ${new Date().toISOString()}`, ...args)
    }
  }

  /**
   * 流式迭代器：实现故障转移 + 缓冲策略。
   *
   * 三种模式的行为：
   *
   * strict（默认）：
   *   - 收集所有 chunk 到 buffer
   *   - 后端成功完成 → flush 全部 chunk 给用户
   *   - 后端中途失败 → 丢弃 buffer，换下一个后端，用户无感知
   *   - 优点：用户永远看到完整响应
   *   - 缺点：有几十毫秒延迟，长回复占用更多内存
   *
   * hybrid：
   *   - 前 warmupChunks 个 chunk 缓存
   *   - warmup 后开始实时 yield
   *   - 如果中途失败，已 yield 的部分无法撤回（用户看到残缺内容）
   *   - 优点：延迟接近零
   *   - 缺点：warmup 后失败时用户已看到部分内容
   *
   * stream：
   *   - 不缓存，实时 yield
   *   - 只处理首 token 前失败（原有行为）
   *   - 优点：零延迟
   *   - 缺点：中途失败无法切换
   */
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (this.backends.length === 0) {
      yield this._errorChunk('no backends configured', 'NO_BACKENDS')
      return
    }

    const sourceBackend = this.backends[0]
    this.log(
      `route="${options.provider}" model="${options.model}" ` +
      `backends=${this.backends.length} mode=${this.bufferMode} warmup=${this.warmupChunks}`,
    )

    let lastFailure: string = 'unknown'
    let totalAttempts = 0

    for (let i = 0; i < this.backends.length; i++) {
      const backend = this.backends[i]
      const label = backend.label ?? backend.provider
      totalAttempts++

      this.log(`attempt ${totalAttempts}/${this.backends.length}: ${label}/${backend.model} (${this.bufferMode})`)

      try {
        // 调用同进程内 ctx.llm 的真实后端
        const innerStream = this.ctx.llm.stream({
          ...options,
          provider: backend.provider,
          model: backend.model,
        })

        if (this.bufferMode === 'stream') {
          // 不缓存，直接透传（原有行为）
          yield* this._streamDirect(innerStream, backend, label)
          return
        }

        if (this.bufferMode === 'hybrid') {
          // warmup 后实时 yield
          yield* this._streamHybrid(innerStream, backend, label)
          return
        }

        // strict 模式：先缓冲，成功后再 flush
        yield* this._streamStrict(innerStream, backend, label)
        return

      } catch (err) {
        const errMsg = String(err)
        this.log(`backend ${label} threw: ${errMsg}`)
        lastFailure = errMsg

        if (i < this.backends.length - 1) {
          this.log(`switching to next backend...`)
          continue
        }

        // 最后一个后端也失败了
        break
      }
    }

    // 所有后端耗尽
    this.log(`all ${this.backends.length} backends exhausted, last error: ${lastFailure}`)
    yield this._errorChunk(
      `all ${this.backends.length} backends failed (${totalAttempts} attempts): ${lastFailure}`,
      'ALL_BACKENDS_FAILED',
    )
  }

  /**
   * Strict 模式：缓冲所有 chunk，成功后一次性 flush。
   * 失败则丢弃 buffer，换后端。
   */
  private async * _streamStrict(
    source: AsyncIterable<StreamChunk>,
    backend: FailoverBackend,
    label: string,
  ): AsyncGenerator<StreamChunk> {
    const buffered = new BufferedStream(source, { maxBufferedChunks: this.maxBufferedChunks })

    // 在后台消费源
    const consumePromise = buffered.consume()

    // 等待直到源结束（成功或失败）
    let finished = false
    let errorOccured = false

    try {
      await consumePromise
      finished = true
    } catch (err) {
      errorOccured = true
      this.log(`backend ${label} failed during collection: ${String(err)}`)
    }

    if (errorOccured) {
      // 消费失败，buffer 已清空（BufferedStream 内部处理）
      throw new Error(lastFailure ?? String(errorOccured))
    }

    if (!finished) {
      // 被中断（abort），丢弃 buffer
      buffered.abort()
      throw new Error('stream aborted by caller')
    }

    // 正常结束，flush 全部 chunk
    const allChunks = await buffered.flushAll()
    this.log(`backend ${label} completed, flushing ${allChunks.length} chunks`)

    for (const chunk of allChunks) {
      yield chunk
    }
  }

  /**
   * Hybrid 模式：warmup 后实时 yield。
   * 若中途失败，已 yield 的内容用户已看到（无法撤回）。
   */
  private async * _streamHybrid(
    source: AsyncIterable<StreamChunk>,
    backend: FailoverBackend,
    label: string,
  ): AsyncGenerator<StreamChunk> {
    const buffered = new BufferedStream(source, { maxBufferedChunks: this.maxBufferedChunks })
    let warmupCount = 0
    let yieldedCount = 0
    let errorOccured = false

    const consumePromise = buffered.consume()

    // 先缓冲 warmup 个 chunk
    while (warmupCount < this.warmupChunks) {
      const batch = await buffered.next()
      if (!batch || batch.length === 0) {
        // 源提前结束
        break
      }
      for (const chunk of batch) {
        yield chunk
        warmupCount++
        yieldedCount++
        if (warmupCount >= this.warmupChunks) break
      }
    }

    // warmup 完成后，开始交替：消费一批 + yield 一批
    mainLoop:
    while (true) {
      // 并发消费下一批
      const nextBatchPromise = buffered.next()

      // 检查源是否已结束
      if (buffered.isDone && buffered.size === 0) {
        break
      }

      const batch = await nextBatchPromise
      if (!batch || batch.length === 0) {
        if (buffered.isDone) break
        continue
      }

      for (const chunk of batch) {
        // 检查是否为错误终态
        if (isErrorFinish(chunk)) {
          errorOccured = true
          this.log(`backend ${label} error at chunk ${yieldedCount}: ${getFailReason(chunk)}`)
          break mainLoop
        }
        yield chunk
        yieldedCount++
      }

      if (errorOccured) break
    }

    // 等待源完成
    await consumePromise

    if (errorOccured) {
      throw new Error(`backend ${label} failed after ${yieldedCount} chunks`)
    }

    this.log(`backend ${label} hybrid complete, yielded ${yieldedCount} chunks`)
  }

  /**
   * Stream 模式：直接透传，不缓存。
   * 只有首 token 前失败能切换，中途失败透传给上层。
   */
  private async * _streamDirect(
    source: AsyncIterable<StreamChunk>,
    _backend: FailoverBackend,
    label: string,
  ): AsyncGenerator<StreamChunk> {
    let committed = false
    for await (const chunk of source) {
      if (isErrorFinish(chunk)) {
        if (!committed) {
          // 首 token 前失败，调用方负责切下一个后端
          throw new Error(getFailReason(chunk))
        }
        // 已 commit，透传错误
        yield chunk
        return
      }
      if (!committed) committed = true
      yield chunk
    }
  }

  /** 构造错误 finish chunk */
  private _errorChunk(message: string, code: string): StreamChunk {
    return {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { message, code, status: undefined },
      },
    } as StreamChunk
  }
}

/* ------------------------------------------------------------------ */
/* 插件挂载                                                          */
/* ------------------------------------------------------------------ */

export const name = '@bamboo/model-router'
export const inject = ['llm']

export function apply(ctx: Context, config: FailoverConfig): void {
  if (!config?.route || !Array.isArray(config.backends) || config.backends.length === 0) {
    ctx.logger?.warn?.('[model-router] missing route or backends, skip')
    return
  }

  const adapter = new ModelRouterAdapter(
    ctx,
    config.backends,
    config.allowStepRetry !== false,
    config.bufferMode ?? 'strict',
    config.warmupChunks ?? 3,
    config.maxBufferedChunks ?? 1000,
    config.logLevel ?? 'normal',
  )

  // 注册为单一 provider 路由
  ctx.llm.registerAdapter([config.route], adapter)

  // 声明为可配置 provider
  ctx.llm.registerConfigurableProviders?.([{
    provider: config.route,
    displayName: `Model Router (${config.backends.map(b => b.label ?? b.provider).join(' → ')})`,
    settingsNs: 'model-router',
    settingsPath: ['model-router'],
  }])

  ctx.logger?.info?.(
    `[model-router] registered "${config.route}" ` +
    `with ${config.backends.length} backends [${config.bufferMode ?? 'strict'} mode]`,
  )
}

export default { name, inject, apply }
