[CmdletBinding()]
param(
  [ValidateSet('stdio', 'http')]
  [string]$Transport = 'stdio',
  [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath 'graphify-out/graph.json')) {
  throw 'graphify-out/graph.json is missing. Run scripts/graphify-build.ps1 first.'
}

if ($Transport -eq 'http') {
  & uv tool run --from 'graphifyy[mcp]' python -m graphify.serve graphify-out/graph.json --transport http --host 127.0.0.1 --port $Port
} else {
  & uv tool run --from 'graphifyy[mcp]' python -m graphify.serve graphify-out/graph.json
}
