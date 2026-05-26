# Flatpak

This directory contains the canonical Flatpak manifest for packaging and distributing **Linux Dev Home** (a Tauri application).

## Canonical Manifest

*   **[`io.github.karimodora.LinuxDevHome.yml`](io.github.karimodora.LinuxDevHome.yml)** — The authoritative manifest mapping to `org.gnome.Platform` branch `49` (which includes WebKitGTK and GTK runtimes required by Tauri). 

All legacy Electron manifests and pre-migration scripts have been removed to avoid confusion.

## Build and Install

To build the Flatpak locally using `flatpak-builder`, execute the following:

```bash
flatpak-builder --user --install --force-clean flatpak-build-tauri \
  flatpak/io.github.karimodora.LinuxDevHome.yml \
  --install-deps-from=flathub
```

Run the built application:

```bash
flatpak run io.github.karimodora.LinuxDevHome
```

For permissions and configuration troubleshooting, refer to [../docs/DOCKER_FLATPAK.md](../docs/DOCKER_FLATPAK.md) and [../docs/FLATHUB_CHECKLIST.md](../docs/FLATHUB_CHECKLIST.md).

## Troubleshooting

### `Error opening cache: opening repo`
If you encounter local database or cache issues, run:
```bash
flatpak repair --user
rm -rf ~/.cache/flatpak-builder
rm -rf flatpak-build-tauri .flatpak-builder
```
