Aezakmi Cloud-Primary Customer Stations Patch

Base: Business Lifecycle / mobile-responsive release.

Apply:
  powershell -ExecutionPolicy Bypass -File .\apply-cloud-primary.ps1 -ProjectRoot "D:\Projects\iCafe Cloud Management"

Final local gate:
  powershell -ExecutionPolicy Bypass -File .\tools\final-cloud-primary-release.ps1

Build installers too:
  powershell -ExecutionPolicy Bypass -File .\tools\final-cloud-primary-release.ps1 -BuildInstallers

After the local gate passes:
  npx supabase db push --dry-run
Expected new migration only: 20260913000006_cloud_primary_customer_stations.sql
