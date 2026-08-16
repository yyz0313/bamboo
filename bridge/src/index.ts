/**
 * @bamboo/bridge
 *
 * Bridge 层职责：
 * 1. 启动/守护 dsh 进程（以 bamboo profile 运行）
 * 2. 解析 dsh 输出的 JSON Lines 事件流
 * 3. 向 UI/CLI 转发标准化事件
 * 4. 将 UI/CLI 命令翻译为 dsh CLI 调用
 *
 * 设计原则：
 * - 不依赖 dsh 内部源码，只通过 CLI 交互
 * - 事件协议向前兼容：新事件类型不影响旧客户端
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

/* ------------------------------------------------------------------ */
/* 类型定义                                                            */
/* ------------------------------------------------------------------ */

/** dsh 原生事件类型（来自 DSH 的 SessionEvent 体系） */
export interface DshEvent {
  /** 事件类型，如 turn/start, tool/call, assistant/message 等 */
  type: string;
  /** 事件载荷 */
  payload?: Record<string, unknown>;
  /** 时间戳（ISO 8601） */
  ts?: string;
  /** 会话 ID */
  sessionId?: string;
}

/** Bridge 向 UI 转发的标准化事件 */
export type BambooEvent =
  | { type: 'session.started'; sessionId: string; ts: string }
  | { type: 'session.ended'; sessionId: string; ts: string }
  | { type: 'agent.message'; sessionId: string; content: string; ts: string }
  | { type: 'tool.call_started'; sessionId: string; tool: string; args: Record<string, unknown>; ts: string }
  | { type: 'tool.call_finished'; sessionId: string; tool: string; result: Record<string, unknown>; ts: string }
  | { type: 'tool.call_error'; sessionId: string; tool: string; error: string; ts: string }
  | { type: 'model.failover'; sessionId: string; from: string; to: string; reason: string; ts: string }
  | { type: 'plugin.loaded'; plugin: string; version: string; ts: string }
  | { type: 'progress'; sessionId: string; percent: number; text: string; ts: string }
  | { type: 'error'; message: string; ts: string }
  | { type: 'ready'; ts: string };

/** Bridge 配置 */
export interface BridgeConfig {
  /** dsh 可执行文件路径（默认从 PATH 查找） */
  dshBinary?: string;
  /** dsh profile 名称（默认 bamboo） */
  profile?: string;
  /** 是否打印调试日志 */
  debug?: boolean;
  /** 工作目录（默认当前目录） */
  cwd?: string;
  /** 环境变量覆盖 */
  env?: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Bridge 类                                                          */
/* ------------------------------------------------------------------ */

export class Bridge extends EventEmitter {
  private process: ChildProcess | null = null;
  private buffer = '';
  private readonly config: Required<BridgeConfig>;
  private readonly pidFile: string;

  constructor(config: BridgeConfig = {}) {
    super();
    this.config = {
      dshBinary: config.dshBinary ?? 'dsh',
      profile: config.profile ?? 'bamboo',
      debug: config.debug ?? false,
      cwd: config.cwd ?? process.cwd(),
      env: config.env ?? {},
    };
    this.pidFile = join(process.cwd(), '.bamboo.pid');
  }

  /**
   * 启动 dsh 进程（headless 模式，等待任务完成）
   * @param prompt 任务描述
   * @returns 任务结果
   */
  async run(prompt: string): Promise<BambooRunResult> {
    return new Promise((resolve, reject) => {
      const args = ['--profile', this.config.profile, prompt];
      this.log(`启动 dsh: ${this.config.dshBinary} ${args.join(' ')}`);

      const child = spawn(this.config.dshBinary, args, {
        cwd: this.config.cwd,
        env: { ...process.env, ...this.config.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.process = child;
      this.writePid(child.pid!);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        this.parseEvents(text);
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        if (this.config.debug) {
          this.log(`[stderr] ${data.toString().trim()}`);
        }
      });

      child.on('close', (code) => {
        this.process = null;
        this.clearPid();
        if (code === 0) {
          resolve({ ok: true, output: stdout.trim(), stderr: stderr.trim() });
        } else {
          reject(new Error(`dsh exited with code ${code}: ${stderr.slice(0, 500)}`));
        }
      });

      child.on('error', (err) => {
        this.process = null;
        this.clearPid();
        this.emit('error', { message: `Failed to start dsh: ${err.message}` });
        reject(err);
      });
    });
  }

  /**
   * 启动长期运行的 dsh 进程（用于 web 服务或持久会话）
   */
  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['--profile', this.config.profile, 'web'];
      this.log(`启动 dsh web: ${this.config.dshBinary} ${args.join(' ')}`);

      const child = spawn(this.config.dshBinary, args, {
        cwd: this.config.cwd,
        env: { ...process.env, ...this.config.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.process = child;
      this.writePid(child.pid!);

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        this.parseEvents(text);
        // 检测 server ready 信号
        if (text.includes('listening') || text.includes('http://')) {
          this.emit('ready', { ts: new Date().toISOString() });
          resolve();
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        if (this.config.debug) {
          this.log(`[stderr] ${data.toString().trim()}`);
        }
      });

      child.on('error', (err) => {
        this.process = null;
        this.clearPid();
        reject(err);
      });
    });
  }

  /**
   * 停止正在运行的 dsh 进程
   */
  stop(): void {
    if (this.process) {
      this.log('停止 dsh 进程');
      this.process.kill('SIGTERM');
      this.process = null;
      this.clearPid();
    } else {
      // 尝试通过 PID 文件停止
      const pid = this.readPid();
      if (pid) {
        try {
          process.kill(Number(pid), 'SIGTERM');
          this.log(`通过 PID ${pid} 停止 dsh`);
        } catch {
          // 进程已不存在
        }
        this.clearPid();
      }
    }
  }

  /**
   * 解析 dsh 输出的 JSON Lines 事件
   */
  private parseEvents(text: string): void {
    this.buffer += text;
    const lines = this.buffer.split(/\r?\n/);
    // 保留最后一行（可能不完整）
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as DshEvent;
        this.emitDshEvent(event);
      } catch {
        // 非 JSON 行（可能是普通输出），作为 progress 事件转发
        if (line.trim()) {
          this.emit('progress', {
            sessionId: '',
            percent: 0,
            text: line.trim().slice(0, 200),
            ts: new Date().toISOString(),
          } as BambooEvent);
        }
      }
    }
  }

  /**
   * 将 DSH 原生事件映射为 Bamboo 标准化事件
   */
  private emitDshEvent(event: DshEvent): void {
    const { type, payload, ts, sessionId } = event;
    const base = { ts: ts ?? new Date().toISOString(), sessionId: sessionId ?? '' };

    switch (type) {
      case 'turn/start':
        this.emit('session.started', { ...base, sessionId: sessionId ?? 'unknown' } as BambooEvent);
        break;
      case 'turn/end':
        this.emit('session.ended', base as BambooEvent);
        break;
      case 'assistant/message':
        this.emit('agent.message', {
          ...base,
          content: (payload?.text ?? payload?.content ?? '') as string,
        } as BambooEvent);
        break;
      case 'tool/call': {
        const toolName = (payload?.name ?? 'unknown') as string;
        const toolArgs = (payload?.arguments ?? {}) as Record<string, unknown>;
        this.emit('tool.call_started', {
          ...base,
          tool: toolName,
          args: toolArgs,
        } as BambooEvent);
        break;
      }
      case 'tool/result': {
        const toolName = (payload?.name ?? 'unknown') as string;
        const isError = (payload?.isError ?? false) as boolean;
        if (isError) {
          this.emit('tool.call_error', {
            ...base,
            tool: toolName,
            error: (payload?.error ?? 'unknown error') as string,
          } as BambooEvent);
        } else {
          this.emit('tool.call_finished', {
            ...base,
            tool: toolName,
            result: { exitCode: (payload?.exitCode ?? 0) as number, output: (payload?.output ?? '') as string },
          } as BambooEvent);
        }
        break;
      }
      case 'llm/failover':
        this.emit('model.failover', {
          ...base,
          from: (payload?.from ?? 'unknown') as string,
          to: (payload?.to ?? 'unknown') as string,
          reason: (payload?.reason ?? '') as string,
        } as BambooEvent);
        break;
      case 'plugin/loaded':
        this.emit('plugin.loaded', {
          ...base,
          plugin: (payload?.name ?? 'unknown') as string,
          version: (payload?.version ?? '0.0.0') as string,
        } as BambooEvent);
        break;
      default:
        // 未知事件类型，以 debug 模式输出
        if (this.config.debug) {
          this.log(`[dsh event] ${type}: ${JSON.stringify(payload)?.slice(0, 200)}`);
        }
    }
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log(`[bridge] ${new Date().toISOString()}`, ...args);
    }
  }

  private writePid(pid: number): void {
    try {
      writeFileSync(this.pidFile, String(pid));
    } catch {
      // 写入失败不影响主流程
    }
  }

  private clearPid(): void {
    try {
      const { unlinkSync } = require('node:fs');
      unlinkSync(this.pidFile);
    } catch {
      // 清理失败忽略
    }
  }

  private readPid(): string | null {
    try {
      return readFileSync(this.pidFile, 'utf8').trim() || null;
    } catch {
      return null;
    }
  }
}

/** 单次 run 的结果 */
export interface BambooRunResult {
  ok: boolean;
  output: string;
  stderr: string;
}

/**
 * 工厂函数：创建 Bridge 实例
 */
export function createBridge(config: BridgeConfig = {}): Bridge {
  return new Bridge(config);
}
