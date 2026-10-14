param([string]$Container = 'jobtracker-local-postgres-1')
$ErrorActionPreference = 'Stop'
if ($Container -notmatch '^[a-zA-Z0-9_.-]+$') { throw 'Invalid local container name.' }
function Invoke-Docker([string[]]$Arguments) { & docker @Arguments; if ($LASTEXITCODE -ne 0) { throw "Docker operation failed" } }
$taskRestoreDatabase = 'jobtracker_restore_' + [Guid]::NewGuid().ToString('N')
$taskOutput = Join-Path (Split-Path $PSScriptRoot -Parent) 'artifacts/backups'
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskBackupFile = Join-Path $taskOutput ((Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
Invoke-Docker -Arguments @('exec', $Container, 'pg_dump', '-U', 'jobtracker', '-d', 'jobtracker_test', '-Fc', '-f', '/tmp/jobtracker-verify.dump')
Invoke-Docker -Arguments @('cp', ($Container + ':/tmp/jobtracker-verify.dump'), $taskBackupFile)
Invoke-Docker -Arguments @('exec', $Container, 'createdb', '-U', 'jobtracker', $taskRestoreDatabase)
try {
  Invoke-Docker -Arguments @('exec', $Container, 'pg_restore', '-U', 'jobtracker', '-d', $taskRestoreDatabase, '--no-owner', '--exit-on-error', '/tmp/jobtracker-verify.dump')
  $taskOriginal = & docker exec $Container psql -U jobtracker -d jobtracker_test -Atc 'SELECT count(*) FROM "Applications"'
  if ($LASTEXITCODE -ne 0) { throw 'Source validation failed' }
  $taskRestored = & docker exec $Container psql -U jobtracker -d $taskRestoreDatabase -Atc 'SELECT count(*) FROM "Applications"'
  if ($LASTEXITCODE -ne 0 -or $taskOriginal -ne $taskRestored) { throw 'Restored application count differs' }
  Write-Output 'Backup restored into a separate database; application counts match.'
}
finally {
  if ($taskRestoreDatabase -notmatch '^jobtracker_restore_[0-9a-f]{32}$') { throw 'Unsafe restore target' }
  Invoke-Docker -Arguments @('exec', $Container, 'dropdb', '-U', 'jobtracker', $taskRestoreDatabase)
}
