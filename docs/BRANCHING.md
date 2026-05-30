# Branching and release process

Phases **0–17** are documented in [`phasesPlan.md`](../phasesPlan.md). Active backlog: [`MASTER_PLAN.md`](./MASTER_PLAN.md).

## Rules

- Follow [`COMMIT_QUALITY_RULES.md`](./COMMIT_QUALITY_RULES.md) for commit hygiene.
- **No direct commits to `main`**. All work lands via pull request.
- Merge to `main` only when CI is green and review is approved.
- Run `pnpm smoke` before opening a PR.

## Branch naming

Use descriptive feature/fix branches:

```bash
git checkout main
git pull origin main
git checkout -b feat/short-description
# or fix/, docs/, chore/
```

## Finishing work

```bash
git push -u origin HEAD
# Open PR → review → CI → merge to main
```

## Distribution policy

**Native Tauri builds only.** Distribution target is **GitHub Releases (AppImage)**.

- Flatpak / Flathub pathway was **abandoned** (2026-05-28). Do not add Flatpak-specific packaging without an explicit product decision.
- Contributor workflows may use **Docker** for reproducible CI tests; application code must not hard-depend on distro package names in runtime paths.
