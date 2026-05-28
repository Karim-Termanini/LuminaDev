use super::*;
use crate::runtime_packages::pkg_remove_with_deps_cmd;

// Explicit imports for extracted handler functions (also available via use super::*)
use crate::host_exec::{
    cmd_timeout_short, exec_output, exec_output_limit, exec_result_limit,
    get_global_daemon_auto_restart, get_global_thread_pool_size,
};
use crate::runtime_packages::{
    runtime_java_system_packages_for_version, runtime_pkg_mgr, runtime_preview_removable_deps,
    runtime_system_package_available, runtime_system_packages,
};
use crate::runtime_versioning::{lumina_probe_meaningful_line, runtime_dnf_repoquery_versions};

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
                                        let alt_cmd = format!(
                        "JAVA_BIN=$(rpm -ql {pkg} 2>/dev/null | awk '/\\/bin\\/java$/'\"'\"'{{print; exit}}'\"'\"') ; \
                         JAVAC_BIN=$(rpm -ql {pkg} 2>/dev/null | awk '/\\/bin\\/javac$/'\"'\"'{{print; exit}}'\"'\"') ; \
                         [ -n \"$JAVA_BIN\" ] && alternatives --set java \"$JAVA_BIN\" || true ; \
                         [ -n \"$JAVAC_BIN\" ] && alternatives --set javac \"$JAVAC_BIN\" || true",
                        pkg = pkg
                      );
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
            } else if (runtime_id == "php" || runtime_id == "ruby" || runtime_id == "lua")
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
                    && !matches!(
                        runtime_id.as_str(),
                        "node"
                            | "python"
                            | "go"
                            | "zig"
                            | "rust"
                            | "bun"
                            | "dart"
                            | "flutter"
                            | "julia"
                            | "php"
                            | "ruby"
                            | "lua"
                    )
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
                            if combined.contains("nothing to do")
                                || combined.contains("0 upgraded")
                                || combined.contains("nothing to upgrade")
                                || combined.contains("there is nothing to do")
                            {
                                logs.push(
                                    "already latest — package manager reports nothing to upgrade."
                                        .to_string(),
                                );
                            } else {
                                logs.push("update finished successfully".to_string());
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
                        let cmd = format!("cd '{}' && docker compose down", from_dir.display());
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
                let overlay = if compose_profiles::compose_full_overlay_enabled(&to_dir) {
                    "-f docker-compose.yml -f docker-compose.full.yml"
                } else {
                    "-f docker-compose.yml"
                };
                // We do a pull first to show download progress, then up -d
                let cmd = format!("export PROJECT_DIR='{}' && cd '{}' && docker compose --progress plain {} pull && docker compose {} up -d", project_dir, to_dir.display(), overlay, overlay);
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

        if matches!(kind.as_str(), "runtime_install" | "install_deps") {
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
        "java" => {
            if !path.ends_with(Path::new("bin/java"))
                || !path
                    .to_string_lossy()
                    .contains("/.local/share/lumina/java/jdk-")
            {
                return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Unsupported Java path (expected ~/.local/share/lumina/java/jdk-*/bin/java)." });
            }
            let Some(jdk_dir) = path.parent().and_then(|p| p.parent()) else {
                return json!({ "ok": false, "error": "[RUNTIME_SET_ACTIVE_FAILED] Could not resolve Java install directory." });
            };
            let link = home.join(".local/share/lumina/java/current");
            lumina_replace_symlink(&link, jdk_dir)
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
    let checks: &[(&str, &str, &str)] = &[
        ("node",    "Node.js", "node --version"),
        ("python",  "Python",  "python3 --version 2>&1 || python --version 2>&1"),
        ("java",    "Java",    "java -version 2>&1"),
        ("go",      "Go",      "go version"),
        ("rust",    "Rust",    "rustc --version"),
        ("php",     "PHP",     "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); php --version 2>&1 | head -1"),
        ("ruby",    "Ruby",    "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); ruby --version"),
        ("dotnet",  ".NET",    "dotnet --version 2>/dev/null || ~/.dotnet/dotnet --version 2>/dev/null"),
        ("bun",     "Bun",     "bun --version 2>/dev/null || ~/.bun/bin/bun --version 2>/dev/null"),
        ("zig",     "Zig",     "([ -x \"$HOME/.local/share/lumina/zig/current/zig\" ] && \"$HOME/.local/share/lumina/zig/current/zig\" version 2>&1) || (command -v zig >/dev/null 2>&1 && zig version 2>&1)"),
        ("c_cpp",   "C/C++",   "gcc --version 2>&1 | head -1"),
        ("matlab",  "Octave",  "octave --version 2>&1 | head -1"),
        ("dart",    "Dart",    "dart --version 2>&1 | head -1 || $HOME/.dart/dart-sdk/bin/dart --version 2>&1 | head -1"),
        ("flutter", "Flutter", "FOUND=0; for d in \"$HOME/.local/share/lumina/flutter/stable\" \"$HOME/.local/share/lumina/flutter/beta\" \"$HOME/.local/share/lumina/flutter/master\" \"$HOME/flutter\" \"$HOME/.flutter-sdk\"; do [ -x \"$d/bin/flutter\" ] && { cat \"$d/version\" 2>/dev/null | head -1 || echo installed; } && FOUND=1 && break; done; [ $FOUND -eq 0 ] && command -v snap >/dev/null 2>&1 && snap list flutter 2>/dev/null | awk 'NR>1{print $2}' || true"),
        ("julia",   "Julia",   "export PATH=\"$HOME/.juliaup/bin:$PATH\"; julia --version 2>/dev/null || ~/.juliaup/bin/julia --version 2>/dev/null"),
        ("lua",     "Lua",     "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); lua -v 2>&1 || lua5.4 -v 2>&1 || lua5.3 -v 2>&1"),
        ("lisp",    "SBCL",    "sbcl --version"),
    ];

    let mut tasks: Vec<(String, String, _)> = Vec::new();
    for &(id, name, shell_cmd) in checks {
        let id = id.to_string();
        let name = name.to_string();
        let shell_cmd = shell_cmd.to_string();
        let id_clone = id.clone();
        let name_clone = name.clone();
        tasks.push((id_clone, name_clone, tokio::spawn(async move {
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
        })));
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
            "node" | "python" | "go" | "php" | "ruby" | "zig" | "lua" | "lisp" => {
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
        .unwrap_or_default();
    if runtime_id.is_empty() || path_str.is_empty() {
        json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] runtimeId and path required." })
    } else {
        let home = std::env::var("HOME").unwrap_or_default();
        let lumina_base = format!("{}/.local/share/lumina/{}", home, runtime_id);
        let mise_base = format!("{}/.local/share/mise/installs/{}", home, runtime_id);
        let nvm_base = format!("{}/.nvm/versions/node", home);
        let pyenv_base = format!("{}/.pyenv/versions", home);
        let rustup_base = format!("{}/.rustup/toolchains", home);

        let rmrf_version_under = |base_s: &str| -> Value {
            let base = std::path::Path::new(base_s);
            let path = std::path::Path::new(path_str);
            let mut cursor = path;
            let mut version_dir: Option<std::path::PathBuf> = None;
            loop {
                match cursor.parent() {
                    Some(p) if p == base => {
                        version_dir = Some(cursor.to_path_buf());
                        break;
                    }
                    Some(p) => {
                        cursor = p;
                    }
                    None => break,
                }
            }
            match version_dir {
                Some(dir) if dir.is_dir() => match std::fs::remove_dir_all(&dir) {
                    Ok(_) => json!({ "ok": true }),
                    Err(e) => {
                        json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] rm -rf: {}", e) })
                    }
                },
                _ => {
                    json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not resolve version directory." })
                }
            }
        };

        if path_str.starts_with(&lumina_base) {
            rmrf_version_under(&lumina_base)
        } else if path_str.starts_with(&nvm_base) {
            let tag = std::path::Path::new(path_str)
                .ancestors()
                .find(|p| {
                    p.parent()
                        .map(|pp| pp == std::path::Path::new(&nvm_base))
                        .unwrap_or(false)
                })
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| version.clone());
            if tag.is_empty() {
                json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not determine nvm version tag." })
            } else {
                let cmd = format!(
                    r#"export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm uninstall '{}' 2>&1"#,
                    tag.replace('\'', "'\\''")
                );
                match exec_output_limit("bash", &["-c", &cmd], cmd_timeout_short()).await {
                    Ok(_) => json!({ "ok": true }),
                    Err(e) => {
                        json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] nvm uninstall: {}", e.trim()) })
                    }
                }
            }
        } else if path_str.starts_with(&pyenv_base) {
            let pyenv_version = std::path::Path::new(path_str)
                .ancestors()
                .find(|p| {
                    p.parent()
                        .map(|pp| pp == std::path::Path::new(&pyenv_base))
                        .unwrap_or(false)
                })
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| version.clone());
            if pyenv_version.is_empty() {
                json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not determine pyenv version." })
            } else {
                let cmd = format!(
                    r#"export PYENV_ROOT="$HOME/.pyenv"; export PATH="$PYENV_ROOT/bin:$PATH"; eval "$(pyenv init -)" 2>/dev/null; pyenv uninstall -f '{}' 2>&1"#,
                    pyenv_version.replace('\'', "'\\''")
                );
                match exec_output_limit("bash", &["-c", &cmd], cmd_timeout_short()).await {
                    Ok(_) => json!({ "ok": true }),
                    Err(e) => {
                        json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] pyenv uninstall: {}", e.trim()) })
                    }
                }
            }
        } else if path_str.starts_with(&rustup_base) {
            let toolchain = std::path::Path::new(path_str)
                .ancestors()
                .find(|p| {
                    p.parent()
                        .map(|pp| pp == std::path::Path::new(&rustup_base))
                        .unwrap_or(false)
                })
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| version.clone());
            if toolchain.is_empty() {
                json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] could not determine rustup toolchain name." })
            } else {
                let cmd = format!(
                    "export PATH=\"$HOME/.cargo/bin:$PATH\"; rustup toolchain remove '{}' 2>&1",
                    toolchain.replace('\'', "'\\''")
                );
                match exec_output_limit("bash", &["-c", &cmd], cmd_timeout_short()).await {
                    Ok(_) => json!({ "ok": true }),
                    Err(e) => {
                        json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] rustup toolchain remove: {}", e.trim()) })
                    }
                }
            }
        } else if path_str.starts_with(&mise_base) || matches!(runtime_id, "php" | "ruby" | "lua") {
            if version.is_empty() {
                json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] version required for mise-managed runtime." })
            } else {
                let cmd = format!(
                    r#"MISE=$(command -v mise 2>/dev/null || echo "$HOME/.local/bin/mise"); export PATH="$HOME/.local/bin:$PATH"; "$MISE" uninstall {}@'{}' 2>&1"#,
                    runtime_id,
                    version.replace('\'', "'\\''")
                );
                match exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short()).await {
                    Ok(_) => json!({ "ok": true }),
                    Err(e) => {
                        json!({ "ok": false, "error": format!("[REMOVE_VERSION_FAILED] mise uninstall: {}", e.trim()) })
                    }
                }
            }
        } else {
            json!({ "ok": false, "error": "[REMOVE_VERSION_FAILED] path is not in a recognised version manager directory (lumina / nvm / pyenv / rustup / mise)." })
        }
    }
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
