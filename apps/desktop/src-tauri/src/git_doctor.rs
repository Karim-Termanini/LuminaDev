//! Git Doctor — system-level Git environment diagnostics.
//!
//! Runs health checks on the host Git installation: version, global config,
//! GPG/SSH keys, credential safety, hooks, and LFS. Returns structured findings
//! with severity levels and fix actions that the renderer can render as
//! premium Dev Home-style diagnostic cards.

use serde_json::{json, Value};

use crate::host_exec::exec_output;

// ---------------------------------------------------------------------------
// Finding model
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct Finding {
    id: String,
    category: String,
    severity: String,
    title: String,
    detail: String,
    fix_label: Option<String>,
    fix_action: Option<String>,
}

impl Finding {
    fn into_value(self) -> Value {
        let mut m = json!({
            "id": self.id,
            "category": self.category,
            "severity": self.severity,
            "title": self.title,
            "detail": self.detail,
        });
        if let Some(label) = self.fix_label {
            m["fix"] = json!({ "label": label });
            if let Some(action) = self.fix_action {
                m["fix"]["action"] = json!(action);
            }
        }
        m
    }
}

fn ok(title: &str, detail: &str) -> Finding {
    Finding {
        id: format!("ok-{}", title.to_lowercase().replace(' ', "-")),
        category: "overview".into(),
        severity: "ok".into(),
        title: title.into(),
        detail: detail.into(),
        fix_label: None,
        fix_action: None,
    }
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/// Check 1: Git binary + version
async fn check_git_version() -> (Option<String>, Vec<Finding>) {
    match exec_output("git", &["--version"]).await {
        Ok(out) => {
            let version = out.trim().to_string();
            let findings = vec![ok("Git installed", &format!("Version: {version}"))];
            (Some(version), findings)
        }
        Err(_) => {
            let f = Finding {
                id: "no-git".into(),
                category: "environment".into(),
                severity: "critical".into(),
                title: "Git is not installed".into(),
                detail: "Git is required for all version control operations. Install it via your package manager.".into(),
                fix_label: None,
                fix_action: None,
            };
            (None, vec![f])
        }
    }
}

/// Check 2: Global config essentials
async fn check_config() -> Vec<Finding> {
    let mut findings = Vec::new();
    let raw = exec_output("git", &["config", "--global", "--list"])
        .await
        .unwrap_or_default();
    let cfg: std::collections::HashMap<String, String> = raw
        .lines()
        .filter_map(|line| {
            let idx = line.find('=')?;
            Some((line[..idx].to_lowercase(), line[idx + 1..].to_string()))
        })
        .collect();

    // Identity
    if cfg.get("user.name").is_none_or(|v| v.trim().is_empty()) {
        findings.push(Finding {
            id: "no-name".into(),
            category: "configuration".into(),
            severity: "critical".into(),
            title: "No user name configured".into(),
            detail: "Every commit requires an author name. Set it in the Identity tab.".into(),
            fix_label: None,
            fix_action: None,
        });
    }
    if cfg.get("user.email").is_none_or(|v| v.trim().is_empty()) {
        findings.push(Finding {
            id: "no-email".into(),
            category: "configuration".into(),
            severity: "critical".into(),
            title: "No email configured".into(),
            detail: "Git attaches email to every commit. Required for push to GitHub/GitLab."
                .into(),
            fix_label: None,
            fix_action: None,
        });
    } else if let Some(email) = cfg.get("user.email") {
        if !email.contains('@') || !email.contains('.') {
            findings.push(Finding {
                id: "bad-email".into(),
                category: "configuration".into(),
                severity: "warning".into(),
                title: "Email format looks invalid".into(),
                detail: format!("Current value: \"{email}\""),
                fix_label: None,
                fix_action: None,
            });
        }
    }

    // Default branch
    if !cfg.contains_key("init.defaultbranch") {
        findings.push(Finding {
            id: "no-branch".into(),
            category: "configuration".into(),
            severity: "warning".into(),
            title: "No default branch set".into(),
            detail: "New repos will use Git's built-in default (often \"master\"). Set to \"main\" for modern convention.".into(),
            fix_label: Some("Set to main".into()),
            fix_action: Some("git-config-set".into()),
        });
    }

    findings
}

/// Check 3: Credential helper safety
async fn check_credentials() -> Vec<Finding> {
    let mut findings = Vec::new();
    let raw = exec_output("git", &["config", "--global", "--list"])
        .await
        .unwrap_or_default();
    let helper_line = raw.lines().find(|l| l.starts_with("credential.helper="));

    match helper_line {
        None => {
            findings.push(Finding {
                id: "no-cred".into(),
                category: "security".into(),
                severity: "critical".into(),
                title: "No credential helper".into(),
                detail: "Git will prompt for password on every push/pull. Set a helper to cache credentials.".into(),
                fix_label: Some("Use cache".into()),
                fix_action: Some("set-credential-cache".into()),
            });
        }
        Some(line) => {
            let val = line.split_once('=').map(|x| x.1).unwrap_or("");
            if val.contains("store") && !val.contains("secretservice") && !val.contains("libsecret")
            {
                findings.push(Finding {
                    id: "plaintext-cred".into(),
                    category: "security".into(),
                    severity: "warning".into(),
                    title: "Credentials stored in plaintext".into(),
                    detail: "credential.helper=store writes passwords to ~/.git-credentials unencrypted. Use libsecret or a platform manager instead.".into(),
                    fix_label: Some("Switch to cache".into()),
                    fix_action: Some("set-credential-cache".into()),
                });
            } else if val.contains("libsecret")
                || val.contains("secretservice")
                || val.contains("manager-core")
            {
                findings.push(ok(
                    "Credential storage",
                    "Using a secure credential manager — credentials are encrypted.",
                ));
            }
        }
    }

    findings
}

/// Check 4: SSL verification
async fn check_ssl() -> Vec<Finding> {
    match exec_output("git", &["config", "--global", "http.sslverify"]).await {
        Ok(val) if val.trim() == "false" => {
            vec![Finding {
                id: "no-ssl".into(),
                category: "security".into(),
                severity: "critical".into(),
                title: "SSL verification disabled".into(),
                detail: "http.sslverify=false exposes connections to man-in-the-middle attacks."
                    .into(),
                fix_label: Some("Re-enable".into()),
                fix_action: Some("enable-ssl".into()),
            }]
        }
        _ => vec![ok(
            "SSL verification",
            "SSL certificate verification is enabled — connections are protected.",
        )],
    }
}

/// Check 5: GPG key availability
async fn check_gpg() -> Vec<Finding> {
    let signing = exec_output("git", &["config", "--global", "commit.gpgsign"]).await;
    let gpg_keys = exec_output("gpg", &["--list-secret-keys", "--keyid-format=long"]).await;

    let mut findings = Vec::new();

    match gpg_keys {
        Ok(out) if out.contains("sec") => {
            findings.push(ok(
                "GPG keys available",
                "Secret GPG keys found — you can sign commits.",
            ));
            if signing.map_or(true, |v| v.trim() != "true") {
                findings.push(Finding {
                    id: "gpg-not-enabled".into(),
                    category: "security".into(),
                    severity: "warning".into(),
                    title: "Commit signing not enabled".into(),
                    detail: "You have GPG keys but commit signing is off. Enable it to cryptographically verify your commits.".into(),
                    fix_label: Some("Enable signing".into()),
                    fix_action: Some("enable-gpg-sign".into()),
                });
            }
        }
        Ok(_) => {
            findings.push(Finding {
                id: "no-gpg".into(),
                category: "security".into(),
                severity: "warning".into(),
                title: "No GPG secret keys found".into(),
                detail: "Without a GPG key, you cannot sign commits. Generate one with: gpg --full-generate-key".into(),
                fix_label: None,
                fix_action: None,
            });
        }
        Err(_) => {
            findings.push(Finding {
                id: "no-gpg-bin".into(),
                category: "security".into(),
                severity: "info".into(),
                title: "GPG not installed".into(),
                detail: "GPG is not available on this system. Install gnupg to sign commits."
                    .into(),
                fix_label: None,
                fix_action: None,
            });
        }
    }

    findings
}

/// Check 6: SSH keys
async fn check_ssh() -> Vec<Finding> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
    let ssh_dir = std::path::Path::new(&home).join(".ssh");

    let has_keys = match std::fs::read_dir(&ssh_dir) {
        Ok(entries) => entries.filter_map(|e| e.ok()).any(|e| {
            e.file_name()
                .to_str()
                .map(|n| n.starts_with("id_") && !n.ends_with(".pub"))
                .unwrap_or(false)
        }),
        Err(_) => false,
    };

    if !has_keys {
        vec![Finding {
            id: "no-ssh".into(),
            category: "security".into(),
            severity: "warning".into(),
            title: "No SSH keys found in ~/.ssh".into(),
            detail: "SSH keys are needed for passwordless Git operations and remote server access. Generate one with ssh-keygen.".into(),
            fix_label: None,
            fix_action: None,
        }]
    } else {
        let key_list: Vec<String> = std::fs::read_dir(&ssh_dir)
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_str()
                    .map(|n| n.starts_with("id_") && !n.ends_with(".pub"))
                    .unwrap_or(false)
            })
            .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
            .collect();
        if key_list.is_empty() {
            vec![Finding {
                id: "only-pub-keys".into(),
                category: "security".into(),
                severity: "info".into(),
                title: "Only public keys found".into(),
                detail: "Public keys exist but no corresponding private keys in ~/.ssh. You cannot authenticate without a private key.".into(),
                fix_label: None,
                fix_action: None,
            }]
        } else {
            vec![ok(
                "SSH keys present",
                &format!("{} private key(s) found in ~/.ssh", key_list.len()),
            )]
        }
    }
}

/// Check 7: Git LFS
async fn check_lfs() -> Vec<Finding> {
    if exec_output("git-lfs", &["version"]).await.is_ok() {
        let configured = exec_output("git", &["config", "--global", "filter.lfs.clean"])
            .await
            .is_ok();
        if configured {
            vec![ok(
                "Git LFS",
                "Git LFS is installed and configured globally.",
            )]
        } else {
            vec![Finding {
                id: "lfs-not-configured".into(),
                category: "performance".into(),
                severity: "info".into(),
                title: "Git LFS installed but not configured globally".into(),
                detail: "Run `git lfs install` to enable LFS globally for large file handling."
                    .into(),
                fix_label: None,
                fix_action: None,
            }]
        }
    } else {
        vec![] // LFS is optional — no finding
    }
}

/// Check 8: Performance settings
async fn check_performance() -> Vec<Finding> {
    let mut findings = Vec::new();
    let raw = exec_output("git", &["config", "--global", "--list"])
        .await
        .unwrap_or_default();
    let cfg: std::collections::HashMap<String, String> = raw
        .lines()
        .filter_map(|line| {
            let idx = line.find('=')?;
            Some((line[..idx].to_lowercase(), line[idx + 1..].to_string()))
        })
        .collect();

    if cfg.get("core.preloadindex").is_none_or(|v| v != "true") {
        findings.push(Finding {
            id: "no-preload".into(),
            category: "performance".into(),
            severity: "info".into(),
            title: "core.preloadindex not enabled".into(),
            detail: "Parallelizes stat calls during git status — faster on large repos.".into(),
            fix_label: Some("Enable".into()),
            fix_action: Some("enable-preload".into()),
        });
    }
    if cfg.get("fetch.prune").is_none_or(|v| v != "true") {
        findings.push(Finding {
            id: "no-prune".into(),
            category: "performance".into(),
            severity: "info".into(),
            title: "fetch.prune not enabled".into(),
            detail: "Stale remote-tracking branches accumulate. Enable auto-prune on fetch.".into(),
            fix_label: Some("Enable".into()),
            fix_action: Some("enable-prune".into()),
        });
    }

    findings
}

/// Check 9: Core hooks directory
async fn check_hooks() -> Vec<Finding> {
    let _home = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
    let hooks_dir = exec_output("git", &["config", "--global", "core.hookspath"])
        .await
        .unwrap_or_default();

    if hooks_dir.trim().is_empty() {
        vec![ok(
            "Git hooks",
            "Using default hooks directory — no global override set.",
        )]
    } else {
        let exists = std::path::Path::new(hooks_dir.trim()).exists();
        if exists {
            vec![ok(
                "Git hooks",
                &format!("Custom hooks directory configured: {}", hooks_dir.trim()),
            )]
        } else {
            vec![Finding {
                id: "hooks-missing".into(),
                category: "environment".into(),
                severity: "warning".into(),
                title: "Custom hooks directory does not exist".into(),
                detail: format!(
                    "core.hookspath is set to \"{}\" but the directory is missing.",
                    hooks_dir.trim()
                ),
                fix_label: None,
                fix_action: None,
            }]
        }
    }
}

// ---------------------------------------------------------------------------
// Health score calculation
// ---------------------------------------------------------------------------

fn calc_score(findings: &[Finding]) -> u32 {
    let total = findings.iter().filter(|f| f.severity != "ok").count() as u32;
    let crit = findings.iter().filter(|f| f.severity == "critical").count() as u32;
    let warn = findings.iter().filter(|f| f.severity == "warning").count() as u32;
    let info = findings.iter().filter(|f| f.severity == "info").count() as u32;

    if total == 0 {
        return 100;
    }
    let penalty = crit * 25 + warn * 12 + info * 5;
    100u32.saturating_sub(penalty).max(5)
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_doctor_scan() -> Value {
    // Get git version first (needed for version badge), then run all checks in parallel
    let (git_version, mut findings) = check_git_version().await;

    // If Git is not available, skip config-dependent checks to avoid noise
    if git_version.is_none() {
        // Still run non-git checks: SSH, GPG
        let (gpg, ssh) = tokio::join!(check_gpg(), check_ssh());
        findings.extend(gpg);
        findings.extend(ssh);
    } else {
        let (config, creds, ssl, gpg, ssh, lfs, perf, hooks) = tokio::join!(
            check_config(),
            check_credentials(),
            check_ssl(),
            check_gpg(),
            check_ssh(),
            check_lfs(),
            check_performance(),
            check_hooks(),
        );
        findings.extend(config);
        findings.extend(creds);
        findings.extend(ssl);
        findings.extend(gpg);
        findings.extend(ssh);
        findings.extend(lfs);
        findings.extend(perf);
        findings.extend(hooks);
    }

    let score = calc_score(&findings);
    let findings_json: Vec<Value> = findings.into_iter().map(|f| f.into_value()).collect();

    json!({
        "ok": true,
        "gitVersion": git_version,
        "healthScore": score,
        "findings": findings_json,
    })
}
