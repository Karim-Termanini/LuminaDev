#!/bin/sh
set -eu
# Regenerate flatpak/generated-sources.json for offline Flatpak builds.
# Requires: Python 3.11+, flatpak-node-generator (pipx recommended).
#
#   pipx install 'flatpak_node_generator @ git+https://github.com/flatpak/flatpak-builder-tools.git#subdirectory=node'
#
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if command -v flatpak-node-generator >/dev/null 2>&1; then
  GEN=flatpak-node-generator
else
  echo "flatpak-node-generator not found. Install with:" >&2
  echo "  pipx install 'flatpak_node_generator @ git+https://github.com/flatpak/flatpak-builder-tools.git#subdirectory=node'" >&2
  exit 1
fi
exec "$GEN" pnpm pnpm-lock.yaml \
  -o flatpak/generated-sources.json \
  --electron-node-headers \
  --node-sdk-extension org.freedesktop.Sdk.Extension.node20//24.08
