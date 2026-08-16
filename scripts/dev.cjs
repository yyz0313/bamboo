#!/usr/bin/env node
/**
 * Bamboo 开发启动器
 * 同时启动 Python bridge 和 Vite dev server（前端 1420，bridge 18720）
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PYTHON = process.env.PYTHON || (process.platform === 'win32'
    ? 'python'
    : 'python3');

function log(prefix: string, data: Buffer) {
    const text = data.toString().trim();
    if (text) console.log(`[${prefix}] ${text}`);
}

function errLog(prefix: string, data: Buffer) {
    const text = data.toString().trim();
    if (text) console.error(`[${prefix} ERR] ${text}`);
}

async function main() {
    // ── 1. Start Python bridge ──────────────────────────────────────────────
    const bridgeArgs = ['bridge/main.py'];
    if (process.argv.includes('--config')) {
        const idx = process.argv.indexOf('--config');
        bridgeArgs.push('--config', process.argv[idx + 1]);
    }

    const bridge = spawn(PYTHON, bridgeArgs, {
        cwd: ROOT,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    bridge.stdout.on('data', (d) => log('bridge', d));
    bridge.stderr.on('data', (d) => errLog('bridge', d));
    bridge.on('error', (err) => {
        console.error('[bamboo] Failed to start bridge:', err.message);
        process.exit(1);
    });
    console.log(`[bamboo] bridge PID=${bridge.pid} (${PYTHON} bridge/main.py)`);

    // ── 2. Wait for bridge to be ready ──────────────────────────────────────
    await new Promise<void>((resolve, reject) => {
        let buffer = '';
        bridge.stdout!.on('data', (d: Buffer) => {
            buffer += d.toString();
            if (buffer.includes('started in') || buffer.includes('Application startup')) {
                resolve();
            }
        });
        bridge.stderr!.on('data', (d: Buffer) => {
            const t = d.toString();
            if (t.includes('started') || t.includes('startup') || t.includes('18720')) {
                resolve();
            }
        });
        setTimeout(() => reject(new Error('Bridge startup timeout')), 30000);
    }).catch(() => {});

    // ── 3. Start Vite dev server ────────────────────────────────────────────
    const vite = spawn(
        'C:/Users/yyz20/.workbuddy/binaries/node/versions/22.22.2/node.exe',
        ['C:/Users/yyz20/.workbuddy/binaries/node/versions/22.22.2/node_modules/vite/bin/vite.js', 'run', 'dev', '--port', '1420'],
        {
            cwd: resolve(ROOT, 'src'),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PORT: '1420' },
        }
    );
    vite.stdout!.on('data', (d) => log('vite', d));
    vite.stderr!.on('data', (d) => errLog('vite', d));
    console.log('[bamboo] vite dev started on http://localhost:1420');

    // ── 4. Graceful shutdown ────────────────────────────────────────────────
    function shutdown() {
        console.log('[bamboo] shutting down...');
        bridge.kill('SIGTERM');
        vite.kill('SIGTERM');
        process.exit(0);
    }
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    console.error('[bamboo] fatal:', err);
    process.exit(1);
});
