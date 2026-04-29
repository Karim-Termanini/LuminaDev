# Flatpak

**Tauri (current app):** [`io.github.karimodora.LinuxDevHome.tauri.yml`](io.github.karimodora.LinuxDevHome.tauri.yml) — `org.gnome.Platform` **49** + `cargo build --release` for `lumina-dev`, installs as `linux-dev-home`. Build locally with `flatpak-builder` (not in GitHub Actions yet; add a workflow job later for CI smoke only).

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

## Troubleshooting

### `Error opening cache: opening repo: opendir(objects): No such file or directory`

Usually a **broken Flatpak user repo or builder cache**, or a **manifest/runtime mismatch** (e.g. EOL GNOME 46, or an SDK extension branch the runtime does not declare — do **not** add `//24.08` on extensions unless that branch is listed for your chosen `org.gnome.Sdk`).

Try in order:

```bash
flatpak repair --user
rm -rf ~/.cache/flatpak-builder
rm -rf flatpak-build-tauri .flatpak-builder
```

Then rebuild. If `FLATPAK_USER_DIR` is set to a custom path, ensure that directory exists and is writable, or unset it for the build.

### `Unknown extension 'org.freedesktop.Sdk.Extension.rust-stable//…' in runtime`

The **`//branch` on `sdk-extensions` must match extensions your `org.gnome.Sdk` actually exposes**. Wrong pins produce this error. The Tauri manifest uses **GNOME Platform 49** and **unpinned** `rust-stable` / `node20` so Flatpak resolves the correct pair.

### Old GNOME runtimes (46–48) end-of-life

Use a **currently supported** `org.gnome.Platform` branch (see Flathub / `flatpak remote-info`). This repo tracks that in [`io.github.karimodora.LinuxDevHome.tauri.yml`](io.github.karimodora.LinuxDevHome.tauri.yml).
