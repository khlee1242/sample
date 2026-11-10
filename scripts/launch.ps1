$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try {
    if (!(Test-Path -LiteralPath 'node_modules')) {
        & "$PSScriptRoot\project.ps1" install
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    if (!(Test-Path -LiteralPath '.env.local')) {
        & "$PSScriptRoot\project.ps1" setup
        if ($LASTEXITCODE -ne 0) { throw 'Initial setup failed.' }
    }
    Write-Host ''
    Write-Host 'Open: http://127.0.0.1:3000'
    Write-Host 'Initial login: .data/initial-admin.txt'
    Write-Host 'Keep this window open. Press Ctrl+C to stop.'
    Write-Host ''
    & "$PSScriptRoot\project.ps1" dev
    if ($LASTEXITCODE -ne 0) { throw 'Server stopped with an error.' }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
