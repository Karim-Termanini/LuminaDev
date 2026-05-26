# Flatpak

**Canonical manifest:** [`io.github.karimodora.LinuxDevHome.yml`](io.github.karimodora.LinuxDevHome.yml) — `org.gnome.Platform` **49** + `cargo build --release` for `lumina-dev`, installs as `linux-dev-home`. This is the only manifest; use it for local builds and Flathub submission.

## Regenerate Node sources

After changing **pnpm** dependencies or `pnpm-lock.yaml`:

```bash
chmod +x flatpak/generate-node-sources.sh
./flatpak/generate-node-sources.sh
```

Commit the updated `flatpak/generated-sources.json` (or vendor it only in your Flathub submission repo).

## Build and install

```bash
flatpak-builder --user --install --force-clean flatpak-build-dir \
  flatpak/io.github.karimodora.LinuxDevHome.yml \
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

### `The state dir … is not on the same filesystem as the target dir`

`flatpak-builder` wants its **cache/state** (default: `.flatpak-builder` under the directory you run from) on the **same filesystem** as the **build directory** (e.g. `flatpak-build-tauri`). Fix by:

- building from the repo with **both** dirs on the same disk, or  
- passing `--state-dir` on the same filesystem as your `--repo` / build dir (see `flatpak-builder --help`).

### `Unknown extension 'org.freedesktop.Sdk.Extension.rust-stable//…' in runtime`

The **`//branch` on `sdk-extensions` must match extensions your `org.gnome.Sdk` actually exposes**. Wrong pins produce this error. The Tauri manifest uses **GNOME Platform 49** and **unpinned** `rust-stable` / `node20` so Flatpak resolves the correct pair.

### Old GNOME runtimes (46–48) end-of-life

Use a **currently supported** `org.gnome.Platform` branch (see Flathub / `flatpak remote-info`). The canonical manifest is [`io.github.karimodora.LinuxDevHome.yml`](io.github.karimodora.LinuxDevHome.yml) — bump `runtime-version` there.
