# Contributing to LuminaDev

Thanks for contributing.

## Development setup

1. Install dependencies:

```bash
pnpm install
```

### 🏗️ Rust backend modularization (Tauri)

- **Prefer new modules over growing `lib.rs`:** Put new behavior in focused files under `apps/desktop/src-tauri/src/` (for example `runtime_jobs.rs`, `runtime_verify.rs`) and keep `lib.rs` mostly wiring (`mod …`, `use …`, dispatch).
- **Small glue in `lib.rs` is OK:** Tiny helpers that only exist to connect IPC to modules are fine; avoid pasting large feature bodies into `lib.rs`.
- **Goal:** keep `lib.rs` readable as an entry point, not as an everything-file.

2. Run local quality gates before opening a PR:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

3. For Rust backend checks:

```bash
cd apps/desktop/src-tauri
cargo test -- --nocapture
```

## Branch and commit rules

- Do not commit directly to `main`; use a feature/fix branch and PR.
- Follow Conventional Commits:
  - `feat: ...`
  - `fix: ...`
  - `docs: ...`
  - `test: ...`
  - `chore: ...`
- One commit should represent one coherent intent.

## Pull request checklist

- Keep PRs focused and reviewable.
- Include tests in the same PR when behavior or contracts change.
- Update documentation when user-visible behavior changes.
- Ensure CI is green before merge.

## Flatpak and host boundary notes

- Flatpak sessions may require explicit overrides for Docker socket and SSH access.
- See:
  - `docs/DOCKER_FLATPAK.md`
  - `docs/PRIVILEGE_BOUNDARY_MATRIX.md`
  - `docs/FLATHUB_CHECKLIST.md`
