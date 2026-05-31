/// First whitespace-delimited token (e.g. "v22.0.0 (LTS: Foo)" → "v22.0.0").
pub(crate) fn lumina_first_version_token(raw: &str) -> Option<String> {
  let t = raw.trim();
  if t.is_empty()
    || t.eq_ignore_ascii_case("latest")
    || t.eq_ignore_ascii_case("stable")
    || t.starts_with("system ")
  {
    return None;
  }
  Some(
    t.split_whitespace()
      .next()
      .unwrap_or(t)
      .trim()
      .trim_start_matches("go")
      .to_string(),
  )
}

/// Channel string for Microsoft `dotnet-install.sh` (`8.0`, `9.0`, …).
pub(crate) fn lumina_dotnet_install_channel(version: &str) -> String {
  let raw = version.trim();
  if raw.is_empty() || raw.starts_with("system") {
    return "8.0".into();
  }
  let tok = lumina_first_version_token(raw).unwrap_or_else(|| raw.to_string());
  let s: String = tok
    .chars()
    .take_while(|c| c.is_ascii_digit() || *c == '.')
    .collect();
  let s = s.trim_matches('.').trim();
  if s.is_empty() {
    "8.0".into()
  } else {
    s.to_string()
  }
}

/// Compare a UI-selected version token against a one-line tool probe.
pub(crate) fn lumina_version_token_matches_probe_line(requested_token: &str, probe_line: &str) -> bool {
  let token = requested_token.trim();
  if token.is_empty() {
    return true;
  }
  let hay = probe_line.trim();
  if hay.contains(token) {
    return true;
  }
  let token_core = token
    .split(['-', '+'])
    .next()
    .unwrap_or(token)
    .trim();
  if token_core.is_empty() {
    return true;
  }
  let probe_core = hay
    .split(|c: char| c.is_whitespace() || c == '(')
    .next()
    .unwrap_or(hay)
    .trim()
    .trim_start_matches('v')
    .split(['-', '+'])
    .next()
    .unwrap_or(hay)
    .trim();
  probe_core == token_core || hay.contains(token_core)
}

/// rustup toolchain channels where `rustc --version` will not contain the word "nightly"/"beta"/"stable".
pub(crate) fn lumina_rust_channel_token(raw: &str) -> Option<String> {
  let t = lumina_first_version_token(raw)?.to_lowercase();
  match t.as_str() {
    "nightly" | "beta" | "stable" => Some(t),
    _ => None,
  }
}

/// Lines from `bash -lc` while sourcing profiles (before the probe) — do not show as runtime version.
fn lumina_shell_profile_noise_line(line: &str) -> bool {
  let t = line.trim();
  if t.is_empty() {
    return true;
  }
  if t.contains(": No such file or directory")
    || t.contains(": Command not found")
    || t.contains(": command not found")
  {
    return true;
  }
  if t.contains(": line ")
    && (t.contains(".bash_profile")
      || t.contains(".bashrc")
      || t.contains(".profile")
      || t.contains(".zprofile")
      || t.contains(".zshrc"))
  {
    return true;
  }
  t.starts_with("bash: ") || t.starts_with("sh: ") || t.starts_with("zsh:")
}

/// Join stdout and stderr with a newline so missing `\n` on stdout does not concatenate stderr.
/// Prefer the first non-empty line that is not shell startup noise (Java may only print on stderr).
pub(crate) fn lumina_probe_meaningful_line(stdout: &str, stderr: &str) -> String {
  let merged = format!("{}\n{}", stdout.trim_end(), stderr.trim_end());
  merged
    .lines()
    .map(str::trim)
    .find(|l| !l.is_empty() && !lumina_shell_profile_noise_line(l))
    .unwrap_or("")
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_token_helpers_handle_expected_inputs() {
        assert_eq!(
            lumina_first_version_token("v22.1.0 (LTS)"),
            Some("v22.1.0".to_string())
        );
        assert_eq!(lumina_first_version_token("latest"), None);
        assert_eq!(lumina_dotnet_install_channel("9.0.1"), "9.0.1");
        assert_eq!(lumina_dotnet_install_channel(""), "8.0");
    }

    #[test]
    fn version_matching_allows_prerelease_probe_lines() {
        assert!(lumina_version_token_matches_probe_line(
            "0.13.0",
            "0.13.0-dev.20240201"
        ));
        assert!(lumina_version_token_matches_probe_line(
            "v22.2.0",
            "node v22.2.0"
        ));
        assert!(!lumina_version_token_matches_probe_line("1.2.3", "1.2.4"));
    }

    #[test]
    fn probe_line_filter_ignores_shell_noise() {
        let stdout = "bash: /home/me/.bashrc: line 1: foo: command not found\n";
        let stderr = "Python 3.12.2\n";
        assert_eq!(
            lumina_probe_meaningful_line(stdout, stderr),
            "Python 3.12.2"
        );
    }
}
