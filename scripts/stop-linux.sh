#!/bin/sh
set -eu

docker rm -f project-management-mvp 2>/dev/null || true
printf 'Project Management MVP stopped.\n'
