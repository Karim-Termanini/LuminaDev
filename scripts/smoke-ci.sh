#!/usr/bin/env bash
# CI-friendly gate: typecheck, unit tests, lint, desktop TS (no Electron launch).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '[smoke-ci %s] %s\n' "$(date -Iseconds)" "$*"; }

PNPM=(pnpm)
if ! command -v pnpm >/dev/null 2>&1; then
  PNPM=(npx --yes pnpm@9.14.2)
  log "pnpm not on PATH; using ${PNPM[*]}"
fi

log "root=$ROOT"
log "typecheck (workspace)"
"${PNPM[@]}" typecheck
log "test (workspace: shared + desktop)"
"${PNPM[@]}" test

log "test (rust backend)"
cd apps/desktop/src-tauri && cargo test -- --nocapture
cd "$ROOT"

log "lint"
"${PNPM[@]}" lint
log "done OK"
