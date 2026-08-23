$ErrorActionPreference = "Stop"

docker rm -f project-management-mvp 2>$null
if ($LASTEXITCODE -ne 0) { $LASTEXITCODE = 0 }
Write-Host "Project Management MVP stopped."
