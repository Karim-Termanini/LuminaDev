use serde_json::{json, Value};

use crate::host_exec::{
    cmd_timeout_long, cmd_timeout_ssh, exec_output, exec_output_limit,
    exec_result_limit, exec_sshpass_ssh, get_global_ipc_timeout,
};


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
    } else {
        let port_str = port.to_string();
        let remote = format!("{}@{}", user, host_str);
        let safe_key = public_key.replace('\'', r"'\''");
        // Wrap in `bash -c '...'` so it works regardless of the remote user's
        // login shell (fish, zsh, dash, etc. all accept this invocation).
        // Key is double-quoted inside the single-quoted bash string; SSH public
        // keys never contain `"` so this is safe.
        let setup_cmd = format!(
            concat!(
                "bash -c '",
                "mkdir -p ~/.ssh && ",
                "touch ~/.ssh/authorized_keys && ",
                "chmod 700 ~/.ssh && ",
                "grep -qF \"{key}\" ~/.ssh/authorized_keys || ",
                "printf \"%s\\n\" \"{key}\" >> ~/.ssh/authorized_keys && ",
                "chmod 600 ~/.ssh/authorized_keys",
                "'"
            ),
            key = safe_key
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
