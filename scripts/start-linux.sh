#!/bin/sh
set -eu

# Shared network so this app can reach the homelab-db MariaDB container by name.
docker network create homelab-net 2>/dev/null || true
docker network connect homelab-net homelab-db 2>/dev/null || true

docker build -t project-management-mvp .
docker rm -f project-management-mvp 2>/dev/null || true
docker run -d --name project-management-mvp \
  --network homelab-net \
  --env-file .env \
  -p 8000:8000 \
  project-management-mvp
printf 'Project Management MVP is running at http://127.0.0.1:8000/\n'
