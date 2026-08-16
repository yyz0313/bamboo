# Bamboo Environment Check Script
$NODE = "C:/Users/yyz20/.workbuddy/binaries/node/versions/22.22.2/node.exe"
$NPM = "C:/Users/yyz20/.workbuddy/binaries/node/versions/22.22.2/node_modules/npm/bin/npm-cli.js"
$CODEx = "C:/Users/yyz20/.workbuddy/binaries/node/versions/22.22.2/node_modules/@openai/codex/bin/codex.js"

Write-Host "=== Node.js ==="
& $NODE --version

Write-Host ""
Write-Host "=== npm ==="
& $NODE $NPM --version

Write-Host ""
Write-Host "=== Codex CLI ==="
& $NODE $CODEx --version 2>&1

Write-Host ""
Write-Host "=== Available NPM packages ==="
& $NODE $NPM list -g --depth=0 2>&1 | Select-Object -First 20

Write-Host ""
Write-Host "=== Git ==="
try { git --version } catch { Write-Host "Git not found" }

Write-Host ""
Write-Host "=== Network test ==="
try {
    $r = Invoke-WebRequest -Uri "https://registry.npmjs.org" -Method Head -TimeoutSec 5 -UseBasicParsing
    Write-Host ("npm registry: " + $r.StatusCode)
} catch { Write-Host "npm registry unreachable: " + $_.Exception.Message }

try {
    $r2 = Invoke-WebRequest -Uri "https://github.com" -Method Head -TimeoutSec 5 -UseBasicParsing
    Write-Host ("GitHub: " + $r2.StatusCode)
} catch { Write-Host "GitHub unreachable: " + $_.Exception.Message }

Write-Host ""
Write-Host "=== Checking for existing Electron/PKGS ==="
if (Test-Path "C:/Users/yyz20/.workbuddy/binaries/node/versions/22.22.2/node_modules/electron") {
    Write-Host "Electron: installed"
} else {
    Write-Host "Electron: not installed"
}

if (Test-Path "C:/Users/yyz20/.workbuddy/binaries/node/versions/22.22.2/node_modules/pkg") {
    Write-Host "pkg: installed"
} else {
    Write-Host "pkg: not installed"
}
