# Privilege Boundary Matrix (Flatpak vs Host)

This document defines expected behavior for critical operations across:
- **Native / host session**
- **Flatpak sandbox session**

Use this as the verification reference for permission-sensitive behavior.

---

## Operation 1: Docker Engine access (socket)

### Native / host
- Expected: Docker panel can list containers/images when daemon is running and user has access.
- Failure mode: daemon stopped or user lacks docker group permissions.

### Flatpak sandbox
- Expected (without override): Docker socket is not visible; operations fail safely.
- Required override examples:
  - `flatpak override --user --filesystem=/var/run/docker.sock io.github.karimodora.LinuxDevHome`
  - `flatpak override --user --filesystem=xdg-run/docker io.github.karimodora.LinuxDevHome`

### User-visible wording
- `Docker daemon/socket unavailable. ...`
- `Docker permission denied. ...`

---

## Operation 2: SSH key access (`~/.ssh`)

### Native / host
- Expected: SSH key generation/read/test flows can access user SSH directory directly.

### Flatpak sandbox
- Expected (without override): SSH directory may be inaccessible depending on portal/permissions.
- Required override example:
  - `flatpak override --user --filesystem=~/.ssh io.github.karimodora.LinuxDevHome`

### User-visible wording
- In SSH page help copy:
  - Flatpak note and explicit override guidance for `~/.ssh` access.

---

## Operation 3: Embedded terminal / PTY

### Native / host
- Expected: embedded terminal works via `node-pty`.

### Flatpak sandbox
- Expected: PTY may fail to initialize due to sandbox restrictions.
- Fallback behavior: user can open external terminal flow.

### User-visible wording
- Terminal page communicates that sandboxed Flatpak builds may block PTYs and suggests external terminal fallback.

---

## Verification Steps

Run each step once in native mode and once in Flatpak mode.

1. **Session confirmation**
   - Open app and confirm environment banner reports `Flatpak session` vs `Native / host session`.

2. **Docker boundary check**
   - In Flatpak without override, open Docker page and verify clear unavailable/permission error.
   - Apply one Docker socket override, restart app, verify container list can load.

3. **SSH boundary check**
   - In Flatpak without `~/.ssh` override, run SSH flow and observe bounded failure/help text.
   - Apply `~/.ssh` override and verify SSH public key flow works.

4. **PTY fallback check**
   - In Flatpak, open terminal page and verify fallback guidance exists when PTY fails.

5. **Record outcome**
   - Save result in `docs/STABILIZATION_CHECKLIST.md` evidence section when behavior matches expected matrix.

---

## Cross References

- `README.md` (Known Limits + Flatpak section)
- `docs/DOCKER_FLATPAK.md`
- `docs/INSTALL_TEST.md`
