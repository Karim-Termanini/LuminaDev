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
