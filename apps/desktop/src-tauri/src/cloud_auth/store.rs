use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

use crate::cloud_auth::types::{ConnectedAccount, StoredCredential};

pub trait CredentialStore {
    fn save(&self, provider: &str, cred: &StoredCredential) -> Result<(), String>;
    fn load(&self, provider: &str) -> Result<Option<StoredCredential>, String>;
    fn delete(&self, provider: &str) -> Result<(), String>;
    fn load_all(&self) -> Result<Vec<ConnectedAccount>, String>;
}

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
}
