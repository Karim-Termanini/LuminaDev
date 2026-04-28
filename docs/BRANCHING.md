# Branching and release process

This project is developed in **sequential phases** (0 → 11). Distribution targets **Flatpak** only; development and CI use **Docker** where practical.

## Rules

- Each **phase branch** is created from an up-to-date `main`, not from another phase branch.
- **No direct commits to `main`**. All work lands via pull request.
- Phase branches are **not rebased**. Integrate with `merge` or **squash merge** as your team prefers; history on the phase branch stays linear from `main`.
- Merge to `main` only when:
  - Phase deliverables and acceptance criteria are met
  - Code review is approved
  - **CI is green**
- Optional: for large phases, use `phase-N/feature-name` branches and merge into the phase branch via PR.

## Starting a phase

```bash
git checkout main
git pull origin main
git checkout -b phase-N-short-name
```

## Finishing a phase

```bash
git push origin phase-N-short-name
# Open PR → review → CI → merge to main
git checkout main
git pull origin main
git branch -d phase-N-short-name
```

## Cross-distribution policy

End-user installs are intended to be **Flatpak**-based so the app runs the same on all Linux distributions without relying on distro packages. Contributor workflows may use **Docker** for reproducible builds and tests; do not add hard dependencies on `.deb`, RPM, or distro-specific package names in application code paths.
