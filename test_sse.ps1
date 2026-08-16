# Test Bamboo Bridge SSE endpoint
$bridgeUrl = 'http://127.0.0.1:18720'
$body = @{prompt = 'hello world'} | ConvertTo-Json

Write-Host "Testing health..."
$health = Invoke-RestMethod "$bridgeUrl/api/health" -UseBasicParsing
Write-Host "Health: $($health.status) mode=$($health.mode)"

Write-Host "`nTesting SSE /api/run..."
try {
    $resp = Invoke-WebRequest -Uri "$bridgeUrl/api/run" -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 15
    Write-Host "Status: $($resp.StatusCode)"
    Write-Host "Content:"
    Write-Host $resp.Content
} catch {
    Write-Host "Error: $_"
}
