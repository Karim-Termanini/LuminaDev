use serde_json::{json, Value};

use crate::host_exec::{
    cmd_timeout_long, cmd_timeout_ssh, exec_output, exec_output_limit,
    exec_result_limit, exec_sshpass_ssh, get_global_ipc_timeout,
};

/// Embed `s` as a single-quoted bash word inside an outer `bash -c '…'` script.
/// Prevents `$()`, backticks, and `"` in `s` from being interpreted by the remote shell.
fn bash_sq_word_in_c(s: &str) -> String {
    format!("'\"'\"'{}'\"'\"'", s.replace('\'', "'\"'\"'"))
}

fn validate_ssh_public_key_line(key: &str) -> Result<&str, &'static str> {
    let key = key.trim();
    if key.is_empty() || key.bytes().any(|b| b == b'\n' || b == b'\r') {
        return Err("empty or multiline");
    }
    if key.chars().any(|c| matches!(c, '$' | '`' | '"' | '\0')) {
        return Err("shell metacharacters");
    }
    let key_type = key.split_whitespace().next().unwrap_or("");
    if !matches!(
        key_type,
        "ssh-ed25519"
            | "ssh-rsa"
            | "ssh-dss"
            | "ecdsa-sha2-nistp256"
            | "ecdsa-sha2-nistp384"
            | "ecdsa-sha2-nistp521"
            | "sk-ssh-ed25519@openssh.com"
            | "sk-ecdsa-sha2-nistp256@openssh.com"
    ) {
        return Err("unsupported key type");
    }
    if key.split_whitespace().count() < 2 {
        return Err("malformed key");
    }
    Ok(key)
}


// ---------------------------------------------------------------------------
// SSH handlers
// ---------------------------------------------------------------------------

pub(crate) async fn handle_ssh_generate(body: &Value) -> Value {
    let email = body
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("lumina@local");
    let key_name = body
        .get("keyName")
        .and_then(|v| v.as_str())
        .unwrap_or("id_ed25519");
    let safe_name: String = key_name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let ssh_dir = format!("{}/.ssh", home);
    let _ = std::fs::create_dir_all(&ssh_dir);

    for attempt in 0..20u32 {
        let candidate = if attempt == 0 {
            safe_name.clone()
        } else {
            format!("{}_{}", safe_name, attempt + 1)
        };
        let key_path = format!("{}/{}", ssh_dir, candidate);
        let pub_path = format!("{}.pub", key_path);
        if std::path::Path::new(&key_path).exists() {
            if std::path::Path::new(&pub_path).exists() {
                return json!({ "ok": true, "keyName": candidate });
            }
            continue;
        }
        match exec_output(
            "ssh-keygen",
            &["-t", "ed25519", "-C", email, "-f", &key_path, "-N", ""],
        )
        .await
        {
            Ok(_) => return json!({ "ok": true, "keyName": candidate }),
            Err(e) => {
                let msg = e.trim();
                if msg.contains("exists") || msg.contains("File exists") {
                    continue;
                }
                return json!({ "ok": false, "error": format!("[SSH_GENERATE_FAILED] {}", msg) });
            }
        }
    }

    json!({ "ok": false, "error": "[SSH_GENERATE_FAILED] No unused key filename available." })
}

pub(crate) async fn handle_ssh_get_pub() -> Value {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let pub_path = format!("{}/.ssh/id_ed25519.pub", home);
    match std::fs::read_to_string(&pub_path) {
        Ok(pubkey) => {
            let fingerprint = exec_output("ssh-keygen", &["-lf", &pub_path])
                .await
                .unwrap_or_default();
            json!({ "ok": true, "pub": pubkey.trim(), "fingerprint": fingerprint.trim() })
        }
        Err(_) => {
            json!({ "ok": false, "pub": "", "fingerprint": "", "error": "[SSH_NO_KEY] Missing public key." })
        }
    }
}

pub(crate) async fn handle_ssh_test_github() -> Value {
    match exec_result_limit("ssh", &["-T", "git@github.com"], get_global_ipc_timeout()).await {
        Ok((stdout, stderr)) => {
            json!({ "ok": true, "output": format!("{}{}", stdout, stderr), "code": 0 })
        }
        Err(e) => json!({ "ok": true, "output": e, "code": 1 }),
    }
}

pub(crate) async fn handle_ssh_list_dir(body: &Value) -> Value {
    let user = body
        .get("user")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let host_str = body
        .get("host")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let port = body.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
    let remote_path = body
        .get("remotePath")
        .and_then(|v| v.as_str())
        .unwrap_or(".");
    let remote = format!("{}@{}", user, host_str);
    let port_str = port.to_string();
    let ls_cmd = format!("ls -aF1 '{}'", remote_path.replace('\'', r"'\''"));
    match exec_result_limit(
        "ssh",
        &[
            "-o",
            "StrictHostKeyChecking=no",
            "-p",
            &port_str,
            &remote,
            &ls_cmd,
        ],
        cmd_timeout_ssh(),
    )
    .await
    {
        Ok((stdout, _)) => {
            let entries: Vec<&str> = stdout.lines().filter(|l| !l.is_empty()).collect();
            json!({ "ok": true, "entries": entries })
        }
        Err(e) => {
            json!({ "ok": false, "entries": [], "error": format!("[SSH_LIST_DIR_FAILED] {}", e.trim()) })
        }
    }
}

pub(crate) async fn handle_ssh_setup_remote_key(body: &Value) -> Value {
    let user = body
        .get("user")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let host_str = body
        .get("host")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let port = body.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
    let password = body
        .get("password")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let public_key = body
        .get("publicKey")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if public_key.is_empty() {
        json!({ "ok": false, "error": "[SSH_SETUP_KEY_FAILED] Missing public key." })
    } else if let Err(reason) = validate_ssh_public_key_line(public_key) {
        json!({
            "ok": false,
            "error": format!("[SSH_SETUP_KEY_FAILED] Invalid public key: {reason}.")
        })
    } else {
        let public_key = public_key.trim();
        let port_str = port.to_string();
        let remote = format!("{}@{}", user, host_str);
        let key_word = bash_sq_word_in_c(public_key);
        // Remote login shell may be fish/zsh/dash; run a bash script with the key
        // embedded as single-quoted literals (no double quotes → no $(…) expansion).
        let setup_cmd = format!(
            concat!(
                "bash -c '",
                "mkdir -p ~/.ssh && ",
                "touch ~/.ssh/authorized_keys && ",
                "chmod 700 ~/.ssh && ",
                "grep -qF -- {key} ~/.ssh/authorized_keys || ",
                "printf %s\\\\n {key} >> ~/.ssh/authorized_keys && ",
                "chmod 600 ~/.ssh/authorized_keys",
                "'"
            ),
            key = key_word
        );
        let result = if !password.is_empty() {
            exec_sshpass_ssh(password, &port_str, &remote, &setup_cmd, cmd_timeout_ssh()).await
        } else {
            exec_result_limit(
                "ssh",
                &[
                    "-o",
                    "StrictHostKeyChecking=no",
                    "-p",
                    &port_str,
                    &remote,
                    &setup_cmd,
                ],
                cmd_timeout_ssh(),
            )
            .await
        };
        match result {
            Ok(_) => json!({ "ok": true }),
            Err(e) => {
                json!({ "ok": false, "error": format!("[SSH_SETUP_KEY_FAILED] {}", e.trim()) })
            }
        }
    }
}

pub(crate) async fn handle_ssh_enable_local() -> Value {
    // Use pkexec so the desktop shows a native polkit password dialog.
    // We write a small helper script, run it elevated, then clean up.
    let script = concat!(
        "#!/bin/sh\n",
        "# Enable SSH daemon (Fedora: sshd, Debian/Ubuntu: ssh)\n",
        "systemctl enable --now sshd 2>/dev/null || systemctl enable --now ssh\n",
        "# Open firewall\n",
        "if command -v firewall-cmd > /dev/null 2>&1; then\n",
        "  firewall-cmd --add-service=ssh --permanent && firewall-cmd --reload\n",
        "elif command -v ufw > /dev/null 2>&1; then\n",
        "  ufw allow ssh\n",
        "fi\n",
    );

    let tmp_path = std::env::temp_dir().join("lumina-ssh-enable.sh");
    if let Err(e) = std::fs::write(&tmp_path, script) {
        return json!({ "ok": false, "log": "", "error": format!("[SSH_ENABLE_LOCAL_FAILED] {}", e) });
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp_path, std::fs::Permissions::from_mode(0o755));
    }

    let script_str = tmp_path.to_string_lossy().to_string();
    // cmd_timeout_long() gives the user enough time to interact with the polkit dialog
    let result = exec_output_limit("pkexec", &[&script_str], cmd_timeout_long()).await;
    let _ = std::fs::remove_file(&tmp_path);

    match result {
        Ok(out) => {
            let log = format!(
                "✓ SSH daemon enabled\n✓ Firewall configured\n{}",
                out.trim()
            );
            json!({ "ok": true, "log": log.trim_end() })
        }
        Err(e) => {
            let msg = e.trim().to_string();
            // pkexec exit 126 = user dismissed the dialog (cancelled)
            let cancelled =
                msg.contains("126") || msg.to_lowercase().contains("cancel") || msg.is_empty();
            if cancelled {
                json!({ "ok": false, "log": "✗ Cancelled by user", "error": "[SSH_ENABLE_LOCAL_FAILED] Authentication cancelled." })
            } else {
                json!({ "ok": false, "log": format!("✗ {}", msg), "error": format!("[SSH_ENABLE_LOCAL_FAILED] {}", msg) })
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Monitor handlers
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{bash_sq_word_in_c, validate_ssh_public_key_line};

    #[test]
    fn bash_sq_word_in_c_neutralizes_command_substitution() {
        let key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample lumina@local";
        let word = bash_sq_word_in_c(key);
        let script = format!("bash -c 'grep -qF -- {word} ~/.ssh/authorized_keys'");
        assert!(script.contains("'\"'\"'"));
        assert!(!script.contains("\"{"));
    }

    #[test]
    fn validate_ssh_public_key_rejects_shell_metacharacters() {
        assert!(validate_ssh_public_key_line("ssh-ed25519 AAA$(x) u@h").is_err());
        assert!(validate_ssh_public_key_line("ssh-ed25519 AAA`id` u@h").is_err());
    }

    #[test]
    fn validate_ssh_public_key_accepts_ed25519_line() {
        let key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample lumina@local";
        assert_eq!(validate_ssh_public_key_line(key), Ok(key));
    }
}
