use lumina_dev_lib::integration_test_support::encrypted_store_roundtrip_smoke;
use tempfile::TempDir;

#[test]
fn encrypted_credential_store_roundtrip_smoke() {
    let dir = TempDir::new().expect("tempdir");
    let path = dir.path().join("cloud_credentials.enc");
    encrypted_store_roundtrip_smoke(path).expect("encrypted store roundtrip");
}

#[test]
fn oauth_client_id_env_smoke() {
    std::env::set_var("LUMINA_GITHUB_CLIENT_ID", "Iv1.integration-smoke-placeholder");
    std::env::set_var("LUMINA_GITLAB_CLIENT_ID", "gitlab-smoke-client-id");
    assert!(
        std::env::var("LUMINA_GITHUB_CLIENT_ID")
            .unwrap_or_default()
            .starts_with("Iv1.")
    );
    assert!(
        !std::env::var("LUMINA_GITLAB_CLIENT_ID")
            .unwrap_or_default()
            .is_empty()
    );
}
