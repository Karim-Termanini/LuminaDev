# Docker access from Flatpak

Linux Dev Home talks to the Docker Engine over its HTTP API on a Unix socket (typically `/var/run/docker.sock` or `${XDG_RUNTIME_DIR}/docker.sock`).

Flatpak sandboxes filesystem access by default, so the socket is **not** visible unless you grant it explicitly.

## Development (host)

Running `pnpm dev` outside Flatpak can access Docker when your user is in the `docker` group and the socket path is standard.

## Flatpak overrides (examples)

After installing the Flatpak bundle, you can extend permissions (adjust app id to match the manifest):

```bash
flatpak override --user --filesystem=/var/run/docker.sock io.github.karimodora.LinuxDevHome
```

or, for rootless Docker:

```bash
flatpak override --user --filesystem=xdg-run/docker io.github.karimodora.LinuxDevHome
```

**Security note:** exposing the Docker socket grants the container/API caller significant host capabilities. Only use overrides you understand.

## Limitations in Flatpak

Certain features that require direct host package manager or Docker CLI access are restricted in the Flatpak sandbox:

- **Automated Install (`dh:docker:install`)**: Restricted because the sandbox cannot (and should not) run `sudo apt/dnf` on the host. Users must install Docker on the host manually.
- **Port Remapping (`dh:docker:remap-port`)**: Currently restricted as it relies on specific host CLI behaviors that are harder to bridge safely. Use a native install if this is a priority, or recreate containers with the desired mappings manually.

If you see an error like "Automated install is not available in this build", it confirms you are running the sandboxed version.

## Flathub review

If you publish on Flathub, be ready to document why broader filesystem/device permissions are required and offer safe defaults (read-only UI) where possible.

## Boundary verification reference

For cross-surface Flatpak/native expectations (Docker, SSH, PTY fallback) and reproducible verification steps, see `docs/PRIVILEGE_BOUNDARY_MATRIX.md`.
