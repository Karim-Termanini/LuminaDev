# Cloud Git — Auth Layer Design

**Phase 12, Subsystem 1 of 4**  
**Date:** 2026-05-02  
**Status:** Approved — ready for implementation planning

---

## Scope

This spec covers the authentication and credential storage layer for Phase 12 (Cloud Git). It is subsystem 1 of 4; subsequent subsystems (Interactive VCS, Cloud Dashboards, Repo Widgets) depend on this foundation.

Out of scope for this spec: API calls beyond auth (PRs, issues, CI/CD), VCS operations, dashboard widgets.

---

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| Providers | GitHub + GitLab from day one | Design auth layer for both upfront; avoids retrofit |
| Auth methods | OAuth device flow + PAT fallback | Device flow is gold standard for desktop (no local server, Flatpak-safe); PAT covers edge cases |
| Storage | `EncryptedFileStore` now, `KeychainStore` later | Abstraction layer allows migration without frontend changes |
| OAuth scope strategy | Declare full scopes upfront | Avoids re-auth dance when VCS/dashboard features land |
| UI location | Dedicated `/cloud-git` page + summary card in Settings | Feature discovery, contextual cohesion, room for complex onboarding UX |

---

## Architecture

### OAuth Client IDs

Device flow requires a registered OAuth App Client ID per provider. These are compile-time constants bundled in the binary — the same pattern used by `gh` CLI and VS Code. They are **not** secrets (Client IDs are public; the security model relies on device codes, not on keeping the Client ID hidden).

- `GITHUB_CLIENT_ID` — defined as a `const` in `cloud_auth.rs`, registered under the LuminaDev GitHub OAuth App
- `GITLAB_CLIENT_ID` — same, registered under the LuminaDev GitLab OAuth App

### Rust — `src-tauri/src/cloud_auth.rs` (new module)

Two traits:

```rust
trait CloudProvider {
    fn device_auth_start(&self, scopes: &[&str]) -> Result<DeviceAuthChallenge>;
    fn device_auth_poll(&self, device_code: &str) -> Result<PollResult>;
    fn validate_pat(&self, token: &str) -> Result<UserProfile>;
    fn revoke_token(&self, token: &str) -> Result<()>;
}

trait CredentialStore {
    fn save(&self, provider: &str, token: &str) -> Result<()>;
    fn load(&self, provider: &str) -> Result<Option<String>>;
    fn delete(&self, provider: &str) -> Result<()>;
}
```

Implementations:

| Struct | Trait | Notes |
|---|---|---|
| `GitHubProvider` | `CloudProvider` | Device flow via `github.com/login/device/code`; PAT via `api.github.com/user` |
| `GitLabProvider` | `CloudProvider` | Device flow via `gitlab.com/oauth/authorize_device`; PAT via `gitlab.com/api/v4/user` |
| `EncryptedFileStore` | `CredentialStore` | AES-256-GCM; key derived from `/etc/machine-id` + app salt; stored at `{app_data}/cloud_credentials.enc` |

`ipc_invoke` in `lib.rs` routes `dh:cloud:auth:*` channels to these — same dispatch pattern as all other domains.

### Migration path to system keychain

When `KeychainStore` (libsecret/GNOME Keyring) is implemented later:

1. On startup: if keychain available and `.enc` file exists → decrypt with machine-ID key → write to keychain → delete `.enc` file.
2. If keychain unavailable: fall back to `EncryptedFileStore` silently.
3. Frontend is unaffected — `CredentialStore` trait hides the implementation.

---

## IPC Channels

All channels follow the existing `{ ok: boolean; error?: string }` response shape.

### New channels in `packages/shared/src/ipc.ts`

| Channel | Request | Response |
|---|---|---|
| `dh:cloud:auth:connect-start` | `{ provider: "github" \| "gitlab" }` | `{ ok, user_code, verification_uri, interval, expires_in }` |
| `dh:cloud:auth:connect-poll` | `{ provider, device_code }` | `{ ok, status: "pending" \| "complete" \| "expired" \| "denied" }` |
| `dh:cloud:auth:connect-pat` | `{ provider, token }` | `{ ok, username, avatar_url }` |
| `dh:cloud:auth:disconnect` | `{ provider }` | `{ ok }` |
| `dh:cloud:auth:status` | `{}` | `{ ok, accounts: ConnectedAccount[] }` |

`ConnectedAccount` shape: `{ provider, username, avatar_url, connected_at }` — raw tokens never returned to renderer.

### New Zod schemas in `packages/shared/src/schemas.ts`

- `CloudAuthConnectStartRequestSchema`
- `CloudAuthConnectPollRequestSchema`
- `CloudAuthConnectPatRequestSchema`
- `CloudAuthDisconnectRequestSchema`
- `CloudAuthStatusResponseSchema`

### Error codes

`expired` and `denied` are **not** error codes — they are expected `status` values returned as `ok: true` from `connect-poll`. Only genuine failures use `[ERROR_CODE]` strings:

| Code | Meaning |
|---|---|
| `[CLOUD_AUTH_INVALID_TOKEN]` | PAT failed validation |
| `[CLOUD_AUTH_NETWORK]` | HTTP call to provider failed |

---

## OAuth Scopes

### GitHub

`repo`, `read:org`, `read:user`, `notifications`

### GitLab

`read_api`, `read_user`, `read_repository`, `write_repository`

Full scopes declared at connect time — no re-auth required when VCS/dashboard subsystems land.

---

## Frontend

### `/cloud-git` route

New file: `apps/desktop/src/renderer/src/pages/CloudGitPage.tsx`

**State 1 — No accounts connected:**
- Hero with two CTA cards: "Connect GitHub" and "Connect GitLab"
- Each card lists the scopes being requested
- "Use a token instead" link on each card (expands PAT input)

**State 2 — Device flow in progress:**
- CTA card replaced with: large monospace `user_code` display, "Copy Code" button, "Open Browser" button (opens `verification_uri`), animated pulse waiting indicator, "Cancel" link
- Frontend polls `dh:cloud:auth:connect-poll` every `interval` seconds

**State 3 — Connected:**
- Account chip per provider: avatar + username + provider badge + connected_at
- "Disconnect" button per chip
- "Add another" option if second provider not yet linked

**PAT flow:** "Use a token instead" expands inline input; on submit calls `dh:cloud:auth:connect-pat`; inline error on `[CLOUD_AUTH_INVALID_TOKEN]`.

### Settings page — new "Connected Accounts" card

- Read-only: connected provider(s) with username + badge
- Empty state: "No accounts linked yet"
- "Manage →" NavLink to `/cloud-git` in both states

### New renderer files

| File | Purpose |
|---|---|
| `pages/CloudGitPage.tsx` | Main page component |
| `pages/cloudAuthError.ts` | `humanizeCloudAuthError()` — maps `[CLOUD_AUTH_*]` to user messages |
| `pages/cloudAuthContract.ts` | `assertCloudAuthOk()` — throws typed errors |
| `pages/cloudAuthContract.test.ts` | Response shape assertions |
| `pages/cloudAuthError.test.ts` | Error code mapping coverage |

---

## Error Handling

**Device flow poll loop:**

| Terminal state | UI response |
|---|---|
| `expired` | "Code expired — try again" + retry button |
| `denied` | "Authorization denied" + retry button |
| `network` | "Connection error" + retry with backoff; does not kill the flow |

**Disconnect:** Rust attempts revocation then always deletes local credential — even if revocation fails (token may be expired). UI reflects success immediately.

---

## Testing

### Renderer (Vitest)

- `cloudAuthContract.test.ts` — response shape assertions for all 5 channels
- `cloudAuthError.test.ts` — `humanizeCloudAuthError()` covers all `[CLOUD_AUTH_*]` codes

### Rust (unit)

- `EncryptedFileStore` round-trip: save → load → delete
- `derive_key` determinism: same machine-id + salt → same key
- Provider URL construction: correct endpoints for GitHub and GitLab
- No mock of live GitHub/GitLab HTTP APIs in unit tests; integration tests only when network available

---

## Nav + Route Status

- AppShell nav: new entry `{ to: '/cloud-git', label: 'Cloud Git', icon: 'github', status: 'partial' }`
- `docs/ROUTE_STATUS.md`: new row for `/cloud-git` — `partial` — "Auth layer: device flow + PAT for GitHub and GitLab; cloud dashboards TBD"
