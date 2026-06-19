mod common;

use std::process::Command;

#[test]
fn git_version_smoke() {
    if !common::git_available() {
        eprintln!("Skipping test: git not available on PATH");
        return;
    }

    let output = Command::new("git")
        .arg("--version")
        .output()
        .expect("git --version");
    assert!(output.status.success());
}

#[test]
fn git_status_on_checkout_smoke() {
    if !common::git_available() {
        eprintln!("Skipping test: git not available on PATH");
        return;
    }

    let repo = common::repo_root();
    let output = Command::new("git")
        .current_dir(&repo)
        .args(["status", "--porcelain=v1", "-b"])
        .output()
        .expect("git status");
    assert!(
        output.status.success(),
        "git status failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.starts_with("## "),
        "expected branch header in porcelain -b output"
    );
}

#[test]
fn git_rev_parse_smoke() {
    if !common::git_available() {
        eprintln!("Skipping test: git not available on PATH");
        return;
    }

    let repo = common::repo_root();
    let output = Command::new("git")
        .current_dir(&repo)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .expect("git rev-parse");
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "true",
        "expected inside work tree"
    );
}

#[test]
fn git_config_list_smoke() {
    if !common::git_available() {
        eprintln!("Skipping test: git not available on PATH");
        return;
    }

    let repo = common::repo_root();
    let output = Command::new("git")
        .current_dir(&repo)
        .args(["config", "--list", "--local"])
        .output()
        .expect("git config --list --local");
    assert!(
        output.status.success(),
        "git config --local failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}
