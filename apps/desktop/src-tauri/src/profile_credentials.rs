use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use crate::cloud_auth::chrono_now;

/// Encrypted profile credentials file next to app data (`profile_credentials.enc`).
pub fn app_profile_credential_store(app: &AppHandle) -> ProfileCredentialStore {
    let path = app
        .path()
        .app_data_dir()
        .map(|d| d.join("profile_credentials.enc"))
        .unwrap_or_else(|_| PathBuf::from("/tmp/profile_credentials.enc"));
    ProfileCredentialStore::new(path)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StoredProfileCredential {
    pub value: String,
    pub created_at: String,
}

pub struct ProfileCredentialStore {
    path: PathBuf,
}

impl ProfileCredentialStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn derive_key(&self) -> Result<[u8; 32], String> {
        let machine_id = std::fs::read_to_string("/etc/machine-id")
            .unwrap_or_else(|_| "fallback-no-machine-id".to_string());
        let salt = b"lumina-dev-profile-creds-v1";
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
            .map_err(|e| format!("[PROFILE_CRED_STORE_READ] {}", e))?;
        if raw.len() < 12 {
            return Ok(serde_json::json!({}));
        }
        let key_bytes = self.derive_key()?;
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(&raw[..12]);
        let plaintext = cipher
            .decrypt(nonce, &raw[12..])
            .map_err(|_| "[PROFILE_CRED_STORE_DECRYPT] Failed to decrypt credentials".to_string())?;
        serde_json::from_slice(&plaintext)
            .map_err(|e| format!("[PROFILE_CRED_STORE_PARSE] {}", e))
    }

    fn write_store(&self, value: &serde_json::Value) -> Result<(), String> {
        let plaintext = serde_json::to_vec(value)
            .map_err(|e| format!("[PROFILE_CRED_STORE_ENCODE] {}", e))?;
        let key_bytes = self.derive_key()?;
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = cipher
            .encrypt(&nonce, plaintext.as_ref())
            .map_err(|e| format!("[PROFILE_CRED_STORE_ENCRYPT] {}", e))?;
        let mut blob = nonce.to_vec();
        blob.extend_from_slice(&ciphertext);
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("[PROFILE_CRED_STORE_DIR] {}", e))?;
        }
        std::fs::write(&self.path, &blob)
            .map_err(|e| format!("[PROFILE_CRED_STORE_WRITE] {}", e))
    }

    pub fn save(&self, id: &str, value: &str) -> Result<(), String> {
        let mut store = self.read_store()?;
        store[id] = serde_json::to_value(StoredProfileCredential {
            value: value.to_string(),
            created_at: chrono_now(),
        })
        .map_err(|e| format!("[PROFILE_CRED_STORE_ENCODE] {}", e))?;
        self.write_store(&store)
    }

    pub fn load(&self, id: &str) -> Result<Option<String>, String> {
        let store = self.read_store()?;
        match store.get(id) {
            None | Some(serde_json::Value::Null) => Ok(None),
            Some(v) => {
                let cred: StoredProfileCredential = serde_json::from_value(v.clone())
                    .map_err(|e| format!("[PROFILE_CRED_STORE_PARSE] {}", e))?;
                Ok(Some(cred.value))
            }
        }
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        let mut store = self.read_store()?;
        store[id] = serde_json::Value::Null;
        self.write_store(&store)
    }

    pub fn list_ids(&self) -> Result<Vec<String>, String> {
        let store = self.read_store()?;
        let mut ids = Vec::new();
        if let Some(obj) = store.as_object() {
            for (key, val) in obj.iter() {
                if !val.is_null() {
                    ids.push(key.clone());
                }
            }
        }
        ids.sort();
        Ok(ids)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn temp_store() -> (ProfileCredentialStore, TempDir) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("test_creds.enc");
        (ProfileCredentialStore::new(path), dir)
    }

    #[test]
    fn store_save_load_roundtrip() {
        let (store, _dir) = temp_store();
        store.save("api-key-1", "secret-token-123").unwrap();
        let loaded = store.load("api-key-1").unwrap().expect("should exist");
        assert_eq!(loaded, "secret-token-123");
    }

    #[test]
    fn store_load_missing_returns_none() {
        let (store, _dir) = temp_store();
        let result = store.load("missing-id").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn store_delete_removes_entry() {
        let (store, _dir) = temp_store();
        store.save("cred-1", "value-1").unwrap();
        store.delete("cred-1").unwrap();
        assert!(store.load("cred-1").unwrap().is_none());
    }

    #[test]
    fn store_list_ids_returns_all() {
        let (store, _dir) = temp_store();
        store.save("cred-1", "value-1").unwrap();
        store.save("cred-2", "value-2").unwrap();
        store.save("cred-3", "value-3").unwrap();
        let ids = store.list_ids().unwrap();
        assert_eq!(ids.len(), 3);
        assert!(ids.contains(&"cred-1".to_string()));
        assert!(ids.contains(&"cred-2".to_string()));
        assert!(ids.contains(&"cred-3".to_string()));
    }

    #[test]
    fn store_delete_does_not_remove_other() {
        let (store, _dir) = temp_store();
        store.save("cred-1", "value-1").unwrap();
        store.save("cred-2", "value-2").unwrap();
        store.delete("cred-1").unwrap();
        assert!(store.load("cred-1").unwrap().is_none());
        assert!(store.load("cred-2").unwrap().is_some());
    }

    #[test]
    fn derive_key_is_deterministic() {
        let (store, _dir) = temp_store();
        let k1 = store.derive_key().unwrap();
        let k2 = store.derive_key().unwrap();
        assert_eq!(k1, k2);
    }
}
