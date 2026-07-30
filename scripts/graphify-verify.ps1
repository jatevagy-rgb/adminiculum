[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath 'graphify-out/graph.json')) {
  throw 'Missing graphify-out/graph.json.'
}

$graph = Get-Content -LiteralPath 'graphify-out/graph.json' -Raw | ConvertFrom-Json
$nodes = @($graph.nodes)
$edges = if ($graph.edges) { @($graph.edges) } else { @($graph.links) }

if ($nodes.Count -le 0) { throw 'Graph contains zero nodes.' }
if ($edges.Count -le 0) { throw 'Graph contains zero edges.' }

$serialized = Get-Content -LiteralPath 'graphify-out/graph.json' -Raw
$forbiddenPatterns = @(
  '\.env',
  'DATABASE_URL=',
  'postgresql://',
  'AccountKey=',
  'BEGIN PRIVATE KEY',
  'refresh_token',
  'access_token',
  'password\s*='
)

$hits = @()
foreach ($pattern in $forbiddenPatterns) {
  if ($serialized -match $pattern) {
    $hits += $pattern
  }
}

if ($hits.Count -gt 0) {
  throw "Forbidden generated/secret patterns found in graph: $($hits -join ', ')"
}

$sourceFiles = @()
foreach ($node in $nodes) {
  if ($node.source_file) { $sourceFiles += [string]$node.source_file }
  if ($node.source_location) { $sourceFiles += [string]$node.source_location }
}

$badSource = $sourceFiles | Where-Object {
  $_ -match '\.artifacts[\\/]' -or
  $_ -match 'node_modules[\\/]' -or
  $_ -match '\.next[\\/]' -or
  $_ -match 'graphify-out[\\/]'
} | Select-Object -First 20

if ($badSource) {
  throw "Forbidden indexed source paths found: $($badSource -join '; ')"
}

Write-Host "Graph verification OK: $($nodes.Count) nodes, $($edges.Count) edges."
