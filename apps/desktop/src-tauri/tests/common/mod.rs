//! Shared helpers for `tests/*_smoke.rs` integration crates.
#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

/// Monorepo root (`LuminaDev/`) from `apps/desktop/src-tauri`.
pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.."))
}

pub fn cmd_output(program: &str, args: &[&str]) -> Option<Output> {
    Command::new(program).args(args).output().ok()
}

pub fn cmd_ok(program: &str, args: &[&str]) -> bool {
    cmd_output(program, args)
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Preset ids from `packages/shared/src/composeProfiles.ts` (must stay aligned with Zod).
pub fn compose_preset_ids_from_shared() -> Vec<String> {
    const TS: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../packages/shared/src/composeProfiles.ts"
    ));
    let mut in_array = false;
    let mut ids = Vec::new();
    for line in TS.lines() {
        let t = line.trim();
        if t.starts_with("export const COMPOSE_PROFILES") {
            in_array = true;
            continue;
        }
        if !in_array {
            continue;
        }
        if t.starts_with(']') {
            break;
        }
        if let Some(q) = t.strip_prefix('\'').and_then(|rest| rest.split('\'').next()) {
            if !q.is_empty() {
                ids.push(q.to_string());
            }
        }
    }
    ids
}

pub fn docker_available() -> bool {
    cmd_ok("docker", &["--version"])
}

pub fn docker_daemon_available() -> bool {
    cmd_ok("docker", &["info"])
}

pub fn git_available() -> bool {
    cmd_ok("git", &["--version"])
}

pub fn on_linux() -> bool {
    Path::new("/proc/meminfo").exists()
}
