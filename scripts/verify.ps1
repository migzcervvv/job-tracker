param([switch]$RequirePostgres)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Checked([scriptblock]$Command) { & $Command; if ($LASTEXITCODE -ne 0) { throw "Verification failed with exit code $LASTEXITCODE" } }
if ($RequirePostgres -and [string]::IsNullOrWhiteSpace($env:JOBTRACKER_TEST_DATABASE)) { throw 'JOBTRACKER_TEST_DATABASE is required for the PostgreSQL gate.' }
Invoke-Checked { dotnet restore JobTracker.Api.Tests/JobTracker.Api.Tests.csproj }
Invoke-Checked { dotnet test JobTracker.Api.Tests/JobTracker.Api.Tests.csproj -c Release --no-restore --logger trx --results-directory artifacts/tests }
Push-Location JobTracker.Api
try { Invoke-Checked { dotnet tool restore }; Invoke-Checked { dotnet ef migrations has-pending-model-changes --context AppDbContext }; Invoke-Checked { dotnet ef migrations script --idempotent --context AppDbContext --output ../artifacts/migrations.sql } }
finally { Pop-Location }
Push-Location client
try { Invoke-Checked { npm ci }; Invoke-Checked { npm run lint }; Invoke-Checked { npm run format:check }; Invoke-Checked { npm test }; Invoke-Checked { npm run build }; Invoke-Checked { npm audit --audit-level=high } }
finally { Pop-Location }
Invoke-Checked { node --test scripts/contracts.test.mjs }
