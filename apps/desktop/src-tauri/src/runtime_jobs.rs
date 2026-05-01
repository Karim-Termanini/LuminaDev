use super::*;

pub(crate) async fn runtime_job_execute(
  app: AppHandle,
  job_id: String,
  kind: String,
  runtime_id: String,
  method: String,
  version: String,
  _remove_mode: String,
  sudo_password: String,
) {
  let mut logs: Vec<String> = vec![format!("job={} runtime={} method={}", kind, runtime_id, method)];
  let password_opt: Option<&str> = if sudo_password.is_empty() { None } else { Some(&sudo_password) };
  let mut final_state = "completed";
  let effective_verify_method = method.clone();

  let distro = exec_output("bash", &["-lc", "source /etc/os-release 2>/dev/null && printf '%s' \"${ID:-unknown}\""])
    .await
    .unwrap_or_else(|_| "unknown".to_string());
  let distro = distro.trim().to_string();
  let pkg_mgr = runtime_pkg_mgr(&distro);
  logs.push(format!("distro={} pkg_mgr={}", distro, pkg_mgr));

  // Flatpak guard for privileged operations
  let in_flatpak = std::env::var("FLATPAK_ID").is_ok();
  if in_flatpak && kind != "runtime_uninstall" && runtime_id != "rust" {
    logs.push("[RUNTIME_INSTALL_FAILED] Flatpak sandbox: cannot run host package managers. Install the runtime on the host and expose it via Flatpak overrides.".to_string());
    final_state = "failed";
  } else {
    {
      let st = app.state::<AppState>();
      let mut jobs = st.jobs.lock().await;
      if let Some(j) = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(job_id.as_str())) {
        j["progress"] = json!(30);
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
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
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
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
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
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
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
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
        } else if runtime_id == "python" && method == "local" {
          if pkg_mgr == "dnf" {
            if let Some(pw) = password_opt.filter(|p| !p.is_empty()) {
              logs.push(
                "Installing Fedora build dependencies for pyenv (gcc, openssl headers, …) — one-time.".into(),
              );
              let dep_cmd = "dnf install -y @development-tools gcc zlib-devel bzip2-devel readline-devel sqlite-devel openssl-devel tk-devel gdbm-devel libffi-devel xz-devel libuuid-devel";
              let _ = sudo_bash_install_step(dep_cmd, Some(pw), &mut logs, Some(app.clone()), Some(job_id.clone()), 5, 25).await;
            } else {
              logs.push(
                "NOTE: pyenv builds CPython from source on Fedora. If install fails, add your sudo password in the wizard and retry, or run: sudo dnf install @development-tools openssl-devel …".into(),
              );
            }
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
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
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
            runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
          } else {
            if pkg_mgr == "dnf" && runtime_java_major(&version) == Some(8) {
              Err("[RUNTIME_INSTALL_FAILED] Fedora repositories on this host do not provide java-1.8.0-openjdk-devel. Use Isolated Script (Local) for Java 8.".to_string())
            } else {
              let pkgs = runtime_java_system_packages_for_version(pkg_mgr, &version);
              if pkgs.is_empty() {
                logs.push(format!("No Java packages known for '{}' on {}.", version, distro));
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
                  logs.push(format!("NOTE: Java package {} is already installed; nothing to do.", pkg));
                  Ok(())
                } else {
                  let cmd = match pkg_mgr {
                    "apt" => format!("DEBIAN_FRONTEND=noninteractive apt-get install -y {}", pkg),
                    "dnf" => format!("dnf install -y {}", pkg),
                    "pacman" => format!("pacman -S --needed --noconfirm {}", pkg),
                    "zypper" => format!("zypper install -y {}", pkg),
                    _ => format!("apt-get install -y {}", pkg),
                  };
                  logs.push(format!("Installing Java package: {}…", pkg));
                  let step_res = sudo_bash_install_step(&cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 75).await;
                  if let Err(e) = step_res {
                    Err(format!("[RUNTIME_INSTALL_FAILED] Failed to install {}: {}", pkg, e))
                  } else {
                  if pkg_mgr == "dnf" {
                      let alt_cmd = format!(
                        "JAVA_BIN=$(rpm -ql {pkg} 2>/dev/null | awk '/\\/bin\\/java$/'\"'\"'{{print; exit}}'\"'\"') ; \
                         JAVAC_BIN=$(rpm -ql {pkg} 2>/dev/null | awk '/\\/bin\\/javac$/'\"'\"'{{print; exit}}'\"'\"') ; \
                         [ -n \"$JAVA_BIN\" ] && alternatives --set java \"$JAVA_BIN\" || true ; \
                         [ -n \"$JAVAC_BIN\" ] && alternatives --set javac \"$JAVAC_BIN\" || true",
                        pkg = pkg
                      );
                    let _ = sudo_bash_install_step(&alt_cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 85, 10).await;
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
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
        } else if runtime_id == "bun" {
          let ver = lumina_first_version_token(&version).unwrap_or_default();
          let ver = ver.trim().trim_start_matches('v').to_string();
          if ver.is_empty() {
            logs.push("Installing Bun via official installer (latest)…".into());
            runtime_bash_user_step("curl -fsSL https://bun.sh/install | bash", &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65)
              .await
              .map_err(|e| format!("{}", e))
          } else {
            logs.push(format!("Installing Bun {} via official installer…", ver));
            let cmd = format!(
              "curl -fsSL https://bun.sh/install | bash -s \"bun-v{}\"",
              ver.replace('"', "").replace('\'', "")
            );
            runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
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
            sudo_bash_install_step(&cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 20, 70).await
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
            runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
          }
        } else if runtime_id == "flutter" {
          let has_snap = exec_output_limit("which", &["snap"], CMD_TIMEOUT_SHORT).await.is_ok();
          if has_snap {
            logs.push("Installing Flutter via snap…".into());
            sudo_bash_install_step("snap install flutter --classic", password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 85).await
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
            runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
          }
        } else if (runtime_id == "php" || runtime_id == "ruby" || runtime_id == "lua") && method == "local" {
          if runtime_id == "php" {
            // PHP source compilation is too slow and fragile on non-Debian systems.
            // Always install via system package manager regardless of "local" track selection.
            logs.push("Installing PHP via system package manager (source compile not supported)…".into());
            let cmd = r#"
if command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y php-cli php-common php-mbstring php-xml php-json php-curl php-zip 2>&1
elif command -v apt-get >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y php-cli php-common php-mbstring php-xml php-curl php-zip 2>&1
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm php 2>&1
else
  echo "[RUNTIME_INSTALL_FAILED] No supported package manager found" >&2; exit 1
fi"#;
            sudo_bash_install_step(cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 85).await
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
              logs.push(format!("Pre-installing build dependencies for {}…", runtime_id));
              let _ = sudo_bash_install_step(build_deps_cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 5, 20).await;
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
            runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
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
          runtime_bash_user_step(&cmd, &mut logs, Some(app.clone()), Some(job_id.clone()), 30, 65).await.map_err(|e| format!("{}", e))
        } else {
          let pkgs = runtime_system_packages(&runtime_id, pkg_mgr);
          if method.trim() == "local"
            && !matches!(
              runtime_id.as_str(),
              "node" | "python" | "go" | "zig" | "rust" | "bun" | "dart" | "flutter" | "julia" | "php" | "ruby" | "lua"
            )
            && !pkgs.is_empty()
          {
            Err(format!(
              "[RUNTIME_INSTALL_FAILED] Isolated (local) install is not implemented for runtime '{}' on this distro (package manager: {}). Choose System for distro packages, pick a toolchain with a supported local installer, or install manually.",
              runtime_id, pkg_mgr
            ))
          } else {
            if method.trim() == "system" && !pkgs.is_empty() && matches!(runtime_id.as_str(), "node" | "python" | "go") {
              logs.push(
                "NOTE: System installs use distro package names only—your Target Version choice is ignored. Pick Local for Node.js, Python, or Go if you want the selected version.".to_string(),
              );
            }
            if pkgs.is_empty() {
              logs.push(format!("No system packages known for '{}' on {}. Try local/rustup method.", runtime_id, distro));
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
                  "apt" => format!("DEBIAN_FRONTEND=noninteractive apt-get install -y {}", pkg),
                  "dnf" => format!("dnf install -y {}", pkg),
                  "pacman" => format!("pacman -S --needed --noconfirm {}", pkg),
                  "zypper" => format!("zypper install -y {}", pkg),
                  _ => format!("apt-get install -y {}", pkg),
                };
                logs.push(format!("Installing dependency {} of {}: {}…", idx + 1, total, pkg));
                let step_res = sudo_bash_install_step(&cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), base, weight).await;
                if let Err(e) = step_res {
                  loop_res = Err(format!("[RUNTIME_INSTALL_FAILED] Failed to install {}: {}", pkg, e));
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
          exec_output_limit("bash", &["-lc", "rustup update"], CMD_TIMEOUT_INSTALL_STEP).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_UPDATE_FAILED] {}", e.trim()))
        } else {
          let pkgs = runtime_system_packages(&runtime_id, pkg_mgr);
          if pkgs.is_empty() {
            logs.push(format!("No system packages to update for '{}' on {}.", runtime_id, distro));
            Ok(())
          } else {
            let cmd = pkg_upgrade_cmd(pkg_mgr, &pkgs);
            sudo_bash_install_step(&cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 85).await
              .map_err(|e| format!("[RUNTIME_UPDATE_FAILED] {}", e))
          }
        }
      }
      "runtime_uninstall" => {
        if runtime_id == "rust" {
          exec_output_limit("bash", &["-lc", "rustup self uninstall -y 2>/dev/null || true"], CMD_TIMEOUT_INSTALL_STEP).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e.trim()))
        } else if runtime_id == "bun" {
          logs.push("Removing Bun (~/.bun)…".into());
          exec_output_limit("bash", &["-lc", "rm -rf \"$HOME/.bun\" && sed -i '/BUN_INSTALL/d;/.bun\\/bin/d' \"$HOME/.bashrc\" \"$HOME/.zshrc\" 2>/dev/null || true"], CMD_TIMEOUT_INSTALL_STEP).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e.trim()))
        } else if runtime_id == "flutter" {
          logs.push("Removing Flutter snap…".into());
          sudo_bash_install_step("snap remove flutter", password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 85).await
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
          exec_output_limit("bash", &["-lc", cmd], CMD_TIMEOUT_INSTALL_STEP).await
            .map(|out| { if !out.is_empty() { logs.push(out); } })
            .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e.trim()))
        } else {
          let pkgs = runtime_system_packages(&runtime_id, pkg_mgr);
          if pkgs.is_empty() {
            logs.push(format!("No system packages to remove for '{}' on {}.", runtime_id, distro));
            Ok(())
          } else {
            let cmd = pkg_remove_cmd(pkg_mgr, &pkgs);
            sudo_bash_install_step(&cmd, password_opt, &mut logs, Some(app.clone()), Some(job_id.clone()), 10, 85).await
              .map_err(|e| format!("[RUNTIME_UNINSTALL_FAILED] {}", e))
          }
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
      if let Some(j) = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(job_id.as_str())) {
        j["progress"] = json!(85);
      }
      drop(jobs);

      if matches!(kind.as_str(), "runtime_install" | "install_deps") {
        runtime_append_verify(&runtime_id, &effective_verify_method, &version, &mut logs).await;
      }
    }
  }

  let st = app.state::<AppState>();
  let current_state = {
    let jobs = st.jobs.lock().await;
    jobs
      .iter()
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
  if let Some(j) = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(job_id.as_str())) {
    j["state"] = json!(final_state);
    j["progress"] = json!(if final_state == "completed" { 100 } else { 0 });
    j["logTail"] = json!(logs.into_iter().rev().take(48).collect::<Vec<String>>().into_iter().rev().collect::<Vec<String>>());
  }
}
