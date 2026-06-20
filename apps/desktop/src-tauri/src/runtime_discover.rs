//! Global runtime discovery — version managers, common home paths, and PATH.
//! Lumina install dirs are included but never exclusive.

const PREAMBLE: &str = r#"export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
[ -s "$HOME/.config/nvm/nvm.sh" ] && export NVM_DIR="$HOME/.config/nvm" && . "$HOME/.config/nvm/nvm.sh" 2>/dev/null
[ -s "$HOME/.nvm/nvm.sh" ] && export NVM_DIR="$HOME/.nvm" && . "$HOME/.nvm/nvm.sh" 2>/dev/null
command -v mise >/dev/null 2>&1 && eval "$("$HOME/.local/bin/mise" activate bash 2>/dev/null || mise activate bash 2>/dev/null)" 2>/dev/null
command -v pyenv >/dev/null 2>&1 && eval "$(pyenv init - --path 2>/dev/null)" 2>/dev/null
"#;

const EMIT_FN: &str = r#"
_emit_unique() {
  local v="$1" p="$2"
  [ -n "$v" ] && [ -n "$p" ] || return 0
  local rp
  rp=$(readlink -f "$p" 2>/dev/null || echo "$p")
  case "|$_disc_seen|" in *"|$rp|"*) return 0 ;; esac
  _disc_seen="${_disc_seen}|$rp"
  printf '%s\t%s\n' "$v" "$rp"
}
_disc_seen=""
"#;

const MISE_LS: &str = r#"
_mise_rows() {
  local tool="$1" bin="$2"
  command -v mise >/dev/null 2>&1 || return 0
  mise ls "$tool" 2>/dev/null | awk '{print $2}' | grep -v '^$' | while read -r ver; do
    p="$HOME/.local/share/mise/installs/$tool/$ver/bin/$bin"
    [ -x "$p" ] && _emit_unique "$ver" "$p"
  done
}
"#;

const ASDF_ROWS: &str = r#"
_asdf_rows() {
  local tool="$1" bin="$2"
  [ -d "$HOME/.asdf/installs/$tool" ] || return 0
  for d in "$HOME/.asdf/installs/$tool"/*; do
    [ -x "$d/bin/$bin" ] || continue
    _emit_unique "$(basename "$d")" "$d/bin/$bin"
  done
}
"#;

fn with_preamble(body: &str) -> String {
    format!("{PREAMBLE}{body}")
}

fn with_discover(body: &str) -> String {
    format!("{PREAMBLE}{EMIT_FN}{body}")
}

/// Resolve the `java` binary the user's shell runs (mise-aware; ignores bare `/usr/bin/mise` shims).
pub(crate) fn java_shell_binary_script() -> String {
    with_preamble(
        r#"if command -v mise >/dev/null 2>&1; then
  p=$(mise which java 2>/dev/null)
  if [ -n "$p" ] && [ -x "$p" ]; then readlink -f "$p" 2>/dev/null && exit 0; fi
fi
if command -v java >/dev/null 2>&1; then
  home=$(java -XshowSettings:properties -version 2>&1 | awk -F'= ' '/java.home/ {print $2; exit}')
  if [ -n "$home" ] && [ -x "$home/bin/java" ]; then readlink -f "$home/bin/java" 2>/dev/null && exit 0; fi
fi
p=$(command -v java 2>/dev/null)
if [ -n "$p" ]; then
  case "$p" in */mise|*/mise.exe) exit 1 ;; esac
  rp=$(readlink -f "$p" 2>/dev/null || echo "$p")
  case "$rp" in */mise|*/mise.exe) exit 1 ;; esac
  case "$(basename "$rp")" in mise|mise.exe) exit 1 ;; esac
  echo "$rp"
  exit 0
fi
[ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ] && readlink -f "$JAVA_HOME/bin/java" && exit 0
[ -x "$HOME/.local/share/lumina/java/current/bin/java" ] && readlink -f "$HOME/.local/share/lumina/java/current/bin/java" && exit 0
[ -x "$HOME/.sdkman/candidates/java/current/bin/java" ] && readlink -f "$HOME/.sdkman/candidates/java/current/bin/java" && exit 0
exit 1"#,
    )
}

/// Reject mise shims and bare `mise` executables masquerading as node.
pub(crate) fn sanitize_node_binary_path(path: &str) -> Option<String> {
    let path = path.trim();
    if path.is_empty()
        || path.ends_with("/mise")
        || path.ends_with("/mise.exe")
        || path.contains("/.local/share/mise/shims/")
        || path == "/usr/bin/mise"
    {
        None
    } else {
        Some(path.to_string())
    }
}

/// Resolve the `node` binary the login shell would run (mise global pin, else first real node on PATH).
pub(crate) fn node_shell_binary_script() -> String {
    r#"export PATH="$HOME/.local/bin:$PATH"
if command -v mise >/dev/null 2>&1; then
  p=$(mise which node 2>/dev/null)
  if [ -n "$p" ] && [ -x "$p" ]; then
    rp=$(readlink -f "$p" 2>/dev/null || echo "$p")
    case "$rp" in */mise|*/mise.exe|*/.local/share/mise/shims/*) ;; *)
      echo "$rp"
      exit 0
    ;; esac
  fi
fi
IFS=':' read -ra __lumina_path_dirs <<< "$PATH"
for dir in "${__lumina_path_dirs[@]}"; do
  [ -n "$dir" ] || continue
  case "$dir" in *"/.local/share/mise/shims"*) continue ;; esac
  [ -x "$dir/node" ] || continue
  rp=$(readlink -f "$dir/node" 2>/dev/null || echo "$dir/node")
  case "$rp" in */mise|*/mise.exe|*/.local/share/mise/shims/*) continue ;; esac
  case "$(basename "$rp")" in mise|mise.exe) continue ;; esac
  echo "$rp"
  exit 0
done
exit 1"#
        .to_string()
}

/// Fish login probe — skip mise shims when no global node pin is active.
pub(crate) fn node_shell_binary_script_fish() -> String {
    r#"function __lumina_real_node_path
  if command -q mise
    set -l p (mise which node 2>/dev/null)
    if test -n "$p"; and test -x "$p"
      set -l rp (readlink -f $p 2>/dev/null)
      if test -z "$rp"; set rp $p; end
      if not string match -q '*\/mise/shims/*' $rp
        if test "$rp" != /usr/bin/mise
          echo $rp
          return 0
        end
      end
    end
  end
  for dir in (string split : -- $PATH)
    if string match -q '*\/mise/shims*' $dir
      continue
    end
    set -l p "$dir/node"
    if test -x "$p"
      set -l rp (readlink -f $p 2>/dev/null)
      if test -z "$rp"; set rp $p; end
      if test "$rp" = /usr/bin/mise
        continue
      end
      if string match -q '*\/mise/shims/*' $rp
        continue
      end
      echo $rp
      return 0
    end
  end
  return 1
end
__lumina_real_node_path"#
        .to_string()
}

pub(crate) fn node_shell_version_script_bash() -> String {
    r#"export PATH="$HOME/.local/bin:$PATH"
__lumina_node_bin=""
if command -v mise >/dev/null 2>&1; then
  p=$(mise which node 2>/dev/null)
  if [ -n "$p" ] && [ -x "$p" ]; then
    rp=$(readlink -f "$p" 2>/dev/null || echo "$p")
    case "$rp" in */mise|*/mise.exe|*/.local/share/mise/shims/*) ;; *)
      __lumina_node_bin="$rp"
    ;; esac
  fi
fi
if [ -z "$__lumina_node_bin" ]; then
  IFS=':' read -ra __lumina_path_dirs <<< "$PATH"
  for dir in "${__lumina_path_dirs[@]}"; do
    [ -n "$dir" ] || continue
    case "$dir" in *"/.local/share/mise/shims"*) continue ;; esac
    [ -x "$dir/node" ] || continue
    rp=$(readlink -f "$dir/node" 2>/dev/null || echo "$dir/node")
    case "$rp" in */mise|*/mise.exe|*/.local/share/mise/shims/*) continue ;; esac
    case "$(basename "$rp")" in mise|mise.exe) continue ;; esac
    __lumina_node_bin="$rp"
    break
  done
fi
[ -n "$__lumina_node_bin" ] || exit 1
"$__lumina_node_bin" --version 2>&1"#
        .to_string()
}

pub(crate) fn node_shell_version_script_fish() -> String {
    r#"function __lumina_real_node_path
  if command -q mise
    set -l p (mise which node 2>/dev/null)
    if test -n "$p"; and test -x "$p"
      set -l rp (readlink -f $p 2>/dev/null)
      if test -z "$rp"; set rp $p; end
      if not string match -q '*\/mise/shims/*' $rp
        if test "$rp" != /usr/bin/mise
          echo $rp
          return 0
        end
      end
    end
  end
  for dir in (string split : -- $PATH)
    if string match -q '*\/mise/shims*' $dir
      continue
    end
    set -l p "$dir/node"
    if test -x "$p"
      set -l rp (readlink -f $p 2>/dev/null)
      if test -z "$rp"; set rp $p; end
      if test "$rp" = /usr/bin/mise
        continue
      end
      if string match -q '*\/mise/shims/*' $rp
        continue
      end
      echo $rp
      return 0
    end
  end
  return 1
end
set -l __p (__lumina_real_node_path)
test -z "$__p"; and exit 1
$__p --version 2>&1"#
        .to_string()
}

pub(crate) async fn resolve_node_shell_binary_path() -> Option<String> {
    use crate::host_exec::{cmd_timeout_short, exec_user_login_shell_output, user_shell_is_fish};
    let script = if user_shell_is_fish() {
        node_shell_binary_script_fish()
    } else {
        node_shell_binary_script()
    };
    exec_user_login_shell_output(&script, cmd_timeout_short())
        .await
        .ok()
        .and_then(|out| {
            out.lines()
                .find_map(sanitize_node_binary_path)
        })
}

pub(crate) async fn resolve_node_shell_version() -> Option<String> {
    use crate::host_exec::{cmd_timeout_short, exec_user_login_shell_output, user_shell_is_fish};
    use crate::runtime_versioning::lumina_probe_meaningful_line;
    let script = if user_shell_is_fish() {
        node_shell_version_script_fish()
    } else {
        node_shell_version_script_bash()
    };
    exec_user_login_shell_output(&script, cmd_timeout_short())
        .await
        .ok()
        .map(|out| lumina_probe_meaningful_line(&out, ""))
        .filter(|v| !v.is_empty())
}

pub(crate) async fn resolve_java_shell_binary_path() -> Option<String> {
    use crate::host_exec::{cmd_timeout_short, exec_output_limit};
    let script = java_shell_binary_script();
    exec_output_limit("bash", &["-lc", &script], cmd_timeout_short())
        .await
        .ok()
        .and_then(|out| {
            let path = out.lines().find(|l| !l.trim().is_empty())?.trim().to_string();
            if path.is_empty()
                || path.ends_with("/mise")
                || path.ends_with("/mise.exe")
                || path.contains("/.local/share/mise/shims/")
            {
                None
            } else {
                Some(path)
            }
        })
}

pub(crate) fn list_installed_versions_script(runtime_id: &str) -> Option<String> {
    Some(match runtime_id {
        "node" => with_discover(&format!(
            "{MISE_LS}{ASDF_ROWS}
if [ -d \"$HOME/.config/nvm/versions/node\" ]; then
  for d in \"$HOME/.config/nvm/versions/node\"/*; do
    [ -d \"$d\" ] || continue
    [ -x \"$d/bin/node\" ] || continue
    _emit_unique \"$(basename \"$d\")\" \"$d/bin/node\"
  done
fi
if [ -d \"$HOME/.nvm/versions/node\" ]; then
  for d in \"$HOME/.nvm/versions/node\"/*; do
    [ -d \"$d\" ] || continue
    [ -x \"$d/bin/node\" ] || continue
    _emit_unique \"$(basename \"$d\")\" \"$d/bin/node\"
  done
fi
if [ -d \"$HOME/.local/share/fnm/node-versions\" ]; then
  for d in \"$HOME/.local/share/fnm/node-versions\"/*; do
    [ -x \"$d/installation/bin/node\" ] || continue
    _emit_unique \"$(basename \"$d\")\" \"$d/installation/bin/node\"
  done
fi
if [ -d \"$HOME/.volta/tools/image/node\" ]; then
  for d in \"$HOME/.volta/tools/image/node\"/*; do
    [ -x \"$d/bin/node\" ] || continue
    _emit_unique \"$(basename \"$d\")\" \"$d/bin/node\"
  done
fi
_mise_rows node node
_asdf_rows nodejs node
if [ -d \"$HOME/.local/share/lumina/node\" ]; then
  for d in \"$HOME/.local/share/lumina/node\"/*; do
    [ -d \"$d\" ] || continue
    b=$(basename \"$d\"); [ \"$b\" = \"current\" ] && continue
    [ -x \"$d/bin/node\" ] || continue
    _emit_unique \"$b\" \"$d/bin/node\"
  done
fi
for sys_node in /usr/bin/node /usr/local/bin/node; do
  if [ -x \"$sys_node\" ]; then
    v=$($sys_node --version 2>/dev/null | sed 's/^v//')
    rp=$(readlink -f \"$sys_node\" 2>/dev/null || echo \"$sys_node\")
    _emit_unique \"$v\" \"$rp\"
  fi
done
"
        )),
        "python" => with_discover(&format!(
            "{MISE_LS}{ASDF_ROWS}
if [ -d \"$HOME/.pyenv/versions\" ]; then
  for d in \"$HOME/.pyenv/versions\"/*; do
    [ -d \"$d\" ] || continue
    [ -x \"$d/bin/python\" ] || continue
    _emit_unique \"$(basename \"$d\")\" \"$d/bin/python\"
  done
fi
_mise_rows python python
_asdf_rows python python
if [ -d \"$HOME/.local/share/lumina/python\" ]; then
  for d in \"$HOME/.local/share/lumina/python\"/*; do
    [ -d \"$d\" ] || continue
    b=$(basename \"$d\"); [ \"$b\" = \"current\" ] && continue
    [ -x \"$d/bin/python\" ] || continue
    _emit_unique \"$b\" \"$d/bin/python\"
  done
fi
"
        )),
        "java" => with_discover(
            r#"
_java_dev_emit() {
  local ver="$1" p="$2" label="$3" home="$4"
  [ -n "$ver" ] && [ -n "$p" ] && [ -n "$label" ] && [ -n "$home" ] || return 0
  case "|$_java_homes|" in *"|$home|"*) return 0 ;; esac
  _java_homes="${_java_homes}|$home"
  printf '%s\t%s\t%s\t%s\n' "$ver" "$p" "$label" "$home"
}
_java_homes=""

_java_dev_row() {
  local d="$1" fallback="${2:-}"
  [ -d "$d" ] || return 0
  [ -x "$d/bin/java" ] || return 0
  [ -x "$d/bin/javac" ] || return 0
  local base home ver label p
  base=$(basename "$d")
  [ "$base" = "current" ] && return 0
  case "$base" in
    java|jre|java-openjdk|jre-openjdk) return 0 ;;
  esac
  case "$base" in
    java-[0-9]|java-[0-9][0-9]) return 0 ;;
    jre*) return 0 ;;
  esac
  home=$(readlink -f "$d" 2>/dev/null || echo "$d")
  ver=$("$d/bin/java" -version 2>&1 | awk -F\" '/version/ {print $2; exit}')
  [ -n "$ver" ] || ver="${fallback:-$base}"
  label="JDK $ver"
  p="$home/bin/java"
  _java_dev_emit "$ver" "$p" "$label" "$home"
}
for d in "$HOME/.local/share/lumina/java"/jdk-*; do
  _java_dev_row "$d" "$(basename "$d" | sed 's/^jdk-//')"
done
if [ -d "$HOME/.sdkman/candidates/java" ]; then
  for d in "$HOME/.sdkman/candidates/java"/*; do
    [ "$d" = "$HOME/.sdkman/candidates/java/current" ] && continue
    _java_dev_row "$d"
  done
fi
if [ -d "$HOME/.jdks" ]; then
  for d in "$HOME/.jdks"/*; do
    _java_dev_row "$d"
  done
fi
if [ -d "$HOME/.local/share/mise/installs/java" ]; then
  for d in "$HOME/.local/share/mise/installs/java"/*; do
    _java_dev_row "$d"
  done
fi
for d in /usr/lib/jvm/* /usr/java/*; do
  _java_dev_row "$d"
done
"#,
        ),
        "go" => with_discover(&format!(
            "{MISE_LS}{ASDF_ROWS}
if [ -d \"$HOME/.local/share/lumina/go\" ]; then
  for d in \"$HOME/.local/share/lumina/go\"/*; do
    [ -d \"$d\" ] || continue
    b=$(basename \"$d\"); [ \"$b\" = \"current\" ] && continue
    [ -x \"$d/bin/go\" ] || continue
    ver=$(\"$d/bin/go\" version 2>/dev/null | awk '{{print $3}}' | sed 's/^go//')
    _emit_unique \"${{ver:-$b}}\" \"$d/bin/go\"
  done
fi
[ -x /usr/local/go/bin/go ] && _emit_unique \"$(/usr/local/go/bin/go version 2>/dev/null | awk '{{print $3}}' | sed 's/^go//')\" \"/usr/local/go/bin/go\"
_mise_rows go go
_asdf_rows golang go
"
        )),
        "dotnet" => with_discover(
            r#"
for d in "$HOME/.dotnet" /usr/share/dotnet /opt/dotnet; do
  [ -x "$d/dotnet" ] || continue
  ver=$("$d/dotnet" --version 2>/dev/null)
  _emit_unique "${ver:-dotnet}" "$d/dotnet"
done
p=$(command -v dotnet 2>/dev/null)
if [ -n "$p" ]; then
  rp=$(readlink -f "$p" 2>/dev/null || echo "$p")
  ver=$("$rp" --version 2>/dev/null)
  _emit_unique "${ver:-dotnet}" "$rp"
fi
"#,
        ),
        _ => return None,
    })
}

pub(crate) fn list_mise_runtime_script(runtime_id: &str, mise_tool: &str, bin: &str) -> String {
    let _ = runtime_id;
    with_discover(&format!(
        "{MISE_LS}{ASDF_ROWS}
_mise_rows {mise_tool} {bin}
_asdf_rows {mise_tool} {bin}
p=$(command -v {bin} 2>/dev/null)
if [ -n \"$p\" ]; then
  rp=$(readlink -f \"$p\" 2>/dev/null || echo \"$p\")
  ver=$(\"$rp\" --version 2>/dev/null | head -1)
  _emit_unique \"${{ver:-{bin}}}\" \"$rp\"
fi
"
    ))
}

pub(crate) fn active_binary_script(runtime_id: &str) -> Option<String> {
    Some(match runtime_id {
        "node" => node_shell_binary_script(),
        "python" => with_preamble(
            r#"pyenv which python 2>/dev/null || pyenv which python3 2>/dev/null || readlink -f "$(command -v python3 2>/dev/null || command -v python 2>/dev/null)" 2>/dev/null"#,
        ),
        "java" => java_shell_binary_script(),
        "go" => with_preamble(
            r#"[ -x "$HOME/.local/share/lumina/go/current/bin/go" ] && readlink -f "$HOME/.local/share/lumina/go/current/bin/go" && exit 0
readlink -f "$(command -v go 2>/dev/null)" 2>/dev/null"#,
        ),
        "rust" => with_preamble(
            r#"readlink -f "$(rustup which rustc 2>/dev/null || command -v rustc 2>/dev/null)" 2>/dev/null"#,
        ),
        "php" => with_preamble(r#"readlink -f "$(command -v php 2>/dev/null)" 2>/dev/null"#),
        "dotnet" => with_preamble(
            r#"readlink -f "$(command -v dotnet 2>/dev/null || echo "$HOME/.dotnet/dotnet")" 2>/dev/null"#,
        ),
        _ => return None,
    })
}

pub(crate) fn status_probe_script(runtime_id: &str) -> Option<String> {
    Some(match runtime_id {
        "node" => with_preamble("node --version 2>&1"),
        "python" => with_preamble("python3 --version 2>&1 || python --version 2>&1"),
        "java" => with_preamble("java -version 2>&1"),
        "go" => with_preamble("go version 2>&1"),
        "rust" => with_preamble("rustc --version 2>&1"),
        "php" => with_preamble("php --version 2>&1 | head -1"),
        "dotnet" => with_preamble("dotnet --version 2>&1 || $HOME/.dotnet/dotnet --version 2>&1"),
        _ => return None,
    })
}

pub(crate) fn parse_version_path_lines(raw: &str) -> Vec<(String, String, Option<String>, Option<String>)> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for line in raw.lines() {
        let mut parts = line.splitn(4, '\t');
        let v = parts.next().unwrap_or("").trim();
        let p = parts.next().unwrap_or("").trim();
        let label = parts
            .next()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let java_home = parts
            .next()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        if v.is_empty() || p.is_empty() {
            continue;
        }
        if seen.insert(p.to_string()) {
            out.push((v.to_string(), p.to_string(), label, java_home));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_dedupes_paths() {
        let raw = "1.0\t/bin/a\n1.0\t/bin/a\n2.0\t/bin/b\n";
        let rows = parse_version_path_lines(raw);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].1, "/bin/a");
        assert_eq!(rows[1].1, "/bin/b");
    }

    #[test]
    fn parse_reads_optional_label_column() {
        let raw = "25.0.3\t/usr/lib/jvm/java-25-openjdk/bin/java\tJDK 25.0.3\t/usr/lib/jvm/java-25-openjdk\n";
        let rows = parse_version_path_lines(raw);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].2.as_deref(), Some("JDK 25.0.3"));
        assert_eq!(
            rows[0].3.as_deref(),
            Some("/usr/lib/jvm/java-25-openjdk")
        );
    }

    #[test]
    fn java_script_is_developer_focused_jdk_only() {
        let script = list_installed_versions_script("java").unwrap();
        assert!(script.contains("JDK $ver"));
        assert!(script.contains("[ -x \"$d/bin/javac\" ]"));
        assert!(script.contains("jre*) return 0"));
        assert!(!script.contains("JDK compiler"));
    }
}
