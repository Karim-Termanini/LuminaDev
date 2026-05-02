use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

// ─── OAuth Client IDs ─────────────────────────────────────────────────────────
// Register a GitHub OAuth App (Device Flow enabled) at github.com/settings/developers
// and a GitLab OAuth Application at gitlab.com/-/profile/applications (enable device flow).
// Resolution order for device flow (same for GitHub / GitLab):
//   1) Optional per-install values in `store.json` → `cloud_oauth_clients` (Cloud Git → Advanced)
//   2) Process environment `LUMINA_*_OAUTH_CLIENT_ID` at app launch
//   3) Compile-time `option_env!("LUMINA_*_OAUTH_CLIENT_ID")`
//   4) Defaults below (placeholders until the project ships real app IDs)
// Client IDs are NOT secrets — security relies on device codes, not on hiding the ID.
pub const GITHUB_OAUTH_CLIENT_ID: &str = "Ov23li9XiY0G9OL1QvcI";
pub const GITLAB_OAUTH_CLIENT_ID: &str = "b300cf76c66e8a7a888e10c648c5243422f089cce232c18415f28399e2dbe4a9";

/// `store_override`: trimmed non-empty value from `cloud_oauth_clients.github_client_id` in store.json, if any.
pub fn compose_github_client_id(store_override: Option<&str>) -> String {
    if let Some(s) = store_override {
        let t = s.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    if let Ok(v) = std::env::var("LUMINA_GITHUB_OAUTH_CLIENT_ID") {
        let t = v.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    if let Some(v) = option_env!("LUMINA_GITHUB_OAUTH_CLIENT_ID") {
        if !v.is_empty() {
            return v.to_string();
        }
    }
    GITHUB_OAUTH_CLIENT_ID.to_string()
}

/// `store_override`: trimmed non-empty value from `cloud_oauth_clients.gitlab_client_id` in store.json, if any.
pub fn compose_gitlab_client_id(store_override: Option<&str>) -> String {
    if let Some(s) = store_override {
        let t = s.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    if let Ok(v) = std::env::var("LUMINA_GITLAB_OAUTH_CLIENT_ID") {
        let t = v.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    if let Some(v) = option_env!("LUMINA_GITLAB_OAUTH_CLIENT_ID") {
        if !v.is_empty() {
            return v.to_string();
        }
    }
    GITLAB_OAUTH_CLIENT_ID.to_string()
}

fn oauth_client_id_unconfigured(id: &str) -> bool {
    let t = id.trim();
    t.is_empty() || t.contains("REPLACE_WITH") || t.eq_ignore_ascii_case("your_client_id_here")
}

fn device_authorize_error_detail(body: &serde_json::Value) -> String {
    if let Some(s) = body["error_description"].as_str() {
        return s.trim().to_string();
    }
    if let Some(s) = body["error"].as_str() {
        return s.trim().to_string();
    }
    String::new()
}

fn parse_device_authorize_body(
    provider: &str,
    status: reqwest::StatusCode,
    body: serde_json::Value,
    default_expires_in: u64,
) -> Result<DeviceAuthChallenge, String> {
    let device_code = body["device_code"].as_str().unwrap_or("");
    if !status.is_success() {
        let detail = device_authorize_error_detail(&body);
        return Err(format!(
            "[CLOUD_AUTH_DEVICE_START_REJECTED] {} device authorization returned HTTP {}. {}",
            provider,
            status.as_u16(),
            detail
        ));
    }
    if device_code.is_empty() {
        let detail = device_authorize_error_detail(&body);
        let suffix = if detail.is_empty() {
            "missing device_code in response.".to_string()
        } else {
            detail
        };
        return Err(format!(
            "[CLOUD_AUTH_DEVICE_START_REJECTED] {} {}",
            provider, suffix
        ));
    }
    let default_verify = if provider == "GitLab" {
        "https://gitlab.com/oauth/device"
    } else {
        "https://github.com/login/device"
    };
    Ok(DeviceAuthChallenge {
        user_code: body["user_code"].as_str().unwrap_or_default().to_string(),
        verification_uri: body["verification_uri"]
            .as_str()
            .unwrap_or(default_verify)
            .to_string(),
        device_code: device_code.to_string(),
        interval: body["interval"].as_u64().unwrap_or(5),
        expires_in: body["expires_in"].as_u64().unwrap_or(default_expires_in),
    })
}

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
        let days_in_year = if y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400)) {
            366
        } else {
            365
        };
        if days < days_in_year { break; }
        days -= days_in_year;
        y += 1;
    }
    let month_days: [u64; 12] = [
        31,
        if y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400)) {
            29
        } else {
            28
        },
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

impl GitHubProvider {
    pub async fn device_auth_start(scopes: &[&str], client_id: &str) -> Result<DeviceAuthChallenge, String> {
        if oauth_client_id_unconfigured(client_id) {
            return Err(
                "[CLOUD_AUTH_OAUTH_NOT_CONFIGURED] GitHub device flow needs a registered OAuth app client ID. Add it under Cloud Git → Advanced (saved locally), set environment variable LUMINA_GITHUB_OAUTH_CLIENT_ID, compile with that var, replace GITHUB_OAUTH_CLIENT_ID in cloud_auth.rs, or use a personal access token."
                    .to_string(),
            );
        }
        let client = reqwest::Client::new();
        let scope = scopes.join(" ");
        let resp = client
            .post("https://github.com/login/device/code")
            .header("Accept", "application/json")
            .form(&[("client_id", client_id), ("scope", scope.as_str())])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub device start: {}", e))?;
        let status = resp.status();
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub device start parse: {}", e))?;
        parse_device_authorize_body("GitHub", status, body, 900)
    }

    pub async fn device_auth_poll(device_code: &str, client_id: &str) -> Result<PollResult, String> {
        let client = reqwest::Client::new();
        let resp = client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id),
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
            let profile = Self::validate_pat(token).await?;
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

    pub async fn validate_pat(token: &str) -> Result<StoredCredential, String> {
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

    pub async fn revoke_token(_token: &str) -> Result<(), String> {
        // GitHub device flow apps have no client_secret — programmatic revocation
        // is not available. Credential is deleted locally by the disconnect handler.
        Ok(())
    }
}

// ─── GitLabProvider ───────────────────────────────────────────────────────────

pub struct GitLabProvider;

impl GitLabProvider {
    pub async fn device_auth_start(scopes: &[&str], client_id: &str) -> Result<DeviceAuthChallenge, String> {
        if oauth_client_id_unconfigured(client_id) {
            return Err(
                "[CLOUD_AUTH_OAUTH_NOT_CONFIGURED] GitLab device flow needs a registered OAuth app (device grant enabled). Add the client ID under Cloud Git → Advanced (saved locally), set LUMINA_GITLAB_OAUTH_CLIENT_ID, compile with that var, replace GITLAB_OAUTH_CLIENT_ID in cloud_auth.rs, or use a personal access token."
                    .to_string(),
            );
        }
        let client = reqwest::Client::new();
        let scope = scopes.join(" ");
        let resp = client
            .post("https://gitlab.com/oauth/authorize_device")
            .header("Accept", "application/json")
            .form(&[("client_id", client_id), ("scope", scope.as_str())])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab device start: {}", e))?;
        let status = resp.status();
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab device start parse: {}", e))?;
        parse_device_authorize_body("GitLab", status, body, 300)
    }

    pub async fn device_auth_poll(device_code: &str, client_id: &str) -> Result<PollResult, String> {
        let client = reqwest::Client::new();
        let resp = client
            .post("https://gitlab.com/oauth/token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id),
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
            let profile = Self::validate_pat(token).await?;
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

    pub async fn validate_pat(token: &str) -> Result<StoredCredential, String> {
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

    pub async fn revoke_token(token: &str, client_id: &str) -> Result<(), String> {
        let client = reqwest::Client::new();
        let _ = client
            .post("https://gitlab.com/oauth/revoke")
            .form(&[("token", token), ("client_id", client_id)])
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

    #[test]
    fn compose_github_prefers_store_override() {
        assert_eq!(super::compose_github_client_id(Some("  myapp  ")), "myapp");
    }

    #[test]
    fn oauth_client_id_placeholder_detection() {
        assert!(oauth_client_id_unconfigured(""));
        assert!(oauth_client_id_unconfigured("   "));
        assert!(oauth_client_id_unconfigured("REPLACE_WITH_GITLAB_CLIENT_ID"));
        assert!(oauth_client_id_unconfigured("YOUR_CLIENT_ID_HERE"));
        assert!(!oauth_client_id_unconfigured("Iv1.8a61f9b3a7aba766"));
    }

}
