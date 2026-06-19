#!/usr/bin/env bash
# Domain integration smoke tests (apps/desktop/src-tauri/tests/*_smoke.rs).
# Cargo accepts one TESTNAME filter OR multiple --test targets — not several bare names.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/desktop/src-tauri"
exec cargo test \
  --test compose_smoke \
  --test git_vcs_smoke \
  --test monitor_smoke \
  --test ssh_smoke \
  --test terminal_pty_smoke \
  --test cloud_auth_smoke \
  -- --nocapture
