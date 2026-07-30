[CmdletBinding()]
param(
  [switch]$Deep,
  [switch]$NoCluster
)

$ErrorActionPreference = 'Stop'

function Assert-RepoRoot {
  if (-not (Test-Path -LiteralPath 'Backend/src') -or -not (Test-Path -LiteralPath 'Frontend/src')) {
    throw 'Run this script from the Adminiculum repository root.'
  }
}

function Invoke-Graphify {
  param([string[]]$Arguments)
  & uv tool run --from graphifyy graphify @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "graphify failed: graphify $($Arguments -join ' ')"
  }
}

Assert-RepoRoot

$started = Get-Date
$head = (git rev-parse HEAD).Trim()
$version = (& uv tool run --from graphifyy graphify --version).Trim()

$extractArgs = @('extract', '.', '--force', '--code-only')
if ($Deep) { $extractArgs += @('--mode', 'deep') }
if ($NoCluster) { $extractArgs += '--no-cluster' }

Invoke-Graphify -Arguments $extractArgs
Invoke-Graphify -Arguments @('cluster-only', '.', '--no-label', '--no-viz')
Invoke-Graphify -Arguments @('export', 'callflow-html')
Invoke-Graphify -Arguments @('tree', '--root', '.', '--label', 'Adminiculum')

& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/graphify-verify.ps1
if ($LASTEXITCODE -ne 0) {
  throw 'Graph verification failed after build.'
}

$graphPath = Join-Path (Get-Location) 'graphify-out/graph.json'
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $graphPath).Hash
$graph = Get-Content -LiteralPath $graphPath -Raw | ConvertFrom-Json
$manifest = [ordered]@{
  repositoryHead = $head
  graphifyVersion = $version
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  durationSeconds = [int]((Get-Date) - $started).TotalSeconds
  indexedNodeCount = @($graph.nodes).Count
  indexedEdgeCount = $(if ($graph.edges) { @($graph.edges).Count } else { @($graph.links).Count })
  graphChecksumSha256 = $hash
  sourcePolicy = 'code-only source graph; generated artifacts and secrets excluded by .graphifyignore'
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'graphify-out/freshness.json' -Encoding UTF8

Write-Host "Graphify build complete for $head"
Write-Host "Graph checksum: $hash"
