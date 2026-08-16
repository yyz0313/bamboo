# Test Bamboo bridge endpoints
$bridge = 'http://127.0.0.1:18720'

Write-Host "=== Health ==="
$health = Invoke-RestMethod "$bridge/api/health" -UseBasicParsing
$health | ConvertTo-Json -Compress

Write-Host "`n=== Update Check ==="
$update = Invoke-RestMethod "$bridge/api/update/check" -UseBasicParsing
$update | ConvertTo-Json -Compress

Write-Host "`n=== Update Apply (dry run) ==="
try {
    $apply = Invoke-RestMethod "$bridge/api/update/apply" -Method POST -UseBasicParsing -TimeoutSec 10
    $apply | ConvertTo-Json -Compress
} catch {
    Write-Host "Apply failed (expected in mock): $($_.Exception.Message)"
}
