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
cd apps/desktop/src-tauri
cargo test -- --nocapture

log "static analysis (rust clippy)"
# Use `cargo clippy` (rustup component); do not gate on a `cargo-clippy` shim — it may be absent even when Clippy works.
if cargo clippy --version >/dev/null 2>&1; then
  cargo clippy --all-targets -- -D warnings
else
  log "clippy not available (rustup component add clippy); skipping"
fi

log "security audit (rust audit)"
if command -v cargo-audit >/dev/null 2>&1; then
  cargo audit
else
  log "cargo-audit not on PATH (cargo install cargo-audit); skipping advisory scan"
fi

cd "$ROOT"

log "lint (frontend)"
"${PNPM[@]}" lint
log "done OK"
