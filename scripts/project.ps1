param([ValidateSet('dev','build','start','test','typecheck','install','setup','db:migrate','db:generate')][string]$Task = 'dev')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$systemPnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if ($systemPnpm) {
    & $systemPnpm.Source $Task
} else {
    $runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node'
    $nodePath = Join-Path $runtimeRoot 'bin\node.exe'
    $pnpmPath = Join-Path $runtimeRoot 'node_modules\pnpm\bin\pnpm.cjs'
    if (!(Test-Path -LiteralPath $nodePath) -or !(Test-Path -LiteralPath $pnpmPath)) {
        throw 'Node.js 24와 pnpm을 설치한 뒤 다시 실행하세요.'
    }
    $env:PATH = (Join-Path $runtimeRoot 'bin') + ';' + $env:PATH
    if ($Task -eq 'install') { & $nodePath $pnpmPath install --store-dir .pnpm-store }
    else { & $nodePath $pnpmPath run $Task }
}
exit $LASTEXITCODE
