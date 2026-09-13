param(
  [switch]$SkipInstall,
  [switch]$BuildInstallers
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n=== $Name ===" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

Write-Host "Aezakmi Cloud-Primary final release gate" -ForegroundColor Green
Write-Host "Repository: $root"

if (-not $SkipInstall) {
  Run-Step 'Install exact dependencies' { npm ci }
}

Run-Step 'Release readiness' { npm run check:release }
Run-Step 'Cloud regression suite' { npm run test:cloud }
Run-Step 'Full regression suite' { npm test }
Run-Step 'Build Cloud Admin' { npm run build:admin }
Run-Step 'Build Customer Station' { npm run build:customer }

if ($BuildInstallers) {
  Run-Step 'Build Admin / Cafe Edge Windows installer' { npm --workspace apps/admin run dist:win }
  Run-Step 'Build Customer Station Windows installer' { npm --workspace apps/customer run dist:win }
}

Write-Host "`nAll requested local release gates passed." -ForegroundColor Green
Write-Host "Next deployment commands:" -ForegroundColor Yellow
Write-Host "  npx supabase db push --dry-run"
Write-Host "  npx supabase db push"
Write-Host "  npx supabase functions deploy --use-api"
Write-Host "  npx supabase functions list"
Write-Host "  git add ."
Write-Host '  git commit -m "Add cloud-primary Customer Stations with Cafe Edge fallback"'
Write-Host "  git push"
