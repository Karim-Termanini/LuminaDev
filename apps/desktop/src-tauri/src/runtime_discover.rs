//! Global runtime discovery — version managers, common home paths, and PATH.
//! Lumina install dirs are included but never exclusive.

const PREAMBLE: &str = r#"export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.juliaup/bin:$HOME/.bun/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" 2>/dev/null
command -v mise >/dev/null 2>&1 && eval "$("$HOME/.local/bin/mise" activate bash 2>/dev/null || mise activate bash 2>/dev/null)" 2>/dev/null
command -v pyenv >/dev/null 2>&1 && eval "$(pyenv init - --path 2>/dev/null)" 2>/dev/null
"#;

const EMIT_FN: &str = r#"
_emit_unique() {
  local v="$1" p="$2"
  [ -n "$v" ] && [ -n "$p" ] || return 0
  case "|$_disc_seen|" in *"|$p|"*) return 0 ;; esac
  _disc_seen="${_disc_seen}|$p"
  printf '%s\t%s\n' "$v" "$p"
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

pub(crate) fn list_installed_versions_script(runtime_id: &str) -> Option<String> {
    Some(match runtime_id {
        "node" => with_discover(&format!(
            "{MISE_LS}{ASDF_ROWS}
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
for d in "$HOME/.local/share/lumina/java"/jdk-*; do
  [ -d "$d" ] || continue
  [ -x "$d/bin/java" ] || continue
  _emit_unique "$(basename "$d" | sed 's/^jdk-//')" "$d/bin/java"
done
if [ -d "$HOME/.sdkman/candidates/java" ]; then
  for d in "$HOME/.sdkman/candidates/java"/*; do
    [ -d "$d" ] || continue
    [ "$d" = "$HOME/.sdkman/candidates/java/current" ] && continue
    [ -x "$d/bin/java" ] || continue
    _emit_unique "$(basename "$d")" "$d/bin/java"
  done
fi
if [ -d "$HOME/.jdks" ]; then
  for d in "$HOME/.jdks"/*; do
    [ -x "$d/bin/java" ] || continue
    _emit_unique "$(basename "$d")" "$d/bin/java"
  done
fi
for d in /usr/lib/jvm/* /usr/java/*; do
  [ -d "$d" ] || continue
  [ -x "$d/bin/java" ] || continue
  _emit_unique "$(basename "$d")" "$d/bin/java"
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
        "zig" => with_discover(
            r#"
if [ -d "$HOME/.local/share/lumina/zig" ]; then
  for d in "$HOME/.local/share/lumina/zig"/*; do
    [ -d "$d" ] || continue
    b=$(basename "$d"); [ "$b" = "current" ] && continue
    [ -x "$d/zig" ] || continue
    _emit_unique "$("$d/zig" version 2>/dev/null)" "$d/zig"
  done
fi
if [ -d "$HOME/.zig" ]; then
  for d in "$HOME/.zig"/*; do
    [ -x "$d/zig" ] || continue
    _emit_unique "$("$d/zig" version 2>/dev/null)" "$d/zig"
  done
fi
p=$(command -v zig 2>/dev/null)
if [ -n "$p" ]; then
  rp=$(readlink -f "$p" 2>/dev/null || echo "$p")
  _emit_unique "$("$rp" version 2>/dev/null)" "$rp"
fi
"#,
        ),
        "dart" => with_discover(
            r#"
if [ -d "$HOME/.local/share/lumina/dart" ]; then
  for d in "$HOME/.local/share/lumina/dart"/*; do
    [ -d "$d" ] || continue
    b=$(basename "$d"); [ "$b" = "current" ] && continue
    [ -x "$d/bin/dart" ] || continue
    ver=$("$d/bin/dart" --version 2>&1 | awk '{print $4}')
    _emit_unique "${ver:-$b}" "$d/bin/dart"
  done
fi
for d in "$HOME/.dart/dart-sdk" "$HOME/dart-sdk" "$HOME/sdks/dart"; do
  [ -x "$d/bin/dart" ] || continue
  ver=$("$d/bin/dart" --version 2>&1 | awk '{print $4}')
  _emit_unique "${ver:-dart}" "$d/bin/dart"
done
p=$(command -v dart 2>/dev/null)
if [ -n "$p" ]; then
  rp=$(readlink -f "$p" 2>/dev/null || echo "$p")
  ver=$("$rp" --version 2>&1 | awk '{print $4}')
  _emit_unique "${ver:-dart}" "$rp"
fi
"#,
        ),
        "flutter" => with_discover(
            r#"
for d in "$HOME/.local/share/lumina/flutter"/* "$HOME/flutter" "$HOME/.flutter-sdk" "$HOME/snap/flutter/common/flutter"; do
  [ -d "$d" ] || continue
  b=$(basename "$d"); [ "$b" = "current" ] && continue
  [ -x "$d/bin/flutter" ] || continue
  ver=$(cat "$d/version" 2>/dev/null | head -1)
  _emit_unique "${ver:-$b}" "$d/bin/flutter"
done
p=$(command -v flutter 2>/dev/null)
if [ -n "$p" ]; then
  rp=$(readlink -f "$p" 2>/dev/null || echo "$p")
  d=$(dirname "$(dirname "$rp")")
  ver=$(cat "$d/version" 2>/dev/null | head -1)
  [ -z "$ver" ] && ver=$("$rp" --version 2>/dev/null | head -1)
  _emit_unique "${ver:-installed}" "$rp"
fi
"#,
        ),
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
        "c_cpp" => with_discover(
            r#"
for bin in gcc g++ clang clang++; do
  p=$(command -v "$bin" 2>/dev/null) || continue
  rp=$(readlink -f "$p" 2>/dev/null || echo "$p")
  ver=$("$rp" --version 2>/dev/null | head -1)
  _emit_unique "${ver:-$bin}" "$rp"
done
"#,
        ),
        "lisp" => with_discover(
            r#"
for bin in sbcl clisp; do
  p=$(command -v "$bin" 2>/dev/null) || continue
  rp=$(readlink -f "$p" 2>/dev/null || echo "$p")
  ver=$("$rp" --version 2>/dev/null | head -1)
  _emit_unique "${ver:-$bin}" "$rp"
done
"#,
        ),
        "matlab" => with_discover(
            r#"
p=$(command -v octave 2>/dev/null)
if [ -n "$p" ]; then
  rp=$(readlink -f "$p" 2>/dev/null || echo "$p")
  ver=$("$rp" --version 2>/dev/null | head -1)
  _emit_unique "${ver:-octave}" "$rp"
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
        "node" => with_preamble(
            r#"command -v node 2>/dev/null | head -1 | xargs -r readlink -f 2>/dev/null || command -v node 2>/dev/null"#,
        ),
        "python" => with_preamble(
            r#"pyenv which python 2>/dev/null || pyenv which python3 2>/dev/null || readlink -f "$(command -v python3 2>/dev/null || command -v python 2>/dev/null)" 2>/dev/null"#,
        ),
        "java" => with_preamble(
            r#"[ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ] && readlink -f "$JAVA_HOME/bin/java" && exit 0
[ -x "$HOME/.local/share/lumina/java/current/bin/java" ] && readlink -f "$HOME/.local/share/lumina/java/current/bin/java" && exit 0
[ -x "$HOME/.sdkman/candidates/java/current/bin/java" ] && readlink -f "$HOME/.sdkman/candidates/java/current/bin/java" && exit 0
readlink -f "$(command -v java 2>/dev/null)" 2>/dev/null"#,
        ),
        "go" => with_preamble(
            r#"[ -x "$HOME/.local/share/lumina/go/current/bin/go" ] && readlink -f "$HOME/.local/share/lumina/go/current/bin/go" && exit 0
readlink -f "$(command -v go 2>/dev/null)" 2>/dev/null"#,
        ),
        "rust" => with_preamble(
            r#"readlink -f "$(rustup which rustc 2>/dev/null || command -v rustc 2>/dev/null)" 2>/dev/null"#,
        ),
        "php" => with_preamble(r#"readlink -f "$(command -v php 2>/dev/null)" 2>/dev/null"#),
        "ruby" => with_preamble(r#"readlink -f "$(command -v ruby 2>/dev/null)" 2>/dev/null"#),
        "zig" => with_preamble(r#"readlink -f "$(command -v zig 2>/dev/null)" 2>/dev/null"#),
        "dart" => with_preamble(r#"readlink -f "$(command -v dart 2>/dev/null)" 2>/dev/null"#),
        "flutter" => with_preamble(
            r#"for d in "$HOME/.local/share/lumina/flutter/current" "$HOME/flutter" "$HOME/.flutter-sdk"; do
  [ -x "$d/bin/flutter" ] && readlink -f "$d/bin/flutter" && exit 0
done
readlink -f "$(command -v flutter 2>/dev/null)" 2>/dev/null"#,
        ),
        "bun" => with_preamble(
            r#"[ -x "$HOME/.bun/bin/bun" ] && readlink -f "$HOME/.bun/bin/bun" 2>/dev/null || readlink -f "$(command -v bun 2>/dev/null)" 2>/dev/null"#,
        ),
        "julia" => with_preamble(
            r#"readlink -f "$(command -v julia 2>/dev/null || echo "$HOME/.juliaup/bin/julia")" 2>/dev/null"#,
        ),
        "lua" => with_preamble(
            r#"readlink -f "$(command -v lua 2>/dev/null || command -v lua5.4 2>/dev/null)" 2>/dev/null"#,
        ),
        "lisp" => with_preamble(r#"readlink -f "$(command -v sbcl 2>/dev/null)" 2>/dev/null"#),
        "r" => with_preamble(r#"readlink -f "$(command -v R 2>/dev/null)" 2>/dev/null"#),
        "c_cpp" => with_preamble(r#"readlink -f "$(command -v gcc 2>/dev/null)" 2>/dev/null"#),
        "matlab" => with_preamble(r#"readlink -f "$(command -v octave 2>/dev/null)" 2>/dev/null"#),
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
        "ruby" => with_preamble("ruby --version 2>&1"),
        "dotnet" => with_preamble("dotnet --version 2>&1 || $HOME/.dotnet/dotnet --version 2>&1"),
        "bun" => with_preamble("bun --version 2>&1"),
        "zig" => with_preamble("zig version 2>&1"),
        "dart" => with_preamble("dart --version 2>&1 | head -1"),
        "flutter" => with_preamble(
            r#"p=$(command -v flutter 2>/dev/null)
if [ -n "$p" ]; then d=$(dirname "$(dirname "$(readlink -f "$p")")"); cat "$d/version" 2>/dev/null | head -1 || flutter --version 2>&1 | head -1; fi"#,
        ),
        "julia" => with_preamble("julia --version 2>&1"),
        "lua" => with_preamble("lua -v 2>&1 || lua5.4 -v 2>&1"),
        "lisp" => with_preamble("sbcl --version 2>&1"),
        "r" => with_preamble("R --version 2>&1 | head -1"),
        "c_cpp" => with_preamble("gcc --version 2>&1 | head -1"),
        "matlab" => with_preamble("octave --version 2>&1 | head -1"),
        _ => return None,
    })
}

pub(crate) fn parse_version_path_lines(raw: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for line in raw.lines() {
        let mut parts = line.splitn(2, '\t');
        let v = parts.next().unwrap_or("").trim();
        let p = parts.next().unwrap_or("").trim();
        if v.is_empty() || p.is_empty() {
            continue;
        }
        if seen.insert(p.to_string()) {
            out.push((v.to_string(), p.to_string()));
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
    fn flutter_script_includes_home_flutter() {
        let script = list_installed_versions_script("flutter").unwrap();
        assert!(script.contains("$HOME/flutter"));
        assert!(script.contains("command -v flutter"));
    }
}
