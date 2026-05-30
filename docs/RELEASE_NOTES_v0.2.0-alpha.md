## LuminaDev v0.2.0-alpha (Draft)

> **Historical note (2026-05-30):** This draft reflects the alpha tag era. Flatpak was the primary distribution path at tag time; **Flatpak is now abandoned**. Current target is **GitHub Releases / AppImage**. Extension tab and dashboard widgets are **removed from scope**. See [`STATUS.md`](./STATUS.md) and [`MASTER_PLAN.md`](./MASTER_PLAN.md).

Alpha release focused on Tauri migration, Docker/runtime reliability, and CI hardening.

### Install Instructions (historical)

- **From source (current recommended path)**
  - Requirements: Node.js 20+, pnpm, Rust toolchain, Tauri Linux deps ([prerequisites](https://v2.tauri.app/start/prerequisites/)).
  - `pnpm install && pnpm dev`

- **Flatpak** — abandoned; manifest removed from repo. Do not use for new installs.

### What Was Included at Alpha Tag

- Full Tauri backend port (Electron removed).
- Rust Docker smoke tests and Job Runner integration tests.
- CI: native Linux build, workspace smoke (`pnpm smoke`).
- Runtime install reliability (including Fedora Java package mapping).
- Backend modularization into focused Rust domain modules.

### Known Issues at Alpha Tag (many since fixed)

- Several routes partial (Settings hosts editing, runtime matrix hardening).
- Dashboard/profile store split sources of truth (evolving).
- AppImage CI artifact upload not verified end-to-end.

### Verification Snapshot

```bash
pnpm smoke
cd apps/desktop/src-tauri && cargo test --lib -- --nocapture
cd apps/desktop/src-tauri && cargo test --test docker_smoke -- --nocapture
```

### Current release blockers

See [`MASTER_PLAN.md`](./MASTER_PLAN.md) §4 P5 — AppImage E2E on clean VM.
