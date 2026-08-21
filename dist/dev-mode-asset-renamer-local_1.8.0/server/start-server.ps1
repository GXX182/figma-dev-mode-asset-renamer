$ErrorActionPreference = "Stop"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if (-not $nodePath) {
  $programFilesNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
  if (Test-Path -LiteralPath $programFilesNode) {
    $nodePath = $programFilesNode
  }
}
if (-not $nodePath) {
  Write-Error "Node.js 18 or newer was not found."
  exit 1
}

$startScript = Join-Path $PSScriptRoot "start-server.mjs"
& $nodePath $startScript
exit $LASTEXITCODE
