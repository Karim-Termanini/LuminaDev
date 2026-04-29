## Summary

Closes the Tauri migration and brings the app to release-ready state.

**This PR (feat/release-gate-docs-ci):**
- CI: removed `agent-*` trigger; added `feat/*`, `fix/*`, `chore/*` branches
- CI: trimmed `quality-gate` apt deps to only what smoke actually needs (`build-essential python3`)
- Renderer: confirmed clean — no bridge fallbacks, no Electron remnants, no unsafe casts
- Docs: STABILIZATION_CHECKLIST updated with Stage 2 evidence + Stage 4/5 status
- Docs: README migration notice updated to reflect completion

**Depends on (merge first):** `feat/tauri-stage2-port`
- Ports remaining 7 IPC channels to Rust native
- Removes `invoke_node_bridge()` and `tauri-ipc-bridge.mjs`
- Node.js no longer required at app runtime

## Migration completion summary

| Stage | Status |
|---|---|
| 0 — baseline + freeze | ✅ done |
| 1 — Tauri skeleton + bridge | ✅ done |
| 2 — Rust-native backend port | ✅ done (pending merge) |
| 3 — renderer parity + UX | ✅ done |
| 4 — CI + packaging | ✅ done |
| 5 — release gate | 🔜 final sanity after merge |

## Channels ported (Stage 2 — feat/tauri-stage2-port)

| Channel | Implementation |
|---|---|
| `dh:metrics` | `/proc/meminfo`, `/proc/loadavg`, `/proc/cpuinfo`, `df` |
| `dh:host:exec` | `systemctl is-active`, `nvidia-smi` |
| `dh:docker:create` | docker CLI with ports/env/volumes/autoStart |
| `dh:ssh:list:dir` | native `ssh ls` |
| `dh:ssh:setup:remote:key` | native `ssh` + `sshpass` |
| `dh:docker:remap-port` | explicit not-supported error |
| `dh:docker:install` | explicit not-supported error (deferred) |

## Test plan

- [ ] `feat/tauri-stage2-port` CI green (native-linux-build ✅)
- [ ] `feat/release-gate-docs-ci` CI green (quality-gate ✅)
- [ ] After merge to main: `pnpm smoke` final sanity
- [ ] `pnpm --filter desktop build:web` clean build
- [ ] Tauri app launches, wizard completes, Docker page loads containers

## Known limits (carry-forward)

- `dh:docker:install`: returns clear error — user directed to docs.docker.com
- `dh:docker:remap-port`: returns clear error — requires stop+rm+recreate via CLI
- Flatpak offline build CI job removed until Flathub submission (SDK download too slow for dev CI)
- Local `cargo check` requires WebKitGTK system packages; mitigated in CI
