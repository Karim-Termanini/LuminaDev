use super::*;
use crate::runtime_packages::pkg_remove_with_deps_cmd;

// Explicit imports for extracted handler functions (also available via use super::*)
use crate::host_exec::{
    cmd_timeout_short, exec_output, exec_output_limit, exec_result_limit,
    get_global_daemon_auto_restart, get_global_thread_pool_size,
};
use crate::runtime_packages::{
    runtime_dnf_java_alternatives_cmd, runtime_java_system_packages_for_version, runtime_pkg_mgr,
    runtime_preview_removable_deps, runtime_system_package_available, runtime_system_packages,
};
use crate::runtime_versioning::{lumina_probe_meaningful_line, runtime_dnf_repoquery_versions};
use crate::runtime_paths::{
    java_home_from_binary, lumina_version_dir_from_path, nvm_version_dir_from_path,
    path_home_before_marker, path_segment_after_marker, validate_java_binary_path,
};
use crate::{
    active_binary_script, list_installed_versions_script, list_mise_runtime_script,
    parse_version_path_lines, status_probe_script,
};
use std::path::{Path, PathBuf};

const LOCAL_INSTALL_RUNTIMES: &[&str] = &[
    "node", "python", "go", "zig", "rust", "bun", "dart", "flutter", "julia", "php", "ruby", "lua",
    "r",
];

fn runtime_supports_local_install(runtime_id: &str) -> bool {
    LOCAL_INSTALL_RUNTIMES.contains(&runtime_id)
}

#[allow(clippy::too_many_arguments)]
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
    let effective_verify_method = method.clone();

    let distro = exec_output(
        "bash",
        &[
            "-lc",
            "source /etc/os-release 2>/dev/null && printf '%s' \"${ID:-unknown}\"",
        ],
    )
    .await
    .unwrap_or_else(|_| "unknown".to_string());
    let distro = distro.trim().to_string();
    let pkg_mgr = runtime_pkg_mgr(&distro);
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
            } else if runtime_id == "zig" && method == "local" {
                let mut v = lumina_first_version_token(&version).unwrap_or_else(|| "0.13.0".into());
                v = v.trim().trim_start_matches('v').trim().to_string();
                if v.is_empty() {
                    v = "0.13.0".into();
                }
                let cmd = format!(
            "set -e \
             && ZIG_BASE=\"$HOME/.local/share/lumina/zig\" \
             && ZIG_VER_DIR=\"$ZIG_BASE/{v}\" \
             && mkdir -p \"$ZIG_BASE\" \
             && ARCH_RAW=\"$(uname -m 2>/dev/null || echo x86_64)\" \
             && case \"$ARCH_RAW\" in aarch64|arm64) ZIG_ARCH=\"aarch64\" ;; *) ZIG_ARCH=\"x86_64\" ;; esac \
             && if [ ! -x \"$ZIG_VER_DIR/zig\" ]; then \
                  TMP=\"/tmp/lumina-zig-{v}-$ZIG_ARCH.tar.xz\"; \
                  curl -fsSL \"https://ziglang.org/download/{v}/zig-linux-$ZIG_ARCH-{v}.tar.xz\" -o \"$TMP\"; \
                  rm -rf \"$ZIG_VER_DIR\"; \
                  mkdir -p \"$ZIG_VER_DIR\"; \
                  tar -xf \"$TMP\" -C \"$ZIG_VER_DIR\" --strip-components=1; \
                  rm -f \"$TMP\"; \
                fi \
             && ln -sfn \"$ZIG_VER_DIR\" \"$ZIG_BASE/current\" \
             && grep -q lumina-zig \"$HOME/.bashrc\" \
             || echo 'export PATH=\"$HOME/.local/share/lumina/zig/current:$PATH\"  # lumina-zig' >> \"$HOME/.bashrc\"",
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
                 ln -s "$TARGET_DIR" "$LUMINA_JAVA_DIR/current"
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
                            logs.push(format!(
                                "No Java packages known for '{}' on {}.",
                                version, distro
                            ));
                            Ok(())
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
            } else if runtime_id == "bun" {
                let ver = lumina_first_version_token(&version).unwrap_or_default();
                let ver = ver.trim().trim_start_matches('v').to_string();
                if ver.is_empty() {
                    logs.push("Installing Bun via official installer (latest)…".into());
                    runtime_bash_user_step(
                        "curl -fsSL https://bun.sh/install | bash",
                        &mut logs,
                        Some(app.clone()),
                        Some(job_id.clone()),
                        5,
                        90,
                    )
                    .await
                    .map_err(|e| e.to_string())
                } else {
                    logs.push(format!("Installing Bun {} via official installer…", ver));
                    let cmd = format!(
                        "curl -fsSL https://bun.sh/install | bash -s \"bun-v{}\"",
                        ver.replace(['"', '\''], "")
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
                }
            } else if runtime_id == "dart" {
                let (channel, release) = lumina_dart_channel_release(&version);
                logs.push(format!(
                    "Installing Dart SDK (channel={}, release={})…",
                    channel, release
                ));
                if pkg_mgr == "apt" {
                    let cmd = format!(
                        "curl -fsSL https://dl-ssl.google.com/linux/linux_signing_key.pub \
                 | gpg --dearmor -o /usr/share/keyrings/dart.gpg 2>/dev/null && \
               echo 'deb [signed-by=/usr/share/keyrings/dart.gpg] \
                 https://storage.googleapis.com/download.dartlang.org/linux/debian {channel} main' \
                 > /etc/apt/sources.list.d/dart_{channel}.list && \
               apt-get update -qq && apt-get install -y dart",
                        channel = channel
                    );
                    sudo_bash_install_step(
                        &cmd,
                        password_opt,
                        &mut logs,
                        Some(app.clone()),
                        Some(job_id.clone()),
                        20,
                        70,
                    )
                    .await
                    .map_err(|e| format!("[RUNTIME_INSTALL_FAILED] {}", e))
                } else {
                    let rel_safe = release.replace('\'', "'\\''");
                    let cmd = format!(
                        r#"set -e
                 ARCH_RAW="$(uname -m 2>/dev/null || echo x86_64)"
                 case "$ARCH_RAW" in aarch64|arm64) DARCH="arm64" ;; *) DARCH="x64" ;; esac
                 curl -fsSL "https://storage.googleapis.com/dart-archive/channels/{channel}/release/{rel}/sdk/dartsdk-linux-$DARCH-release.zip" -o /tmp/dart-sdk.zip
                 mkdir -p "$HOME/.dart"
                 unzip -q -o /tmp/dart-sdk.zip -d "$HOME/.dart"
                 rm /tmp/dart-sdk.zip
                 grep -q 'dart-sdk' "$HOME/.bashrc" || echo 'export PATH="$HOME/.dart/dart-sdk/bin:$PATH"' >> "$HOME/.bashrc""#,
                        channel = channel,
                        rel = rel_safe
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
                }
            } else if runtime_id == "flutter" {
                let has_snap = exec_output_limit("which", &["snap"], cmd_timeout_short())
                    .await
                    .is_ok();
                if has_snap {
                    logs.push("Installing Flutter via snap…".into());
                    sudo_bash_install_step(
                        "snap install flutter --classic",
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
                    let flutter_ch = match version.trim().to_lowercase().as_str() {
                        "beta" => "beta",
                        "master" => "master",
                        _ => "stable",
                    };
                    logs.push(format!(
              "snap not found — downloading Flutter SDK ({}) tarball into ~/.flutter-sdk…",
              flutter_ch
            ));
                    let cmd = format!(
                        r#"
              FLUTTER_JSON=$(curl -fsSL https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json 2>/dev/null)
              FLUTTER_ARCHIVE=$(echo "$FLUTTER_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(r['archive'] for r in d['releases'] if r['channel']=='{ch}'))" 2>/dev/null)
              if [ -z "$FLUTTER_ARCHIVE" ]; then
                echo "Could not resolve latest Flutter release URL" >&2; exit 1
              fi
              curl -fsSL "https://storage.googleapis.com/flutter_infra_release/releases/$FLUTTER_ARCHIVE" -o /tmp/flutter.tar.xz
              mkdir -p "$HOME/.flutter-sdk"
              tar xf /tmp/flutter.tar.xz -C "$HOME/.flutter-sdk" --strip-components=1
              rm /tmp/flutter.tar.xz
              grep -q 'flutter-sdk' "$HOME/.bashrc" || echo 'export PATH="$HOME/.flutter-sdk/bin:$PATH"' >> "$HOME/.bashrc"
            "#,
                        ch = flutter_ch
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
                }
            } else if (runtime_id == "php"
                || runtime_id == "ruby"
                || runtime_id == "lua"
                || runtime_id == "r")
                && method == "local"
            {
                if runtime_id == "php" {
                    // PHP source compilation is too slow and fragile on non-Debian systems.
                    // Always install via system package manager regardless of "local" track selection.
                    logs.push(
                        "Installing PHP via system package manager (source compile not supported)…"
                            .into(),
                    );
                    // Elevated via sudo_bash_install_step below — no sudo needed inline.
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
                    let ver_guess = lumina_first_version_token(&version)
                        .unwrap_or_else(|| version.trim().to_string())
                        .trim()
                        .trim_start_matches('v')
                        .to_string();
                    if ver_guess.is_empty() {
                        Err(
              "[RUNTIME_INSTALL_FAILED] Pick a concrete version for isolated install (examples: Ruby 3.3.5, Lua 5.4)."
                .to_string(),
            )
                    } else {
                        let spec = if ver_guess.contains('@') {
                            ver_guess.clone()
                        } else {
                            format!("{}@{}", runtime_id, ver_guess)
                        };
                        let safe_spec = spec.replace('\'', "'\\''").replace('"', "");
                        logs.push(format!(
              "Installing {} via mise (https://mise.jdx.dev) — downloads prebuilt binaries when available…",
              spec
            ));
                        let build_deps_cmd = if runtime_id == "lua" {
                            r#"
              if command -v dnf >/dev/null 2>&1; then
                sudo dnf install -y readline-devel 2>/dev/null || true
              elif command -v apt-get >/dev/null 2>&1; then
                sudo apt-get install -y libreadline-dev 2>/dev/null || true
              elif command -v pacman >/dev/null 2>&1; then
                sudo pacman -S --needed --noconfirm readline 2>/dev/null || true
              fi"#
                        } else {
                            ""
                        };
                        if !build_deps_cmd.is_empty() {
                            logs.push(format!(
                                "Pre-installing build dependencies for {}…",
                                runtime_id
                            ));
                            let _ = sudo_bash_install_step(
                                build_deps_cmd,
                                password_opt,
                                &mut logs,
                                Some(app.clone()),
                                Some(job_id.clone()),
                                5,
                                20,
                            )
                            .await;
                        }
                        let cmd = format!(
                            r#"set -e
                 export PATH="$HOME/.local/bin:$PATH"
                 if [ ! -x "$HOME/.local/bin/mise" ]; then
                   curl -fsSL https://mise.run | sh
                 fi
                 export PATH="$HOME/.local/bin:$PATH"
                 "$HOME/.local/bin/mise" install '{spec}'
                 "$HOME/.local/bin/mise" use -g '{spec}'
                 if ! grep -q 'mise activate' "$HOME/.bashrc" 2>/dev/null; then
                   echo 'eval "$($HOME/.local/bin/mise activate bash)"' >> "$HOME/.bashrc"
                 fi"#,
                            spec = safe_spec
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
                    }
                }
            } else if runtime_id == "julia" {
                let want = lumina_first_version_token(&version).unwrap_or_default();
                let want = want.trim().to_string();
                logs.push("Installing Julia via juliaup…".into());
                let cmd = if want.is_empty() {
                    r#"set -e
               export PATH="$HOME/.juliaup/bin:$PATH"
               if ! command -v juliaup >/dev/null 2>&1 && [ ! -x "$HOME/.juliaup/bin/juliaup" ]; then
                 curl -fsSL https://install.julialang.org | sh -s -- -y
               fi"#
              .to_string()
                } else {
                    let safe = want.replace('\'', "'\\''").replace('"', "");
                    format!(
                        r#"set -e
                 export PATH="$HOME/.juliaup/bin:$PATH"
                 if ! command -v juliaup >/dev/null 2>&1 && [ ! -x "$HOME/.juliaup/bin/juliaup" ]; then
                   curl -fsSL https://install.julialang.org | sh -s -- -y
                   export PATH="$HOME/.juliaup/bin:$PATH"
                 fi
                 export PATH="$HOME/.juliaup/bin:$PATH"
                 JUP="$HOME/.juliaup/bin/juliaup"
                 if [ ! -x "$JUP" ]; then
                   echo "[RUNTIME_INSTALL_FAILED] juliaup not found after install" >&2
                   exit 1
                 fi
                 "$JUP" status >/dev/null 2>&1 || true
                 juliaup_add() {{
                   if "$JUP" add "$1" 2>/dev/null; then return 0; fi
                   return 1
                 }}
                 if ! juliaup_add '{want}' && ! juliaup_add "release~{want}"; then
                   echo "[RUNTIME_INSTALL_FAILED] juliaup add failed for {want} (tried bare name and release~…)" >&2
                   "$JUP" add '{want}'
                 fi
                 juliaup_def() {{
                   if "$JUP" default "$1" 2>/dev/null; then return 0; fi
                   return 1
                 }}
                 if ! juliaup_def '{want}' && ! juliaup_def "release~{want}"; then
                   "$JUP" default '{want}'
                 fi"#,
                        want = safe
                    )
                };
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
                        logs.push(format!(
                            "No system packages known for '{}' on {}. Try local/rustup method.",
                            runtime_id, distro
                        ));
                        Ok(())
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
            } else if runtime_id == "bun" {
                logs.push("Removing Bun (~/.bun)…".into());
                exec_output_limit("bash", &["-lc", "rm -rf \"$HOME/.bun\" && sed -i '/BUN_INSTALL/d;/.bun\\/bin/d' \"$HOME/.bashrc\" \"$HOME/.zshrc\" 2>/dev/null || true"], cmd_timeout_install_step()).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e.trim()))
            } else if runtime_id == "flutter" {
                logs.push("Removing Flutter snap…".into());
                sudo_bash_install_step(
                    "snap remove flutter",
                    password_opt,
                    &mut logs,
                    Some(app.clone()),
                    Some(job_id.clone()),
                    10,
                    85,
                )
                .await
                .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e))
            } else if runtime_id == "julia" {
                // juliaup self uninstall doesn't accept -y; pipe stdin to confirm,
                // then fall back to manual directory removal if juliaup isn't found.
                let cmd = r#"
            if command -v juliaup > /dev/null 2>&1 || [ -x "$HOME/.juliaup/bin/juliaup" ]; then
              JULIAUP="$( command -v juliaup 2>/dev/null || echo "$HOME/.juliaup/bin/juliaup" )"
              echo y | "$JULIAUP" self uninstall 2>/dev/null || true
            fi
            rm -rf "$HOME/.juliaup" "$HOME/.julia" 2>/dev/null || true
            sed -i '/juliaup/d;/\.julia/d' "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile" "$HOME/.bash_profile" 2>/dev/null || true
          "#;
                logs.push("Removing Julia via juliaup and cleaning home directories…".into());
                exec_output_limit("bash", &["-lc", cmd], cmd_timeout_install_step())
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
            runtime_append_verify(&runtime_id, &effective_verify_method, &version, &mut logs).await;
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

pub(crate) fn effective_runtime_job_final_state(
    default_state: &str,
    current_state: &str,
) -> &'static str {
    if current_state == "cancelled" {
        "cancelled"
    } else if default_state == "failed" {
        "failed"
    } else {
        "completed"
    }
}

pub(crate) fn cancel_runtime_job(jobs: &mut [Value], id: &str) -> bool {
    if let Some(j) = jobs
        .iter_mut()
        .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(id))
    {
        if j.get("state").and_then(|v| v.as_str()) == Some("running") {
            j["state"] = json!("cancelled");
            j["logTail"] = json!(["Cancelled by user."]);
            return true;
        }
    }
    false
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

async fn runtime_set_julia_active(body: &Value, path: &Path) -> Value {
    if !path.to_string_lossy().contains("/.juliaup/bin/julia") {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Julia path (expected ~/.juliaup/bin/julia)." });
    }
    let channel = body
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    if channel.is_empty() {
        return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Julia channel name required (pass version)." });
    }
    let safe_channel = channel.replace('\'', "'\\''");
    let cmd = format!(
        "export PATH=\"$HOME/.juliaup/bin:$PATH\" \
         && juliaup default '{}'",
        safe_channel
    );
    match exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short()).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({
            "ok": false,
            "error": format!("[RUNTIME_SET_ACTIVE_FAILED] {}", e.trim())
        }),
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

    if runtime_id == "julia" {
        return runtime_set_julia_active(body, &path).await;
    }

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
        "zig" => {
            if path.file_name() != Some(OsStr::new("zig"))
                || !path.to_string_lossy().contains("/.local/share/lumina/zig/")
            {
                return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Zig path (expected ~/.local/share/lumina/zig/<ver>/zig)." });
            }
            let Some(zig_dir) = path.parent() else {
                return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve Zig install directory." });
            };
            let link = home.join(".local/share/lumina/zig/current");
            lumina_replace_symlink(&link, zig_dir)
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
        "php" | "ruby" | "lua" | "r" => {
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
            let safe_spec = format!("{}@{}", runtime_id, version).replace('\'', "'\\''");
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

// ── Extracted IPC handlers ──────────────────────────────────────────────

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

pub(crate) async fn handle_runtime_status() -> Value {
    // (id, display name, primary command, args, fallback commands)
    // Use a login shell so ~/.bashrc / ~/.profile PATH additions are active
    // (covers juliaup, nvm, bun, pyenv, etc. installed to user home dirs).
    let checks: &[(&str, &str)] = &[
        ("node", "Node.js"),
        ("python", "Python"),
        ("java", "Java"),
        ("go", "Go"),
        ("rust", "Rust"),
        ("php", "PHP"),
        ("ruby", "Ruby"),
        ("dotnet", ".NET"),
        ("bun", "Bun"),
        ("zig", "Zig"),
        ("c_cpp", "C/C++"),
        ("matlab", "Octave"),
        ("dart", "Dart"),
        ("flutter", "Flutter"),
        ("julia", "Julia"),
        ("lua", "Lua"),
        ("lisp", "SBCL"),
        ("r", "R"),
    ];

    let mut tasks: Vec<(String, String, _)> = Vec::new();
    for &(id, name) in checks {
        let shell_cmd = status_probe_script(id).unwrap_or_default();
        if shell_cmd.is_empty() {
            continue;
        }
        let id = id.to_string();
        let name = name.to_string();
        let id_clone = id.clone();
        let name_clone = name.clone();
        tasks.push((
            id_clone,
            name_clone,
            tokio::spawn(async move {
                match exec_result_limit("bash", &["-lc", &shell_cmd], cmd_timeout_short()).await {
                    Ok((stdout, stderr)) => {
                        let version = lumina_probe_meaningful_line(&stdout, &stderr);
                        if version.is_empty() {
                            json!({ "id": id, "name": name, "installed": false })
                        } else {
                            json!({ "id": id, "name": name, "installed": true, "version": version })
                        }
                    }
                    Err(_) => json!({ "id": id, "name": name, "installed": false }),
                }
            }),
        ));
    }

    let mut runtimes = Vec::new();
    for (id, name, t) in tasks {
        match t.await {
            Ok(val) => runtimes.push(val),
            Err(_) => runtimes.push(json!({ "id": id, "name": name, "installed": false })),
        }
    }
    json!({ "ok": true, "runtimes": runtimes })
}

async fn collect_discovered_tab_versions(script: String, versions: &mut Vec<Value>) {
    if let Ok(raw) = exec_output_limit("bash", &["-lc", &script], cmd_timeout_short()).await {
        for (v, p, explicit_label, java_home) in parse_version_path_lines(&raw) {
            let mut row = json!({ "version": v, "path": p });
            if let Some(label) = explicit_label {
                row["label"] = json!(label);
            } else {
                let label = flutter_or_short_label(&v);
                if label != v {
                    row["label"] = json!(label);
                }
            }
            if let Some(home) = java_home {
                row["javaHome"] = json!(home);
            }
            versions.push(row);
        }
    }
}

fn sort_java_developer_versions(versions: &mut [Value]) {
    versions.sort_by(|a, b| {
        let va = a.get("version").and_then(|v| v.as_str()).unwrap_or("");
        let vb = b.get("version").and_then(|v| v.as_str()).unwrap_or("");
        vb.cmp(va)
    });
}

fn flutter_or_short_label(version: &str) -> String {
    if version.starts_with("Flutter ") {
        version
            .strip_prefix("Flutter ")
            .unwrap_or(version)
            .split_whitespace()
            .next()
            .unwrap_or(version)
            .to_string()
    } else {
        version.to_string()
    }
}

async fn collect_rust_installed_versions(versions: &mut Vec<Value>) {
    if let Ok(raw) = exec_output_limit(
        "bash",
        &["-lc", "unset RUSTUP_TOOLCHAIN; [ -x \"$HOME/.cargo/bin/rustup\" ] && \"$HOME/.cargo/bin/rustup\" toolchain list 2>/dev/null || true"],
        cmd_timeout_short(),
    )
    .await
    {
        let home = std::env::var("HOME").unwrap_or_default();
        for line in raw.lines() {
            let Some((tc, is_default)) = parse_rustup_toolchain_line(line) else {
                continue;
            };
            let rustc_bin = format!("{}/.rustup/toolchains/{}/bin/rustc", home, tc);
            if !std::path::Path::new(&rustc_bin).exists() {
                continue;
            }
            let label = exec_output_limit(
                "bash",
                &["-lc", &format!("\"{}\" --version 2>/dev/null | head -1", rustc_bin.replace('\"', "\\\""))],
                cmd_timeout_short(),
            )
            .await
            .ok()
            .map(|s| rust_toolchain_display_label(&tc, s.trim()))
            .unwrap_or_else(|| rust_toolchain_short_name(&tc));
            versions.push(json!({
                "version": tc,
                "path": rustc_bin,
                "label": label,
                "isDefault": is_default,
            }));
        }
    }
}

async fn collect_julia_installed_versions(versions: &mut Vec<Value>) {
    if let Ok(raw) = exec_output_limit(
        "bash",
        &["-lc", "export PATH=\"$HOME/.juliaup/bin:$PATH\"; juliaup status 2>/dev/null | tail -n +3 || true"],
        cmd_timeout_short(),
    )
    .await
    {
        let julia_bin = format!(
            "{}/.juliaup/bin/julia",
            std::env::var("HOME").unwrap_or_default()
        );
        for line in raw.lines() {
            if let Some((channel, label, is_default)) = parse_juliaup_status_line(line) {
                versions.push(json!({
                    "version": channel,
                    "path": julia_bin,
                    "label": label,
                    "isDefault": is_default,
                }));
            }
        }
    }
}

pub(crate) async fn handle_runtime_installed_versions(body: &Value) -> Value {
    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    if runtime_id.is_empty() {
        return json!({ "ok": false, "error": "[RUNTIME_INSTALLED_VERSIONS_INVALID] Missing runtimeId." });
    }

    let mut versions: Vec<Value> = Vec::new();

    match runtime_id {
        "rust" => collect_rust_installed_versions(&mut versions).await,
        "julia" => collect_julia_installed_versions(&mut versions).await,
        "bun" => {
            let bun_bin = format!("{}/.bun/bin/bun", std::env::var("HOME").unwrap_or_default());
            if std::path::Path::new(&bun_bin).exists() {
                versions.push(json!({ "version": "installed", "path": bun_bin, "isDefault": true }));
            }
        }
        "php" => {
            collect_discovered_tab_versions(list_mise_runtime_script("php", "php", "php"), &mut versions)
                .await;
        }
        "ruby" => {
            collect_discovered_tab_versions(list_mise_runtime_script("ruby", "ruby", "ruby"), &mut versions)
                .await;
        }
        "lua" => {
            collect_discovered_tab_versions(list_mise_runtime_script("lua", "lua", "lua"), &mut versions)
                .await;
        }
        "r" => {
            collect_discovered_tab_versions(list_mise_runtime_script("r", "r", "R"), &mut versions)
                .await;
        }
        id => {
            if let Some(script) = list_installed_versions_script(id) {
                collect_discovered_tab_versions(script, &mut versions).await;
            }
        }
    }

    if runtime_id == "java" {
        sort_java_developer_versions(&mut versions);
    }

    if runtime_id != "julia" && runtime_id != "rust" {
        if let Some(active) = runtime_active_binary_path(runtime_id).await {
            mark_default_installed_versions(&mut versions, &active);
        }
    }
    if versions.is_empty() {
        if let Some(entry) = probe_single_installed_version(runtime_id).await {
            versions.push(entry);
        }
    }
    ensure_single_installed_version_default(&mut versions);

    json!({ "ok": true, "versions": versions })
}

pub(crate) async fn handle_runtime_get_versions(body: &Value) -> Value {
    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or("node");
    let method = body
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("local");
    let mut versions: Vec<String> = Vec::new();
    if method == "system" {
        let distro = exec_output(
            "bash",
            &[
                "-lc",
                "source /etc/os-release 2>/dev/null && printf '%s' \"${ID:-unknown}\"",
            ],
        )
        .await
        .unwrap_or_else(|_| "unknown".to_string());
        let pkg_mgr = runtime_pkg_mgr(distro.trim());
        match runtime_id {
            "c_cpp" => {
                let discovered = runtime_dnf_repoquery_versions("gcc", 25).await;
                if discovered.is_empty() {
                    versions.push("system (repo default)".into());
                } else {
                    for v in discovered {
                        versions.push(format!("gcc {}", v));
                    }
                }
            }
            "matlab" => {
                let discovered = runtime_dnf_repoquery_versions("octave", 20).await;
                if discovered.is_empty() {
                    versions.push("system (repo default)".into());
                } else {
                    for v in discovered {
                        versions.push(format!("octave {}", v));
                    }
                }
            }
            "node" | "python" | "go" | "php" | "ruby" | "zig" | "lua" | "lisp" | "r" => {
                versions.push("system (repo default)".into());
            }
            "bun" | "dart" | "flutter" | "julia" | "rust" => {
                versions.push("local installer (recommended)".into());
            }
            "java" => {
                for label in ["21 (LTS)", "17 (LTS)", "11 (LTS)", "8 (LTS)"] {
                    if let Some(pkg) = runtime_java_system_packages_for_version(pkg_mgr, label)
                        .into_iter()
                        .next()
                    {
                        if runtime_system_package_available(pkg_mgr, &pkg).await {
                            versions.push(label.to_string());
                        }
                    }
                }
                let latest_pkg = if pkg_mgr == "dnf" {
                    "java-latest-openjdk-devel"
                } else {
                    ""
                };
                if !latest_pkg.is_empty()
                    && runtime_system_package_available(pkg_mgr, latest_pkg).await
                {
                    versions.push("latest (repo)".into());
                }
                if versions.is_empty() {
                    versions.push("system (repo default)".into());
                }
            }
            "dotnet" => versions.push("8.0 (LTS)".into()),
            _ => versions.push("system (repo default)".into()),
        }
        return json!({ "ok": true, "versions": versions });
    }
    match runtime_id {
        "node" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &["-fsSL", "https://nodejs.org/dist/index.json"],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
                    if let Some(list) = arr.as_array() {
                        for item in list.iter().take(25) {
                            if let (Some(v), Some(lts)) = (
                                item.get("version").and_then(|x| x.as_str()),
                                item.get("lts"),
                            ) {
                                let label = if lts.is_string() {
                                    format!("{} (LTS: {})", v, lts.as_str().unwrap())
                                } else if lts.as_bool().unwrap_or(false) {
                                    format!("{} (LTS)", v)
                                } else {
                                    v.to_string()
                                };
                                versions.push(label);
                            }
                        }
                    }
                }
            }
        }
        "rust" => versions.extend(["stable".into(), "beta".into(), "nightly".into()]),
        "python" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &["-fsSL", "https://endoflife.date/api/python.json"],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
                    if let Some(list) = arr.as_array() {
                        for item in list.iter() {
                            let is_eol = !matches!(item.get("eol"), Some(Value::Bool(false)));
                            if is_eol {
                                continue;
                            }
                            if let Some(v) = item.get("latest").and_then(|x| x.as_str()) {
                                versions.push(v.to_string());
                            }
                            if versions.len() >= 8 {
                                break;
                            }
                        }
                    }
                }
            }
            if versions.is_empty() {
                versions.extend([
                    "3.13.3".into(),
                    "3.12.10".into(),
                    "3.11.12".into(),
                    "3.10.17".into(),
                ]);
            }
        }
        "go" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &["-fsSL", "https://go.dev/dl/?mode=json&include=all"],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
                    if let Some(list) = arr.as_array() {
                        for item in list.iter().take(30) {
                            if let Some(v) = item.get("version").and_then(|x| x.as_str()) {
                                versions.push(v.trim_start_matches("go").to_string());
                            }
                        }
                    }
                }
            }
        }
        "java" => {
            versions.extend([
                "21 (LTS)".into(),
                "17 (LTS)".into(),
                "11 (LTS)".into(),
                "8 (LTS)".into(),
            ]);
        }
        "php" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &["-fsSL", "https://endoflife.date/api/php.json"],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
                    if let Some(list) = arr.as_array() {
                        for item in list.iter().take(10) {
                            if let Some(v) = item.get("latest").and_then(|x| x.as_str()) {
                                versions.push(v.to_string());
                            }
                        }
                    }
                }
            }
            if versions.is_empty() {
                versions.extend(["8.3".into(), "8.2".into(), "8.1".into(), "8.0".into()]);
            }
        }
        "ruby" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &["-fsSL", "https://endoflife.date/api/ruby.json"],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
                    if let Some(list) = arr.as_array() {
                        for item in list.iter().take(10) {
                            if let Some(v) = item.get("latest").and_then(|x| x.as_str()) {
                                versions.push(v.to_string());
                            }
                        }
                    }
                }
            }
            if versions.is_empty() {
                versions.extend([
                    "3.3.0".into(),
                    "3.2.3".into(),
                    "3.1.4".into(),
                    "3.0.6".into(),
                ]);
            }
        }
        "dotnet" => versions.extend([
            "9.0".into(),
            "8.0 (LTS)".into(),
            "7.0".into(),
            "6.0 (LTS)".into(),
        ]),
        "bun" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &[
                    "-fsSL",
                    "https://api.github.com/repos/oven-sh/bun/releases?per_page=20",
                ],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
                    if let Some(list) = arr.as_array() {
                        for item in list.iter().take(15) {
                            if let Some(v) = item.get("tag_name").and_then(|x| x.as_str()) {
                                versions.push(v.trim_start_matches("bun-v").to_string());
                            }
                        }
                    }
                }
            }
            if versions.is_empty() {
                versions.extend([
                    "1.2.0".into(),
                    "1.1.45".into(),
                    "1.1.44".into(),
                    "1.1.43".into(),
                ]);
            }
        }
        "zig" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &["-fsSL", "https://ziglang.org/download/index.json"],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(obj) = serde_json::from_str::<Value>(&raw) {
                    if let Some(map) = obj.as_object() {
                        for key in map.keys().take(10) {
                            if key != "master" {
                                versions.push(key.clone());
                            }
                        }
                    }
                }
            }
            if versions.is_empty() {
                versions.extend(["0.14.0".into(), "0.13.0".into(), "0.12.0".into()]);
            }
        }
        "julia" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &["-fsSL", "https://endoflife.date/api/julia.json"],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
                    if let Some(list) = arr.as_array() {
                        for item in list.iter().take(10) {
                            if let Some(v) = item.get("latest").and_then(|x| x.as_str()) {
                                versions.push(v.to_string());
                            }
                        }
                    }
                }
            }
            if versions.is_empty() {
                versions.extend(["1.11.5".into(), "1.10.9".into(), "1.9.4".into()]);
            }
        }
        "c_cpp" => {
            let discovered = runtime_dnf_repoquery_versions("gcc", 30).await;
            if discovered.is_empty() {
                versions.extend(["system (repo default)".into()]);
            } else {
                for v in discovered {
                    versions.push(format!("gcc {}", v));
                }
            }
        }
        "matlab" => {
            let discovered = runtime_dnf_repoquery_versions("octave", 20).await;
            if discovered.is_empty() {
                versions.extend(["system (repo default)".into()]);
            } else {
                for v in discovered {
                    versions.push(format!("octave {}", v));
                }
            }
        }
        "dart" => {
            versions.extend(["stable".into(), "beta".into(), "dev".into()]);
            versions.push("beta/<semver> (zip)".into());
            versions.push("stable/<semver> (zip)".into());
        }
        "flutter" => versions.extend(["stable".into(), "beta".into(), "master".into()]),
        "lua" => versions.extend(["5.4".into(), "5.3".into()]),
        "lisp" => versions.extend(["system (sbcl)".into()]),
        "r" => versions.extend(["4.4".into(), "4.3".into(), "4.2".into()]),
        _ => {}
    }
    if versions.is_empty() {
        versions.push("latest".into());
    }
    json!({ "ok": true, "versions": versions })
}

pub(crate) async fn handle_runtime_check_deps(body: &Value) -> Value {
    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or("node");
    let tools: Vec<(&str, &str)> = match runtime_id {
        "node"    => vec![("node", "node --version"), ("npm", "npm --version"), ("curl", "curl --version")],
        "python"  => vec![("python3", "python3 --version 2>&1 || python --version 2>&1"), ("pip3", "pip3 --version 2>&1 || pip --version 2>&1")],
        "go"      => vec![("go", "go version"), ("gcc", "gcc --version")],
        "rust"    => vec![("rustc", "rustc --version"), ("cargo", "cargo --version"), ("rustup", "rustup --version")],
        "java"    => vec![("java", "java -version 2>&1"), ("javac", "javac -version 2>&1")],
        "php"     => vec![("php", "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); php --version 2>&1 | head -1"), ("composer", "composer --version 2>/dev/null")],
        "ruby"    => vec![("ruby", "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); ruby --version"), ("gem", "gem --version")],
        "dotnet"  => vec![("dotnet", "dotnet --version 2>/dev/null || ~/.dotnet/dotnet --version 2>/dev/null")],
        "bun"     => vec![("bun", "bun --version 2>/dev/null || ~/.bun/bin/bun --version 2>/dev/null"), ("unzip", "unzip -v"), ("curl", "curl --version")],
        "zig"     => vec![("zig", "zig version"), ("tar", "tar --version")],
        "c_cpp"   => vec![("gcc", "gcc --version"), ("g++", "g++ --version"), ("make", "make --version"), ("cmake", "cmake --version"), ("gdb", "gdb --version")],
        "matlab"  => vec![("octave", "octave --version")],
        "dart"    => vec![("dart", "dart --version 2>&1 || $HOME/.dart/dart-sdk/bin/dart --version 2>&1"), ("curl", "curl --version")],
        "flutter" => vec![("flutter", "flutter --version 2>&1 | head -1 || $HOME/.flutter-sdk/bin/flutter --version 2>&1 | head -1"), ("dart", "dart --version 2>&1 || $HOME/.dart/dart-sdk/bin/dart --version 2>&1"), ("git", "git --version")],
        "julia"   => vec![("julia", "export PATH=\"$HOME/.juliaup/bin:$PATH\"; julia --version 2>/dev/null || ~/.juliaup/bin/julia --version 2>/dev/null"), ("curl", "curl --version")],
        "lua"     => vec![("lua", "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); lua -v 2>&1 || lua5.4 -v 2>&1"), ("readline-devel (build dep)", "rpm -q readline-devel 2>/dev/null || dpkg -l libreadline-dev 2>/dev/null | grep -q '^ii' && echo ok || echo missing")],
        "lisp"    => vec![("sbcl", "sbcl --version")],
        "r"       => vec![("R", "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); R --version 2>&1 | head -1")],
        _         => vec![],
    };
    let mut deps: Vec<Value> = Vec::new();
    for (name, shell_cmd) in tools {
        let ok = exec_result_limit("bash", &["-lc", shell_cmd], cmd_timeout_short())
            .await
            .map(|(so, se)| !format!("{}{}", so, se).trim().is_empty())
            .unwrap_or(false);
        deps.push(
            json!({ "name": name, "status": if ok { "installed" } else { "missing" }, "ok": ok }),
        );
    }
    json!({ "ok": true, "dependencies": deps })
}

pub(crate) async fn handle_runtime_uninstall_preview(body: &Value) -> Value {
    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or("node");
    let remove_mode = body
        .get("removeMode")
        .and_then(|v| v.as_str())
        .unwrap_or("runtime_only");
    let distro = exec_output(
        "sh",
        &[
            "-c",
            ". /etc/os-release 2>/dev/null; printf '%s' \"${ID:-unknown}\"",
        ],
    )
    .await
    .unwrap_or_else(|_| "unknown".to_string());
    let distro = distro.trim().to_string();
    let pkg_mgr = runtime_pkg_mgr(&distro);
    let pkgs = runtime_system_packages(runtime_id, pkg_mgr);

    let mut pkg_vals: Vec<Value> = pkgs.iter().map(|p| json!(p)).collect();
    let mut note: String;

    match runtime_id {
        "rust" => {
            note = "Rust is managed by rustup. This will run 'rustup self uninstall'.".to_string();
            pkg_vals = vec![json!("rustup")];
        }
        "bun" => {
            note = "Bun was installed via the official installer. This will remove ~/.bun."
                .to_string();
            pkg_vals = vec![json!("~/.bun (directory)")];
        }
        "dart" => {
            note = format!("Dart was installed via apt. Removal will use {}.", pkg_mgr);
            pkg_vals = vec![json!("dart")];
        }
        "flutter" => {
            note =
                "Flutter was installed via snap. This will run 'snap remove flutter'.".to_string();
            pkg_vals = vec![json!("flutter (snap)")];
        }
        "julia" => {
            note = "Removes juliaup + cleans ~/.juliaup and ~/.julia. No sudo needed.".to_string();
            pkg_vals = vec![json!("~/.juliaup"), json!("~/.julia")];
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
        } else if !matches!(runtime_id, "rust" | "bun" | "dart" | "flutter" | "julia") {
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

    let uses_pkg_mgr = !matches!(runtime_id, "rust" | "bun" | "julia" | "dart" | "flutter");
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
        "blockedSharedDeps": [],
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

    const NVM_MARKER: &str = "/.nvm/versions/node/";
    const PYENV_MARKER: &str = "/.pyenv/versions/";
    const RUSTUP_MARKER: &str = "/.rustup/toolchains/";

    if path_str.contains(NVM_MARKER) {
        let tag = path_segment_after_marker(path_str, NVM_MARKER).unwrap_or_else(|| version.clone());
        if tag.is_empty() {
            return json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not determine nvm version tag." });
        }
        let cmd = format!(
            r#"export NVM_DIR="${{NVM_DIR:-$HOME/.nvm}}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm uninstall '{}' 2>&1"#,
            tag.replace('\'', "'\\''")
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

    let home = std::env::var("HOME").unwrap_or_default();
    if path_str.contains("/.dart/dart-sdk") {
        let dart_sdk = path_home_before_marker(path_str, "/.dart/dart-sdk")
            .map(|h| h.join(".dart").join("dart-sdk"))
            .unwrap_or_else(|| PathBuf::from(format!("{}/.dart/dart-sdk", home)));
        return match std::fs::remove_dir_all(&dart_sdk) {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({
                "ok": false,
                "error": format!("[REMOVE_VERSION_FAILED] could not remove Dart SDK: {}", e)
            }),
        };
    }

    if path_str.contains("/.flutter-sdk") || path_str.contains("/.flutter/") {
        let flutter_dir = if path_str.contains("/.flutter-sdk") {
            path_home_before_marker(path_str, "/.flutter-sdk")
                .map(|h| h.join(".flutter-sdk"))
                .unwrap_or_else(|| PathBuf::from(format!("{}/.flutter-sdk", home)))
        } else {
            path_home_before_marker(path_str, "/.flutter/")
                .map(|h| h.join(".flutter"))
                .unwrap_or_else(|| PathBuf::from(format!("{}/.flutter", home)))
        };
        return match std::fs::remove_dir_all(&flutter_dir) {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({
                "ok": false,
                "error": format!("[REMOVE_VERSION_FAILED] could not remove Flutter SDK: {}", e)
            }),
        };
    }

    if runtime_id == "julia" || path_str.contains("/.juliaup/") {
        if version.is_empty() {
            return json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] Julia channel name required." });
        }
        let cmd = format!(
            r#"export PATH="$HOME/.juliaup/bin:$PATH"; juliaup remove '{}' 2>&1"#,
            version.replace('\'', "'\\''")
        );
        return match exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short()).await {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] juliaup remove: {}", e.trim()) }),
        };
    }

    let mise_marker = format!("/.local/share/mise/installs/{}/", runtime_id);
    if path_str.contains(&mise_marker) || matches!(runtime_id, "php" | "ruby" | "lua" | "r") {
        let mise_version =
            path_segment_after_marker(path_str, &mise_marker).unwrap_or_else(|| version.clone());
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

    json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] path is not in a recognised version manager directory (lumina / nvm / pyenv / rustup / juliaup / mise)." })
}

async fn runtime_active_binary_path(runtime_id: &str) -> Option<String> {
    let script = active_binary_script(runtime_id)?;
    let out = exec_output_limit("bash", &["-lc", &script], cmd_timeout_short())
        .await
        .ok()?;
    let path = out.lines().find(|l| !l.trim().is_empty())?.trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

fn paths_refer_to_same_binary(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => false,
    }
}

fn active_match_score(path: &str, active_path: &str, label: Option<&str>) -> Option<u8> {
    if path != active_path && !paths_refer_to_same_binary(path, active_path) {
        return None;
    }
    if path == active_path {
        return Some(0);
    }
    let rank = match label {
        Some(l) if l.starts_with("JDK ") && !l.starts_with("JDK compiler") => 1,
        Some(l) if l.starts_with("System default") => 2,
        Some(l) if l.starts_with("JRE ") => 3,
        Some(l) if l.starts_with("JDK compiler") => 4,
        _ => 5,
    };
    Some(rank)
}

fn mark_default_installed_versions(versions: &mut [Value], active_path: &str) {
    let mut best: Option<(usize, u8)> = None;
    for (i, entry) in versions.iter().enumerate() {
        let Some(path) = entry.get("path").and_then(|v| v.as_str()) else {
            continue;
        };
        let label = entry.get("label").and_then(|v| v.as_str());
        let Some(score) = active_match_score(path, active_path, label) else {
            continue;
        };
        if best.map(|(_, s)| score < s).unwrap_or(true) {
            best = Some((i, score));
        }
    }
    for entry in versions.iter_mut() {
        if let Some(obj) = entry.as_object_mut() {
            obj.remove("isDefault");
        }
    }
    if let Some((i, _)) = best {
        if let Some(obj) = versions[i].as_object_mut() {
            obj.insert("isDefault".to_string(), json!(true));
        }
    }
}

fn ensure_single_installed_version_default(versions: &mut [Value]) {
    if versions.len() != 1 {
        return;
    }
    let already = versions
        .first()
        .and_then(|v| v.get("isDefault").and_then(|x| x.as_bool()))
        .unwrap_or(false);
    if already {
        return;
    }
    if let Some(obj) = versions[0].as_object_mut() {
        obj.insert("isDefault".to_string(), json!(true));
    }
}

fn parse_rustup_toolchain_line(line: &str) -> Option<(String, bool)> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let is_default = trimmed.contains("(default)") || trimmed.contains(", default)");
    let tc = trimmed.split('(').next()?.trim();
    if tc.is_empty() {
        None
    } else {
        Some((tc.to_string(), is_default))
    }
}

fn rust_toolchain_short_name(tc: &str) -> String {
    tc.split('-').next().unwrap_or(tc).to_string()
}

fn rust_toolchain_display_label(tc: &str, rustc_version_line: &str) -> String {
    let channel = rust_toolchain_short_name(tc);
    let ver = rustc_version_line
        .trim()
        .strip_prefix("rustc ")
        .unwrap_or(rustc_version_line)
        .split_whitespace()
        .next()
        .unwrap_or(channel.as_str());
    format!("{} ({})", ver, channel)
}

async fn probe_single_installed_version(runtime_id: &str) -> Option<Value> {
    let path = runtime_active_binary_path(runtime_id).await?;
    let probe = status_probe_script(runtime_id)?;
    let raw = exec_output_limit("bash", &["-lc", &probe], cmd_timeout_short())
        .await
        .ok()?;
    let label = lumina_probe_meaningful_line(&raw, "");
    if label.is_empty() {
        return None;
    }
    Some(json!({
        "version": "system",
        "path": path,
        "label": label,
        "isDefault": true,
    }))
}

/// Parse one line of `juliaup status` (installed channels only).
fn parse_juliaup_status_line(line: &str) -> Option<(String, String, bool)> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.chars().all(|c| c == '-') {
        return None;
    }
    if trimmed.contains("Default") && trimmed.contains("Channel") {
        return None;
    }
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.is_empty() {
        return None;
    }
    let (start, is_default) = if parts[0] == "*" {
        (1, true)
    } else {
        (0, false)
    };
    if parts.len() <= start + 1 {
        return None;
    }
    let channel = parts[start].to_string();
    let version_raw = parts[start + 1];
    let label = version_raw.split('+').next().unwrap_or(version_raw).to_string();
    Some((channel, label, is_default))
}

pub(crate) async fn handle_job_cancel(state: &AppState, body: &Value) -> Value {
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let mut jobs = state.jobs.lock().await;
    let _ = cancel_runtime_job(&mut jobs, id.as_str());
    json!({ "ok": true })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn job_runner_cancel_marks_running_job() {
        let mut jobs = vec![json!({
          "id": "job-1",
          "state": "running",
          "logTail": ["start"]
        })];
        let changed = cancel_runtime_job(&mut jobs, "job-1");
        assert!(changed, "expected running job to be cancelled");
        assert_eq!(jobs[0]["state"], json!("cancelled"));
        assert_eq!(jobs[0]["logTail"], json!(["Cancelled by user."]));
    }

    #[test]
    fn job_runner_cancel_does_not_change_non_running_job() {
        let mut jobs = vec![json!({
          "id": "job-2",
          "state": "completed",
          "logTail": ["done"]
        })];
        let changed = cancel_runtime_job(&mut jobs, "job-2");
        assert!(!changed, "completed job should not be modified");
        assert_eq!(jobs[0]["state"], json!("completed"));
        assert_eq!(jobs[0]["logTail"], json!(["done"]));
    }

    #[test]
    fn parse_juliaup_status_default_channel() {
        let (channel, label, is_default) =
            parse_juliaup_status_line("       *  1.6.7    1.6.7+0.x64.linux.gnu").unwrap();
        assert_eq!(channel, "1.6.7");
        assert_eq!(label, "1.6.7");
        assert!(is_default);
    }

    #[test]
    fn parse_juliaup_status_release_channel() {
        let (channel, label, is_default) =
            parse_juliaup_status_line("          release  1.12.6+0.x64.linux.gnu").unwrap();
        assert_eq!(channel, "release");
        assert_eq!(label, "1.12.6");
        assert!(!is_default);
    }

    #[test]
    fn parse_rustup_toolchain_active_default() {
        let (tc, is_default) =
            parse_rustup_toolchain_line("stable-x86_64-unknown-linux-gnu (active, default)").unwrap();
        assert_eq!(tc, "stable-x86_64-unknown-linux-gnu");
        assert!(is_default);
    }

    #[test]
    fn parse_rustup_toolchain_beta_not_default() {
        let (tc, is_default) =
            parse_rustup_toolchain_line("beta-x86_64-unknown-linux-gnu").unwrap();
        assert_eq!(tc, "beta-x86_64-unknown-linux-gnu");
        assert!(!is_default);
    }

    #[test]
    fn rust_toolchain_display_label_formats_channel() {
        let label = rust_toolchain_display_label(
            "stable-x86_64-unknown-linux-gnu",
            "rustc 1.96.0 (ac68faa20 2026-05-25)",
        );
        assert_eq!(label, "1.96.0 (stable)");
    }

    #[test]
    fn parse_juliaup_status_skips_separator() {
        assert!(parse_juliaup_status_line("--------------------------------------------------").is_none());
    }

    #[test]
    fn mark_default_installed_versions_by_path() {
        let mut versions = vec![
            json!({ "version": "3.12.0", "path": "/home/u/.pyenv/versions/3.12.0/bin/python" }),
            json!({ "version": "3.14.5", "path": "/home/u/.pyenv/versions/3.14.5/bin/python" }),
        ];
        mark_default_installed_versions(
            &mut versions,
            "/home/u/.pyenv/versions/3.14.5/bin/python",
        );
        assert_eq!(versions[0].get("isDefault"), None);
        assert_eq!(versions[1].get("isDefault"), Some(&json!(true)));
    }

    #[test]
    fn ensure_single_installed_version_default_marks_lone_entry() {
        let mut versions = vec![json!({ "version": "v25.2.0", "path": "/home/u/.nvm/versions/node/v25.2.0/bin/node" })];
        ensure_single_installed_version_default(&mut versions);
        assert_eq!(versions[0].get("isDefault"), Some(&json!(true)));
    }

    #[test]
    fn effective_final_state_prefers_cancelled_state() {
        assert_eq!(
            effective_runtime_job_final_state("completed", "cancelled"),
            "cancelled"
        );
        assert_eq!(
            effective_runtime_job_final_state("failed", "cancelled"),
            "cancelled"
        );
        assert_eq!(
            effective_runtime_job_final_state("failed", "running"),
            "failed"
        );
        assert_eq!(
            effective_runtime_job_final_state("completed", "running"),
            "completed"
        );
    }
}
