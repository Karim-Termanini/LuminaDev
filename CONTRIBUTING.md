# Contributing to LuminaDev

Thanks for contributing.

## Development setup

1. Install dependencies:

```bash
pnpm install
```

### 🏗️ Architecture & Modularization Policy

- **No `lib.rs` Bloat:** As of v0.2.0-alpha, adding new logic or functions directly to `apps/desktop/src-tauri/src/lib.rs` is strictly prohibited.
- **New Modules First:** Every new feature or IPC handler group must be created in its own `.rs` file (e.g., `runtime_jobs.rs`).
- **Clean Interface:** `lib.rs` should only serve as the entry point and dispatcher, keeping its size manageable.

### 🚀 Push & Multi-Remote Policy

- **Bundle Your Pushes:** Do not push every micro-commit. Bundle your work into logical blocks (Vertical Slices) before pushing to save CI resources.
- **Sync Both Remotes:** When pushing new code, ensure it is pushed to both **GitLab** and **GitHub**.
- **Dual Review:** After pushing, you must create a **Merge Request (MR)** on GitLab and a **Pull Request (PR)** on GitHub to maintain synchronization and allow for multi-platform review.

### 🧪 Quality Gate Policy

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

- **Compose preset stacks:** `dh:compose:up` resolves `docker/compose/<profile>` from the repo checkout, `LUMINA_DEV_COMPOSE_ROOT` (parent of `<profile>` dirs), or bundled `resource_dir()/docker/compose` when packaged. Export this env in Flatpak if the app cwd is not inside the git tree.
- Flatpak sessions may require explicit overrides for Docker socket and SSH access.
- See:
  - `docs/DOCKER_FLATPAK.md`
  - `docs/PRIVILEGE_BOUNDARY_MATRIX.md`
  - `docs/FLATHUB_CHECKLIST.md`
