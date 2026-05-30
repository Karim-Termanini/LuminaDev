# Install test (native Tauri / AppImage)

Manual verification on a clean Linux VM before tagging a release. See also [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md) (B5) and [`AUDIT.md`](./AUDIT.md) Appendix B.

## Build from source

```bash
git clone https://github.com/Karim-Termanini/LuminaDev.git
cd LuminaDev
pnpm install
pnpm smoke
pnpm --filter desktop build:tauri
```

Artifact path depends on Tauri output (typically under `apps/desktop/src-tauri/target/release/bundle/`).

## AppImage smoke checklist

1. App launches without crash; readiness wizard completes on first run.
2. Dashboard renders; host metrics update when `/proc` is readable.
3. Docker panel lists containers or shows a clear error when the daemon/socket is unavailable.
4. `/git` hub loads Config, VCS, and Cloud tabs.
5. Settings hub opens all 14 tabs (no Extension tab).
6. Embedded terminal shows a shell prompt; input works (line-buffered — vim/htop may not work).
7. `pnpm smoke` equivalent passed on the build machine before packaging.

## Cross-distro spot checks

Test on at least one of each when feasible:

- **Ubuntu / Pop!_OS** — docker group, apt-based runtime installs
- **Fedora** — dnf Java package mapping, SELinux context
- **Arch** — pacman hooks, `/proc` reads

Record failures in the PR or against [`ROUTE_STATUS.md`](./ROUTE_STATUS.md) if route maturity changes.
