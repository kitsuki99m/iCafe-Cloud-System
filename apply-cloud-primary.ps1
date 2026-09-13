param(
  [Parameter(Mandatory=$false)]
  [string]$ProjectRoot = "D:\Projects\iCafe Cloud Management"
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$payload = Join-Path $here 'payload'
if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
  throw "package.json not found at $ProjectRoot"
}
Write-Host "Applying Cloud-Primary Customer Station patch to $ProjectRoot" -ForegroundColor Cyan
Copy-Item -Path (Join-Path $payload '*') -Destination $ProjectRoot -Recurse -Force
Set-Location $ProjectRoot
npm run check:release
if ($LASTEXITCODE -ne 0) { throw 'Release readiness failed after patch.' }
npm run test:cloud
if ($LASTEXITCODE -ne 0) { throw 'Cloud tests failed after patch.' }
Write-Host "Patch applied. Next run: powershell -ExecutionPolicy Bypass -File .\tools\final-cloud-primary-release.ps1" -ForegroundColor Green
