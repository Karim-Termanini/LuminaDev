mod common;

use std::path::Path;
use std::process::Command;

use lumina_dev_lib::integration_test_support::{
    compose_dir_has_full_overlay_file, find_repo_root,
};

#[test]
fn compose_preset_dirs_match_shared_catalog() {
    let ids = common::compose_preset_ids_from_shared();
    assert_eq!(
        ids.len(),
        9,
        "expected 9 compose presets in composeProfiles.ts"
    );

    let compose_root = common::repo_root().join("docker/compose");
    for id in &ids {
        let dir = compose_root.join(id);
        assert!(
            dir.is_dir(),
            "missing preset directory docker/compose/{id}"
        );
        assert!(
            dir.join("docker-compose.yml").is_file(),
            "missing docker-compose.yml for preset {id}"
        );
    }
}

#[test]
fn compose_find_repo_root_from_checkout() {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let root = find_repo_root(manifest);
    assert!(
        root.join("docker/compose").is_dir(),
        "find_repo_root should discover docker/compose from src-tauri ({:?})",
        root
    );
}

#[test]
fn compose_web_dev_full_overlay_file_exists() {
    let web_dev = common::repo_root().join("docker/compose/web-dev");
    assert!(compose_dir_has_full_overlay_file(&web_dev));
}

#[test]
fn compose_config_validate_smoke() {
    if !common::docker_available() {
        eprintln!("Skipping test: docker CLI not available on PATH");
        return;
    }
    if !common::docker_daemon_available() {
        eprintln!("Skipping test: docker daemon is not running");
        return;
    }

    let compose_root = common::repo_root().join("docker/compose");
    let project_dir = std::env::temp_dir().join("keel-compose-config-smoke");
    let _ = std::fs::create_dir_all(&project_dir);
    let project_dir = project_dir
        .to_str()
        .expect("temp compose smoke path must be valid UTF-8");

    for id in common::compose_preset_ids_from_shared() {
        let dir = compose_root.join(&id);
        let mut cmd = Command::new("docker");
        cmd.args(["compose", "-f", "docker-compose.yml", "config", "--quiet"]);
        cmd.current_dir(&dir);
        cmd.env("PROJECT_DIR", project_dir);
        let output = cmd.output().expect("docker compose config");
        assert!(
            output.status.success(),
            "docker compose config failed for {id}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
