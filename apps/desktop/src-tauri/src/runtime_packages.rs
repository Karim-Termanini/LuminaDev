use crate::host_exec::{cmd_timeout_short, exec_output_limit, exec_result_limit};

/// Runtimes surfaced on `/runtimes` — used by install-matrix coverage tests.
#[cfg(test)]
pub(crate) const RUNTIME_IDS: &[&str] = &[
    "node", "python", "java", "go", "rust", "php", "dotnet",
];

pub(crate) fn runtime_pkg_mgr(distro: &str) -> &'static str {
    match distro.trim().to_lowercase().as_str() {
        "ubuntu" | "debian" | "linuxmint" | "pop" | "elementary" | "raspbian" | "zorin"
        | "neon" | "kubuntu" | "xubuntu" | "lubuntu" => "apt",
        "fedora" | "rhel" | "centos" | "rocky" | "alma" | "amzn" | "nobara" | "ultramarine"
        | "azurelinux" | "centos_stream" | "mageia" => "dnf",
        "arch" | "manjaro" | "endeavouros" | "garuda" | "cachyos" | "archcraft" => "pacman",
        "opensuse" | "opensuse-leap" | "opensuse-tumbleweed" | "sles" => "zypper",
        _ => "unknown",
    }
}

pub(crate) fn runtime_pkg_mgr_or_default(distro: &str) -> &'static str {
    let mgr = runtime_pkg_mgr(distro);
    if mgr == "unknown" {
        "apt"
    } else {
        mgr
    }
}

pub(crate) fn runtime_parse_os_release(content: &str) -> (String, String) {
    let mut id = "unknown".to_string();
    let mut id_like = String::new();
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("ID=") {
            id = rest.trim_matches('"').trim().to_lowercase();
        } else if let Some(rest) = line.strip_prefix("ID_LIKE=") {
            id_like = rest.trim_matches('"').trim().to_lowercase();
        }
    }
    (id, id_like)
}

/// Resolve distro id for package-manager mapping (handles ID_LIKE for spins/remixes).
pub(crate) fn runtime_resolve_distro_id(id: &str, id_like: &str) -> String {
    let id = id.trim().to_lowercase();
    if runtime_pkg_mgr(&id) != "unknown" {
        return id;
    }
    for token in id_like.split_whitespace() {
        let t = token.trim_matches('"').trim();
        if !t.is_empty() && runtime_pkg_mgr(t) != "unknown" {
            return t.to_string();
        }
    }
    id
}

pub(crate) fn runtime_read_host_distro() -> (String, String) {
    let content = std::fs::read_to_string("/etc/os-release").unwrap_or_default();
    let (id, id_like) = runtime_parse_os_release(&content);
    let resolved = runtime_resolve_distro_id(&id, &id_like);
    let pkg_mgr = runtime_pkg_mgr_or_default(&resolved);
    (resolved, pkg_mgr.to_string())
}

/// True when system packages exist or the runtime has a dedicated local installer path.
#[cfg(test)]
pub(crate) fn runtime_install_supported(runtime_id: &str, pkg_mgr: &str) -> bool {
    if !runtime_system_packages(runtime_id, pkg_mgr).is_empty() {
        return true;
    }
    matches!(
        runtime_id,
        "node" | "python" | "go" | "rust" | "java" | "dotnet" | "php"
    )
}

pub(crate) fn runtime_system_packages(runtime_id: &str, pkg_mgr: &str) -> Vec<&'static str> {
    match (runtime_id, pkg_mgr) {
        ("node", "apt") => vec!["nodejs", "npm"],
        ("node", "dnf") => vec!["nodejs", "npm"],
        ("node", "pacman") => vec!["nodejs", "npm"],
        ("node", "zypper") => vec!["nodejs", "npm"],
        ("python", "apt") => vec!["python3", "python3-pip"],
        ("python", "dnf") => vec!["python3", "python3-pip"],
        ("python", "pacman") => vec!["python", "python-pip"],
        ("python", "zypper") => vec!["python3", "python3-pip"],
        ("go", "apt") => vec!["golang"],
        ("go", "dnf") => vec!["golang"],
        ("go", "pacman") => vec!["go"],
        ("go", "zypper") => vec!["go"],
        ("java", "apt") => vec!["default-jdk"],
        ("java", "dnf") => vec!["java-latest-openjdk-devel"],
        ("java", "pacman") => vec!["jdk-openjdk"],
        ("java", "zypper") => vec!["java-21-openjdk-devel"],
        ("php", "apt") => vec!["php", "php-cli", "php-common"],
        ("php", "dnf") => vec!["php", "php-cli"],
        ("php", "pacman") => vec!["php"],
        ("php", "zypper") => vec!["php8", "php8-cli"],
        ("dotnet", "apt") => vec!["dotnet-sdk-8.0"],
        ("dotnet", "dnf") => vec!["dotnet-sdk-8.0"],
        ("dotnet", "pacman") => vec![],
        ("dotnet", "zypper") => vec!["dotnet-sdk-8.0"],
        _ => vec![],
    }
}

pub(crate) fn runtime_java_major(requested_version: &str) -> Option<u32> {
    let t = requested_version.trim().trim_start_matches('v');
    let digits: String = t.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse::<u32>().ok()
    }
}

pub(crate) fn runtime_java_system_packages_for_version(
    pkg_mgr: &str,
    requested_version: &str,
) -> Vec<String> {
    let major = runtime_java_major(requested_version).unwrap_or(21);
    match pkg_mgr {
        "dnf" => match major {
            8 => vec!["java-1.8.0-openjdk-devel".to_string()],
            11 => vec!["java-11-openjdk-devel".to_string()],
            17 => vec!["java-17-openjdk-devel".to_string()],
            21 => vec!["java-21-openjdk-devel".to_string()],
            _ => vec!["java-latest-openjdk-devel".to_string()],
        },
        "apt" => match major {
            8 => vec!["openjdk-8-jdk".to_string()],
            11 => vec!["openjdk-11-jdk".to_string()],
            17 => vec!["openjdk-17-jdk".to_string()],
            21 => vec!["openjdk-21-jdk".to_string()],
            _ => vec!["default-jdk".to_string()],
        },
        "pacman" => match major {
            8 => vec!["jdk8-openjdk".to_string()],
            11 => vec!["jdk11-openjdk".to_string()],
            17 => vec!["jdk17-openjdk".to_string()],
            21 => vec!["jdk21-openjdk".to_string()],
            _ => vec!["jdk-openjdk".to_string()],
        },
        "zypper" => match major {
            8 => vec!["java-1_8_0-openjdk-devel".to_string()],
            11 => vec!["java-11-openjdk-devel".to_string()],
            17 => vec!["java-17-openjdk-devel".to_string()],
            21 => vec!["java-21-openjdk-devel".to_string()],
            _ => vec!["java-21-openjdk-devel".to_string()],
        },
        _ => vec!["default-jdk".to_string()],
    }
}

/// Arch Linux `archlinux-java` profile for a pacman JDK package name.
pub(crate) fn runtime_pacman_java_profile_for_pkg(pkg: &str) -> Option<&'static str> {
    match pkg {
        "jdk8-openjdk" => Some("java-8-openjdk"),
        "jdk11-openjdk" => Some("java-11-openjdk"),
        "jdk17-openjdk" => Some("java-17-openjdk"),
        "jdk21-openjdk" => Some("java-21-openjdk"),
        "jdk26-openjdk" => Some("java-26-openjdk"),
        _ => None,
    }
}

/// Arch Linux `archlinux-java` profile for a requested Java major version.
pub(crate) fn runtime_pacman_java_profile_for_version(requested_version: &str) -> &'static str {
    match runtime_java_major(requested_version).unwrap_or(21) {
        8 => "java-8-openjdk",
        11 => "java-11-openjdk",
        17 => "java-17-openjdk",
        21 => "java-21-openjdk",
        26 => "java-26-openjdk",
        _ => "java-21-openjdk",
    }
}

/// Profile name from a system JVM binary path, e.g. `/usr/lib/jvm/java-21-openjdk/bin/java`.
pub(crate) fn runtime_archlinux_java_profile_from_jvm_path(path: &str) -> Option<String> {
    const PREFIX: &str = "/usr/lib/jvm/";
    let rest = path.strip_prefix(PREFIX)?;
    let profile = rest.split('/').next()?.trim();
    if profile.is_empty() || profile == "default" || profile == "default-runtime" {
        return None;
    }
    Some(profile.to_string())
}

/// Switch the system default JDK on Arch Linux (`archlinux-java set` requires root).
pub(crate) fn runtime_archlinux_java_set_cmd(profile: &str) -> String {
    let safe = profile.replace('\'', "'\\''");
    format!("/usr/bin/archlinux-java set '{safe}'")
}

/// Expected system JVM binary path for an Arch `archlinux-java` profile (no filesystem check).
pub(crate) fn runtime_archlinux_java_binary_path_for_profile(profile: &str) -> Option<String> {
    let profile = profile.trim();
    if profile.is_empty() || profile.contains('/') {
        return None;
    }
    Some(format!("/usr/lib/jvm/{}/bin/java", profile))
}

/// Resolve the system default `bin/java` from `archlinux-java get` (Arch Linux only).
pub(crate) fn runtime_archlinux_java_binary_from_profile(profile: &str) -> Option<String> {
    let java_bin = runtime_archlinux_java_binary_path_for_profile(profile)?;
    if std::path::Path::new(&java_bin).is_file() {
        Some(java_bin)
    } else {
        None
    }
}

pub(crate) async fn runtime_archlinux_java_active_binary_path() -> Option<String> {
    let out = exec_output_limit(
        "bash",
        &["-lc", "/usr/bin/archlinux-java get 2>/dev/null"],
        cmd_timeout_short(),
    )
    .await
    .ok()?;
    let profile = out.lines().find(|l| !l.trim().is_empty())?.trim();
    runtime_archlinux_java_binary_from_profile(profile)
}

/// OpenJDK major from an Arch `archlinux-java` profile name (`java-21-openjdk` → 21).
pub(crate) fn java_major_from_archlinux_profile(profile: &str) -> Option<u32> {
    let rest = profile.strip_prefix("java-")?.strip_suffix("-openjdk")?;
    rest.parse().ok()
}

/// `mise use -g` for an installed Java version id (directory name under mise installs).
pub(crate) fn runtime_mise_java_set_cmd(version_id: &str) -> String {
    let safe = version_id.replace('\'', "'\\''");
    format!(
        r#"export PATH="$HOME/.local/bin:$PATH"
command -v mise >/dev/null 2>&1 || {{ echo '[RUNTIME_SET_ACTIVE_FAILED] mise is not installed.' >&2; exit 1; }}
mise use -g 'java@{safe}' && mise reshim"#
    )
}

/// Pick a mise Java install matching a major version and set it global (no-op when none match).
pub(crate) fn runtime_mise_java_set_for_major_cmd(major: u32) -> String {
    format!(
        r#"export PATH="$HOME/.local/bin:$PATH"
command -v mise >/dev/null 2>&1 || exit 0
pick=""
for d in "$HOME/.local/share/mise/installs/java"/*; do
  [ -d "$d" ] || continue
  bn=$(basename "$d")
  echo "$bn" | grep -qE '(^|[^0-9]){major}([^0-9]|$)|^{major}\.' || continue
  pick="$bn"
  break
done
[ -z "$pick" ] && exit 0
mise use -g "java@$pick" && mise reshim"#
    )
}

/// Point `alternatives` at the JDK shipped by an RPM (Fedora/RHEL).
pub(crate) fn runtime_dnf_java_alternatives_cmd(pkg: &str) -> String {
    format!(
        "JAVA_BIN=$(rpm -ql {pkg} 2>/dev/null | awk '/\\/bin\\/java$/'\"'\"'{{print; exit}}'\"'\"') ; \
         JAVAC_BIN=$(rpm -ql {pkg} 2>/dev/null | awk '/\\/bin\\/javac$/'\"'\"'{{print; exit}}'\"'\"') ; \
         [ -n \"$JAVA_BIN\" ] && alternatives --set java \"$JAVA_BIN\" || true ; \
         [ -n \"$JAVAC_BIN\" ] && alternatives --set javac \"$JAVAC_BIN\" || true",
        pkg = pkg
    )
}

pub(crate) async fn runtime_dnf_package_available(pkg: &str) -> bool {
    let cmd = format!("dnf -q list --available '{}' >/dev/null 2>&1", pkg);
    exec_result_limit("bash", &["-lc", &cmd], cmd_timeout_short())
        .await
        .is_ok()
}

pub(crate) async fn runtime_system_package_available(pkg_mgr: &str, pkg: &str) -> bool {
    let cmd = match pkg_mgr {
        "dnf" => format!("dnf -q list --available '{}' >/dev/null 2>&1", pkg),
        "apt" => format!("apt-cache show '{}' >/dev/null 2>&1", pkg),
        "pacman" => format!("pacman -Si '{}' >/dev/null 2>&1", pkg),
        "zypper" => format!("zypper -n info '{}' >/dev/null 2>&1", pkg),
        _ => return false,
    };
    exec_result_limit("bash", &["-lc", &cmd], cmd_timeout_short())
        .await
        .is_ok()
}

pub(crate) async fn runtime_system_package_installed(pkg_mgr: &str, pkg: &str) -> bool {
    let cmd = match pkg_mgr {
        "dnf" | "zypper" => format!("rpm -q '{}' >/dev/null 2>&1", pkg),
        "apt" => format!("dpkg -s '{}' >/dev/null 2>&1", pkg),
        "pacman" => format!("pacman -Qi '{}' >/dev/null 2>&1", pkg),
        _ => return false,
    };
    exec_result_limit("bash", &["-lc", &cmd], cmd_timeout_short())
        .await
        .is_ok()
}

pub(crate) fn pkg_upgrade_cmd(pkg_mgr: &str, packages: &[&str]) -> String {
    let pkgs = packages.join(" ");
    match pkg_mgr {
        "apt" => format!(
            "DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y {}",
            pkgs
        ),
        "dnf" => format!("dnf upgrade -y {}", pkgs),
        "pacman" => format!("pacman -Syu --noconfirm {}", pkgs),
        "zypper" => format!("zypper update -y {}", pkgs),
        _ => format!("apt-get install --only-upgrade -y {}", pkgs),
    }
}

pub(crate) fn pkg_remove_cmd(pkg_mgr: &str, packages: &[&str]) -> String {
    let pkgs = packages.join(" ");
    match pkg_mgr {
        "apt" => format!("apt-get remove -y {}", pkgs),
        "dnf" => format!("dnf remove -y {}", pkgs),
        "pacman" => format!("pacman -R --noconfirm {}", pkgs),
        "zypper" => format!("zypper remove -y {}", pkgs),
        _ => format!("apt-get remove -y {}", pkgs),
    }
}

/// Dry-run package removal and return dependency packages that would also be removed.
/// Returns an empty vec when the package manager is unavailable or unsupported.
pub(crate) async fn runtime_preview_removable_deps(pkg_mgr: &str, pkgs: &[&str]) -> Vec<String> {
    if pkgs.is_empty() {
        return vec![];
    }
    let pkg_set: std::collections::HashSet<&str> = pkgs.iter().copied().collect();
    match pkg_mgr {
        "apt" => {
            let mut args = vec!["-s", "remove", "--auto-remove"];
            args.extend_from_slice(pkgs);
            let out = exec_output_limit("apt-get", &args, cmd_timeout_short())
                .await
                .unwrap_or_default();
            out.lines()
                .filter(|l| l.starts_with("Remv "))
                .filter_map(|l| l.split_whitespace().nth(1))
                .filter(|p| !pkg_set.contains(*p))
                .map(|p| p.to_string())
                .collect()
        }
        "dnf" | "yum" => {
            let mut args = vec!["remove", "--assumeno"];
            args.extend_from_slice(pkgs);
            let out = exec_output_limit(pkg_mgr, &args, cmd_timeout_short())
                .await
                .unwrap_or_default();
            // dnf lists packages being removed under a "Removing:" header, one per line with leading space
            let mut in_removing = false;
            let mut deps = vec![];
            for line in out.lines() {
                if line.trim_start().starts_with("Removing:")
                    || line
                        .trim_start()
                        .starts_with("Removing dependent packages:")
                {
                    in_removing = true;
                    continue;
                }
                if in_removing {
                    if line.starts_with(' ') || line.starts_with('\t') {
                        let pkg = line.split_whitespace().next().unwrap_or("").to_string();
                        if !pkg.is_empty() && !pkg_set.contains(pkg.as_str()) {
                            deps.push(pkg);
                        }
                    } else {
                        in_removing = false;
                    }
                }
            }
            deps
        }
        "pacman" => {
            let mut args = vec!["-Rns", "--print-format", "%n\n"];
            args.extend_from_slice(pkgs);
            let out = exec_output_limit("pacman", &args, cmd_timeout_short())
                .await
                .unwrap_or_default();
            out.lines()
                .map(|l| l.trim().to_string())
                .filter(|p| !p.is_empty() && !pkg_set.contains(p.as_str()))
                .collect()
        }
        "zypper" => {
            let mut args = vec!["--non-interactive", "remove", "--clean-deps", "--dry-run"];
            args.extend_from_slice(pkgs);
            let out = exec_output_limit("zypper", &args, cmd_timeout_short())
                .await
                .unwrap_or_default();
            // zypper dry-run lists "Removing: <pkg>" lines
            out.lines()
                .filter(|l| l.trim_start().starts_with("Removing ") || l.starts_with("D "))
                .filter_map(|l| {
                    let p = l
                        .trim_start_matches("D ")
                        .trim_start_matches("Removing ")
                        .split_whitespace()
                        .next()?
                        .to_string();
                    if !pkg_set.contains(p.as_str()) {
                        Some(p)
                    } else {
                        None
                    }
                })
                .collect()
        }
        _ => vec![],
    }
}

fn parse_apt_dep_token(token: &str) -> String {
    token.split('(').next().unwrap_or(token).trim().to_string()
}

fn parse_apt_depends_lines(out: &str) -> Vec<String> {
    out.lines()
        .filter_map(|line| {
            let line = line.trim();
            if !(line.starts_with("Depends:") || line.starts_with("PreDepends:")) {
                return None;
            }
            let token = line.split_whitespace().nth(1)?;
            let name = parse_apt_dep_token(token);
            if name.is_empty() || name == "<" {
                None
            } else {
                Some(name)
            }
        })
        .collect()
}

fn parse_dnf_repoquery_requires(out: &str) -> Vec<String> {
    out.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.contains('(') && !line.starts_with('/'))
        .map(|line| line.to_string())
        .collect()
}

fn parse_pacman_qi_depends(out: &str) -> Vec<String> {
    for line in out.lines() {
        if let Some((_, rest)) = line.split_once("Depends On") {
            let deps_part = rest.trim().trim_start_matches(':').trim();
            return deps_part
                .split_whitespace()
                .map(|dep| dep.trim().to_string())
                .filter(|dep| !dep.is_empty())
                .collect();
        }
    }
    vec![]
}

fn parse_rpm_requires_lines(out: &str) -> Vec<String> {
    out.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.contains('(') && !line.starts_with('/'))
        .map(|line| line.to_string())
        .collect()
}

/// Installed packages that are direct dependencies of the runtime packages.
pub(crate) async fn runtime_preview_installed_dependencies(
    pkg_mgr: &str,
    pkgs: &[&str],
) -> Vec<String> {
    if pkgs.is_empty() {
        return vec![];
    }

    let mut deps = Vec::new();
    match pkg_mgr {
        "apt" => {
            for pkg in pkgs {
                let out = exec_output_limit(
                    "apt-cache",
                    &[
                        "depends",
                        "--no-recommends",
                        "--no-suggests",
                        "--no-conflicts",
                        "--no-breaks",
                        "--no-replaces",
                        "--no-enhances",
                        pkg,
                    ],
                    cmd_timeout_short(),
                )
                .await
                .unwrap_or_default();
                deps.extend(parse_apt_depends_lines(&out));
            }
        }
        "dnf" | "yum" => {
            for pkg in pkgs {
                let out = exec_output_limit(
                    pkg_mgr,
                    &["repoquery", "--requires", "--installed", "--resolve", "--quiet", pkg],
                    cmd_timeout_short(),
                )
                .await
                .unwrap_or_default();
                deps.extend(parse_dnf_repoquery_requires(&out));
            }
        }
        "pacman" => {
            for pkg in pkgs {
                let out = exec_output_limit("pacman", &["-Qi", pkg], cmd_timeout_short())
                    .await
                    .unwrap_or_default();
                deps.extend(parse_pacman_qi_depends(&out));
            }
        }
        "zypper" => {
            for pkg in pkgs {
                let safe = pkg.replace('\'', "'\\''");
                let cmd = format!("rpm -q --requires '{}' 2>/dev/null", safe);
                let out = exec_output_limit("bash", &["-lc", &cmd], cmd_timeout_short())
                    .await
                    .unwrap_or_default();
                deps.extend(parse_rpm_requires_lines(&out));
            }
        }
        _ => return vec![],
    }

    deps.sort();
    deps.dedup();

    let mut installed = Vec::new();
    for dep in deps {
        if runtime_system_package_installed(pkg_mgr, &dep).await {
            installed.push(dep);
        }
    }
    installed
}

/// Dependencies that stay installed because other software still requires them.
pub(crate) fn runtime_preview_blocked_shared_deps(
    runtime_pkgs: &[&str],
    installed_deps: &[String],
    removable_deps: &[String],
) -> Vec<String> {
    let runtime_set: std::collections::HashSet<&str> = runtime_pkgs.iter().copied().collect();
    let removable_set: std::collections::HashSet<&str> =
        removable_deps.iter().map(|dep| dep.as_str()).collect();
    let mut blocked: Vec<String> = installed_deps
        .iter()
        .filter(|dep| {
            !runtime_set.contains(dep.as_str()) && !removable_set.contains(dep.as_str())
        })
        .cloned()
        .collect();
    blocked.sort();
    blocked.dedup();
    blocked
}

pub(crate) async fn runtime_preview_blocked_shared_deps_for_runtime(
    pkg_mgr: &str,
    runtime_pkgs: &[&str],
    removable_deps: &[String],
) -> Vec<String> {
    let installed_deps = runtime_preview_installed_dependencies(pkg_mgr, runtime_pkgs).await;
    runtime_preview_blocked_shared_deps(runtime_pkgs, &installed_deps, removable_deps)
}

pub(crate) fn pkg_remove_with_deps_cmd(pkg_mgr: &str, packages: &[&str]) -> String {
    let pkgs = packages.join(" ");
    match pkg_mgr {
        "apt" => format!("apt-get remove -y {} && apt-get autoremove -y", pkgs),
        "dnf" => format!("dnf remove -y {}", pkgs),
        "pacman" => format!("pacman -Rns --noconfirm {}", pkgs),
        "zypper" => format!("zypper remove -y --clean-deps {}", pkgs),
        _ => format!("apt-get remove -y {} && apt-get autoremove -y", pkgs),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distro_pkg_manager_mapping_is_stable() {
        assert_eq!(runtime_pkg_mgr("ubuntu"), "apt");
        assert_eq!(runtime_pkg_mgr("fedora"), "dnf");
        assert_eq!(runtime_pkg_mgr("nobara"), "dnf");
        assert_eq!(runtime_pkg_mgr("arch"), "pacman");
        assert_eq!(runtime_pkg_mgr("opensuse"), "zypper");
        assert_eq!(runtime_pkg_mgr("unknown-distro"), "unknown");
        assert_eq!(runtime_pkg_mgr_or_default("unknown-distro"), "apt");
    }

    #[test]
    fn distro_resolution_uses_id_like_for_spins() {
        assert_eq!(
            runtime_resolve_distro_id("nobara", "rhel fedora"),
            "nobara"
        );
        assert_eq!(
            runtime_resolve_distro_id("custom-spin", "fedora"),
            "fedora"
        );
        assert_eq!(
            runtime_resolve_distro_id("custom-spin", "arch"),
            "arch"
        );
    }

    #[test]
    fn install_matrix_covers_all_runtimes_on_primary_distros() {
        for pkg_mgr in ["apt", "dnf", "pacman"] {
            for runtime_id in RUNTIME_IDS {
                assert!(
                    runtime_install_supported(runtime_id, pkg_mgr),
                    "runtime '{}' must be installable on {}",
                    runtime_id,
                    pkg_mgr
                );
            }
        }
    }

    #[test]
    fn java_package_selection_honors_major_version() {
        assert_eq!(
            runtime_java_system_packages_for_version("dnf", "17"),
            vec!["java-17-openjdk-devel".to_string()]
        );
        assert_eq!(
            runtime_java_system_packages_for_version("apt", "11.0.22"),
            vec!["openjdk-11-jdk".to_string()]
        );
        assert_eq!(
            runtime_java_system_packages_for_version("pacman", "stable"),
            vec!["jdk21-openjdk".to_string()]
        );
        assert_eq!(
            runtime_java_system_packages_for_version("dnf", "11.0.23"),
            vec!["java-11-openjdk-devel".to_string()]
        );
        assert_eq!(
            runtime_java_system_packages_for_version("dnf", "8"),
            vec!["java-1.8.0-openjdk-devel".to_string()]
        );
        assert_eq!(
            runtime_java_system_packages_for_version("dnf", "latest"),
            vec!["java-21-openjdk-devel".to_string()]
        );
    }

    #[test]
    fn pacman_java_profile_mapping_matches_archlinux_java() {
        assert_eq!(
            runtime_pacman_java_profile_for_pkg("jdk21-openjdk"),
            Some("java-21-openjdk")
        );
        assert_eq!(
            runtime_pacman_java_profile_for_version("17 (LTS)"),
            "java-17-openjdk"
        );
        assert_eq!(
            runtime_archlinux_java_profile_from_jvm_path(
                "/usr/lib/jvm/java-21-openjdk/bin/java"
            ),
            Some("java-21-openjdk".to_string())
        );
        assert_eq!(
            runtime_archlinux_java_set_cmd("java-21-openjdk"),
            "/usr/bin/archlinux-java set 'java-21-openjdk'"
        );
        assert_eq!(
            runtime_archlinux_java_binary_path_for_profile("java-21-openjdk"),
            Some("/usr/lib/jvm/java-21-openjdk/bin/java".to_string())
        );
        assert_eq!(
            runtime_archlinux_java_binary_from_profile("java-21-openjdk"),
            runtime_archlinux_java_binary_path_for_profile("java-21-openjdk")
                .filter(|p| std::path::Path::new(p).is_file())
        );
        assert_eq!(java_major_from_archlinux_profile("java-21-openjdk"), Some(21));
        assert!(runtime_mise_java_set_cmd("temurin-21.0.11+10.0.LTS").contains("mise reshim"));
    }

    #[test]
    fn pkg_command_builders_generate_expected_strings() {
        assert_eq!(
            pkg_upgrade_cmd("apt", &["nodejs", "npm"]),
            "DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y nodejs npm"
        );
        assert_eq!(
            pkg_remove_cmd("pacman", &["go"]),
            "pacman -R --noconfirm go"
        );
    }

    #[test]
    fn parse_apt_depends_lines_strips_version_constraints() {
        let sample = "\
nodejs
  Depends: libc6
  Depends: libnode72 (>= 12.22)
  PreDepends: adduser
  Recommends: ca-certificates
";
        assert_eq!(
            parse_apt_depends_lines(sample),
            vec![
                "libc6".to_string(),
                "libnode72".to_string(),
                "adduser".to_string()
            ]
        );
    }

    #[test]
    fn parse_pacman_qi_depends_reads_depends_on_line() {
        let sample = "\
Name            : nodejs
Version         : 23.7.0-1
Depends On      : glibc libngtcp2 libuv
Required By     : None
";
        assert_eq!(
            parse_pacman_qi_depends(sample),
            vec![
                "glibc".to_string(),
                "libngtcp2".to_string(),
                "libuv".to_string()
            ]
        );
    }

    #[test]
    fn blocked_shared_deps_excludes_runtime_and_autoremove_candidates() {
        let blocked = runtime_preview_blocked_shared_deps(
            &["nodejs", "npm"],
            &[
                "libc6".to_string(),
                "libgcc-s1".to_string(),
                "libuv1".to_string(),
                "npm".to_string(),
            ],
            &["libuv1".to_string()],
        );
        assert_eq!(
            blocked,
            vec!["libc6".to_string(), "libgcc-s1".to_string()]
        );
    }
}
