$ErrorActionPreference = 'Stop'

# Resolve project root as parent of /scripts when launched from the repository.
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$MigrationDir = Join-Path $ProjectRoot 'supabase\migrations'

if (-not (Test-Path $MigrationDir)) {
  throw "Supabase migration directory not found: $MigrationDir"
}

# These two files are obsolete names left behind by older merged builds.
# They collide with migrations that now own those version numbers.
$Obsolete = @(
  '20260914000017_platform_pricing_quotes_and_customer_updates.sql',
  '20260914000018_admin_managed_customer_updates.sql'
)

Write-Host "Cleaning obsolete colliding migrations..." -ForegroundColor Cyan
foreach ($Name in $Obsolete) {
  $Path = Join-Path $MigrationDir $Name
  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Force
    Write-Host "  Removed $Name" -ForegroundColor Yellow
  } else {
    Write-Host "  Already absent: $Name" -ForegroundColor DarkGray
  }
}

$Required = @(
  '20260914000017_close_session_pause_on_end.sql',
  '20260914000018_platform_pricing_quotes_and_customer_updates.sql',
  '20260914000019_admin_managed_customer_updates.sql'
)

foreach ($Name in $Required) {
  $Path = Join-Path $MigrationDir $Name
  if (-not (Test-Path $Path)) {
    throw "Required corrected migration is missing: $Name"
  }
}

# Supabase migration versions must be unique locally. Fail loudly if any collision remains.
$Files = Get-ChildItem -LiteralPath $MigrationDir -File -Filter '*.sql'
$VersionGroups = $Files | ForEach-Object {
  if ($_.Name -match '^(\d{14})_') {
    [pscustomobject]@{ Version = $Matches[1]; Name = $_.Name }
  }
} | Group-Object Version | Where-Object { $_.Count -gt 1 }

if ($VersionGroups) {
  Write-Host "" 
  Write-Host "Duplicate migration versions still exist:" -ForegroundColor Red
  foreach ($Group in $VersionGroups) {
    Write-Host "  Version $($Group.Name):" -ForegroundColor Red
    foreach ($Entry in $Group.Group) {
      Write-Host "    $($Entry.Name)" -ForegroundColor Red
    }
  }
  throw 'Migration version collisions remain. Resolve them before running supabase db push.'
}

Write-Host "" 
Write-Host "Migration cleanup complete. Correct final sequence:" -ForegroundColor Green
Get-ChildItem -LiteralPath $MigrationDir -File -Filter '202609140000*.sql' |
  Sort-Object Name |
  ForEach-Object { Write-Host "  $($_.Name)" }

Write-Host "" 
Write-Host 'Next commands:' -ForegroundColor Cyan
Write-Host '  npx supabase migration list'
Write-Host '  npx supabase db push'
