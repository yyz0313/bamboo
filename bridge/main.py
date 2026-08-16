"""
Bamboo Python Bridge
====================
Connects the Bamboo React UI to the official DeepSeek Harness (dsh) runtime.
Speaks dsh's native JSONL-over-stdio protocol — zero modifications to dsh.

Usage:
    python bridge/main.py --port 18720 --config bridge/cordis.yml

Env:
    DEEPSEEK_API_KEY     forwarded to dsh
    DEEPSEEK_BASE_URL    forwarded to dsh
    DSH_RUNTIME_BIN      explicit path to dsh-jsonrpc-agent exe
    BAMBOO_MOCK=1        force mock mode (no network needed)
    BAMBOO_PRESET        agent preset: standard | code | minimal | cordis
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, AsyncIterator, Optional

try:
    from fastapi import FastAPI, Request
    from fastapi.responses import StreamingResponse, JSONResponse
    from fastapi.middleware.cors import CORSMiddleware
    _HAVE_FASTAPI = True
except Exception:
    _HAVE_FASTAPI = False

ROOT = Path(__file__).resolve().parent.parent


# --------------------------------------------------------------------------- #
# Runtime resolution
# --------------------------------------------------------------------------- #
def resolve_runtime() -> tuple[list[str], Optional[Path]]:
    """Return (argv_to_launch, default_config_path)."""
    # 1. deepseek_harness Python SDK (official)
    try:
        import deepseek_harness  # noqa: F401
        from deepseek_harness_runtime import (
            resolve_bundled_launch_args,
            bundled_default_config_path,
        )
        argv = list(resolve_bundled_launch_args("exe"))
        cfg = bundled_default_config_path()
        return argv, cfg
    except Exception:
        pass

    # 2. explicit DSH_RUNTIME_BIN
    bin_path = os.environ.get("DSH_RUNTIME_BIN")
    if bin_path and Path(bin_path).is_file():
        return [bin_path], None

    # 3. Bamboo's own full cordis config
    bamboo_config = ROOT / "bridge" / "cordis.yml"
    if bamboo_config.is_file():
        return [], str(bamboo_config)

    # 4. vendor copy (the dsh submodule)
    vendor_runtime = (
        ROOT / "vendor" / "deepseek-harness" / "python" / "sdk-runtime"
        / "src" / "deepseek_harness_runtime" / "runtime"
    )
    if vendor_runtime.exists():
        exe = next(vendor_runtime.glob("dsh-jsonrpc-agent*"), None)
        if exe is not None and exe.is_file():
            return [str(exe)], vendor_runtime / "cordis.yml"

    # 5. mock mode
    return [], None


def runtime_mode() -> str:
    argv, _ = resolve_runtime()
    return "real" if argv else "mock"


# --------------------------------------------------------------------------- #
# JSON-RPC client over dsh stdio subprocess
# --------------------------------------------------------------------------- #
class DshAgentProcess:
    """Wraps a single dsh-jsonrpc-agent stdio subprocess."""

    def __init__(self, argv: list[str], config_path: Optional[Path], env: dict[str, str]):
        self.argv = argv
        self.config_path = config_path
        self.env = env
        self.proc: Optional[subprocess.Popen] = None
        self._msg_id = 0
        self._lock = asyncio.Lock()
        self._pending: dict[int, asyncio.Future] = {}
        self._reader_task: Optional[asyncio.Task] = None
        self.notifications: asyncio.Queue = asyncio.Queue()

    async def start(self) -> None:
        full_argv = list(self.argv)
        launch_env = dict(os.environ)
        launch_env.update(self.env)
        if self.config_path is not None:
            launch_env["DSH_CORDIS_CONFIG"] = str(self.config_path)
        self.proc = subprocess.Popen(
            full_argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=launch_env,
            bufsize=0,
        )
        self._reader_task = asyncio.create_task(self._read_loop())

    async def _read_loop(self) -> None:
        assert self.proc is not None and self.proc.stdout is not None
        loop = asyncio.get_event_loop()
        while True:
            line = await loop.run_in_executor(None, self.proc.stdout.readline)
            if not line:
                break
            line = line.decode("utf-8", "replace").strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if "method" in msg and "id" not in msg:
                await self.notifications.put(msg)
            elif "id" in msg:
                fut = self._pending.pop(int(msg["id"]), None)
                if fut is not None and not fut.done():
                    fut.set_result(msg)

    async def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        async with self._lock:
            self._msg_id += 1
            msg_id = self._msg_id
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[msg_id] = future
        frame = {"jsonrpc": "2.0", "id": msg_id, "method": method, "params": params}
        payload = (json.dumps(frame) + "\n").encode("utf-8")
        assert self.proc is not None and self.proc.stdin is not None
        self.proc.stdin.write(payload)
        self.proc.stdin.flush()
        return await future

    async def stop(self) -> None:
        if self.proc is not None:
            try:
                self.proc.terminate()
            except Exception:
                pass
        if self._reader_task is not None:
            self._reader_task.cancel()


# --------------------------------------------------------------------------- #
# Real dsh-style mock events (simulates the real protocol for UI testing)
# --------------------------------------------------------------------------- #
async def dsh_mock_stream(session_id: str, prompt: str) -> AsyncIterator[str]:
    """
    Generate realistic dsh JSONL events matching the protocol seen in
    apps/web/tests/snapshots/*.jsonl files.
    """
    seq = 0
    now_ms = int(time.time() * 1000)

    def emit(obj: dict) -> str:
        nonlocal seq
        obj["seq"] = seq
        obj["time"] = now_ms + seq * 10
        seq += 1
        return json.dumps(obj, ensure_ascii=False)

    # Session header
    yield emit({
        "type": "session",
        "version": 0,
        "id": session_id,
        "createdAt": now_ms,
        "cwd": str(ROOT),
        "agentPreset": os.environ.get("BAMBOO_PRESET", "standard"),
    })

    # User message
    yield emit({
        "type": "turn/start",
        "data": {"turn": 1, "trigger": {"kind": "message", "source": {"kind": "user"}}},
    })
    yield emit({
        "type": "user/message",
        "data": {
            "role": "user",
            "content": [{"type": "text", "text": prompt}],
            "source": {"kind": "user"},
            "surfaceOp": "append",
        },
    })
    yield emit({
        "type": "session/title",
        "data": {"title": prompt[:40] + ("..." if len(prompt) > 40 else ""),
                 "messageSeqs": [seq - 1], "source": {"kind": "fallback"}},
    })
    yield emit({
        "type": "step/start",
        "data": {"turn": 1, "step": 1},
    })

    # Simulate a few tool calls (pwsh, fs-write, etc.)
    tool_calls = [
        ("pwsh", {"script": "Get-ChildItem -Recurse | Select-Object -First 10"}),
        ("fs-write", {"path": "output.txt", "content": "# Result\nDone."}),
    ]

    for tool_name, args in tool_calls:
        call_id = f"call_{tool_name}_{uuid.uuid4().hex[:8]}"
        # block-start
        yield emit({
            "type": "assistant/chunk",
            "data": {"turn": 1, "step": 1,
                     "chunk": {"type": "block-start", "index": 0, "blockType": "tool-call"}},
        })
        # tool-call-delta
        yield emit({
            "type": "assistant/chunk",
            "data": {"turn": 1, "step": 1,
                     "chunk": {"type": "tool-call-delta", "index": 0,
                               "id": call_id, "name": tool_name,
                               "argumentsDelta": json.dumps(args)}},
        })
        # block-end
        yield emit({
            "type": "assistant/chunk",
            "data": {"turn": 1, "step": 1,
                     "chunk": {"type": "block-end", "index": 0,
                               "block": {"type": "tool-call", "id": call_id,
                                         "name": tool_name, "arguments": json.dumps(args)}}},
        })
        # tool/result
        yield emit({
            "type": "tool/result",
            "data": {"toolCallId": call_id, "name": tool_name,
                     "result": f"Tool '{tool_name}' executed successfully",
                     "isError": False},
        })

    # Reasoning
    yield emit({
        "type": "assistant/chunk",
        "data": {"turn": 1, "step": 1,
                 "chunk": {"type": "block-start", "index": 1, "blockType": "reasoning"}},
    })
    reasoning_text = "Analyzing the task, planning the implementation steps..."
    for i in range(0, len(reasoning_text), 3):
        yield emit({
            "type": "assistant/chunk",
            "data": {"turn": 1, "step": 1,
                     "chunk": {"type": "reasoning-delta", "index": 1,
                               "text": reasoning_text[i:i+3]}},
        })
    yield emit({
        "type": "assistant/chunk",
        "data": {"turn": 1, "step": 1,
                 "chunk": {"type": "block-end", "index": 1,
                           "block": {"type": "reasoning",
                                     "text": reasoning_text}}},
        })

    # Text response
    yield emit({
        "type": "assistant/chunk",
        "data": {"turn": 1, "step": 1,
                 "chunk": {"type": "block-start", "index": 2, "blockType": "text"}},
    })
    response = f"已收到任务：{prompt}\n\n这是 Bamboo bridge 的标准模式输出。\n\n"
    if os.environ.get("BAMBOO_PRESET") == "code":
        response += "Code Mode: 使用 TypeScript SDK 组合操作。\n"
    elif os.environ.get("BAMBOO_PRESET") == "plan":
        response += "Plan Mode: 已生成计划，等待审批。\n"
    for ch in response:
        yield emit({
            "type": "assistant/chunk",
            "data": {"turn": 1, "step": 1,
                     "chunk": {"type": "text-delta", "index": 2, "text": ch}},
        })
    yield emit({
        "type": "assistant/chunk",
        "data": {"turn": 1, "step": 1,
                 "chunk": {"type": "block-end", "index": 2,
                           "block": {"type": "text", "text": response}}},
    })

    # Terminal output
    yield emit({
        "type": "assistant/chunk",
        "data": {"turn": 1, "step": 1,
                 "chunk": {"type": "block-start", "index": 3, "blockType": "terminal"}},
    })
    terminal_text = "$ pwsh -Command Get-ChildItem\n  output.txt\n  README.md\n"
    for ch in terminal_text:
        yield emit({
            "type": "assistant/chunk",
            "data": {"turn": 1, "step": 1,
                     "chunk": {"type": "terminal-delta", "index": 3, "text": ch}},
        })
    yield emit({
        "type": "assistant/chunk",
        "data": {"turn": 1, "step": 1,
                 "chunk": {"type": "block-end", "index": 3,
                           "block": {"type": "terminal", "text": terminal_text}}},
    })

    # Finish
    yield emit({
        "type": "assistant/message",
        "data": {
            "turn": 1, "step": 1,
            "message": {"role": "assistant",
                        "content": [{"type": "text", "text": response.strip()}],
                        "source": {"kind": "model", "provider": "bamboo-failover",
                                   "model": "deepseek-v4-flash"}},
            "usage": {"inputTokens": 120, "outputTokens": 45},
        },
    })
    yield emit({
        "type": "run/finished",
        "data": {"finishReason": "completed"},
    })


# --------------------------------------------------------------------------- #
# Real dsh agent session
# --------------------------------------------------------------------------- #
class Bridge:
    def __init__(self, argv: list[str], config_path: Optional[Path], env: dict[str, str]):
        self.argv = argv
        self.config_path = config_path
        self.env = env
        self.mode = "real" if argv else "mock"
        self.agent: Optional[DshAgentProcess] = None
        self.initialized = False

    async def ensure_agent(self) -> None:
        if self.agent is not None:
            return
        if self.mode == "mock":
            self.initialized = True
            return
        self.agent = DshAgentProcess(self.argv, self.config_path, self.env)
        await self.agent.start()
        await self.agent.request("initialize", {"client": "bamboo"})
        self.initialized = True

    async def run_session(self, prompt: str, preset: str = "standard") -> AsyncIterator[str]:
        await self.ensure_agent()
        session_id = f"s-{uuid.uuid4().hex[:12]}"
        if self.mode == "mock":
            async for line in dsh_mock_stream(session_id, prompt):
                yield line
            return
        assert self.agent is not None
        await self.agent.request("session/create", {"sessionId": session_id, "preset": preset})
        try:
            result = await self.agent.request("session/run", {
                "sessionId": session_id,
                "prompt": prompt,
                "preset": preset,
            })
            # Convert dsh response to JSONL stream
            yield json.dumps({"type": "session", "version": 0, "id": session_id,
                              "createdAt": int(time.time() * 1000), "cwd": str(ROOT)}) + "\n"
            yield json.dumps(result) + "\n"
        finally:
            yield json.dumps({"type": "run/finished", "data": {"finishReason": "completed"}}) + "\n"

    async def shutdown(self) -> None:
        if self.agent is not None:
            await self.agent.stop()
            self.agent = None


# --------------------------------------------------------------------------- #
# HTTP server
# --------------------------------------------------------------------------- #
def build_app() -> Any:
    argv, config_path = resolve_runtime()
    env = {
        "DEEPSEEK_API_KEY": os.environ.get("DEEPSEEK_API_KEY", ""),
        "DEEPSEEK_BASE_URL": os.environ.get("DEEPSEEK_BASE_URL", ""),
    }
    bridge = Bridge(argv, config_path, env)

    if not _HAVE_FASTAPI:
        return _build_stdlib_app(bridge)

    app = FastAPI(title="Bamboo Bridge", version="0.2.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health():
        return {
            "status": "ok",
            "mode": bridge.mode,
            "version": "0.2.0",
            "dsh_version": "vendor",
        }

    @app.get("/api/update/check")
    async def check_update():
        import subprocess
        vendor_dir = ROOT / "vendor" / "deepseek-harness"
        latest_tag = "unknown"
        try:
            r = subprocess.run(
                ["git", "describe", "--tags", "--abbrev=0"],
                cwd=str(vendor_dir),
                capture_output=True, text=True, timeout=5
            )
            if r.returncode == 0:
                latest_tag = r.stdout.strip()
        except Exception:
            pass
        return {"current": "0.2.0", "dshLatestTag": latest_tag, "hasUpdate": latest_tag != "unknown"}

    @app.post("/api/update/apply")
    async def apply_update():
        import subprocess
        vendor_dir = str(ROOT / "vendor" / "deepseek-harness")
        try:
            r = subprocess.run(
                ["git", "pull", "--ff-only"],
                cwd=vendor_dir,
                capture_output=True, text=True, timeout=30
            )
            if r.returncode != 0:
                return JSONResponse({"error": r.stderr}, status_code=500)
            return {"status": "updated", "message": r.stdout.strip()}
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)

    @app.post("/api/run")
    async def run(request: Request):
        try:
            raw = await request.body()
            body = json.loads(raw) if raw else {}
        except Exception:
            body = {}
        prompt = body.get("prompt", "")
        preset = body.get("preset", os.environ.get("BAMBOO_PRESET", "standard"))

        async def event_gen():
            async for line in bridge.run_session(prompt, preset):
                yield f"data: {line}\n\n"

        return StreamingResponse(event_gen(), media_type="text/event-stream; charset=utf-8")

    @app.post("/api/command")
    async def send_command(request: Request):
        """Send a slash command: /plan, /goal, /permission, etc."""
        try:
            raw = await request.body()
            body = json.loads(raw) if raw else {}
        except Exception:
            body = {}
        name = body.get("name", "")
        args = body.get("args", "")
        return {"status": "ok", "command": name, "args": args}

    @app.on_event("shutdown")
    async def _shutdown():
        await bridge.shutdown()

    return app


# --- stdlib fallback (no FastAPI) ---------------------------------------- #
def _build_stdlib_app(bridge: Bridge) -> Any:
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    import threading

    class Handler(BaseHTTPRequestHandler):
        def _send(self, code: int, obj: Any):
            data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/api/health":
                self._send(200, {"status": "ok", "mode": bridge.mode,
                                  "version": "0.2.0", "dsh_version": "vendor"})
            elif self.path == "/api/update/check":
                self._send(200, {"current": "0.2.0", "dshLatestTag": "unknown",
                                  "hasUpdate": False})
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path == "/api/run":
                length = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(length) if length > 0 else b""
                try:
                    body = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    body = {}
                prompt = body.get("prompt", "")
                preset = body.get("preset", "standard")

                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()

                async def pump():
                    async for line in bridge.run_session(prompt, preset):
                        self.wfile.write(f"data: {line}\n\n".encode("utf-8"))
                        self.wfile.flush()

                asyncio.run(pump())
            elif self.path == "/api/command":
                length = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(length) if length > 0 else b""
                try:
                    body = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    body = {}
                self._send(200, {"status": "ok", "command": body.get("name", ""),
                                  "args": body.get("args", "")})
            else:
                self._send(404, {"error": "not found"})

        def log_message(self, *args):
            pass

    return ThreadingHTTPServer(("127.0.0.1", 18720), Handler)


def main() -> None:
    parser = argparse.ArgumentParser(description="Bamboo Python Bridge")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18720)
    parser.add_argument("--config", default=None, help="Cordis config for dsh")
    args = parser.parse_args()

    if args.config:
        os.environ["DSH_CORDIS_CONFIG"] = str(Path(args.config).resolve())

    print(f"[bamboo-bridge] starting in {runtime_mode()} mode on "
          f"http://{args.host}:{args.port}", file=sys.stderr)
    app = build_app()

    if _HAVE_FASTAPI:
        import uvicorn
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    else:
        server: ThreadingHTTPServer = app  # type: ignore
        server.serve_forever()


if __name__ == "__main__":
    main()
