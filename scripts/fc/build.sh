#!/usr/bin/env bash
set -euo pipefail
# BuildKit exports ZIP files only. No registry login or push.
mkdir -p fc-packages
docker buildx build --platform linux/amd64 -f deploy/fc/Dockerfile.frontend-package \
  --build-arg PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://zlspace.ai}" \
  --build-arg CONTENT_ORIGIN="${CONTENT_ORIGIN:?Set independent HTTPS CONTENT_ORIGIN}" \
  --output type=local,dest=fc-packages .
