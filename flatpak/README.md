# Flatpak

Two manifests (run from **repository root** `startSH/`):

| Manifest | Use |
|----------|-----|
| [`io.github.karimodora.LinuxDevHome.yml`](io.github.karimodora.LinuxDevHome.yml) | **Network build** (CI or quick local); `flatpak-builder` passes `--share=network`. |
| [`io.github.karimodora.LinuxDevHome.offline.yml`](io.github.karimodora.LinuxDevHome.offline.yml) | **Offline build** for Flathub-style reproducibility; requires [`generated-sources.json`](generated-sources.json). |

## Regenerate Node sources (offline manifest)

After changing **pnpm** dependencies or `pnpm-lock.yaml`:

```bash
chmod +x flatpak/generate-node-sources.sh
./flatpak/generate-node-sources.sh
```

Commit the updated `flatpak/generated-sources.json` (or vendor it only in your Flathub submission repo).

## Build and install

```bash
# Network (simpler)
flatpak-builder --user --install --force-clean flatpak-build-dir \
  flatpak/io.github.karimodora.LinuxDevHome.yml \
  --install-deps-from=flathub

# Offline (no build network; install Flathub runtimes first)
flatpak-builder --user --install --force-clean flatpak-build-dir-offline \
  flatpak/io.github.karimodora.LinuxDevHome.offline.yml \
  --install-deps-from=flathub
```

Run: `flatpak run io.github.karimodora.LinuxDevHome`

See [../docs/DOCKER_FLATPAK.md](../docs/DOCKER_FLATPAK.md), [../docs/INSTALL_TEST.md](../docs/INSTALL_TEST.md), [../docs/FLATHUB_CHECKLIST.md](../docs/FLATHUB_CHECKLIST.md).
