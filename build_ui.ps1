# Build Bamboo UI with Vite
$node = 'C:\Users\yyz20\.workbuddy\binaries\node\versions\22.22.2\node.exe'
$vite = 'C:\Users\yyz20\WorkBuddy\bamboo\src\node_modules\vite\bin\vite.js'
$dist = 'C:\Users\yyz20\WorkBuddy\bamboo\src\dist'

Set-Location 'C:\Users\yyz20\WorkBuddy\bamboo\src'

Write-Host "Building Vite UI..."
& $node $vite build --logLevel=silent 2>&1 | ForEach-Object { Write-Host $_ }
$exitCode = $LASTEXITCODE
Write-Host "Exit code: $exitCode"

if (Test-Path $dist) {
    Write-Host "`nBuild successful!"
    Get-ChildItem $dist -Recurse | Select-Object Name, Length | Format-Table -AutoSize
} else {
    Write-Host "No dist found"
}
