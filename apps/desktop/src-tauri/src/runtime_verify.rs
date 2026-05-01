use crate::host_exec::{CMD_TIMEOUT_SHORT, exec_result_limit};
use crate::runtime_versioning::{
  lumina_first_version_token,
  lumina_probe_meaningful_line,
  lumina_rust_channel_token,
  lumina_version_token_matches_probe_line,
};

/// After runtime_install succeeds, probe `bash -lc` for the toolchain.
pub(crate) async fn runtime_append_verify(
  runtime_id: &str,
  method: &str,
  requested_version: &str,
  logs: &mut Vec<String>,
) {
  logs.push(format!(
    "VERIFY: login shell check requested_version={:?} install_method={} …",
    requested_version.trim(),
    method
  ));
  let probe = match runtime_id {
    "node" => "([ -s \"$NVM_DIR/nvm.sh\" ] && . \"$NVM_DIR/nvm.sh\" && node --version 2>&1) || (command -v node >/dev/null 2>&1 && node --version 2>&1) || echo MISSING",
    "python" => "([ -d \"$HOME/.pyenv\" ] && export PYENV_ROOT=\"$HOME/.pyenv\" && export PATH=\"$PYENV_ROOT/bin:$PATH\" && eval \"$(pyenv init -)\" && python3 --version 2>&1) || (command -v python3 >/dev/null 2>&1 && python3 --version 2>&1) || echo MISSING",
    "go" => "([ -x \"$HOME/.local/share/lumina/go/current/bin/go\" ] && \"$HOME/.local/share/lumina/go/current/bin/go\" version 2>&1) || ([ -x \"$HOME/.local/share/lumina/go/bin/go\" ] && \"$HOME/.local/share/lumina/go/bin/go\" version 2>&1) || (command -v go >/dev/null 2>&1 && go version 2>&1) || echo MISSING",
    "rust" => "unset RUSTUP_TOOLCHAIN; ([ -x \"$HOME/.cargo/bin/rustup\" ] && \"$HOME/.cargo/bin/rustup\" show active-toolchain 2>&1 | head -1) || ([ -x \"$HOME/.cargo/bin/rustc\" ] && \"$HOME/.cargo/bin/rustc\" --version 2>&1) || (command -v rustc >/dev/null 2>&1 && rustc --version 2>&1) || echo MISSING",
    "java" if method == "local" => "([ -x \"$HOME/.local/share/lumina/java/current/bin/java\" ] && \"$HOME/.local/share/lumina/java/current/bin/java\" -version 2>&1 | head -1) || echo MISSING",
    "java" => "command -v java >/dev/null 2>&1 && java -version 2>&1 | head -1 || echo MISSING",
    "php" if method == "local" => "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); (command -v php >/dev/null 2>&1 && php --version 2>&1 | head -1) || echo MISSING",
    "php" => "command -v php >/dev/null 2>&1 && php --version 2>&1 | head -1 || echo MISSING",
    "ruby" if method == "local" => "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); (command -v ruby >/dev/null 2>&1 && ruby --version 2>&1) || echo MISSING",
    "ruby" => "command -v ruby >/dev/null 2>&1 && ruby --version 2>&1 || echo MISSING",
    "dotnet" => "([ -x \"$HOME/.dotnet/dotnet\" ] && \"$HOME/.dotnet/dotnet\" --version 2>&1) || (command -v dotnet >/dev/null 2>&1 && dotnet --version 2>&1) || echo MISSING",
    "bun" => "([ -x \"$HOME/.bun/bin/bun\" ] && \"$HOME/.bun/bin/bun\" --version 2>&1) || (command -v bun >/dev/null 2>&1 && bun --version 2>&1) || echo MISSING",
    "zig" if method == "local" => "([ -x \"$HOME/.local/share/lumina/zig/current/zig\" ] && \"$HOME/.local/share/lumina/zig/current/zig\" version 2>&1) || (command -v zig >/dev/null 2>&1 && zig version 2>&1) || echo MISSING",
    "zig" => "command -v zig >/dev/null 2>&1 && zig version 2>&1 || echo MISSING",
    "c_cpp" => "command -v gcc >/dev/null 2>&1 && gcc --version 2>&1 | head -1 || echo MISSING",
    "matlab" => "command -v octave >/dev/null 2>&1 && octave --version 2>&1 | head -1 || echo MISSING",
    "dart" => "([ -x \"$HOME/.dart/dart-sdk/bin/dart\" ] && \"$HOME/.dart/dart-sdk/bin/dart\" --version 2>&1 | head -1) || (command -v dart >/dev/null 2>&1 && dart --version 2>&1 | head -1) || echo MISSING",
    "flutter" => "([ -x \"$HOME/.flutter-sdk/bin/flutter\" ] && \"$HOME/.flutter-sdk/bin/flutter\" --version 2>&1 | head -1) || (command -v flutter >/dev/null 2>&1 && flutter --version 2>&1 | head -1) || echo MISSING",
    "julia" => "export PATH=\"$HOME/.juliaup/bin:$PATH\"; ([ -x \"$HOME/.juliaup/bin/julia\" ] && \"$HOME/.juliaup/bin/julia\" --startup-file=no --version 2>&1) || (command -v julia >/dev/null 2>&1 && julia --startup-file=no --version 2>&1) || echo MISSING",
    "lua" if method == "local" => "export PATH=\"$HOME/.local/bin:$PATH\"; ([ -x \"$HOME/.local/bin/mise\" ] && eval \"$($HOME/.local/bin/mise activate bash)\" >/dev/null 2>&1 || true); ((command -v lua5.4 >/dev/null 2>&1 && lua5.4 -v 2>&1) || (command -v lua >/dev/null 2>&1 && lua -v 2>&1)) || echo MISSING",
    "lua" => "(command -v lua5.4 >/dev/null 2>&1 && lua5.4 -v 2>&1) || (command -v lua >/dev/null 2>&1 && lua -v 2>&1) || echo MISSING",
    "lisp" => "command -v sbcl >/dev/null 2>&1 && sbcl --version 2>&1 || echo MISSING",
    _ => {
      logs.push(format!("VERIFY: skipped (unknown runtime '{}')", runtime_id));
      return;
    }
  };
  match exec_result_limit("bash", &["-lc", probe], CMD_TIMEOUT_SHORT).await {
    Ok((stdout, stderr)) => {
      let line = lumina_probe_meaningful_line(&stdout, &stderr);
      if line.contains("MISSING") || line.is_empty() {
        logs.push(format!("VERIFY FAIL: {} not found on PATH after install.", runtime_id));
      } else {
        let mut ver_token = lumina_first_version_token(requested_version).unwrap_or_default();
        if runtime_id == "dart" {
          if let Some((_, rhs)) = requested_version.trim().split_once('/') {
            let r = rhs.trim();
            if !r.is_empty() {
              if let Some(t) = lumina_first_version_token(r) {
                ver_token = t;
              } else if r.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                ver_token = r.trim_start_matches('v').to_string();
              }
            }
          }
        }
        let mut is_match = true;
        if !ver_token.is_empty() && method != "system" {
          if runtime_id == "rust" {
            if let Some(ch) = lumina_rust_channel_token(requested_version) {
              is_match = line.to_lowercase().contains(&ch);
            } else if !lumina_version_token_matches_probe_line(&ver_token, &line) {
              is_match = false;
            }
          } else if !lumina_version_token_matches_probe_line(&ver_token, &line) {
            is_match = false;
          }
        }

        if !is_match {
          logs.push(format!("VERIFY WARNING: version mismatch! Got {:?}, expected token {:?}. Ensure your shell is fresh or check if another version is overriding this one.", line, ver_token));
        } else {
          logs.push(format!("VERIFY OK: {}", line));
          logs.push("Smoke test passed".to_string());
        }
      }
    }
    Err(e) => logs.push(format!("VERIFY FAIL: {}", e.trim())),
  }
}
