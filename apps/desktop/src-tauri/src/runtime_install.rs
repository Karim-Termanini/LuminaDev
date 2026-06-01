use super::*;
use crate::runtime_packages::pkg_remove_with_deps_cmd;

// Explicit imports for extracted handler functions (also available via use super::*)
use crate::host_exec::{
    cmd_timeout_short, exec_output_limit,
    get_global_daemon_auto_restart, get_global_thread_pool_size,
};
use crate::runtime_packages::{
    runtime_dnf_java_alternatives_cmd, runtime_java_system_packages_for_version, runtime_read_host_distro,
    runtime_system_packages,
};
use crate::runtime_paths::{
    java_home_from_binary, validate_java_binary_path,
};
use std::path::Path;

// Must match `RUNTIME_SYSTEM_ONLY_IDS` in packages/shared/src/runtimes.ts
const SYSTEM_ONLY_RUNTIMES: &[&str] = &["php"];

fn runtime_supports_local_install(runtime_id: &str) -> bool {
    !SYSTEM_ONLY_RUNTIMES.contains(&runtime_id)
}
pub(crate) async fn runtime_job_execute(
    app: AppHandle,
    job_id: String,
    kind: String,
    runtime_id: String,
    method: String,
    version: String,
    _remove_mode: String,
) {
    let mut logs: Vec<String> = vec![format!(
        "job={} runtime={} method={}",
        kind, runtime_id, method
    )];
    let password_opt: Option<&str> = None;
    let mut final_state = "completed";
    let mut effective_verify_method = method.clone();

    let (distro, pkg_mgr_owned) = runtime_read_host_distro();
    let pkg_mgr = pkg_mgr_owned.as_str();
    logs.push(format!("distro={} pkg_mgr={}", distro, pkg_mgr));

    {
        let st = app.state::<AppState>();
        let mut jobs = st.jobs.lock().await;
        if let Some(j) = jobs
            .iter_mut()
            .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(job_id.as_str()))
        {
            j["progress"] = json!(5);
        }
    }
    let result: Result<(), String> = match kind.as_str() {
        "runtime_install" | "install_deps" => {
            if runtime_id == "rust" {
                let tc_raw = version.trim();
                let tc = if tc_raw.is_empty() { "stable" } else { tc_raw };
                let safe_tc = tc.replace('\'', "'\\''").replace('"', "");
                // Re-assert default toolchain: rustup self-update / prior installs can leave a non-matching default.
                let cmd = format!(
                    r#"set -e
               curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain '{safe_tc}'
               export PATH="$HOME/.cargo/bin:$PATH"
               if command -v rustup >/dev/null 2>&1; then
                 rustup default '{safe_tc}'
               fi"#,
                    safe_tc = safe_tc
                );
                runtime_bash_user_step(
                    &cmd,
                    &mut logs,
                    Some(app.clone()),
                    Some(job_id.clone()),
                    5,
                    90,
                )
                .await
                .map_err(|e| e.to_string())
            } else if runtime_id == "node" && method == "local" {
                let v = lumina_first_version_token(&version).unwrap_or_else(|| "lts/*".into());
                // nvm refuses to operate when ~/.npmrc pins npm prefix/globalconfig; strip those keys (with backup).
                let cmd = format!(
                    r#"set -e
               NPMRC="$HOME/.npmrc"
               if [ -f "$NPMRC" ] && grep -qE '^[[:space:]]*(prefix|globalconfig)[[:space:]]*=' "$NPMRC" 2>/dev/null; then
                 TS="$(date +%s)"
                 cp -p "$NPMRC" "$NPMRC.lumina-nvm-backup-$TS"
                 sed -i '/^[[:space:]]*prefix[[:space:]]*=/d;/^[[:space:]]*globalconfig[[:space:]]*=/d' "$NPMRC"
                 echo "NOTE: Removed incompatible prefix/globalconfig entries from ~/.npmrc (backup: $NPMRC.lumina-nvm-backup-$TS)." >&2
               fi
               curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
               export NVM_DIR="$HOME/.nvm"
               [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
               unset npm_config_prefix NPM_CONFIG_PREFIX npm_CONFIG_PREFIX
               export NPM_CONFIG_USERCONFIG=/dev/null
               nvm install {v}
               nvm use --delete-prefix {v}"#,
                    v = v
                );
                runtime_bash_user_step(
                    &cmd,
                    &mut logs,
                    Some(app.clone()),
                    Some(job_id.clone()),
                    5,
                    90,
                )
                .await
                .map_err(|e| e.to_string())
            } else if runtime_id == "go" && method == "local" {
                let v = lumina_first_version_token(&version).unwrap_or_else(|| "1.22.2".into());
                let cmd = format!(
            "set -e \
             && GO_BASE=\"$HOME/.local/share/lumina/go\" \
             && GO_VER_DIR=\"$GO_BASE/{v}\" \
             && mkdir -p \"$GO_BASE\" \
             && if [ ! -x \"$GO_VER_DIR/bin/go\" ]; then \
                  curl -L -o \"/tmp/lumina-go-{v}.tar.gz\" \"https://go.dev/dl/go{v}.linux-amd64.tar.gz\"; \
                  rm -rf \"$GO_VER_DIR\"; \
                  mkdir -p \"$GO_VER_DIR\"; \
                  tar -xzf \"/tmp/lumina-go-{v}.tar.gz\" -C \"$GO_VER_DIR\" --strip-components=1; \
                  rm -f \"/tmp/lumina-go-{v}.tar.gz\"; \
                fi \
             && ln -sfn \"$GO_VER_DIR\" \"$GO_BASE/current\" \
             && grep -q lumina-go \"$HOME/.bashrc\" \
             || echo 'export PATH=\"$HOME/.local/share/lumina/go/current/bin:$PATH\"  # lumina-go' >> \"$HOME/.bashrc\"",
            v = v
          );
                runtime_bash_user_step(
                    &cmd,
                    &mut logs,
                    Some(app.clone()),
                    Some(job_id.clone()),
                    5,
                    90,
                )
                .await
                .map_err(|e| e.to_string())
            } else if runtime_id == "python" && method == "local" {
                // pyenv builds CPython from source — install build deps once via pkexec (Polkit native dialog).
                // Best-effort: pyenv may still work with whatever deps are already present.
                let dep_cmd: Option<&str> = match pkg_mgr {
                        "dnf" => Some("dnf install -y make gcc zlib-devel bzip2 bzip2-devel readline-devel sqlite sqlite-devel openssl-devel tk-devel libffi-devel xz-devel libuuid-devel gdbm-libs"),
                        "apt" => Some("apt-get install -y build-essential libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev curl libncursesw5-dev xz-utils tk-dev libxml2-dev libxmlsec1-dev libffi-dev liblzma-dev"),
                        "pacman" => Some("pacman -S --needed --noconfirm base-devel openssl zlib xz tk"),
                        _ => None,
                    };
                if let Some(cmd) = dep_cmd {
                    logs.push(format!(
                        "Installing build dependencies for pyenv ({} — one-time)…",
                        pkg_mgr
                    ));
                    let _ = sudo_bash_install_step(
                        cmd,
                        None,
                        &mut logs,
                        Some(app.clone()),
                        Some(job_id.clone()),
                        5,
                        25,
                    )
                    .await;
                }
                let v = lumina_first_version_token(&version).unwrap_or_else(|| "3.12.2".into());
                let cmd = format!(
                    "if [ ! -d \"$HOME/.pyenv\" ]; then curl https://pyenv.run | bash; fi \
             && export PYENV_ROOT=\"$HOME/.pyenv\" \
             && [[ -d $PYENV_ROOT/bin ]] && export PATH=\"$PYENV_ROOT/bin:$PATH\" \
             && eval \"$(pyenv init -)\" \
             && (pyenv versions --bare | grep -qx '{v}' || pyenv install {v}) \
             && pyenv global {v}",
                    v = v
                );
                runtime_bash_user_step(
                    &cmd,
                    &mut logs,
                    Some(app.clone()),
                    Some(job_id.clone()),
                    5,
                    90,
                )
                .await
                .map_err(|e| e.to_string())
            } else if runtime_id == "java" {
                if method.trim() == "local" {
                    let major = runtime_java_major(&version).unwrap_or(21);
                    logs.push(format!("Installing Java {} locally via Adoptium…", major));
                    let cmd = format!(
                        r#"set -e
                 LUMINA_JAVA_DIR="$HOME/.local/share/lumina/java"
                 mkdir -p "$LUMINA_JAVA_DIR"
                 TMP_JAVA="/tmp/lumina-java-{major}.tar.gz"
                 curl -fsSL "https://api.adoptium.net/v3/binary/latest/{major}/ga/linux/x64/jdk/hotspot/normal/eclipse" -o "$TMP_JAVA"
                 TMP_EXTRACT="$LUMINA_JAVA_DIR/.tmp-jdk-{major}-$$"
                 rm -rf "$TMP_EXTRACT"
                 mkdir -p "$TMP_EXTRACT"
                 tar -xzf "$TMP_JAVA" -C "$TMP_EXTRACT" --strip-components=1
                 rm -f "$TMP_JAVA"
                 DETECTED_VER=$("$TMP_EXTRACT/bin/java" -version 2>&1 | awk -F\" '/version/ {{print $2; exit}}')
                 [ -n "$DETECTED_VER" ] || DETECTED_VER="{major}"
                 SAFE_VER=$(printf '%s' "$DETECTED_VER" | tr '/ ' '__')
                 TARGET_DIR="$LUMINA_JAVA_DIR/jdk-$SAFE_VER"
                 if [ ! -d "$TARGET_DIR" ]; then mv "$TMP_EXTRACT" "$TARGET_DIR"; else rm -rf "$TMP_EXTRACT"; fi
                 ln -sfn "$TARGET_DIR" "$LUMINA_JAVA_DIR/current"
                 for f in "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
                   if [ -f "$f" ] && ! grep -q 'lumina-java' "$f"; then
                     printf '\n# lumina-java\nexport JAVA_HOME="$HOME/.local/share/lumina/java/current"\nexport PATH="$JAVA_HOME/bin:$PATH"\n' >> "$f"
                   fi
                 done
                 [ -x "$LUMINA_JAVA_DIR/current/bin/java" ]
                 "$LUMINA_JAVA_DIR/current/bin/java" -version 2>&1 | head -1"#,
                        major = major
                    );
                    runtime_bash_user_step(
                        &cmd,
                        &mut logs,
                        Some(app.clone()),
                        Some(job_id.clone()),
                        5,
                        90,
                    )
                    .await
                    .map_err(|e| e.to_string())
                } else {
                    if pkg_mgr == "dnf" && runtime_java_major(&version) == Some(8) {
                        Err("[RUNTIME_INSTALL_FAILED] Fedora repositories on this host do not provide java-1.8.0-openjdk-devel. Use Isolated Script (Local) for Java 8.".to_string())
                    } else {
                        let pkgs = runtime_java_system_packages_for_version(pkg_mgr, &version);
                        if pkgs.is_empty() {
                            Err(format!(
                                "[RUNTIME_INSTALL_FAILED] No Java packages mapped for '{}' on {} ({}). Use Isolated (Local) install.",
                                version, distro, pkg_mgr
                            ))
                        } else {
                            let pkg = pkgs[0].clone();
                            if pkg_mgr == "dnf" && !runtime_dnf_package_available(&pkg).await {
                                let maj = runtime_java_major(&version).unwrap_or(21);
                                Err(format!(
                    "[RUNTIME_INSTALL_FAILED] Requested Java {} is not available in Fedora repositories on this machine (missing package: {}). Use Isolated Script (Local) for exact version installs.",
                    maj, pkg
                  ))
                            } else if runtime_system_package_installed(pkg_mgr, &pkg).await {
                                logs.push(format!(
                                    "NOTE: Java package {} is already installed; nothing to do.",
                                    pkg
                                ));
                                Ok(())
                            } else {
                                let cmd = match pkg_mgr {
                                    "apt" => format!(
                                        "DEBIAN_FRONTEND=noninteractive apt-get install -y {}",
                                        pkg
                                    ),
                                    "dnf" => format!("dnf install -y {}", pkg),
                                    "pacman" => {
                                        format!("pacman -S --needed --noconfirm {}", pkg)
                                    }
                                    "zypper" => format!("zypper install -y {}", pkg),
                                    _ => format!("apt-get install -y {}", pkg),
                                };
                                logs.push(format!("Installing Java package: {}…", pkg));
                                let step_res = sudo_bash_install_step(
                                    &cmd,
                                    password_opt,
                                    &mut logs,
                                    Some(app.clone()),
                                    Some(job_id.clone()),
                                    10,
                                    75,
                                )
                                .await;
                                if let Err(e) = step_res {
                                    Err(format!(
                                        "[RUNTIME_INSTALL_FAILED] Failed to install {}: {}",
                                        pkg, e
                                    ))
                                } else {
                                    if pkg_mgr == "dnf" {
                                        let alt_cmd =
                                            runtime_dnf_java_alternatives_cmd(&pkg);
                                        let _ = sudo_bash_install_step(
                                            &alt_cmd,
                                            password_opt,
                                            &mut logs,
                                            Some(app.clone()),
                                            Some(job_id.clone()),
                                            85,
                                            10,
                                        )
                                        .await;
                                    }
                                    Ok(())
                                }
                            }
                        }
                    }
                }
            } else if runtime_id == "dotnet" && (method.trim() == "local" || pkg_mgr == "pacman") {
                // User-space SDK install (works on Fedora too; avoids pinning via distro metapackages).
                let ch = lumina_dotnet_install_channel(&version);
                logs.push(format!(
                    "Installing .NET channel {} via Microsoft dotnet-install.sh (user ~/.dotnet)…",
                    ch
                ));
                let cmd = format!(
            "set -e \
             && curl -fsSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel {ch} --install-dir \"$HOME/.dotnet\" \
             && grep -q 'Microsoft .NET' \"$HOME/.bashrc\" 2>/dev/null || grep -q dotnet-install \"$HOME/.bashrc\" 2>/dev/null \
             || echo 'export PATH=\"$HOME/.dotnet:$HOME/.dotnet/tools:$PATH\"  # Microsoft .NET (lumina)' >> \"$HOME/.bashrc\"",
            ch = ch
          );
                runtime_bash_user_step(
                    &cmd,
                    &mut logs,
                    Some(app.clone()),
                    Some(job_id.clone()),
                    5,
                    90,
                )
                .await
                .map_err(|e| e.to_string())
            } else if runtime_id == "php" && method == "local" {
                // PHP source compilation is too slow and fragile on non-Debian systems.
                // Always install via system package manager regardless of "local" track selection.
                effective_verify_method = "system".to_string();
                logs.push(
                    "Installing PHP via system package manager (source compile not supported)…"
                        .into(),
                );
                let cmd = r#"
if command -v dnf >/dev/null 2>&1; then
  dnf install -y php-cli php-common php-mbstring php-xml php-json php-curl php-zip 2>&1
elif command -v apt-get >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y php-cli php-common php-mbstring php-xml php-curl php-zip 2>&1
elif command -v pacman >/dev/null 2>&1; then
  pacman -S --noconfirm php 2>&1
else
  echo "[RUNTIME_INSTALL_FAILED] No supported package manager found" >&2; exit 1
fi"#;
                sudo_bash_install_step(
                    cmd,
                    password_opt,
                    &mut logs,
                    Some(app.clone()),
                    Some(job_id.clone()),
                    10,
                    85,
                )
                .await
                .map_err(|e| format!("[RUNTIME_INSTALL_FAILED] {}", e))
            } else {
                let pkgs = runtime_system_packages(&runtime_id, pkg_mgr);
                if method.trim() == "local"
                    && !runtime_supports_local_install(&runtime_id)
                    && !pkgs.is_empty()
                {
                    Err(format!(
              "[RUNTIME_INSTALL_FAILED] Isolated (local) install is not implemented for runtime '{}' on this distro (package manager: {}). Choose System for distro packages, pick a toolchain with a supported local installer, or install manually.",
              runtime_id, pkg_mgr
            ))
                } else {
                    if method.trim() == "system"
                        && !pkgs.is_empty()
                        && matches!(runtime_id.as_str(), "node" | "python" | "go")
                    {
                        logs.push(
                "NOTE: System installs use distro package names only—your Target Version choice is ignored. Pick Local for Node.js, Python, or Go if you want the selected version.".to_string(),
              );
                    }
                    if pkgs.is_empty() {
                        Err(format!(
                            "[RUNTIME_INSTALL_FAILED] No system packages mapped for '{}' on {} ({}). Choose Isolated (Local), pick a runtime with a supported installer, or install manually.",
                            runtime_id, distro, pkg_mgr
                        ))
                    } else {
                        let total = pkgs.len();
                        let mut loop_res = Ok(());
                        for (idx, pkg) in pkgs.iter().enumerate() {
                            let base = (idx as u32 * 100) / total as u32;
                            let weight = 100 / total as u32;
                            if runtime_system_package_installed(pkg_mgr, pkg).await {
                                logs.push(format!("NOTE: {} already installed; skipping.", pkg));
                                continue;
                            }
                            let cmd = match pkg_mgr {
                                "apt" => format!(
                                    "DEBIAN_FRONTEND=noninteractive apt-get install -y {}",
                                    pkg
                                ),
                                "dnf" => format!("dnf install -y {}", pkg),
                                "pacman" => format!("pacman -S --needed --noconfirm {}", pkg),
                                "zypper" => format!("zypper install -y {}", pkg),
                                _ => format!("apt-get install -y {}", pkg),
                            };
                            logs.push(format!(
                                "Installing dependency {} of {}: {}…",
                                idx + 1,
                                total,
                                pkg
                            ));
                            let step_res = sudo_bash_install_step(
                                &cmd,
                                password_opt,
                                &mut logs,
                                Some(app.clone()),
                                Some(job_id.clone()),
                                base,
                                weight,
                            )
                            .await;
                            if let Err(e) = step_res {
                                loop_res = Err(format!(
                                    "[RUNTIME_INSTALL_FAILED] Failed to install {}: {}",
                                    pkg, e
                                ));
                                break;
                            }
                        }
                        loop_res
                    }
                }
            }
        }
        "runtime_update" => {
            if runtime_id == "rust" {
                match exec_output_limit(
                    "bash",
                    &["-lc", "unset RUSTUP_TOOLCHAIN; rustup update 2>&1"],
                    cmd_timeout_install_step(),
                )
                .await
                {
                    Ok(out) => {
                        if !out.is_empty() {
                            logs.push(out.clone());
                        }
                        let lower = out.to_lowercase();
                        if lower.contains("unchanged")
                            || lower.contains("already")
                            || lower.contains("no change")
                        {
                            logs.push("already latest — rustup reports no updates.".to_string());
                        } else {
                            logs.push("update finished successfully".to_string());
                        }
                        Ok(())
                    }
                    Err(e) => Err(format!("[RUNTIME_UPDATE_FAILED] {}", e.trim())),
                }
            } else if runtime_id == "java" && method.trim() == "local" {
                let major = exec_output_limit(
                    "bash",
                    &["-lc", r#"[ -x "$HOME/.local/share/lumina/java/current/bin/java" ] && "$HOME/.local/share/lumina/java/current/bin/java" -version 2>&1 | awk -F\" '/version/ {split($2,v,"."); print v[1]; exit}'"#],
                    cmd_timeout_short(),
                )
                .await
                .ok()
                .map(|s| s.trim().to_string())
                .and_then(|s| s.parse::<u32>().ok())
                .or_else(|| runtime_java_major(&version))
                .unwrap_or(21);
                logs.push(format!(
                    "Refreshing local Java {} from Adoptium and switching active…",
                    major
                ));
                let cmd = format!(
                    r#"set -e
                 LUMINA_JAVA_DIR="$HOME/.local/share/lumina/java"
                 mkdir -p "$LUMINA_JAVA_DIR"
                 TMP_JAVA="/tmp/lumina-java-{major}.tar.gz"
                 curl -fsSL "https://api.adoptium.net/v3/binary/latest/{major}/ga/linux/x64/jdk/hotspot/normal/eclipse" -o "$TMP_JAVA"
                 TMP_EXTRACT="$LUMINA_JAVA_DIR/.tmp-jdk-{major}-$$"
                 rm -rf "$TMP_EXTRACT"
                 mkdir -p "$TMP_EXTRACT"
                 tar -xzf "$TMP_JAVA" -C "$TMP_EXTRACT" --strip-components=1
                 rm -f "$TMP_JAVA"
                 DETECTED_VER=$("$TMP_EXTRACT/bin/java" -version 2>&1 | awk -F\" '/version/ {{print $2; exit}}')
                 [ -n "$DETECTED_VER" ] || DETECTED_VER="{major}"
                 SAFE_VER=$(printf '%s' "$DETECTED_VER" | tr '/ ' '__')
                 TARGET_DIR="$LUMINA_JAVA_DIR/jdk-$SAFE_VER"
                 if [ ! -d "$TARGET_DIR" ]; then mv "$TMP_EXTRACT" "$TARGET_DIR"; else rm -rf "$TMP_EXTRACT"; fi
                 ln -sfn "$TARGET_DIR" "$LUMINA_JAVA_DIR/current"
                 "$LUMINA_JAVA_DIR/current/bin/java" -version 2>&1 | head -1"#,
                    major = major
                );
                match runtime_bash_user_step(
                    &cmd,
                    &mut logs,
                    Some(app.clone()),
                    Some(job_id.clone()),
                    10,
                    90,
                )
                .await
                {
                    Ok(()) => {
                        logs.push("update finished successfully".to_string());
                        Ok(())
                    }
                    Err(e) => Err(format!("[RUNTIME_UPDATE_FAILED] {}", e)),
                }
            } else {
                let pkgs = runtime_system_packages(&runtime_id, pkg_mgr);
                if pkgs.is_empty() {
                    logs.push(format!(
                        "No system packages to update for '{}' on {}.",
                        runtime_id, distro
                    ));
                    logs.push(
                        "already latest — no packages registered for this runtime.".to_string(),
                    );
                    Ok(())
                } else {
                    let cmd = pkg_upgrade_cmd(pkg_mgr, &pkgs);
                    match sudo_bash_install_step(
                        &cmd,
                        password_opt,
                        &mut logs,
                        Some(app.clone()),
                        Some(job_id.clone()),
                        10,
                        85,
                    )
                    .await
                    {
                        Ok(()) => {
                            let combined = logs.join("\n").to_lowercase();
                            let already_latest = combined.contains("nothing to do")
                                || combined.contains("0 upgraded")
                                || combined.contains("nothing to upgrade")
                                || combined.contains("there is nothing to do");
                            if already_latest {
                                logs.push(
                                    "already latest — package manager reports nothing to upgrade."
                                        .to_string(),
                                );
                            } else {
                                logs.push("update finished successfully".to_string());
                                if runtime_id == "java" && pkg_mgr == "dnf" {
                                    if let Some(pkg) = pkgs.first() {
                                        logs.push(
                                            "Switching default Java to the upgraded package…"
                                                .to_string(),
                                        );
                                        let alt_cmd = runtime_dnf_java_alternatives_cmd(pkg);
                                        let _ = sudo_bash_install_step(
                                            &alt_cmd,
                                            password_opt,
                                            &mut logs,
                                            Some(app.clone()),
                                            Some(job_id.clone()),
                                            88,
                                            95,
                                        )
                                        .await;
                                    }
                                }
                            }
                            Ok(())
                        }
                        Err(e) => Err(format!("[RUNTIME_UPDATE_FAILED] {}", e)),
                    }
                }
            }
        }
        "runtime_uninstall" => {
            if runtime_id == "rust" {
                exec_output_limit(
                    "bash",
                    &["-lc", "rustup self uninstall -y 2>/dev/null || true"],
                    cmd_timeout_install_step(),
                )
                .await
                .map(|out| {
                    if !out.is_empty() {
                        logs.push(out);
                    }
                })
                .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e.trim()))
            } else {
                let pkgs = runtime_system_packages(&runtime_id, pkg_mgr);
                if pkgs.is_empty() {
                    logs.push(format!(
                        "No system packages to remove for '{}' on {}.",
                        runtime_id, distro
                    ));
                    Ok(())
                } else {
                    let cmd = if _remove_mode == "runtime_and_deps" {
                        pkg_remove_with_deps_cmd(pkg_mgr, &pkgs)
                    } else {
                        pkg_remove_cmd(pkg_mgr, &pkgs)
                    };
                    sudo_bash_install_step(
                        &cmd,
                        password_opt,
                        &mut logs,
                        Some(app.clone()),
                        Some(job_id.clone()),
                        10,
                        85,
                    )
                    .await
                    .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e))
                }
            }
        }
        "profile_switch" => {
            let to_profile = runtime_id.clone();
            let from_profile = method.clone(); // use 'method' string for from_profile

            let to_dir = compose_profiles::compose_profile_workdir(&app, &to_profile);
            if !to_dir.is_dir() {
                Err(format!(
                    "[PROFILE_SWITCH_FAILED] missing compose directory: {}",
                    to_dir.display()
                ))
            } else {
                if !from_profile.is_empty() && from_profile != "none" {
                    let from_dir = compose_profiles::compose_profile_workdir(&app, &from_profile);
                    if from_dir.is_dir() {
                        logs.push(format!("Stopping old profile: {}...", from_profile));
                        let safe_from_dir = from_dir.display().to_string().replace('\'', "'\\''");
                        let cmd = format!("cd '{}' && docker compose down", safe_from_dir);
                        let _ = runtime_bash_user_step(
                            &cmd,
                            &mut logs,
                            Some(app.clone()),
                            Some(job_id.clone()),
                            5,
                            20,
                        )
                        .await;
                    }
                }

                // Fetch project_dir from store.json
                let mut project_dir = String::new();
                if let Ok(store_path) = app_file(&app, "store.json") {
                    let store = read_json(&store_path);
                    if let Some(path) = store
                        .get(format!("project_dir_{}", to_profile))
                        .and_then(|v| v.as_str())
                    {
                        project_dir = path.to_string();
                    }
                }
                if project_dir.is_empty() {
                    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
                    project_dir = format!("{}/LuminaProjects/{}/default", home, to_profile);
                }
                let _ = std::fs::create_dir_all(&project_dir);

                logs.push(format!(
                    "Starting new profile: {} (Project: {})...",
                    to_profile, project_dir
                ));
                let overlay = if compose_profiles::profile_wants_full_stack(&app, &to_profile, &to_dir) {
                    "-f docker-compose.yml -f docker-compose.full.yml"
                } else {
                    "-f docker-compose.yml"
                };
                // We do a pull first to show download progress, then up -d
                let safe_project_dir = project_dir.replace('\'', "'\\''");
                let safe_to_dir = to_dir.display().to_string().replace('\'', "'\\''");
                let cmd = format!("export PROJECT_DIR='{}' && cd '{}' && docker compose --progress plain {} pull && docker compose {} up -d", safe_project_dir, safe_to_dir, overlay, overlay);
                runtime_bash_user_step(
                    &cmd,
                    &mut logs,
                    Some(app.clone()),
                    Some(job_id.clone()),
                    25,
                    75,
                )
                .await
                .map_err(|e| e.to_string())
            }
        }
        _ => {
            logs.push(format!("Unknown job kind: {}.", kind));
            Ok(())
        }
    };
    if let Err(e) = result {
        logs.push(format!("ERROR: {}", e));
        final_state = "failed";
    } else {
        let st = app.state::<AppState>();
        let mut jobs = st.jobs.lock().await;
        if let Some(j) = jobs
            .iter_mut()
            .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(job_id.as_str()))
        {
            j["progress"] = json!(85);
        }
        drop(jobs);

        if matches!(
            kind.as_str(),
            "runtime_install" | "install_deps" | "runtime_update"
        ) {
            let verified = runtime_append_verify(
                &runtime_id,
                &effective_verify_method,
                &version,
                &mut logs,
            )
            .await;
            if !verified {
                logs.push(
                    "ERROR: [RUNTIME_VERIFY_FAILED] Toolchain not available after install.".into(),
                );
                final_state = "failed";
            }
        }
    }

    let st = app.state::<AppState>();
    let current_state = {
        let jobs = st.jobs.lock().await;
        jobs.iter()
            .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(job_id.as_str()))
            .and_then(|j| j.get("state").and_then(|v| v.as_str()))
            .unwrap_or("")
            .to_string()
    };
    final_state = effective_runtime_job_final_state(final_state, current_state.as_str());
    if final_state == "cancelled" && !logs.iter().any(|l| l.contains("Cancelled by user.")) {
        logs.push("Cancelled by user.".to_string());
    }

    let st = app.state::<AppState>();
    let mut jobs = st.jobs.lock().await;
    if let Some(j) = jobs
        .iter_mut()
        .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(job_id.as_str()))
    {
        j["state"] = json!(final_state);
        j["progress"] = json!(if final_state == "completed" { 100 } else { 0 });
        j["logTail"] = json!(logs
            .into_iter()
            .rev()
            .take(48)
            .collect::<Vec<String>>()
            .into_iter()
            .rev()
            .collect::<Vec<String>>());
    }
}

async fn runtime_set_java_active(home: &Path, path_raw: &str) -> Value {
    let path = match validate_java_binary_path(path_raw, home) {
        Ok(p) => p,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let path_str = path.to_string_lossy().to_string();
    let safe_java = path_str.replace('\'', "'\\''");

    let res: Result<(), String> = if path_str.contains("/.local/share/lumina/java/") {
        let Some(jdk_dir) = java_home_from_binary(&path) else {
            return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve Java install directory." });
        };
        let link = home.join(".local/share/lumina/java/current");
        lumina_replace_symlink(&link, &jdk_dir)
    } else if path_str.contains("/.sdkman/candidates/java/") {
        let Some(version_id) = path
            .parent()
            .and_then(|p| p.parent())
            .and_then(|d| d.file_name())
            .and_then(|s| s.to_str())
            .map(str::to_string)
        else {
            return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve SDKMAN Java version id." });
        };
        let safe_ver = version_id.replace('\'', "'\\''");
        let cmd = format!(
            "export SDKMAN_DIR=\"$HOME/.sdkman\" \
             && [ -s \"$SDKMAN_DIR/bin/sdkman-init.sh\" ] && . \"$SDKMAN_DIR/bin/sdkman-init.sh\" \
             && sdk default java '{safe_ver}'"
        );
        exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short())
            .await
            .map(|_| ())
            .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] {}", e.trim()))
    } else if path_str.contains("/.jdks/") {
        let Some(jdk_dir) = java_home_from_binary(&path) else {
            return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve JetBrains JDK directory." });
        };
        let safe_home = jdk_dir.to_string_lossy().replace('\'', "'\\''");
        let cmd = format!(
            "set -e \
             && ENV_FILE=\"$HOME/.config/lumina/active-java.env\" \
             && mkdir -p \"$HOME/.config/lumina\" \
             && printf 'export JAVA_HOME=%s\\nexport PATH=\"$JAVA_HOME/bin:$PATH\"\\n' '{safe_home}' > \"$ENV_FILE\" \
             && MARKER=\"# lumina-active-java\" \
             && for f in \"$HOME/.bashrc\" \"$HOME/.zshrc\" \"$HOME/.profile\"; do \
                  [ -f \"$f\" ] || continue; \
                  grep -q \"$MARKER\" \"$f\" && continue; \
                  printf '\\n%s\\n[ -f \"$HOME/.config/lumina/active-java.env\" ] && . \"$HOME/.config/lumina/active-java.env\"  %s\\n' \"$MARKER\" \"$MARKER\" >> \"$f\"; \
                done"
        );
        exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short())
            .await
            .map(|_| ())
            .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] {}", e.trim()))
    } else if path_str.starts_with("/usr/lib/jvm/") || path_str.starts_with("/usr/java/") {
        let jdk_dir = java_home_from_binary(&path).unwrap_or_else(|| path.clone());
        let javac = jdk_dir.join("bin/javac");
        let cmd = if javac.exists() {
            let safe_javac = javac.to_string_lossy().replace('\'', "'\\''");
            format!(
                "alternatives --set java '{safe_java}' && alternatives --set javac '{safe_javac}'"
            )
        } else {
            format!("alternatives --set java '{safe_java}'")
        };
        let mut logs = Vec::new();
        sudo_bash_install_step(&cmd, None, &mut logs, None, None, 0, 100)
            .await
            .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] {}", e))
    } else {
        Err("[RUNTIME_SET_ACTIVE_FAILED] Unsupported Java path.".to_string())
    };

    match res {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}
pub(crate) async fn runtime_set_active_invoke(body: &Value) -> Value {
    // ...

    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim();
    let path_raw = body
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim();
    if runtime_id.is_empty() || path_raw.is_empty() {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Missing runtimeId or path." });
    }

    let home = match lumina_home_dir() {
        Ok(h) => h,
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    if runtime_id == "java" {
        return runtime_set_java_active(&home, path_raw).await;
    }

    let path = match lumina_path_must_be_under_home(&home, Path::new(path_raw)) {
        Ok(p) => p,
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    let safe_path = path.to_string_lossy().replace('\'', "'\\''");

    let res: Result<(), String> = match runtime_id {
        "node" => {
            if !path.ends_with(Path::new("bin/node"))
                || !path.to_string_lossy().contains("/.nvm/versions/node/")
            {
                return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Node path (expected an nvm-managed ~/.nvm/versions/node/*/bin/node)." });
            }
            let cmd = format!(
                "export NVM_DIR=\"$HOME/.nvm\" \
         && [ -s \"$NVM_DIR/nvm.sh\" ] && . \"$NVM_DIR/nvm.sh\" \
         && unset npm_config_prefix NPM_CONFIG_PREFIX npm_CONFIG_PREFIX \
         && export NPM_CONFIG_USERCONFIG=/dev/null \
         && nvm alias default \"$(basename \"$(dirname '{}')\")\" \
         && nvm use default",
                safe_path
            );
            exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short())
                .await
                .map(|_| ())
                .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] {}", e.trim()))
        }
        "python" => {
            let p = path.to_string_lossy();
            let ok_bin = path.file_name() == Some(OsStr::new("python"))
                || path.file_name() == Some(OsStr::new("python3"));
            if !p.contains("/.pyenv/versions/") || !ok_bin {
                return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Python path (expected a pyenv-managed ~/.pyenv/versions/*/bin/python or python3)." });
            }
            let cmd = format!(
                "export PYENV_ROOT=\"$HOME/.pyenv\" \
         && export PATH=\"$PYENV_ROOT/bin:$PATH\" \
         && eval \"$(pyenv init -)\" \
         && pyenv global \"$(basename \"$(dirname '{}')\")\"",
                safe_path
            );
            exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short())
                .await
                .map(|_| ())
                .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] {}", e.trim()))
        }
        "go" => {
            if !path.ends_with(Path::new("bin/go"))
                || !path.to_string_lossy().contains("/.local/share/lumina/go/")
            {
                return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Go path (expected ~/.local/share/lumina/go/<ver>/bin/go)." });
            }
            let Some(ver_dir) = path.parent().and_then(|p| p.parent()) else {
                return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve Go install directory." });
            };
            let link = home.join(".local/share/lumina/go/current");
            lumina_replace_symlink(&link, ver_dir)
        }
        "rust" => {
            if !path.ends_with(Path::new("bin/rustc"))
                || !path.to_string_lossy().contains("/.rustup/toolchains/")
            {
                return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Rust path (expected ~/.rustup/toolchains/<name>/bin/rustc)." });
            }
            let toolchain = path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.file_name())
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .trim()
                .to_string();
            if toolchain.is_empty() {
                return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve rustup toolchain name." });
            }
            let safe_tc = toolchain.replace('\'', "'\\''");
            let cmd = format!(
                "export PATH=\"$HOME/.cargo/bin:$PATH\" \
         && command -v rustup >/dev/null 2>&1 \
         && rustup default '{}'",
                safe_tc
            );
            exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short())
                .await
                .map(|_| ())
                .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] {}", e.trim()))
        }
        "php" => {
            let version = path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            if version.is_empty() {
                return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve mise version from path." });
            }
            let safe_spec = format!("php@{}", version).replace('\'', "'\\''");
            let cmd = format!(
                "export PATH=\"$HOME/.local/bin:$PATH\" \
         && [ -x \"$HOME/.local/bin/mise\" ] \
         && \"$HOME/.local/bin/mise\" use -g '{}'",
                safe_spec
            );
            exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short())
                .await
                .map(|_| ())
                .map_err(|e| format!("[RUNTIME_SET_ACTIVE_FAILED] {}", e.trim()))
        }
        _ => {
            return json!({ "ok": false, "error": format!("[RUNTIME_SET_ACTIVE_FAILED] Switching active '{}' is not supported yet.", runtime_id) })
        }
    };

    match res {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}
pub(crate) async fn handle_job_start(app: &AppHandle, state: &AppState, body: &Value) -> Value {
    let id = Uuid::new_v4().to_string();
    let kind = body
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let method = body
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("system")
        .to_string();
    let version = body
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let remove_mode = body
        .get("removeMode")
        .and_then(|v| v.as_str())
        .unwrap_or("runtime_only")
        .to_string();
    {
        let mut jobs = state.jobs.lock().await;
        let running = jobs
            .iter()
            .filter(|j| j.get("state").and_then(|v| v.as_str()) == Some("running"))
            .count();
        if running >= get_global_thread_pool_size() {
            return json!({ "ok": false, "error": format!("[JOB_POOL_FULL] Thread pool at capacity ({} concurrent jobs). Wait for a running job to complete.", get_global_thread_pool_size()) });
        }
        jobs.push(json!({
          "id": id,
          "kind": kind,
          "runtimeId": runtime_id,
          "state": "running",
          "progress": 10,
          "logTail": [format!("Starting {} for {}…", kind, runtime_id)]
        }));
    }
    let jid = id.clone();
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let retry_args = (
            kind.clone(),
            runtime_id.clone(),
            method.clone(),
            version.clone(),
            remove_mode.clone(),
        );
        runtime_job_execute(
            app2.clone(),
            jid.clone(),
            kind,
            runtime_id,
            method,
            version,
            remove_mode,
        )
        .await;
        if get_global_daemon_auto_restart() {
            let final_state = {
                let st = app2.state::<AppState>();
                let jobs = st.jobs.lock().await;
                jobs.iter()
                    .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(jid.as_str()))
                    .and_then(|j| j.get("state").and_then(|v| v.as_str()))
                    .unwrap_or("")
                    .to_string()
            };
            if final_state == "error" {
                {
                    let st = app2.state::<AppState>();
                    let mut jobs = st.jobs.lock().await;
                    if let Some(j) = jobs
                        .iter_mut()
                        .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(jid.as_str()))
                    {
                        j["state"] = json!("running");
                        j["progress"] = json!(5);
                        j["logTail"] = json!(["Auto-restarting after failure…"]);
                    }
                }
                let (kind, runtime_id, method, version, remove_mode) = retry_args;
                runtime_job_execute(app2, jid, kind, runtime_id, method, version, remove_mode)
                    .await;
            }
        }
    });
    json!({ "id": id })
}
