mod common;

use std::process::Command;

use tempfile::TempDir;

#[test]
fn ssh_keygen_version_smoke() {
    let output = Command::new("ssh-keygen").arg("-V").output();
    let Ok(output) = output else {
        eprintln!("Skipping test: ssh-keygen not available");
        return;
    };
    // OpenSSH prints version to stderr for `-V`.
    assert!(
        !output.stderr.is_empty() || !output.stdout.is_empty(),
        "expected ssh-keygen version output"
    );
}

#[test]
fn ssh_keygen_ed25519_roundtrip_smoke() {
    let version = Command::new("ssh-keygen").arg("-V").output();
    if version.is_err() {
        eprintln!("Skipping test: ssh-keygen not available");
        return;
    }

    let dir = TempDir::new().expect("tempdir");
    let key_path = dir.path().join("lumina-smoke-key");
    let key_str = key_path.to_str().expect("utf8 path");

    let output = Command::new("ssh-keygen")
        .args(["-t", "ed25519", "-f", key_str, "-N", "", "-q"])
        .output()
        .expect("ssh-keygen");
    assert!(
        output.status.success(),
        "ssh-keygen failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let pub_path = key_path.with_extension("pub");
    assert!(pub_path.is_file(), "expected .pub file");
    let pub_line = std::fs::read_to_string(&pub_path).expect("read pubkey");
    assert!(
        pub_line.starts_with("ssh-ed25519 "),
        "unexpected pubkey format: {pub_line}"
    );
}
