[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath 'Backend/src') -or -not (Test-Path -LiteralPath 'Frontend/src')) {
  throw 'Run this script from the Adminiculum repository root.'
}

& uv tool run --from graphifyy graphify extract . --force --code-only
if ($LASTEXITCODE -ne 0) {
  throw 'graphify code-only update failed.'
}

& uv tool run --from graphifyy graphify cluster-only . --no-label --no-viz
if ($LASTEXITCODE -ne 0) {
  throw 'graphify cluster-only failed.'
}

& uv tool run --from graphifyy graphify export callflow-html
if ($LASTEXITCODE -ne 0) {
  throw 'graphify callflow export failed.'
}

& uv tool run --from graphifyy graphify tree --root . --label Adminiculum
if ($LASTEXITCODE -ne 0) {
  throw 'graphify tree export failed.'
}

& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/graphify-verify.ps1
if ($LASTEXITCODE -ne 0) {
  throw 'Graph verification failed after update.'
}

$graphPath = Join-Path (Get-Location) 'graphify-out/graph.json'
$graph = Get-Content -LiteralPath $graphPath -Raw | ConvertFrom-Json
$manifest = [ordered]@{
  repositoryHead = (git rev-parse HEAD).Trim()
  graphifyVersion = (& uv tool run --from graphifyy graphify --version).Trim()
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  indexedNodeCount = @($graph.nodes).Count
  indexedEdgeCount = $(if ($graph.edges) { @($graph.edges).Count } else { @($graph.links).Count })
  graphChecksumSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $graphPath).Hash
  sourcePolicy = 'code-only source graph update; generated artifacts and secrets excluded by .graphifyignore'
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'graphify-out/freshness.json' -Encoding UTF8

Write-Host 'Graphify update complete.'
