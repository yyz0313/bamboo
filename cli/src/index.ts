#!/usr/bin/env node
/**
 * bamboo — CLI 入口
 *
 * 用法:
 *   bamboo              启动桌面端
 *   bamboo chat         命令行对话（TUI）
 *   bamboo run "任务"   一次性任务
 *   bamboo serve        启动 bridge 服务（桌面端连接）
 *   bamboo plugin       插件管理
 *   bamboo config       配置查看/编辑
 */
import { createInterface } from 'node:readline'
import { createBridge, type BambooEvent } from '@bamboo/bridge'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'

const BINARY = 'bamboo'
const CONFIG_PATH = join(homedir(), '.bamboo', 'config.json')

/* ------------------------------------------------------------------ */
/* 配置                                                               */
/* ------------------------------------------------------------------ */

interface BambooConfig {
  dshProfile: string
  modelProvider: string
  model: string
  debug: boolean
  backends: Array<{ provider: string; model: string; label?: string }>
}

function loadConfig(): BambooConfig {
  const defaults: BambooConfig = {
    dshProfile: 'bamboo',
    modelProvider: 'bamboo-failover',
    model: 'deepseek-v4-flash',
    debug: false,
    backends: [
      { provider: 'deepseek-official', model: 'deepseek-v4-flash', label: '主 Key' },
    ],
  }
  if (!existsSync(CONFIG_PATH)) {
    saveConfig(defaults)
    return defaults
  }
  try {
    return { ...defaults, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) }
  } catch {
    return defaults
  }
}

function saveConfig(cfg: BambooConfig): void {
  const dir = join(homedir(), '.bamboo')
  if (!existsSync(dir)) require('node:fs').mkdirSync(dir, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

/* ------------------------------------------------------------------ */
/* 子命令                                                              */
/* ------------------------------------------------------------------ */

async function cmdRun(prompt: string, cfg: BambooConfig): Promise<void> {
  const bridge = createBridge({
    debug: cfg.debug,
    env: {
      DSH_PROFILE: cfg.dshProfile,
      DSH_MODEL_PROVIDER: cfg.modelProvider,
      DSH_MODEL: cfg.model,
    },
  })

  console.log(`\n🎋 任务：${prompt}\n`)
  console.log(`模型：${cfg.modelProvider}/${cfg.model}`)
  console.log(`后端：${cfg.backends.map(b => `${b.label ?? b.provider}(${b.model})`).join(' → ')}\n`)

  bridge.on('agent.message', (e) => {
    process.stdout.write(`> ${(e as any).content}\n`)
  })

  bridge.on('tool.call_started', (e) => {
    console.log(`⚙️  [${(e as any).tool}] ${JSON.stringify((e as any).args).slice(0, 80)}`)
  })

  bridge.on('tool.call_finished', (e) => {
    const result = (e as any).result
    console.log(`✅ [${(e as any).tool}] exit=${result?.exitCode}`)
  })

  bridge.on('tool.call_error', (e) => {
    console.error(`❌ [${(e as any).tool}] ${(e as any).error}`)
  })

  bridge.on('model.failover', (e) => {
    const { from, to, reason } = e as any
    console.warn(`⚡ 故障转移：${from} → ${to}（${reason}）`)
  })

  bridge.on('error', (e) => {
    console.error(`[error] ${(e as any).message}`)
  })

  try {
    const result = await bridge.run(prompt)
    if (result.ok) {
      if (result.output) {
        console.log('\n--- 输出 ---')
        console.log(result.output.slice(0, 3000))
      }
    } else {
      console.error(`任务失败: ${result.stderr.slice(0, 500)}`)
      process.exit(1)
    }
  } finally {
    bridge.stop()
  }
}

async function cmdChat(cfg: BambooConfig): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const question = (q: string): Promise<string> =>
    new Promise(resolve => rl.question(q, resolve))

  console.log(`🎋 Bamboo CLI (${cfg.model})`)
  console.log(`输入任务，Enter 发送；输入 /stop 停止，/quit 退出\n`)

  let active = false
  let bridge: ReturnType<typeof createBridge> | null = null

  while (true) {
    const input = (await question('> ')).trim()
    if (!input) continue

    if (input === '/quit' || input === '/exit') {
      break
    }
    if (input === '/stop') {
      bridge?.stop()
      active = false
      continue
    }
    if (input === '/config') {
      console.log(JSON.stringify(cfg, null, 2))
      continue
    }

    if (!active) {
      active = true
      bridge = createBridge({ debug: cfg.debug })

      bridge.on('agent.message', (e) => {
        process.stdout.write(`\n🤖 ${(e as any).content}\n\n`)
      })
      bridge.on('tool.call_started', (e) => {
        console.log(`  ⚙️  ${(e as any).tool}`)
      })
      bridge.on('tool.call_finished', (e) => {
        console.log(`  ✅ ${(e as any).tool}`)
      })
      bridge.on('model.failover', (e) => {
        console.warn(`  ⚡ 切换: ${(e as any).from} → ${(e as any).to}`)
      })
      bridge.on('error', (e) => {
        console.error(`  ❌ ${(e as any).message}`)
      })
    }

    try {
      await cmdRun(input, cfg)
    } catch (err) {
      console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`)
    } finally {
      active = false
      bridge?.stop()
    }
  }

  rl.close()
}

async function cmdServe(cfg: BambooConfig): Promise<void> {
  console.log('🎋 Bamboo Bridge Server 启动中...')
  // TODO: 实现 WebSocket 服务，供桌面端连接
  console.log('[serve] 暂未实现，敬请期待')
}

function cmdConfig(cfg: BambooConfig): void {
  console.log(`# Bamboo 配置 (${CONFIG_PATH})\n`)
  console.log(JSON.stringify(cfg, null, 2))
}

function cmdPlugin(cfg: BambooConfig): void {
  console.log('🎋 Bamboo 插件管理\n')
  console.log('命令：')
  console.log('  bamboo plugin list          列出已加载插件')
  console.log('  bamboo plugin add <pkg>     添加插件')
  console.log('  bamboo plugin remove <pkg>  移除插件')
  console.log('  bamboo plugin reload        重新加载所有插件')
  console.log('\n当前插件：')
  console.log('  ✓ @bamboo/model-router (多 Key/供应商故障转移)')
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

function printUsage(): void {
  console.log(`
🎋 Bamboo — 基于 DeepSeek Harness 的 Codex 风格客户端

用法:
  bamboo              启动桌面端（需要 Tauri 环境）
  bamboo chat         交互式命令行对话
  bamboo run "任务"   一次性任务
  bamboo serve        启动 bridge 服务
  bamboo config       查看/编辑配置
  bamboo plugin       插件管理
  bamboo --help       显示帮助

选项:
  --debug             启用调试日志
  --profile <name>    指定 dsh profile
  --model <name>      指定模型
  --key <key>         设置 API Key
`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const cfg = loadConfig()

  let debug = false
  let profile = cfg.dshProfile
  let model = cfg.model

  // 解析全局选项
  while (args.length > 0) {
    if (args[0] === '--debug') { debug = true; args.shift() }
    else if (args[0] === '--profile' && args[1]) { profile = args[1]; args.shift(); args.shift() }
    else if (args[0] === '--model' && args[1]) { model = args[1]; args.shift(); args.shift() }
    else if (args[0] === '--key' && args[1]) {
      process.env.DEEPSEEK_API_KEY = args[1]
      args.shift()
      args.shift()
    }
    else break
  }

  const cmd = args[0]
  const cmdArgs = args.slice(1)

  if (!cmd || cmd === '--help' || cmd === '-h') {
    printUsage()
    return
  }

  const runCfg = { ...cfg, debug, dshProfile: profile, model }

  switch (cmd) {
    case 'chat':
      await cmdChat(runCfg)
      break
    case 'run': {
      const prompt = cmdArgs.join(' ')
      if (!prompt) {
        console.error('run 需要任务描述：bamboo run "任务"')
        process.exit(1)
      }
      await cmdRun(prompt, runCfg)
      break
    }
    case 'serve':
      await cmdServe(runCfg)
      break
    case 'config':
      cmdConfig(runCfg)
      break
    case 'plugin':
      cmdPlugin(runCfg)
      break
    case 'desktop':
    case 'ui':
      console.log('🎋 启动桌面端...（需要 Tauri CLI）')
      console.log('运行: pnpm tauri dev')
      break
    default:
      console.error(`未知命令: ${cmd}`)
      printUsage()
      process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
