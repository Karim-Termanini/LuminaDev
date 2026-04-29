# Flatpak

**Tauri (current app):** [`io.github.karimodora.LinuxDevHome.tauri.yml`](io.github.karimodora.LinuxDevHome.tauri.yml) — `org.gnome.Platform` + `cargo build --release` for `lumina-dev`, installs as `linux-dev-home`. Build locally with `flatpak-builder` (not in GitHub Actions yet; add a workflow job later for CI smoke only).

**Legacy Electron manifests** (historical; still usable if you maintain an Electron pack path):

| Manifest | Use |
|----------|-----|
| [`io.github.karimodora.LinuxDevHome.yml`](io.github.karimodora.LinuxDevHome.yml) | **Network build**; `flatpak-builder` passes `--share=network`. |
| [`io.github.karimodora.LinuxDevHome.offline.yml`](io.github.karimodora.LinuxDevHome.offline.yml) | **Offline build**; requires [`generated-sources.json`](generated-sources.json). |

## Regenerate Node sources (offline manifest)

After changing **pnpm** dependencies or `pnpm-lock.yaml`:

```bash
chmod +x flatpak/generate-node-sources.sh
./flatpak/generate-node-sources.sh
```

Commit the updated `flatpak/generated-sources.json` (or vendor it only in your Flathub submission repo).

## Build and install

```bash
# Tauri (recommended)
flatpak-builder --user --install --force-clean flatpak-build-tauri \
  flatpak/io.github.karimodora.LinuxDevHome.tauri.yml \
  --install-deps-from=flathub

# Electron legacy — network
flatpak-builder --user --install --force-clean flatpak-build-dir \
  flatpak/io.github.karimodora.LinuxDevHome.yml \
  --install-deps-from=flathub

# Electron legacy — offline (install Flathub runtimes first)
flatpak-builder --user --install --force-clean flatpak-build-dir-offline \
  flatpak/io.github.karimodora.LinuxDevHome.offline.yml \
  --install-deps-from=flathub
```

Run: `flatpak run io.github.karimodora.LinuxDevHome`

See [../docs/DOCKER_FLATPAK.md](../docs/DOCKER_FLATPAK.md), [../docs/INSTALL_TEST.md](../docs/INSTALL_TEST.md), [../docs/FLATHUB_CHECKLIST.md](../docs/FLATHUB_CHECKLIST.md).
