# Reset the installed iCafe Management System operational database.
# Run PowerShell as the Windows user that administers the station/server.
# Close Admin/Electron and stop the bundled backend before running this.

$ErrorActionPreference = "Stop"
$dbDir = Join-Path $env:ProgramData "iCafe Management System\data"
$db = Join-Path $dbDir "aezakmi.sqlite"

Write-Host "Database directory: $dbDir"
Write-Host "Database: $db"

$targets = @($db, "$db-wal", "$db-shm")
foreach ($target in $targets) {
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Force
    Write-Host "Removed: $target"
  }
}

Write-Host "Database reset complete. Start iCafe Management System to create a fresh database."
