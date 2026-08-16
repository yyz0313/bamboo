# Start Bamboo Bridge
$python = 'C:\Users\yyz20\AppData\Local\Programs\Python\Python312\python.exe'
$bridge = 'C:\Users\yyz20\WorkBuddy\bamboo\bridge\main.py'
$logFile = 'C:\Users\yyz20\WorkBuddy\bamboo\bridge_test.log'

# Kill existing
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 2

# Start bridge
$proc = Start-Process $python -ArgumentList $bridge, '--port', '18720' -PassThru -WindowStyle Hidden
Start-Sleep 4

# Check
$running = Get-Process python -ErrorAction SilentlyContinue
Write-Host "Bridge PID: $($proc.Id), Running: $($running -ne $null)"

# Test health
try {
    $resp = Invoke-RestMethod 'http://127.0.0.1:18720/api/health' -UseBasicParsing -TimeoutSec 5
    Write-Host "Health: $($resp | ConvertTo-Json)"
} catch {
    Write-Host "Health check failed: $_"
}
