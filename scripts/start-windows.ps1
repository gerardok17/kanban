$ErrorActionPreference = "Stop"

docker build -t project-management-mvp .
docker rm -f project-management-mvp 2>$null
if ($LASTEXITCODE -ne 0) { $LASTEXITCODE = 0 }
docker run -d --name project-management-mvp -p 8000:8000 project-management-mvp
Write-Host "Project Management MVP is running at http://127.0.0.1:8000/"
