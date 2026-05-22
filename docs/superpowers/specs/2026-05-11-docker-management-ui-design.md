# Docker Management UI Overhaul — Design Spec
Date: 2026-05-11

## Goal

Make the Docker section feel like Docker Desktop on Windows: no terminal, everything via clicks. Users can see all containers, inspect/configure them (ports, env, networks, restart policy), and add/remap port bindings even when a container has no existing `-p` mapping.

---

## Section 1 — Container Inspect Drawer

### Trigger
Click any row in the Containers tab → a right-side drawer (~480px wide) slides in. The container list remains visible and scrollable behind it.

### Drawer Tabs

| Tab | Content |
|-----|---------|
| **Info** | Name, image, status, short ID, restart policy (dropdown) |
| **Ports** | Table of current bindings (host:container/proto). Add binding button. Remove per row. Apply button. |
| **Networks** | Current networks listed. Disconnect button per network. Connect to other available networks. |
| **Env** | Key=value list with add/edit/remove rows. Apply button. |
| **Volumes** | Mounted volume list (read-only display). |
| **Logs** | Last 200 lines via existing `dh:docker:logs`. Refresh button. |

### Apply Behavior
Docker does not support mutating ports/env/network on a running container. "Apply" does:
1. `docker stop <id>`
2. `docker rm <id>`
3. `docker create --name <same-name> ...merged-args...`
4. `docker start <new-id>`

User sees a spinner during the operation. On success: drawer refreshes with new container state. On failure: error banner shown, original container untouched (stop/rm is only attempted if create succeeds first — actually: create first, then stop/rm old, then start new to minimize downtime).

---

## Section 2 — Ports Tab Fix + Remap Enhancement

### Bug Fix
`docker_remap_port_invoke` in `lib.rs` hard-fails when `PortBindings` is empty:
```
"[DOCKER_INVALID_REQUEST] no published host ports to remap."
```
This prevents adding a first binding to a container created without `-p`.

### New Behavior
When `old_hp == 0` (add-new-binding mode):
- Skip the `matched` check
- Inject the new port binding into the bindings map
- Proceed with the create/start/stop-old flow

### IPC Payload Change
`dh:docker:remap-port` extended payload:
```json
{
  "id": "container-id",
  "containerPort": 80,
  "newHostPort": 8080,
  "protocol": "tcp",
  "oldHostPort": 0,
  "networkMode": "bridge"
}
```
`oldHostPort: 0` signals "add fresh binding". `containerPort` is now required when `oldHostPort == 0`.

### UI Changes (Ports Tab)
- Section renamed from "Remap host port" to "Port bindings"
- All containers shown in dropdown (already the case)
- For containers **with no bindings**: show "Add new binding" form
  - Container port input
  - Host port input
  - Protocol select (tcp/udp)
- For containers **with existing bindings**: show current port select + new host port (existing flow)
- Both paths call `dh:docker:remap-port`

---

## Section 3 — Rust Backend: Container Reconfigure IPC

### New channel: `dh:docker:reconfigure`

**Request payload:**
```json
{
  "id": "container-id",
  "ports": [{ "hostPort": 8080, "containerPort": 80, "protocol": "tcp" }],
  "env": ["KEY=VALUE"],
  "networkMode": "bridge",
  "restartPolicy": "unless-stopped"
}
```

**Implementation (`docker_reconfigure_invoke` in `lib.rs`):**
1. `docker inspect <id>` → parse full config
2. Merge user overrides over inspected config (ports, env, network, restart)
3. Preserve: image, command, TTY flags, existing binds/volumes, labels
4. `docker create --name <same-name> ...merged-args...` (create first, before touching old container)
5. On create success: `docker stop <id>` → `docker rm <id>` → `docker start <new-id>`
6. Return `{ ok: true, newId }` or `{ ok: false, error: "[DOCKER_RECONFIG_FAILED] ..." }`

**Error codes:**
- `[DOCKER_RECONFIG_NOT_FOUND]` — inspect returned empty
- `[DOCKER_RECONFIG_CREATE_FAILED]` — docker create failed (old container untouched)
- `[DOCKER_RECONFIG_START_FAILED]` — create succeeded but start failed (new container left stopped)

**No new Rust modules** — logic fits in `lib.rs` as a new async function, same pattern as `docker_remap_port_invoke`.

---

## Shared Type Changes (`packages/shared/src/ipc.ts`)

```typescript
export type ContainerReconfigureRequest = {
  id: string
  ports?: Array<{ hostPort: number; containerPort: number; protocol: 'tcp' | 'udp' }>
  env?: string[]
  networkMode?: string
  restartPolicy?: string
}

export type ContainerInspectData = {
  id: string
  name: string
  image: string
  state: string
  ports: Array<{ hostPort: number; containerPort: number; protocol: string }>
  env: string[]
  networks: string[]
  volumes: string[]
  restartPolicy: string
}
```

New IPC channel added to `IPC` const: `reconfigureContainer: 'dh:docker:reconfigure'`

---

## Files Changed

| File | Change |
|------|--------|
| `apps/desktop/src-tauri/src/lib.rs` | Add `docker_reconfigure_invoke`, fix `docker_remap_port_invoke` empty-bindings case, wire `dh:docker:reconfigure` |
| `packages/shared/src/ipc.ts` | Add `ContainerReconfigureRequest`, `ContainerInspectData`, new IPC channel |
| `apps/desktop/src/renderer/src/pages/DockerPage.tsx` | Add drawer component, drawer state, ports tab UI fix |

---

## Out of Scope
- Volume management from the drawer (add/remove mounts) — requires recreate and path picking; deferred
- Container rename without recreate — Docker doesn't support it
- Real-time log streaming — current pull-on-demand is sufficient for now
