# Spec: Dashboard-Kernels — Config Grid with Controls

**Date:** 2026-05-28
**Status:** Approved

---

## Problem

`DashboardKernelsPage` monitors `['docker', 'ssh', 'nginx']` systemctl units with status indicators but no control buttons. The phasesPlan requires a configuration grid that lets users start, stop, and link local development kernels (Jupyter, PHP-FPM, plus existing units).

---

## Design

### Unit Definitions

Extend the monitored units from a const array to a typed config structure:

```ts
type KernelDef = {
  id: string
  label: string
  icon: string
  systemdUnit: string        // tried first
  altUnits?: string[]        // fallback unit names (distro variants)
  httpPort?: number          // if set, show "Open in Browser" button when active
  category: 'system' | 'dev'
}

const KERNEL_DEFS: KernelDef[] = [
  { id: 'docker',   label: 'Docker',    icon: 'package',    systemdUnit: 'docker',       category: 'system' },
  { id: 'ssh',      label: 'SSH',       icon: 'key',        systemdUnit: 'sshd',         altUnits: ['ssh'], category: 'system' },
  { id: 'nginx',    label: 'Nginx',     icon: 'server',     systemdUnit: 'nginx',        category: 'system' },
  { id: 'jupyter',  label: 'Jupyter',   icon: 'notebook',   systemdUnit: 'jupyter',      altUnits: ['jupyter-notebook', 'jupyter-lab'], httpPort: 8888, category: 'dev' },
  { id: 'phpfpm',   label: 'PHP-FPM',   icon: 'globe',      systemdUnit: 'php-fpm',      altUnits: ['php8.3-fpm', 'php8.2-fpm', 'php8.1-fpm', 'php-fpm8'], category: 'dev' },
]
```

### Status Detection

Current: `systemctl_is_active` for each unit. Keep, but try `altUnits` if primary fails.

New Rust `host_exec` command: `systemctl_is_active_fallback` — tries a list of unit names, returns the first active one's status + actual unit name found.

Add `systemctl_is_active_fallback` to the `host_exec` allowlist in `lib.rs`.

### UI — Kernel Cards

Grid of cards (2-column on wide, 1-column on narrow). Two sections: "System Services" and "Development Kernels".

Each card:
```
[icon] Label         [status badge: ACTIVE / INACTIVE / FAILED]
systemd: unit-name                        [Start] [Stop]  [Open↗]?
                                          [Link Project]?
```

- **Start button**: calls `dh:host:exec { command: 'systemctl_start', unit: '...' }` → re-poll status.
- **Stop button**: calls `dh:host:exec { command: 'systemctl_stop', unit: '...' }` → re-poll status. Disabled when inactive.
- **Open in Browser** (only for units with `httpPort` when status === 'active'): calls `window.dh.openExternal('http://localhost:PORT')`.
- **Link Project**: opens a folder picker (`dh:dialog:select-folder`). Saves `{ kernelId, projectPath }` to store key `kernel_links`. Shows linked path as truncated badge on card.

### Link Project Store Schema

```ts
// store key: 'kernel_links'
type KernelLinks = Record<string, string>  // kernelId → absolute path
```

### Systemctl Commands in `system_info.rs`

The host exec dispatcher lives in `system_info.rs` (pattern: `host_exec_<command>` functions dispatched from `"dh:host:exec"` match arm). Add `systemctl_start`, `systemctl_stop`, and `systemctl_is_active_fallback` as new `host_exec_*` functions there.

`systemctl_start` / `systemctl_stop`: run `pkexec systemctl start/stop <unit>` for `system` category units; `systemctl --user start/stop <unit>` for `dev` category units (no polkit needed for user-level systemd).

Actually: for start/stop of dev services (Jupyter, PHP-FPM), user-level systemd is preferred. Use `systemctl --user start/stop` for `dev` category units, `pkexec systemctl` for `system` category.

### Refresh

On card Start/Stop action: immediately re-poll that single unit's status. Keep the 30s auto-refresh for all units.

---

## Data Flow

```
Mount → poll all units (parallel) → render cards

Start/Stop click
  └─ dh:host:exec { systemctl_start/stop, unit } → re-poll unit → update card status

Open in Browser
  └─ dh:openExternal('http://localhost:PORT')

Link Project
  └─ dh:dialog:select-folder → storeSet kernel_links[kernelId] = path → badge appears
```

---

## Error Handling

- Start/Stop failure: show error toast on card with raw error. Don't crash page.
- Unit not found (all altUnits missing): show "Not installed" badge. Start/Stop buttons hidden.
- Polkit denial: surface as user-readable error toast.

---

## Files Changed

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/pages/DashboardKernelsPage.tsx` | Extend UNITS → KERNEL_DEFS; add Start/Stop/Open/Link controls |
| `apps/desktop/src/renderer/src/pages/DashboardKernelsPage.css` | Add button + link badge styles |
| `apps/desktop/src-tauri/src/host_exec.rs` | Add `systemctl_start`, `systemctl_stop`, `systemctl_is_active_fallback` commands |
| `apps/desktop/src-tauri/src/lib.rs` | Add new host_exec commands to allowlist |
| `packages/shared/src/ipc.ts` | Add `KernelLinks` type |
