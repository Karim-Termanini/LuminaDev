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
}
