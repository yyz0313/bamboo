/**
 * buffered-stream.ts
 *
 * 缓冲式异步迭代器适配器。
 *
 * 原理：
 *   上游 AsyncIterable 产生的所有 chunk 先写入内部 buffer。
 *   上游正常结束（non-error finish）→ 一次性 flush 全部 chunk 给下游。
 *   上游抛错 / 产生 error finish → 清空 buffer，向上抛出异常。
 *   下游可以随时 abort，buffer 随之释放。
 *
 * 用途：让上层可以"吞掉"中途失败的流，而不把残缺内容暴露给用户。
 *       配合 failover 使用：先拿到完整结果再 yield，失败则丢弃换下一个。
 */

import type { StreamChunk } from './types.js'

export interface BufferedStreamOptions {
  /** 单个 buffer 的最大 chunk 数量，防止内存无限增长 */
  maxBufferedChunks?: number
}

export class BufferedStream {
  private buffer: StreamChunk[] = []
  private readonly maxBufferedChunks: number
  private aborted = false
  private sourceDone = false
  private flushSignal: (() => void) | null = null
  private flushSignalResolve: (() => void) | null = null

  constructor(private source: AsyncIterable<StreamChunk>, opts?: BufferedStreamOptions) {
    this.maxBufferedChunks = opts?.maxBufferedChunks ?? 1000
  }

  /** 开始消费源，收集 chunk 到 buffer */
  async consume(): Promise<void> {
    let count = 0
    try {
      for await (const chunk of this.source) {
        if (this.aborted) return
        if (count >= this.maxBufferedChunks) {
          // buffer 过大，说明流太长或出错，直接 flush（允许部分输出）
          break
        }
        this.buffer.push(chunk)
        count++

        // 如果上游有下游在等待 flush，通知它
        if (this.flushSignalResolve) {
          const resolve = this.flushSignalResolve
          this.flushSignalResolve = null
          this.flushSignal = null
          resolve()
        }
      }
      this.sourceDone = true
    } catch (err) {
      this.buffer = []
      throw err
    }
  }

  /** 向下游提供 chunk，每次最多返回一批。返回 null 表示没有更多。 */
  async next(): Promise<StreamChunk[] | null> {
    if (this.aborted) return null
    if (this.sourceDone && this.buffer.length === 0) return null

    // 等待 buffer 有数据或源完成
    await this.waitForData()

    if (this.buffer.length === 0) return null
    const batch = this.buffer.splice(0, Math.min(20, this.buffer.length))
    return batch
  }

  /** 立即 flush 所有 buffer（用于正常结束场景） */
  async flushAll(): Promise<StreamChunk[]> {
    await this.waitForData()
    const all = [...this.buffer]
    this.buffer = []
    return all
  }

  /** 标记中断，释放所有资源 */
  abort(): void {
    this.aborted = true
    this.buffer = []
    if (this.flushSignalResolve) {
      const resolve = this.flushSignalResolve
      this.flushSignalResolve = null
      this.flushSignal = null
      resolve()
    }
  }

  private waitForData(): Promise<void> {
    return new Promise((resolve) => {
      if (this.buffer.length > 0 || this.sourceDone) {
        resolve()
        return
      }
      this.flushSignalResolve = resolve
    })
  }

  get size(): number {
    return this.buffer.length
  }

  get isDone(): boolean {
    return this.sourceDone && this.buffer.length === 0
  }
}
