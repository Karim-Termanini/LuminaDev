## LuminaDev v0.2.0-alpha (Draft)

Alpha release focused on Flatpak stability, Docker/runtime reliability, and CI hardening.

### Install Instructions

- **Flatpak (recommended)**
  - Install runtime deps:
    - `flatpak install flathub org.gnome.Platform//49 org.gnome.Sdk//49`
  - Install app build/bundle artifact from release assets (when attached).
  - Run:
    - `flatpak run io.github.karimodora.LinuxDevHome`

- **From source (desktop app)**
  - Requirements: Node.js + pnpm, Rust toolchain, Tauri Linux deps.
  - Install dependencies:
    - `pnpm install`
  - Run app:
    - `pnpm dev`

### What Is Included

- Flatpak manifest/build flow stabilized, including cargo source generation support.
- Rust Docker smoke tests and Job Runner integration tests.
- GitHub/GitLab CI hardening for native build, smoke tests, and Flatpak build.
- Runtime install reliability improvements (including Fedora Java package mapping behavior).
- Flatpak-specific guidance improvements for Docker socket and terminal fallback UX.
- Initial backend modularization: `lib.rs` split into `host_exec`, `runtime_packages`, and `runtime_versioning`.

### Known Issues (Alpha)

- Some routes remain intentionally partial/post-alpha scope (`Settings`, `Extensions`, `Cloud Git`).
- Dashboard/Profile store still has split sources of truth for preset linkage.
- Runtime uninstall dependency graph remains best-effort (`removableDeps` limited).
- Ruby install flow can be slower/less predictable on some Fedora setups.
- Flatpak host integration still depends on user environment and override correctness (Docker socket access, host tools availability).

### Verification Snapshot

- Workspace smoke: `pnpm smoke`
- Rust library tests: `cd apps/desktop/src-tauri && cargo test --lib -- --nocapture`
- Docker smoke tests: `cd apps/desktop/src-tauri && cargo test --test docker_smoke -- --nocapture`

### Release Checklist (remaining manual steps)

- Create tag: `v0.2.0-alpha`
- Create GitHub Release draft and attach artifacts:
  - AppImage (if produced in CI)
  - Flatpak bundle (if produced in CI)
