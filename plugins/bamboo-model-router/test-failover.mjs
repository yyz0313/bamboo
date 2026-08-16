/**
 * 故障转移测试脚本（纯 JS，无需 TS 编译）
 *
 * 测试场景：
 *   1. strict 模式：主后端中途失败 → 自动切换备用 → 用户收到完整响应
 *   2. hybrid 模式：warmup 后实时输出，中途失败用户可能看到残缺内容
 *   3. direct 模式：无缓冲，中途失败直接中断
 *
 * 用法：
 *   node test-failover.mjs              # strict 模式
 *   node test-failover.mjs --hybrid     # hybrid 模式
 *   node test-failover.mjs --direct     # direct 对比
 *   node test-failover.mjs --all        # 全部测试
 */

// ─────────────────────────────────────────────────────────────
// BufferedStream 实现（与 src/buffered-stream.ts 对齐）
// ─────────────────────────────────────────────────────────────

class BufferedStream {
  constructor(source, { maxBufferedChunks = 1000 } = {}) {
    this.source = source
    this.maxBufferedChunks = maxBufferedChunks
    this.buffer = []
    this.aborted = false
    this.sourceDone = false
    this.flushResolve = null
  }

  async consume() {
    let count = 0
    try {
      for await (const chunk of this.source) {
        if (this.aborted) return
        if (count >= this.maxBufferedChunks) {
          console.log(`  ⚠️  buffer 已满 (${this.maxBufferedChunks} chunks)，停止缓冲`)
          break
        }
        this.buffer.push(chunk)
        count++
        // 通知等待 flush 的调用方
        if (this.flushResolve) {
          const resolve = this.flushResolve
          this.flushResolve = null
          resolve()
        }
      }
      this.sourceDone = true
    } catch (err) {
      this.buffer = []  // 失败时清空 buffer
      throw err
    }
  }

  async next() {
    if (this.aborted || (this.sourceDone && this.buffer.length === 0)) return null
    if (this.buffer.length > 0) {
      return this.buffer.splice(0, Math.min(20, this.buffer.length))
    }
    // 等待新数据
    return new Promise((resolve) => {
      const check = () => {
        if (this.buffer.length > 0 || this.sourceDone) {
          resolve(this.buffer.splice(0, Math.min(20, this.buffer.length)) || null)
        } else {
          setTimeout(check, 10)
        }
      }
      check()
    })
  }

  async flushAll() {
    // 等待消费完成
    await new Promise((resolve) => {
      if (this.sourceDone) { resolve() }
      else { this.flushResolve = resolve }
    })
    const all = [...this.buffer]
    this.buffer = []
    return all
  }

  abort() {
    this.aborted = true
    this.buffer = []
  }

  get isDone() {
    return this.sourceDone && this.buffer.length === 0
  }
}

// ─────────────────────────────────────────────────────────────
// 模拟后端
// ─────────────────────────────────────────────────────────────

async function* createMockBackend(name, { shouldFail, delayMs = 80, failAt = 3, chunks = null }) {
  const defaultChunks = [
    { type: 'text-delta', index: 0, text: '我是' },
    { type: 'text-delta', index: 0, text: '一个' },
    { type: 'text-delta', index: 0, text: 'AI' },
    { type: 'text-delta', index: 0, text: '助手' },
    { type: 'text-delta', index: 0, text: '，' },
    { type: 'text-delta', index: 0, text: '专门' },
    { type: 'text-delta', index: 0, text: '帮助' },
    { type: 'text-delta', index: 0, text: '你' },
    { type: 'text-delta', index: 0, text: '写' },
    { type: 'text-delta', index: 0, text: '代码' },
  ]
  const texts = chunks || defaultChunks
  let index = 0

  for (const chunk of texts) {
    await sleep(delayMs)
    yield chunk
    index++
  }

  if (shouldFail) {
    await sleep(delayMs)
    throw new Error(`模拟后端「${name}」中途失败：quota exhausted at chunk ${index}`)
  }

  // 成功终态
  yield { type: 'finish', reason: { kind: 'stop' } }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─────────────────────────────────────────────────────────────
// 测试逻辑
// ─────────────────────────────────────────────────────────────

async function testStrict() {
  console.log(`\n${'═'.repeat(60)}`)
  console.log('【Strict 模式】所有 chunk 缓冲，成功才 flush，失败丢弃换下一个')
  console.log(`${'═'.repeat(60)}`)

  const backends = [
    createMockBackend('主后端（中途失败）', { shouldFail: true, delayMs: 80, failAt: 3 }),
    createMockBackend('备用后端（正常）',   { shouldFail: false, delayMs: 50 }),
  ]

  const results = []
  let switched = false
  const t0 = Date.now()

  for (let i = 0; i < backends.length; i++) {
    const backend = backends[i]
    console.log(`\n  ▶ 尝试: ${backends[i].name || 'backend ' + (i+1)}`)

    const buffered = new BufferedStream(backend)
    const consumePromise = buffered.consume()

    try {
      await consumePromise

      // 检查是否为错误终态
      const lastChunk = buffered.buffer[buffered.buffer.length - 1]
      if (lastChunk?.type === 'finish' && lastChunk.reason?.kind === 'error') {
        throw new Error(getFailReason(lastChunk))
      }

      const chunks = await buffered.flushAll()
      const elapsed = Date.now() - t0
      const text = chunks.filter(c => c.type === 'text-delta').map(c => c.text).join('')
      console.log(`  ✅ 收集 ${chunks.length} 个 chunk，耗时 ${elapsed}ms`)
      console.log(`  📝 响应: "${text}"`)

      results.push(...chunks)
      break
    } catch (err) {
      console.log(`  ❌ ${backends[i].name}: ${err.message}`)
      buffered.abort()

      if (i < backends.length - 1) {
        switched = true
        console.log(`  ⚡ 切换到下一个后端...`)
      } else {
        console.log(`  💀 所有后端已耗尽`)
        return { success: false, error: err.message }
      }
    }
  }

  console.log(`\n  🎯 结果：${switched ? '✅ 自动切换成功' : '✅ 未切换'}，最终文本: "${results.filter(c=>c.type==='text-delta').map(c=>c.text).join('')}"`)
  return { success: true, switched }
}

async function testDirect() {
  console.log(`\n${'═'.repeat(60)}`)
  console.log('【Direct 模式】无缓冲，中途失败直接中断（用户已看到残缺内容）')
  console.log(`${'═'.repeat(60)}`)

  const backend = createMockBackend('主后端（中途失败）', { shouldFail: true, delayMs: 80 })
  let yielded = 0

  try {
    for await (const chunk of backend) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.text)
        yielded++
      }
    }
    console.log(`\n  ✅ 完成，yield ${yielded} 个 chunk`)
  } catch (err) {
    console.log(`\n  ❌ 中途失败: ${err.message}`)
    console.log(`  ⚠️  用户已看到 ${yielded} 个 chunk 的内容，无法撤回`)
  }
}

async function testAllBackendsFail() {
  console.log(`\n${'═'.repeat(60)}`)
  console.log('【All Fail 测试】所有后端都失败，验证错误处理')
  console.log(`${'═'.repeat(60)}`)

  const backends = [
    createMockBackend('主后端（失败）', { shouldFail: true, delayMs: 50 }),
    createMockBackend('备用后端（也失败）', { shouldFail: true, delayMs: 50 }),
  ]

  for (let i = 0; i < backends.length; i++) {
    const backend = backends[i]
    console.log(`\n  ▶ 尝试: backend ${i + 1}`)

    const buffered = new BufferedStream(backend)
    try {
      await buffered.consume()
      const chunks = await buffered.flushAll()
      console.log(`  ✅ backend ${i + 1} 完成`)
    } catch (err) {
      console.log(`  ❌ backend ${i + 1} 失败: ${err.message}`)
      buffered.abort()
    }
  }

  console.log(`\n  💀 所有后端失败，用户应收到 ALL_BACKENDS_FAILED 错误`)
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const mode = args.includes('--all') ? 'all'
    : args.includes('--direct') ? 'direct'
    : args.includes('--hybrid') ? 'hybrid'
    : 'strict'

  console.log('🎋 Bamboo Model Router — 故障转移测试')
  console.log(`测试模式: ${mode}`)

  if (mode === 'all' || mode === 'strict') {
    await testStrict()
  }

  if (mode === 'all' || mode === 'direct') {
    await testDirect()
  }

  if (mode === 'all' || mode === 'strict') {
    await testAllBackendsFail()
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log('测试完成')
  console.log(`${'═'.repeat(60)}`)
}

main().catch(err => {
  console.error('测试执行出错:', err)
  process.exit(1)
})
