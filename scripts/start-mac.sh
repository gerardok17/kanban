#!/bin/sh
set -eu

docker build -t project-management-mvp .
docker rm -f project-management-mvp 2>/dev/null || true
docker run -d --name project-management-mvp -p 8000:8000 project-management-mvp
printf 'Project Management MVP is running at http://127.0.0.1:8000/\n'
