#!/usr/bin/env node
/**
 * Bamboo 生产构建脚本
 * 1. 构建 React 前端（Vite）
 * 2. 打包 Python bridge（使用 pyinstaller / pkg 可选）
 * 3. 输出 dist/
 */
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');

function run(cmd, cwd) {
    console.log(`$ ${cmd}`);
    execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

async function main() {
    mkdirSync(DIST, { recursive: true });

    // ── 1. Build React UI ───────────────────────────────────────────────────
    console.log('\n[1/3] Building React UI...');
    const uiDist = resolve(ROOT, 'src/dist');
    mkdirSync(uiDist, { recursive: true });
    run('npx vite build', resolve(ROOT, 'src'));

    // Copy dist to bamboo/dist/ui
    const targetDir = resolve(DIST, 'ui');
    mkdirSync(targetDir, { recursive: true });
    for (const f of ['index.html', 'assets']) {
        const src = resolve(uiDist, f);
        const dst = resolve(targetDir, f);
        if (existsSync(src)) {
            if (f === 'assets') {
                run(`xcopy /E /I "${src}" "${dst}"`, '.');
            } else {
                copyFileSync(src, dst);
            }
        }
    }
    console.log('  UI built → dist/ui/');

    // ── 2. Copy bridge source ───────────────────────────────────────────────
    console.log('\n[2/3] Copying bridge...');
    const bridgeDir = resolve(DIST, 'bridge');
    mkdirSync(bridgeDir, { recursive: true });
    run(`xcopy /E /I "${resolve(ROOT, 'bridge')}\\*" "${bridgeDir}\\*"`, '.');
    console.log('  bridge copied → dist/bridge/');

    // ── 3. Generate launcher scripts ────────────────────────────────────────
    console.log('\n[3/3] Generating launcher...');
    const launcher = resolve(DIST, 'bamboo.exe');
    // We'll create a batch launcher since we can't pack Python easily
    const bat = resolve(DIST, 'Bamboo.bat');
    const batContent = `@echo off
chcp 65001 >nul
echo  Bamboo Launcher
echo.
if not exist "%~dp0python" goto :no_python
"%~dp0python\\python.exe" "%~dp0bridge\\main.py" --port 18720
goto :eof
:no_python
echo ERROR: Python not found. Please install Python 3.10+ and add python to PATH.
pause
`;
    require('fs').writeFileSync(bat, batContent, 'utf-8');

    // Create start.html that opens the UI
    const startHtml = resolve(DIST, 'index.html');
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bamboo</title>
  <style>
    body { margin: 0; background: #0d1117; color: #e6edf3; font-family: system-ui; }
    .loader { display: flex; align-items: center; justify-content: center; height: 100vh; }
    .loader span { font-size: 1.2rem; opacity: 0.7; }
    iframe { display: none; }
  </style>
</head>
<body>
  <div class="loader"><span>启动 Bamboo...</span></div>
  <iframe id="ui" src="http://localhost:1420"></iframe>
  <script>
    const check = setInterval(async () => {
      try {
        await fetch('http://localhost:18720/api/health', { signal: AbortSignal.timeout(2000) });
        clearInterval(check);
        document.querySelector('.loader').style.display = 'none';
        document.getElementById('ui').style.display = 'block';
      } catch { await new Promise(r => setTimeout(r, 1000)); }
    }, 1000);
  </script>
</body>
</html>`;
    require('fs').writeFileSync(startHtml, htmlContent, 'utf-8');

    console.log('\n✅ Bamboo build complete!');
    console.log(`   Run: start dist\\Bamboo.bat`);
}

main().catch(console.error);
