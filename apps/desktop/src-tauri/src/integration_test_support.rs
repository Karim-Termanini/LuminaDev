//! Hidden helpers for `tests/*.rs` integration smoke (not public product API).

use std::path::{Path, PathBuf};

use crate::cloud_auth::store::EncryptedFileStore;
use crate::cloud_auth::types::StoredCredential;

pub fn find_repo_root(start: &Path) -> PathBuf {
    crate::compose_profiles::find_repo_root(start)
}

pub fn compose_dir_has_full_overlay_file(compose_dir: &Path) -> bool {
    crate::compose_profiles::compose_dir_has_full_overlay_file(compose_dir)
}

pub fn compose_full_overlay_from_env() -> bool {
    crate::compose_profiles::compose_full_overlay_from_env()
}

pub fn encrypted_store_roundtrip_smoke(path: PathBuf) -> Result<(), String> {
    let store = EncryptedFileStore::new(path);
    let cred = StoredCredential {
        token: "integration-smoke-token".to_string(),
        username: "smoke-user".to_string(),
        avatar_url: "https://example.com/smoke.png".to_string(),
        connected_at: "2026-06-19T00:00:00Z".to_string(),
        web_origin: None,
    };
    use crate::cloud_auth::store::CredentialStore;
    store.save("github", &cred)?;
    let loaded = store
        .load("github")?
        .ok_or_else(|| "github entry missing after save".to_string())?;
    if loaded.token != cred.token || loaded.username != cred.username {
        return Err("credential roundtrip mismatch".to_string());
    }
    store.delete("github")?;
    if store.load("github")?.is_some() {
        return Err("github entry still present after delete".to_string());
    }
    Ok(())
}
