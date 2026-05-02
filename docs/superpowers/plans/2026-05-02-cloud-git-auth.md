# Cloud Git Auth Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the authentication and credential storage layer for Phase 12 (Cloud Git) — device flow + PAT for GitHub and GitLab, encrypted credential storage, `/cloud-git` route with onboarding UI, and a Connected Accounts summary card in Settings.

**Architecture:** Two Rust traits (`CloudProvider`, `CredentialStore`) in a new `cloud_auth.rs` module. `GitHubProvider` and `GitLabProvider` implement `CloudProvider` using `reqwest`. `EncryptedFileStore` implements `CredentialStore` with AES-256-GCM (key derived from `/etc/machine-id`). Five IPC channels wired through `ipc_invoke` in `lib.rs`, each with a named method in `desktopApiBridge.ts` and a type entry in `vite-env.d.ts`.

**Tech Stack:** Rust (`reqwest` + `rustls-tls`, `aes-gcm`, `sha2`), TypeScript/React (Vitest), Zod (shared schemas), Tauri 2 IPC.

---

## File Map

### New files
| File | Role |
|---|---|
| `apps/desktop/src-tauri/src/cloud_auth.rs` | All Rust auth logic: traits, impls, types, unit tests |
| `apps/desktop/src/renderer/src/pages/CloudGitPage.tsx` | `/cloud-git` route component (3 states) |
| `apps/desktop/src/renderer/src/pages/cloudAuthError.ts` | `humanizeCloudAuthError()` |
| `apps/desktop/src/renderer/src/pages/cloudAuthContract.ts` | `assertCloudAuthOk()` |
| `apps/desktop/src/renderer/src/pages/cloudAuthContract.test.ts` | Contract shape tests |
| `apps/desktop/src/renderer/src/pages/cloudAuthError.test.ts` | Error humanizer tests |

### Modified files
| File | Change |
|---|---|
| `apps/desktop/src-tauri/Cargo.toml` | Add `reqwest`, `aes-gcm`, `sha2` deps + `tempfile` dev-dep |
| `apps/desktop/src-tauri/src/lib.rs` | Add `mod cloud_auth;`, `cloud_store()` helper, 5 dispatch arms |
| `packages/shared/src/ipc.ts` | 5 new channel keys in `IPC` const |
| `packages/shared/src/schemas.ts` | 5 new Zod schemas + `ConnectedAccount` type |
| `apps/desktop/src/renderer/src/api/desktopApiBridge.ts` | 5 new named bridge methods |
| `apps/desktop/src/renderer/src/vite-env.d.ts` | 5 new method type declarations on `Window.dh` |
| `apps/desktop/src/renderer/src/App.tsx` | Add `/cloud-git` route |
| `apps/desktop/src/renderer/src/layout/AppShell.tsx` | Add Cloud Git nav entry |
| `apps/desktop/src/renderer/src/pages/SettingsPage.tsx` | Add `'accounts'` nav section |
| `docs/ROUTE_STATUS.md` | Add `/cloud-git` row |

---

## Task 1: Cargo dependencies

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`

- [ ] **Step 1: Add dependencies**

In `apps/desktop/src-tauri/Cargo.toml`, add after the `libc = "0.2"` line:

```toml
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
aes-gcm = "0.10"
sha2 = "0.10"
```

Then add a `[dev-dependencies]` section at the end of the file if it does not exist:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: Verify compilation**

```bash
cd apps/desktop/src-tauri && cargo check 2>&1 | tail -5
```

Expected: `Finished` with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock
git commit -m "chore(deps): add reqwest, aes-gcm, sha2 for cloud auth layer"
```

---

## Task 2: Shared package — IPC channels + Zod schemas

**Files:**
- Modify: `packages/shared/src/ipc.ts`
- Modify: `packages/shared/src/schemas.ts`

- [ ] **Step 1: Add IPC channel keys**

In `packages/shared/src/ipc.ts`, add inside the `IPC = {` const object before the closing `} as const`:

```typescript
  cloudAuthConnectStart: 'dh:cloud:auth:connect-start',
  cloudAuthConnectPoll: 'dh:cloud:auth:connect-poll',
  cloudAuthConnectPat: 'dh:cloud:auth:connect-pat',
  cloudAuthDisconnect: 'dh:cloud:auth:disconnect',
  cloudAuthStatus: 'dh:cloud:auth:status',
```

- [ ] **Step 2: Add Zod schemas**

At the end of `packages/shared/src/schemas.ts`, add:

```typescript
// --- Cloud Auth ---

export const CloudAuthProviderSchema = z.enum(['github', 'gitlab'])
export type CloudAuthProvider = z.infer<typeof CloudAuthProviderSchema>

export const CloudAuthConnectStartRequestSchema = z.object({
  provider: CloudAuthProviderSchema,
})

export const CloudAuthConnectPollRequestSchema = z.object({
  provider: CloudAuthProviderSchema,
  device_code: z.string().min(1),
})

export const CloudAuthConnectPatRequestSchema = z.object({
  provider: CloudAuthProviderSchema,
  token: z.string().min(1).max(512),
})

export const CloudAuthDisconnectRequestSchema = z.object({
  provider: CloudAuthProviderSchema,
})

export const ConnectedAccountSchema = z.object({
  provider: CloudAuthProviderSchema,
  username: z.string(),
  avatar_url: z.string(),
  connected_at: z.string(),
})
export type ConnectedAccount = z.infer<typeof ConnectedAccountSchema>

export const CloudAuthStatusResponseSchema = z.object({
  ok: z.literal(true),
  accounts: z.array(ConnectedAccountSchema),
})
```

- [ ] **Step 3: Build shared package**

```bash
pnpm --filter @linux-dev-home/shared build 2>&1 | tail -10
```

Expected: exits 0, no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/schemas.ts
git commit -m "feat(shared): add cloud auth IPC channels and Zod schemas"
```

---

## Task 3: Bridge — desktopApiBridge.ts + vite-env.d.ts

**Files:**
- Modify: `apps/desktop/src/renderer/src/api/desktopApiBridge.ts`
- Modify: `apps/desktop/src/renderer/src/vite-env.d.ts`

Every IPC channel in this project requires a named method in the bridge and a matching type declaration in `vite-env.d.ts`. This task adds the 5 cloud auth methods.

- [ ] **Step 1: Add bridge methods**

In `apps/desktop/src/renderer/src/api/desktopApiBridge.ts`, inside the `return { ... } satisfies DhApi` object (before the closing `}`), add after the `terminalGetAllEnv` line:

```typescript
    cloudAuthConnectStart: (provider) => tauriInvoke(IPC.cloudAuthConnectStart, { provider }),
    cloudAuthConnectPoll: (payload) => tauriInvoke(IPC.cloudAuthConnectPoll, payload),
    cloudAuthConnectPat: (payload) => tauriInvoke(IPC.cloudAuthConnectPat, payload),
    cloudAuthDisconnect: (payload) => tauriInvoke(IPC.cloudAuthDisconnect, payload),
    cloudAuthStatus: () => tauriInvoke(IPC.cloudAuthStatus),
```

- [ ] **Step 2: Add type declarations**

In `apps/desktop/src/renderer/src/vite-env.d.ts`, inside the `Window.dh` interface (before the closing `}`), add after the `terminalGetAllEnv` line:

```typescript
      cloudAuthConnectStart: (provider: 'github' | 'gitlab') => Promise<{
        ok: boolean
        user_code?: string
        verification_uri?: string
        device_code?: string
        interval?: number
        expires_in?: number
        error?: string
      }>
      cloudAuthConnectPoll: (payload: {
        provider: 'github' | 'gitlab'
        device_code: string
      }) => Promise<{
        ok: boolean
        status?: 'pending' | 'complete' | 'expired' | 'denied'
        username?: string
        avatar_url?: string
        error?: string
      }>
      cloudAuthConnectPat: (payload: {
        provider: 'github' | 'gitlab'
        token: string
      }) => Promise<{ ok: boolean; username?: string; avatar_url?: string; error?: string }>
      cloudAuthDisconnect: (payload: {
        provider: 'github' | 'gitlab'
      }) => Promise<{ ok: boolean; error?: string }>
      cloudAuthStatus: () => Promise<{
        ok: boolean
        accounts: import('@linux-dev-home/shared').ConnectedAccount[]
        error?: string
      }>
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/desktop && pnpm exec tsc --noEmit 2>&1 | grep -E "desktopApiBridge|vite-env" | head -10
```

Expected: no errors on those files.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/api/desktopApiBridge.ts \
        apps/desktop/src/renderer/src/vite-env.d.ts
git commit -m "feat(cloud-auth): add bridge methods and Window.dh type declarations"
```

---

## Task 4: Rust — types, CredentialStore trait, EncryptedFileStore

**Files:**
- Create: `apps/desktop/src-tauri/src/cloud_auth.rs`

- [ ] **Step 1: Write the failing unit tests + full module**

Create `apps/desktop/src-tauri/src/cloud_auth.rs`:

```rust
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

// ─── OAuth Client IDs ─────────────────────────────────────────────────────────
// Register a GitHub OAuth App (Device Flow enabled) at github.com/settings/developers
// and a GitLab OAuth Application at gitlab.com/-/profile/applications.
// Replace these placeholders with the real Client IDs before use.
// Client IDs are NOT secrets — security relies on device codes, not on hiding the ID.
pub const GITHUB_OAUTH_CLIENT_ID: &str = "REPLACE_WITH_GITHUB_CLIENT_ID";
pub const GITLAB_OAUTH_CLIENT_ID: &str = "REPLACE_WITH_GITLAB_CLIENT_ID";

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct DeviceAuthChallenge {
    pub user_code: String,
    pub verification_uri: String,
    pub device_code: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Debug)]
pub enum PollResult {
    Pending,
    Complete {
        token: String,
        username: String,
        avatar_url: String,
    },
    Expired,
    Denied,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StoredCredential {
    pub token: String,
    pub username: String,
    pub avatar_url: String,
    pub connected_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConnectedAccount {
    pub provider: String,
    pub username: String,
    pub avatar_url: String,
    pub connected_at: String,
}

// ─── CredentialStore trait ────────────────────────────────────────────────────

pub trait CredentialStore {
    fn save(&self, provider: &str, cred: &StoredCredential) -> Result<(), String>;
    fn load(&self, provider: &str) -> Result<Option<StoredCredential>, String>;
    fn delete(&self, provider: &str) -> Result<(), String>;
    fn load_all(&self) -> Result<Vec<ConnectedAccount>, String>;
}

// ─── EncryptedFileStore ───────────────────────────────────────────────────────

pub struct EncryptedFileStore {
    path: PathBuf,
}

impl EncryptedFileStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn derive_key(&self) -> Result<[u8; 32], String> {
        let machine_id = std::fs::read_to_string("/etc/machine-id")
            .unwrap_or_else(|_| "fallback-no-machine-id".to_string());
        let salt = b"lumina-dev-cloud-creds-v1";
        let mut hasher = Sha256::new();
        hasher.update(machine_id.trim().as_bytes());
        hasher.update(salt);
        Ok(hasher.finalize().into())
    }

    fn read_store(&self) -> Result<serde_json::Value, String> {
        if !self.path.exists() {
            return Ok(serde_json::json!({}));
        }
        let raw = std::fs::read(&self.path)
            .map_err(|e| format!("[CLOUD_AUTH_STORE_READ] {}", e))?;
        if raw.len() < 12 {
            return Ok(serde_json::json!({}));
        }
        let key_bytes = self.derive_key()?;
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(&raw[..12]);
        let plaintext = cipher
            .decrypt(nonce, &raw[12..])
            .map_err(|_| "[CLOUD_AUTH_STORE_DECRYPT] Failed to decrypt credentials".to_string())?;
        serde_json::from_slice(&plaintext)
            .map_err(|e| format!("[CLOUD_AUTH_STORE_PARSE] {}", e))
    }

    fn write_store(&self, value: &serde_json::Value) -> Result<(), String> {
        let plaintext = serde_json::to_vec(value)
            .map_err(|e| format!("[CLOUD_AUTH_STORE_ENCODE] {}", e))?;
        let key_bytes = self.derive_key()?;
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = cipher
            .encrypt(&nonce, plaintext.as_ref())
            .map_err(|e| format!("[CLOUD_AUTH_STORE_ENCRYPT] {}", e))?;
        let mut blob = nonce.to_vec();
        blob.extend_from_slice(&ciphertext);
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("[CLOUD_AUTH_STORE_DIR] {}", e))?;
        }
        std::fs::write(&self.path, &blob)
            .map_err(|e| format!("[CLOUD_AUTH_STORE_WRITE] {}", e))
    }
}

impl CredentialStore for EncryptedFileStore {
    fn save(&self, provider: &str, cred: &StoredCredential) -> Result<(), String> {
        let mut store = self.read_store()?;
        store[provider] = serde_json::to_value(cred)
            .map_err(|e| format!("[CLOUD_AUTH_STORE_ENCODE] {}", e))?;
        self.write_store(&store)
    }

    fn load(&self, provider: &str) -> Result<Option<StoredCredential>, String> {
        let store = self.read_store()?;
        match store.get(provider) {
            None | Some(serde_json::Value::Null) => Ok(None),
            Some(v) => {
                let cred: StoredCredential = serde_json::from_value(v.clone())
                    .map_err(|e| format!("[CLOUD_AUTH_STORE_PARSE] {}", e))?;
                Ok(Some(cred))
            }
        }
    }

    fn delete(&self, provider: &str) -> Result<(), String> {
        let mut store = self.read_store()?;
        store[provider] = serde_json::Value::Null;
        self.write_store(&store)
    }

    fn load_all(&self) -> Result<Vec<ConnectedAccount>, String> {
        let store = self.read_store()?;
        let mut accounts = Vec::new();
        for provider in &["github", "gitlab"] {
            if let Some(v) = store.get(*provider) {
                if !v.is_null() {
                    if let Ok(cred) = serde_json::from_value::<StoredCredential>(v.clone()) {
                        accounts.push(ConnectedAccount {
                            provider: provider.to_string(),
                            username: cred.username,
                            avatar_url: cred.avatar_url,
                            connected_at: cred.connected_at,
                        });
                    }
                }
            }
        }
        Ok(accounts)
    }
}

// ─── CloudProvider trait ──────────────────────────────────────────────────────

pub trait CloudProvider {
    fn device_auth_start(
        &self,
        scopes: &[&str],
    ) -> impl std::future::Future<Output = Result<DeviceAuthChallenge, String>> + Send;

    fn device_auth_poll(
        &self,
        device_code: &str,
    ) -> impl std::future::Future<Output = Result<PollResult, String>> + Send;

    fn validate_pat(
        &self,
        token: &str,
    ) -> impl std::future::Future<Output = Result<StoredCredential, String>> + Send;

    fn revoke_token(
        &self,
        token: &str,
    ) -> impl std::future::Future<Output = Result<(), String>> + Send;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

pub fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let mut days = secs / 86400;
    let mut y = 1970u64;
    loop {
        let days_in_year = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
        if days < days_in_year { break; }
        days -= days_in_year;
        y += 1;
    }
    let month_days: [u64; 12] = [
        31,
        if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 29 } else { 28 },
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut mo = 1u64;
    let mut remaining = days;
    for &md in &month_days {
        if remaining < md { break; }
        remaining -= md;
        mo += 1;
    }
    let d = remaining + 1;
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, m, s)
}

// ─── GitHubProvider ───────────────────────────────────────────────────────────

pub struct GitHubProvider;

impl CloudProvider for GitHubProvider {
    async fn device_auth_start(&self, scopes: &[&str]) -> Result<DeviceAuthChallenge, String> {
        let client = reqwest::Client::new();
        let scope = scopes.join(" ");
        let resp = client
            .post("https://github.com/login/device/code")
            .header("Accept", "application/json")
            .form(&[("client_id", GITHUB_OAUTH_CLIENT_ID), ("scope", scope.as_str())])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub device start: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_AUTH_NETWORK] GitHub device start returned {}",
                resp.status()
            ));
        }
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub device start parse: {}", e))?;
        Ok(DeviceAuthChallenge {
            user_code: body["user_code"].as_str().unwrap_or_default().to_string(),
            verification_uri: body["verification_uri"]
                .as_str()
                .unwrap_or("https://github.com/login/device")
                .to_string(),
            device_code: body["device_code"].as_str().unwrap_or_default().to_string(),
            interval: body["interval"].as_u64().unwrap_or(5),
            expires_in: body["expires_in"].as_u64().unwrap_or(900),
        })
    }

    async fn device_auth_poll(&self, device_code: &str) -> Result<PollResult, String> {
        let client = reqwest::Client::new();
        let resp = client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", GITHUB_OAUTH_CLIENT_ID),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub poll: {}", e))?;
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub poll parse: {}", e))?;
        if let Some(token) = body["access_token"].as_str() {
            let profile = self.validate_pat(token).await?;
            return Ok(PollResult::Complete {
                token: token.to_string(),
                username: profile.username,
                avatar_url: profile.avatar_url,
            });
        }
        match body["error"].as_str() {
            Some("authorization_pending") | Some("slow_down") => Ok(PollResult::Pending),
            Some("expired_token") => Ok(PollResult::Expired),
            Some("access_denied") => Ok(PollResult::Denied),
            other => Err(format!(
                "[CLOUD_AUTH_NETWORK] GitHub poll unexpected error: {:?}",
                other
            )),
        }
    }

    async fn validate_pat(&self, token: &str) -> Result<StoredCredential, String> {
        let client = reqwest::Client::new();
        let resp = client
            .get("https://api.github.com/user")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub validate: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitHub token is invalid or expired.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_AUTH_NETWORK] GitHub validate returned {}",
                resp.status()
            ));
        }
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub validate parse: {}", e))?;
        Ok(StoredCredential {
            token: token.to_string(),
            username: body["login"].as_str().unwrap_or("unknown").to_string(),
            avatar_url: body["avatar_url"].as_str().unwrap_or("").to_string(),
            connected_at: chrono_now(),
        })
    }

    async fn revoke_token(&self, _token: &str) -> Result<(), String> {
        // GitHub device flow apps have no client_secret — programmatic revocation
        // is not available. Credential is deleted locally by the disconnect handler.
        Ok(())
    }
}

// ─── GitLabProvider ───────────────────────────────────────────────────────────

pub struct GitLabProvider;

impl CloudProvider for GitLabProvider {
    async fn device_auth_start(&self, scopes: &[&str]) -> Result<DeviceAuthChallenge, String> {
        let client = reqwest::Client::new();
        let scope = scopes.join(" ");
        let resp = client
            .post("https://gitlab.com/oauth/authorize_device")
            .header("Accept", "application/json")
            .form(&[("client_id", GITLAB_OAUTH_CLIENT_ID), ("scope", scope.as_str())])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab device start: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_AUTH_NETWORK] GitLab device start returned {}",
                resp.status()
            ));
        }
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab device start parse: {}", e))?;
        Ok(DeviceAuthChallenge {
            user_code: body["user_code"].as_str().unwrap_or_default().to_string(),
            verification_uri: body["verification_uri"]
                .as_str()
                .unwrap_or("https://gitlab.com/oauth/device")
                .to_string(),
            device_code: body["device_code"].as_str().unwrap_or_default().to_string(),
            interval: body["interval"].as_u64().unwrap_or(5),
            expires_in: body["expires_in"].as_u64().unwrap_or(300),
        })
    }

    async fn device_auth_poll(&self, device_code: &str) -> Result<PollResult, String> {
        let client = reqwest::Client::new();
        let resp = client
            .post("https://gitlab.com/oauth/token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", GITLAB_OAUTH_CLIENT_ID),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab poll: {}", e))?;
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab poll parse: {}", e))?;
        if let Some(token) = body["access_token"].as_str() {
            let profile = self.validate_pat(token).await?;
            return Ok(PollResult::Complete {
                token: token.to_string(),
                username: profile.username,
                avatar_url: profile.avatar_url,
            });
        }
        match body["error"].as_str() {
            Some("authorization_pending") | Some("slow_down") => Ok(PollResult::Pending),
            Some("expired_token") => Ok(PollResult::Expired),
            Some("access_denied") => Ok(PollResult::Denied),
            other => Err(format!(
                "[CLOUD_AUTH_NETWORK] GitLab poll unexpected error: {:?}",
                other
            )),
        }
    }

    async fn validate_pat(&self, token: &str) -> Result<StoredCredential, String> {
        let client = reqwest::Client::new();
        let resp = client
            .get("https://gitlab.com/api/v4/user")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab validate: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_AUTH_NETWORK] GitLab validate returned {}",
                resp.status()
            ));
        }
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab validate parse: {}", e))?;
        Ok(StoredCredential {
            token: token.to_string(),
            username: body["username"].as_str().unwrap_or("unknown").to_string(),
            avatar_url: body["avatar_url"].as_str().unwrap_or("").to_string(),
            connected_at: chrono_now(),
        })
    }

    async fn revoke_token(&self, token: &str) -> Result<(), String> {
        let client = reqwest::Client::new();
        let _ = client
            .post("https://gitlab.com/oauth/revoke")
            .form(&[("token", token), ("client_id", GITLAB_OAUTH_CLIENT_ID)])
            .send()
            .await;
        Ok(())
    }
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn temp_store() -> (EncryptedFileStore, TempDir) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("test_creds.enc");
        (EncryptedFileStore::new(path), dir)
    }

    fn sample_cred(provider: &str) -> StoredCredential {
        StoredCredential {
            token: format!("tok_{}", provider),
            username: format!("user_{}", provider),
            avatar_url: format!("https://example.com/{}.png", provider),
            connected_at: "2026-05-02T12:00:00Z".to_string(),
        }
    }

    #[test]
    fn store_save_load_roundtrip() {
        let (store, _dir) = temp_store();
        let cred = sample_cred("github");
        store.save("github", &cred).unwrap();
        let loaded = store.load("github").unwrap().expect("should exist");
        assert_eq!(loaded.token, "tok_github");
        assert_eq!(loaded.username, "user_github");
    }

    #[test]
    fn store_load_missing_returns_none() {
        let (store, _dir) = temp_store();
        let result = store.load("github").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn store_delete_removes_entry() {
        let (store, _dir) = temp_store();
        store.save("github", &sample_cred("github")).unwrap();
        store.delete("github").unwrap();
        assert!(store.load("github").unwrap().is_none());
    }

    #[test]
    fn store_load_all_returns_connected() {
        let (store, _dir) = temp_store();
        store.save("github", &sample_cred("github")).unwrap();
        store.save("gitlab", &sample_cred("gitlab")).unwrap();
        let all = store.load_all().unwrap();
        assert_eq!(all.len(), 2);
        let providers: Vec<&str> = all.iter().map(|a| a.provider.as_str()).collect();
        assert!(providers.contains(&"github"));
        assert!(providers.contains(&"gitlab"));
    }

    #[test]
    fn store_delete_does_not_remove_other_provider() {
        let (store, _dir) = temp_store();
        store.save("github", &sample_cred("github")).unwrap();
        store.save("gitlab", &sample_cred("gitlab")).unwrap();
        store.delete("github").unwrap();
        assert!(store.load("github").unwrap().is_none());
        assert!(store.load("gitlab").unwrap().is_some());
    }

    #[test]
    fn derive_key_is_deterministic() {
        let (store, _dir) = temp_store();
        let k1 = store.derive_key().unwrap();
        let k2 = store.derive_key().unwrap();
        assert_eq!(k1, k2);
    }

    #[test]
    fn chrono_now_format() {
        let ts = chrono_now();
        assert_eq!(ts.len(), 20, "timestamp should be 20 chars: {}", ts);
        assert!(ts.ends_with('Z'));
        assert!(ts.contains('T'));
    }
}
```

- [ ] **Step 2: Declare module in lib.rs**

In `apps/desktop/src-tauri/src/lib.rs`, find the block of `mod` declarations (lines ~16–64) and add:

```rust
mod cloud_auth;
```

- [ ] **Step 3: Run the unit tests**

```bash
cd apps/desktop/src-tauri && cargo test cloud_auth -- --nocapture 2>&1
```

Expected: 7 tests pass (`store_save_load_roundtrip`, `store_load_missing_returns_none`, `store_delete_removes_entry`, `store_load_all_returns_connected`, `store_delete_does_not_remove_other_provider`, `derive_key_is_deterministic`, `chrono_now_format`).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/cloud_auth.rs \
        apps/desktop/src-tauri/src/lib.rs \
        apps/desktop/src-tauri/Cargo.toml \
        apps/desktop/src-tauri/Cargo.lock
git commit -m "feat(cloud-auth): cloud_auth module — CredentialStore, providers, unit tests"
```

---

## Task 5: Rust — IPC dispatch in lib.rs

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Add the `cloud_store` helper**

In `lib.rs`, after the `write_json` function and before `ipc_send`, add:

```rust
fn cloud_store(app: &AppHandle) -> cloud_auth::EncryptedFileStore {
    let path = app
        .path()
        .app_data_dir()
        .map(|d| d.join("cloud_credentials.enc"))
        .unwrap_or_else(|_| std::path::PathBuf::from("/tmp/cloud_credentials.enc"));
    cloud_auth::EncryptedFileStore::new(path)
}
```

- [ ] **Step 2: Add the 5 dispatch arms**

Inside `ipc_invoke`, locate the `match channel.as_str() {` block. Add these 5 arms after the last `"dh:git:*"` arm:

```rust
    "dh:cloud:auth:connect-start" => {
        let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
        match provider {
            "github" => {
                let gh = cloud_auth::GitHubProvider;
                match gh.device_auth_start(&["repo", "read:org", "read:user", "notifications"]).await {
                    Ok(c) => json!({
                        "ok": true,
                        "user_code": c.user_code,
                        "verification_uri": c.verification_uri,
                        "device_code": c.device_code,
                        "interval": c.interval,
                        "expires_in": c.expires_in,
                    }),
                    Err(e) => json!({ "ok": false, "error": e }),
                }
            }
            "gitlab" => {
                let gl = cloud_auth::GitLabProvider;
                match gl.device_auth_start(&["read_api", "read_user", "read_repository", "write_repository"]).await {
                    Ok(c) => json!({
                        "ok": true,
                        "user_code": c.user_code,
                        "verification_uri": c.verification_uri,
                        "device_code": c.device_code,
                        "interval": c.interval,
                        "expires_in": c.expires_in,
                    }),
                    Err(e) => json!({ "ok": false, "error": e }),
                }
            }
            _ => json!({ "ok": false, "error": "[CLOUD_AUTH_NETWORK] Unknown provider" }),
        }
    },

    "dh:cloud:auth:connect-poll" => {
        let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
        let device_code = body.get("device_code").and_then(|v| v.as_str()).unwrap_or("");
        let store = cloud_store(&app);
        let poll_result = match provider {
            "github" => cloud_auth::GitHubProvider.device_auth_poll(device_code).await,
            "gitlab" => cloud_auth::GitLabProvider.device_auth_poll(device_code).await,
            _ => Err("[CLOUD_AUTH_NETWORK] Unknown provider".to_string()),
        };
        match poll_result {
            Ok(cloud_auth::PollResult::Pending) => json!({ "ok": true, "status": "pending" }),
            Ok(cloud_auth::PollResult::Expired) => json!({ "ok": true, "status": "expired" }),
            Ok(cloud_auth::PollResult::Denied) => json!({ "ok": true, "status": "denied" }),
            Ok(cloud_auth::PollResult::Complete { token, username, avatar_url }) => {
                let cred = cloud_auth::StoredCredential {
                    token,
                    username: username.clone(),
                    avatar_url: avatar_url.clone(),
                    connected_at: cloud_auth::chrono_now(),
                };
                match store.save(provider, &cred) {
                    Ok(_) => json!({ "ok": true, "status": "complete", "username": username, "avatar_url": avatar_url }),
                    Err(e) => json!({ "ok": false, "error": e }),
                }
            }
            Err(e) => json!({ "ok": false, "error": e }),
        }
    },

    "dh:cloud:auth:connect-pat" => {
        let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
        let token = body.get("token").and_then(|v| v.as_str()).unwrap_or("");
        let store = cloud_store(&app);
        let validate_result = match provider {
            "github" => cloud_auth::GitHubProvider.validate_pat(token).await,
            "gitlab" => cloud_auth::GitLabProvider.validate_pat(token).await,
            _ => Err("[CLOUD_AUTH_NETWORK] Unknown provider".to_string()),
        };
        match validate_result {
            Ok(cred) => {
                let username = cred.username.clone();
                let avatar_url = cred.avatar_url.clone();
                match store.save(provider, &cred) {
                    Ok(_) => json!({ "ok": true, "username": username, "avatar_url": avatar_url }),
                    Err(e) => json!({ "ok": false, "error": e }),
                }
            }
            Err(e) => json!({ "ok": false, "error": e }),
        }
    },

    "dh:cloud:auth:disconnect" => {
        let provider = body.get("provider").and_then(|v| v.as_str()).unwrap_or("");
        let store = cloud_store(&app);
        if let Ok(Some(cred)) = store.load(provider) {
            let _ = match provider {
                "github" => cloud_auth::GitHubProvider.revoke_token(&cred.token).await,
                "gitlab" => cloud_auth::GitLabProvider.revoke_token(&cred.token).await,
                _ => Ok(()),
            };
        }
        match store.delete(provider) {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": e }),
        }
    },

    "dh:cloud:auth:status" => {
        let store = cloud_store(&app);
        match store.load_all() {
            Ok(accounts) => {
                let arr: Vec<serde_json::Value> = accounts
                    .into_iter()
                    .map(|a| json!({
                        "provider": a.provider,
                        "username": a.username,
                        "avatar_url": a.avatar_url,
                        "connected_at": a.connected_at,
                    }))
                    .collect();
                json!({ "ok": true, "accounts": arr })
            }
            Err(e) => json!({ "ok": false, "error": e }),
        }
    },
```

- [ ] **Step 3: Compile check**

```bash
cd apps/desktop/src-tauri && cargo check 2>&1 | grep "^error" | head -20
```

Expected: no `error` lines.

- [ ] **Step 4: Run all Rust tests**

```bash
cd apps/desktop/src-tauri && cargo test -- --nocapture 2>&1 | tail -15
```

Expected: all tests pass including all `cloud_auth` tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(cloud-auth): wire dh:cloud:auth:* IPC channels in lib.rs dispatcher"
```

---

## Task 6: Renderer — cloudAuthError.ts + cloudAuthContract.ts + tests

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/cloudAuthError.ts`
- Create: `apps/desktop/src/renderer/src/pages/cloudAuthContract.ts`
- Create: `apps/desktop/src/renderer/src/pages/cloudAuthError.test.ts`
- Create: `apps/desktop/src/renderer/src/pages/cloudAuthContract.test.ts`

- [ ] **Step 1: Write cloudAuthError.ts**

```typescript
export function humanizeCloudAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()
  if (code === 'CLOUD_AUTH_INVALID_TOKEN')
    return `Token is invalid or expired. Double-check the token and try again. ${detail}`.trim()
  if (code === 'CLOUD_AUTH_NETWORK')
    return `Could not reach the provider. Check your connection and try again. ${detail}`.trim()
  return detail || 'Cloud auth operation failed.'
}
```

- [ ] **Step 2: Write cloudAuthContract.ts**

```typescript
export type CloudAuthOpResult = { ok: boolean; error?: string }

export function assertCloudAuthOk(
  result: unknown,
  fallback = 'Cloud auth operation failed.',
): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as CloudAuthOpResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}
```

- [ ] **Step 3: Write cloudAuthContract.test.ts**

```typescript
import { describe, expect, it } from 'vitest'
import { assertCloudAuthOk } from './cloudAuthContract'

describe('assertCloudAuthOk', () => {
  it('does nothing for success payloads', () => {
    expect(() => assertCloudAuthOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit cloud auth error', () => {
    expect(() =>
      assertCloudAuthOk({ ok: false, error: '[CLOUD_AUTH_INVALID_TOKEN] bad token' }),
    ).toThrow('[CLOUD_AUTH_INVALID_TOKEN] bad token')
  })

  it('throws with fallback when error is missing', () => {
    expect(() => assertCloudAuthOk({ ok: false }, 'Custom fallback')).toThrow('Custom fallback')
  })

  it('throws when response payload is not an object', () => {
    expect(() => assertCloudAuthOk('unexpected-string', 'Custom fallback')).toThrow(
      'Custom fallback (invalid response payload)',
    )
  })

  it('throws when ok flag is missing', () => {
    expect(() => assertCloudAuthOk({ error: 'x' }, 'Custom fallback')).toThrow(
      'Custom fallback (missing ok flag)',
    )
  })
})
```

- [ ] **Step 4: Write cloudAuthError.test.ts**

```typescript
import { describe, expect, it } from 'vitest'
import { humanizeCloudAuthError } from './cloudAuthError'

describe('humanizeCloudAuthError', () => {
  it('humanizes CLOUD_AUTH_INVALID_TOKEN', () => {
    const msg = humanizeCloudAuthError(new Error('[CLOUD_AUTH_INVALID_TOKEN] token rejected'))
    expect(msg).toContain('invalid or expired')
  })

  it('humanizes CLOUD_AUTH_NETWORK', () => {
    const msg = humanizeCloudAuthError(new Error('[CLOUD_AUTH_NETWORK] connection refused'))
    expect(msg).toContain('Check your connection')
  })

  it('returns raw detail for unknown codes', () => {
    const msg = humanizeCloudAuthError(new Error('Something unexpected'))
    expect(msg).toBe('Something unexpected')
  })

  it('handles non-Error values', () => {
    const msg = humanizeCloudAuthError('[CLOUD_AUTH_NETWORK] from string')
    expect(msg).toContain('Check your connection')
  })
})
```

- [ ] **Step 5: Run renderer tests**

```bash
cd apps/desktop && pnpm exec vitest run src/renderer/src/pages/cloudAuthContract.test.ts src/renderer/src/pages/cloudAuthError.test.ts 2>&1
```

Expected: all 9 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/cloudAuthError.ts \
        apps/desktop/src/renderer/src/pages/cloudAuthContract.ts \
        apps/desktop/src/renderer/src/pages/cloudAuthError.test.ts \
        apps/desktop/src/renderer/src/pages/cloudAuthContract.test.ts
git commit -m "feat(cloud-auth): cloudAuthError + cloudAuthContract with tests"
```

---

## Task 7: Renderer — CloudGitPage.tsx

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/CloudGitPage.tsx`

- [ ] **Step 1: Write CloudGitPage.tsx**

```typescript
import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectedAccount } from '@linux-dev-home/shared'
import { assertCloudAuthOk } from './cloudAuthContract'
import { humanizeCloudAuthError } from './cloudAuthError'

type Provider = 'github' | 'gitlab'

type DeviceFlowState = {
  provider: Provider
  user_code: string
  verification_uri: string
  device_code: string
  interval: number
}

const PROVIDER_META: Record<Provider, { label: string; icon: string; scopes: string[] }> = {
  github: {
    label: 'GitHub',
    icon: 'github',
    scopes: ['repo', 'read:org', 'read:user', 'notifications'],
  },
  gitlab: {
    label: 'GitLab',
    icon: 'source-control',
    scopes: ['read_api', 'read_user', 'read_repository', 'write_repository'],
  },
}

export function CloudGitPage(): ReactElement {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null)
  const [patProvider, setPatProvider] = useState<Provider | null>(null)
  const [patToken, setPatToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [patError, setPatError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    const res = await window.dh.cloudAuthStatus()
    if (res.ok) setAccounts(res.accounts ?? [])
  }, [])

  useEffect(() => {
    void refreshStatus().finally(() => setLoading(false))
    return () => stopPoll()
  }, [refreshStatus, stopPoll])

  const startDeviceFlow = async (provider: Provider) => {
    setError(null)
    setConnecting(true)
    try {
      const res = await window.dh.cloudAuthConnectStart(provider)
      assertCloudAuthOk(res)
      setDeviceFlow({
        provider,
        user_code: res.user_code!,
        verification_uri: res.verification_uri!,
        device_code: res.device_code!,
        interval: res.interval!,
      })
      startPoll(provider, res.device_code!, res.interval!)
    } catch (e) {
      setError(humanizeCloudAuthError(e))
    } finally {
      setConnecting(false)
    }
  }

  const startPoll = (provider: Provider, device_code: string, interval: number) => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const res = await window.dh.cloudAuthConnectPoll({ provider, device_code })
        if (!res.ok) {
          stopPoll()
          setDeviceFlow(null)
          setError(humanizeCloudAuthError(new Error(res.error ?? 'Poll failed')))
          return
        }
        if (res.status === 'complete') {
          stopPoll()
          setDeviceFlow(null)
          await refreshStatus()
        } else if (res.status === 'expired') {
          stopPoll()
          setDeviceFlow(null)
          setError('Code expired — click "Connect" to try again.')
        } else if (res.status === 'denied') {
          stopPoll()
          setDeviceFlow(null)
          setError('Authorization was denied on the provider side.')
        }
      } catch {
        // Network hiccup — keep polling, don't kill the flow
      }
    }, interval * 1000)
  }

  const cancelDeviceFlow = () => {
    stopPoll()
    setDeviceFlow(null)
    setError(null)
  }

  const submitPat = async () => {
    if (!patProvider || !patToken.trim()) return
    setPatError(null)
    setConnecting(true)
    try {
      const res = await window.dh.cloudAuthConnectPat({
        provider: patProvider,
        token: patToken.trim(),
      })
      assertCloudAuthOk(res)
      setPatProvider(null)
      setPatToken('')
      await refreshStatus()
    } catch (e) {
      setPatError(humanizeCloudAuthError(e))
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = async (provider: Provider) => {
    try {
      await window.dh.cloudAuthDisconnect({ provider })
      await refreshStatus()
    } catch (e) {
      setError(humanizeCloudAuthError(e))
    }
  }

  if (loading) {
    return <div style={{ padding: '48px 32px', color: 'var(--text-muted)' }}>Loading…</div>
  }

  const connectedProviders = new Set(accounts.map((a) => a.provider as Provider))

  return (
    <div
      style={{
        minHeight: '100%',
        padding: '28px 32px 48px',
        maxWidth: 900,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ marginBottom: 28 }}>
        <h1 className="hp-title" style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>
          Cloud Git
        </h1>
        <p className="hp-muted" style={{ marginTop: 10, maxWidth: 560, fontSize: 14 }}>
          Connect your GitHub and GitLab accounts to view pull requests, issues, and CI/CD
          status directly in LuminaDev.
        </p>
      </header>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(255,82,82,0.1)',
            border: '1px solid rgba(255,82,82,0.3)',
            borderRadius: 8,
            color: '#ff8a80',
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {deviceFlow && (
        <div className="hp-card" style={{ padding: '32px 28px', marginBottom: 24, maxWidth: 480 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
            Connecting to {PROVIDER_META[deviceFlow.provider].label}
          </div>
          <p className="hp-muted" style={{ fontSize: 13, marginBottom: 24 }}>
            Enter this code at{' '}
            <span className="mono" style={{ color: 'var(--text)' }}>
              {deviceFlow.verification_uri}
            </span>
          </p>
          <div
            className="mono"
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: '0.15em',
              color: 'var(--accent)',
              marginBottom: 24,
              userSelect: 'all',
            }}
          >
            {deviceFlow.user_code}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <button
              type="button"
              className="hp-btn hp-btn-primary"
              onClick={() => {
                void navigator.clipboard.writeText(deviceFlow.user_code)
                void window.open(deviceFlow.verification_uri, '_blank')
              }}
            >
              <span className="codicon codicon-copy" aria-hidden /> Copy &amp; Open Browser
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent)',
                animation: 'pulse 1.4s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
            Waiting for authorization…
            <button
              type="button"
              onClick={cancelDeviceFlow}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {accounts.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 650, marginBottom: 14 }}>Connected accounts</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {accounts.map((a) => (
              <div
                key={a.provider}
                className="hp-card"
                style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}
              >
                {a.avatar_url ? (
                  <img
                    src={a.avatar_url}
                    alt=""
                    style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <span
                    className="codicon codicon-account"
                    style={{ fontSize: 28, color: 'var(--text-muted)' }}
                    aria-hidden
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '1px 7px',
                        borderRadius: 4,
                        background: 'rgba(124,77,255,0.12)',
                        color: 'var(--accent)',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        marginRight: 8,
                      }}
                    >
                      {a.provider.toUpperCase()}
                    </span>
                    Connected {a.connected_at.slice(0, 10)}
                  </div>
                </div>
                <button
                  type="button"
                  className="hp-btn"
                  style={{ fontSize: 12 }}
                  onClick={() => void disconnect(a.provider as Provider)}
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!deviceFlow && (
        <section>
          <h2 style={{ fontSize: 15, fontWeight: 650, marginBottom: 14 }}>
            {accounts.length > 0 ? 'Add another account' : 'Connect an account'}
          </h2>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {(['github', 'gitlab'] as Provider[])
              .filter((p) => !connectedProviders.has(p))
              .map((p) => {
                const meta = PROVIDER_META[p]
                const isPat = patProvider === p
                return (
                  <div
                    key={p}
                    className="hp-card"
                    style={{ padding: '22px 24px', minWidth: 260, maxWidth: 340, flex: '1 1 260px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <span
                        className={`codicon codicon-${meta.icon}`}
                        style={{ fontSize: 22, color: 'var(--accent)' }}
                        aria-hidden
                      />
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{meta.label}</span>
                    </div>
                    <p className="hp-muted" style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                      Scopes: {meta.scopes.join(', ')}
                    </p>
                    {!isPat ? (
                      <>
                        <button
                          type="button"
                          className="hp-btn hp-btn-primary"
                          style={{ width: '100%', marginBottom: 8 }}
                          disabled={connecting}
                          onClick={() => void startDeviceFlow(p)}
                        >
                          Connect {meta.label}
                        </button>
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: 12,
                            padding: 0,
                            textDecoration: 'underline',
                            width: '100%',
                          }}
                          onClick={() => {
                            setPatProvider(p)
                            setPatError(null)
                          }}
                        >
                          Use a token instead
                        </button>
                      </>
                    ) : (
                      <div>
                        <input
                          type="password"
                          placeholder="Paste personal access token"
                          value={patToken}
                          onChange={(e) => setPatToken(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-panel)',
                            color: 'var(--text)',
                            fontSize: 13,
                            marginBottom: 8,
                            boxSizing: 'border-box',
                          }}
                        />
                        {patError && (
                          <p style={{ color: '#ff8a80', fontSize: 12, margin: '0 0 8px' }}>
                            {patError}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="hp-btn hp-btn-primary"
                            style={{ flex: 1 }}
                            disabled={connecting || !patToken.trim()}
                            onClick={() => void submitPat()}
                          >
                            Verify &amp; Save
                          </button>
                          <button
                            type="button"
                            className="hp-btn"
                            onClick={() => {
                              setPatProvider(null)
                              setPatToken('')
                              setPatError(null)
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/desktop && pnpm exec tsc --noEmit 2>&1 | grep "CloudGitPage" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/CloudGitPage.tsx
git commit -m "feat(cloud-git): CloudGitPage — device flow, PAT fallback, connected accounts"
```

---

## Task 8: App.tsx + AppShell.tsx — route + nav entry

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/layout/AppShell.tsx`

- [ ] **Step 1: Add import and route to App.tsx**

Add the import near the other page imports:

```typescript
import { CloudGitPage } from './pages/CloudGitPage'
```

Add the route inside `<Routes>` after the `/settings` route:

```typescript
<Route path="/cloud-git" element={<CloudGitPage />} />
```

- [ ] **Step 2: Add nav entry to AppShell.tsx**

In the `nav` array, add after the `/git-config` entry:

```typescript
  { to: '/cloud-git', label: 'Cloud Git', icon: 'github', status: 'partial' as RouteStatus },
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/desktop && pnpm exec tsc --noEmit 2>&1 | grep -E "App\.tsx|AppShell" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/App.tsx \
        apps/desktop/src/renderer/src/layout/AppShell.tsx
git commit -m "feat(cloud-git): add /cloud-git route and nav entry"
```

---

## Task 9: SettingsPage.tsx — Connected Accounts section

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Expand SettingsNavId type**

Find:
```typescript
type SettingsNavId = 'personalization' | 'remote' | 'system'
```

Replace with:
```typescript
type SettingsNavId = 'personalization' | 'remote' | 'system' | 'accounts'
```

- [ ] **Step 2: Add nav item to NAV array**

In the `NAV` array, after the `system` entry, add:

```typescript
  {
    id: 'accounts',
    label: 'Connected Accounts',
    hint: 'GitHub & GitLab',
    icon: 'github',
  },
```

- [ ] **Step 3: Add subtitle for accounts section**

Find the block:
```typescript
                {activeNav.id === 'system' &&
                  'Read-only diagnostics: hosts file and a small set of process environment variables (no profile editing yet).'}
```

Add immediately after it:
```typescript
                {activeNav.id === 'accounts' &&
                  'Cloud accounts linked to LuminaDev. Manage connections on the Cloud Git page.'}
```

- [ ] **Step 4: Add accounts content pane**

Find the last `): null}` that closes the `{navId === 'system' ? (` block (around line 887–889). After that closing `): null}`, add:

```typescript
            {navId === 'accounts' ? (
              <AccountsSummarySection />
            ) : null}
```

- [ ] **Step 5: Add AccountsSummarySection component**

Add this function just before the `export function SettingsPage` declaration:

```typescript
function AccountsSummarySection(): ReactElement {
  const [accounts, setAccounts] = useState<Array<{ provider: string; username: string; avatar_url: string }>>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void window.dh.cloudAuthStatus().then((res) => {
      if (res.ok) setAccounts(res.accounts ?? [])
      setLoaded(true)
    })
  }, [])

  if (!loaded) {
    return <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>Loading…</p>
  }

  if (accounts.length === 0) {
    return (
      <div>
        <p className="hp-muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
          No accounts linked yet.
        </p>
        <Link to="/cloud-git" className="hp-btn" style={{ fontSize: 13, textDecoration: 'none' }}>
          Manage →
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {accounts.map((a) => (
          <div key={a.provider} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {a.avatar_url ? (
              <img
                src={a.avatar_url}
                alt=""
                style={{ width: 28, height: 28, borderRadius: '50%' }}
              />
            ) : (
              <span
                className="codicon codicon-account"
                style={{ fontSize: 22, color: 'var(--text-muted)' }}
                aria-hidden
              />
            )}
            <span style={{ fontWeight: 600, fontSize: 13 }}>{a.username}</span>
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                background: 'rgba(124,77,255,0.12)',
                color: 'var(--accent)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}
            >
              {a.provider.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
      <Link to="/cloud-git" className="hp-btn" style={{ fontSize: 13, textDecoration: 'none' }}>
        Manage →
      </Link>
    </div>
  )
}
```

Note: `useState`, `useEffect`, and `Link` are already imported at the top of `SettingsPage.tsx`. No new imports needed.

- [ ] **Step 6: TypeScript check**

```bash
cd apps/desktop && pnpm exec tsc --noEmit 2>&1 | grep "SettingsPage" | head -10
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(settings): Connected Accounts section with Manage link to /cloud-git"
```

---

## Task 10: docs/ROUTE_STATUS.md + final verification

**Files:**
- Modify: `docs/ROUTE_STATUS.md`

- [ ] **Step 1: Add the /cloud-git row**

In `docs/ROUTE_STATUS.md`, add after the `/settings` row:

```markdown
| `/cloud-git` | partial | Auth layer: device flow + PAT for GitHub and GitLab. Cloud dashboards (PRs, issues, CI/CD) planned in subsequent subsystems. |
```

- [ ] **Step 2: Run full renderer test suite**

```bash
cd apps/desktop && pnpm --filter @linux-dev-home/shared build && pnpm exec vitest run 2>&1 | tail -15
```

Expected: all tests pass, no regressions.

- [ ] **Step 3: Run workspace typecheck**

```bash
pnpm typecheck 2>&1 | tail -10
```

Expected: exits 0 or only pre-existing warnings.

- [ ] **Step 4: Run all Rust tests**

```bash
cd apps/desktop/src-tauri && cargo test -- --nocapture 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Final commit**

```bash
git add docs/ROUTE_STATUS.md
git commit -m "docs: add /cloud-git to ROUTE_STATUS.md — auth layer partial"
```
