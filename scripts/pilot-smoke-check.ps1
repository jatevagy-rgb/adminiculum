param(
  [Parameter(Mandatory = $true)]
  [string]$BackendBaseUrl,
  [Parameter(Mandatory = $true)]
  [string]$FrontendBaseUrl
)

$ErrorActionPreference = 'Stop'

function Normalize-BaseUrl {
  param([string]$Value)
  return $Value.TrimEnd('/')
}

function Invoke-SmokeGet {
  param(
    [string]$Name,
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 20
    Write-Host "[PASS] $Name -> $($response.StatusCode) $Url"
    return $true
  } catch {
    $statusCode = $null
    try {
      $statusCode = $_.Exception.Response.StatusCode.value__
    } catch {
      $statusCode = 'N/A'
    }
    Write-Host "[FAIL] $Name -> $statusCode $Url"
    Write-Host "       $($_.Exception.Message)"
    return $false
  }
}

$backend = Normalize-BaseUrl $BackendBaseUrl
$frontend = Normalize-BaseUrl $FrontendBaseUrl

Write-Host "Pilot smoke check started"
Write-Host "Backend:  $backend"
Write-Host "Frontend: $frontend"

$checks = @(
  @{ Name = 'Backend health'; Url = "$backend/health" },
  @{ Name = 'Backend SharePoint diagnostics (auth expected)'; Url = "$backend/api/v1/sharepoint/diagnostics" },
  @{ Name = 'Frontend homepage'; Url = "$frontend/" }
)

$passed = 0
foreach ($check in $checks) {
  if (Invoke-SmokeGet -Name $check.Name -Url $check.Url) {
    $passed++
  }
}

Write-Host "Smoke summary: $passed / $($checks.Count) checks passed"

if ($passed -lt 2) {
  exit 1
}

exit 0
