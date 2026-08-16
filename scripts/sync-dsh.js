#!/usr/bin/env node
/**
 * scripts/sync-dsh.js
 *
 * 从 GitHub 拉取 dsh 上游源码到 vendor/deepseek-harness/，
 * 用于开发时引用本地版本，或进行兼容测试。
 *
 * 用法:
 *   node scripts/sync-dsh.js              # 拉取最新 main
 *   node scripts/sync-dsh.js v0.1.0       # 拉取指定版本
 *   node scripts/sync-dsh.js --help
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = join(fileURLToPath(import.meta.url), '..')
const ROOT = resolve(__dirname, '..')
const VENDOR_DIR = join(ROOT, 'vendor', 'deepseek-harness')
const REPO = 'deepseek-ai/deepseek-harness'
const BRANCH = process.argv[2] === '--branch' ? process.argv[3] : 'main'

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`)
  try {
    return execSync(cmd, { cwd: opts.cwd || ROOT, stdio: 'inherit', ...opts })
  } catch (e) {
    console.error(`命令失败: ${cmd}`)
    throw e
  }
}

function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
bamboo sync-dsh — 同步 dsh 上游

用法:
  node scripts/sync-dsh.js              拉取最新 main 分支
  node scripts/sync-dsh.js <ref>        拉取指定 ref（tag / branch / commit）
  node scripts/sync-dsh.js --clean      清除 vendor 目录后重新拉取
`)
    process.exit(0)
  }

  const clean = args.includes('--clean')

  if (clean && existsSync(VENDOR_DIR)) {
    console.log(`清除旧 vendor: ${VENDOR_DIR}`)
    rmSync(VENDOR_DIR, { recursive: true, force: true })
  }

  mkdirSync(join(ROOT, 'vendor'), { recursive: true })

  const ref = args.find(a => !a.startsWith('--')) || BRANCH

  if (!existsSync(join(VENDOR_DIR, '.git'))) {
    console.log(`克隆 ${REPO}@${ref} -> ${VENDOR_DIR}`)
    run(`git clone https://github.com/${REPO}.git "${VENDOR_DIR}"`)
    run(`git checkout ${ref}`, { cwd: VENDOR_DIR })
  } else {
    console.log(`更新 ${VENDOR_DIR}`)
    run('git fetch origin', { cwd: VENDOR_DIR })
    run(`git checkout ${ref}`, { cwd: VENDOR_DIR })
    run('git pull origin', { cwd: VENDOR_DIR })
  }

  console.log(`✅ 已同步到 ${VENDOR_DIR}`)
  console.log(`下一步: pnpm install && pnpm --filter @bamboo/bridge build`)
}

main()
