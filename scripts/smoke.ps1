param([Parameter(Mandatory=$true)][string]$BaseUrl)
$ErrorActionPreference = 'Stop'
$uri = [Uri]$BaseUrl
if ($uri.Scheme -ne 'https' -and $uri.Host -notin @('localhost','127.0.0.1')) { throw 'Use HTTPS for remote smoke checks.' }
foreach ($path in @('/api/health/live','/api/health/ready')) {
  $healthy = $false
  for ($attempt = 0; $attempt -lt 12; $attempt++) {
    try { $result = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + $path) -TimeoutSec 10; if ($result.status -eq 'healthy') { $healthy = $true; break } } catch { }
    Start-Sleep -Seconds 5
  }
  if (-not $healthy) { throw "Smoke check failed: $path" }
}
$protected = Invoke-WebRequest -Uri ($BaseUrl.TrimEnd('/') + '/api/applications') -SkipHttpErrorCheck -TimeoutSec 10
if ($protected.StatusCode -ne 401) { throw 'Anonymous CRUD access must return 401.' }
Write-Output 'Liveness, readiness and authorization smoke checks passed.'
