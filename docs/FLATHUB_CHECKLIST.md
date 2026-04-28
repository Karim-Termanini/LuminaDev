# Flathub submission checklist

- [ ] Choose a unique **application id** (for example `io.github.<user>.LinuxDevHome`).
- [ ] AppStream metadata (`metainfo.xml`) with license, summary, screenshots.
- [ ] Desktop entry and **original** icon assets (no Microsoft or VS Code trademarks).
- [ ] Flatpak manifest builds reproducibly with `flatpak-builder`.
- [ ] Document all `finish-args`; justify broad permissions (Docker socket, host exec bridges).
- [ ] **Electron BaseApp** / Node SDK extension versions pinned.
- [ ] OARS / content rating block in AppStream.
- [ ] Verified URL or publisher trademark expectations handled per Flathub policy.
- [ ] Smoke-tested install on at least one **immutable** distro (e.g. Fedora Silverblue) and one traditional distro via Flatpak only.

This repository ships manifests under `flatpak/` including an **offline** variant backed by `flatpak/generated-sources.json` from [flatpak-node-generator](https://github.com/flatpak/flatpak-builder-tools/tree/master/node).

**After changing `pnpm-lock.yaml`**, regenerate Node sources before a Flathub PR:

```bash
./flatpak/generate-node-sources.sh
```

Then commit `flatpak/generated-sources.json` (or keep it only in the Flathub fork — your choice).

See [flatpak/README.md](../flatpak/README.md) for network vs offline builds.
