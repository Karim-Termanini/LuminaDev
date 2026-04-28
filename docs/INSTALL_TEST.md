# Install test (Flatpak)

After building the Flatpak locally (network build; see `flatpak/README.md` for the offline manifest):

```bash
cd /path/to/startSH
flatpak-builder --user --install --force-clean flatpak-build-dir flatpak/io.github.karimodora.LinuxDevHome.yml
```

Offline / Flathub-style (uses `flatpak/generated-sources.json`; regenerate after lockfile changes):

```bash
flatpak-builder --user --install --force-clean flatpak-build-dir flatpak/io.github.karimodora.LinuxDevHome.offline.yml
```

Smoke checklist:

1. App launches under Wayland or X11 fallback.
2. Dashboard renders and host metrics update without crashing when `/proc` is restricted.
3. Docker panel surfaces a clear error when the socket is missing (expected in a strict sandbox until overrides are applied).
4. Embedded terminal falls back to “Open external terminal” when `node-pty` cannot start.
5. Git clone refuses paths outside the user home / temp allowlist.

Record failures against `docs/DOCKER_FLATPAK.md` permission guidance.
