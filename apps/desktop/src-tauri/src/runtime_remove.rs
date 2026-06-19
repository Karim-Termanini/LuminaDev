use super::*;
use crate::host_exec::{cmd_timeout_short, exec_output_limit};
use crate::runtime_packages::{
    runtime_preview_blocked_shared_deps_for_runtime, runtime_preview_removable_deps,
    runtime_read_host_distro, runtime_system_packages, NVM_BASH_RESOLVE,
};
use crate::runtime_paths::{
    lumina_version_dir_from_path, mise_install_version_from_path, nvm_node_tag_from_path,
    nvm_version_dir_from_path, path_segment_after_marker,
};

const PYENV_MARKER: &str = "/.pyenv/versions/";
const RUSTUP_MARKER: &str = "/.rustup/toolchains/";
pub(crate) async fn handle_runtime_uninstall_preview(body: &Value) -> Value {
    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or("node");
    let remove_mode = body
        .get("removeMode")
        .and_then(|v| v.as_str())
        .unwrap_or("runtime_only");
    let (distro, pkg_mgr_owned) = runtime_read_host_distro();
    let pkg_mgr = pkg_mgr_owned.as_str();
    let pkgs = runtime_system_packages(runtime_id, pkg_mgr);

    let mut pkg_vals: Vec<Value> = pkgs.iter().map(|p| json!(p)).collect();
    let mut note: String;

    match runtime_id {
        "rust" => {
            note = "Rust is managed by rustup. This will run 'rustup self uninstall'.".to_string();
            pkg_vals = vec![json!("rustup")];
        }
        "dotnet" if pkg_mgr == "pacman" => {
            note = "On Arch, .NET was installed via Microsoft's install script to ~/.dotnet. Remove that directory manually or run: rm -rf ~/.dotnet".to_string();
            pkg_vals = vec![json!("~/.dotnet (directory)")];
        }
        _ if pkgs.is_empty() => {
            note = format!("No system packages found for {}. If installed via a version manager, remove it manually.", runtime_id);
        }
        _ => {
            note = format!(
                "Will remove {} system package(s) using {}.",
                pkg_vals.len(),
                pkg_mgr
            );
        }
    }

    if remove_mode == "runtime_and_deps" {
        if pkg_vals.is_empty() {
            note = format!("{} No additional package-managed cleanup candidates were detected for this runtime.", note);
        } else if runtime_id != "rust" {
            note = format!(
                "{} Package manager autoremove may also clean unused dependencies on this distro.",
                note
            );
        } else {
            note = format!(
                "{} Remove + deps mode is not applicable to this runtime.",
                note
            );
        }
    }

    let uses_pkg_mgr = runtime_id != "rust";
    let removable_deps: Vec<Value> =
        if remove_mode == "runtime_and_deps" && uses_pkg_mgr && !pkgs.is_empty() {
            let pkg_strs: Vec<&str> = pkgs.to_vec();
            runtime_preview_removable_deps(pkg_mgr, &pkg_strs)
                .await
                .into_iter()
                .map(|p| json!(p))
                .collect()
        } else {
            vec![]
        };

    let removable_dep_names: Vec<String> = removable_deps
        .iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .collect();
    let blocked_shared_deps: Vec<Value> =
        if remove_mode == "runtime_and_deps" && uses_pkg_mgr && !pkgs.is_empty() {
            let pkg_strs: Vec<&str> = pkgs.to_vec();
            runtime_preview_blocked_shared_deps_for_runtime(
                pkg_mgr,
                &pkg_strs,
                &removable_dep_names,
            )
            .await
            .into_iter()
            .map(|p| json!(p))
            .collect()
        } else {
            vec![]
        };

    let mut final_pkgs = pkg_vals.clone();
    for d in &removable_deps {
        if !final_pkgs.contains(d) {
            final_pkgs.push(d.clone());
        }
    }

    json!({
        "ok": true,
        "distro": distro,
        "runtimePackages": pkg_vals,
        "removableDeps": removable_deps,
        "blockedSharedDeps": blocked_shared_deps,
        "finalPackages": final_pkgs,
        "note": note
    })
}

pub(crate) async fn handle_runtime_remove_version(body: &Value) -> Value {
    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let version = body
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    let path_str = body
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim();
    if runtime_id.is_empty() || path_str.is_empty() {
        return json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] runtimeId and path required." });
    }


    use crate::runtime_paths::NVM_NODE_MARKERS;

    if NVM_NODE_MARKERS.iter().any(|m| path_str.contains(m)) {
        let tag = nvm_node_tag_from_path(path_str).unwrap_or_else(|| version.clone());
        if tag.is_empty() {
            return json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not determine nvm version tag." });
        }
        let cmd = format!(
            r#"{NVM_BASH_RESOLVE}
. "$NVM_DIR/nvm.sh"
nvm uninstall '{tag}' 2>&1"#,
            NVM_BASH_RESOLVE = NVM_BASH_RESOLVE,
            tag = tag.replace('\'', "'\\''")
        );
        if exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short())
            .await
            .is_ok()
        {
            return json!({ "ok": true });
        }
        if let Some(dir) = nvm_version_dir_from_path(path_str) {
            if dir.is_dir() {
                return match std::fs::remove_dir_all(&dir) {
                    Ok(_) => json!({ "ok": true }),
                    Err(e) => json!({
                        "ok": false,
                        "error": format!("[REMOVE_VERSION_FAILED] could not remove {}: {}", dir.display(), e)
                    }),
                };
            }
        }
        return json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] nvm uninstall failed and version directory was not found." });
    }

    if path_str.contains(PYENV_MARKER) {
        let pyenv_version =
            path_segment_after_marker(path_str, PYENV_MARKER).unwrap_or_else(|| version.clone());
        if pyenv_version.is_empty() {
            return json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not determine pyenv version." });
        }
        let cmd = format!(
            r#"export PYENV_ROOT="$HOME/.pyenv"; export PATH="$PYENV_ROOT/bin:$PATH"; eval "$(pyenv init -)" 2>/dev/null; pyenv uninstall -f '{}' 2>&1"#,
            pyenv_version.replace('\'', "'\\''")
        );
        return match exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short()).await {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] pyenv uninstall: {}", e.trim()) }),
        };
    }

    if path_str.contains(RUSTUP_MARKER) {
        let toolchain =
            path_segment_after_marker(path_str, RUSTUP_MARKER).unwrap_or_else(|| version.clone());
        if toolchain.is_empty() {
            return json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not determine rustup toolchain name." });
        }
        let cmd = format!(
            "export PATH=\"$HOME/.cargo/bin:$PATH\"; rustup toolchain remove '{}' 2>&1",
            toolchain.replace('\'', "'\\''")
        );
        return match exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short()).await {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] rustup toolchain remove: {}", e.trim()) }),
        };
    }

    let lumina_marker = format!("/.local/share/lumina/{}/", runtime_id);
    if path_str.contains(&lumina_marker) {
        if let Some(dir) = lumina_version_dir_from_path(path_str, runtime_id) {
            if dir.is_dir() {
                return match std::fs::remove_dir_all(&dir) {
                    Ok(_) => json!({ "ok": true }),
                    Err(e) => json!({
                        "ok": false,
                        "error": format!("[REMOVE_VERSION_FAILED] rm -rf: {}", e)
                    }),
                };
            }
        }
        return json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not resolve version directory." });
    }

    let mise_marker = format!("/.local/share/mise/installs/{}/", runtime_id);
    if path_str.contains(&mise_marker) || runtime_id == "php" {
        let mise_version = mise_install_version_from_path(path_str, runtime_id)
            .or_else(|| path_segment_after_marker(path_str, &mise_marker))
            .unwrap_or_else(|| version.clone());
        if mise_version.is_empty() {
            return json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] version required for mise-managed runtime." });
        }
        let cmd = format!(
            r#"MISE=$(command -v mise 2>/dev/null || echo "$HOME/.local/bin/mise"); export PATH="$HOME/.local/bin:$PATH"; "$MISE" uninstall {}@'{}' 2>&1"#,
            runtime_id,
            mise_version.replace('\'', "'\\''")
        );
        return match exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short()).await {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] mise uninstall: {}", e.trim()) }),
        };
    }

    json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] path is not in a recognised version manager directory (lumina / nvm / pyenv / rustup / mise)." })
}
