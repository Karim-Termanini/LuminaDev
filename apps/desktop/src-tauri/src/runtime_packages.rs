use crate::host_exec::{CMD_TIMEOUT_SHORT, exec_result_limit};

pub(crate) fn runtime_pkg_mgr(distro: &str) -> &'static str {
  match distro {
    "ubuntu" | "debian" | "linuxmint" | "pop" | "elementary" | "raspbian" => "apt",
    "fedora" | "rhel" | "centos" | "rocky" | "alma" | "amzn" => "dnf",
    "arch" | "manjaro" | "endeavouros" | "garuda" => "pacman",
    "opensuse" | "opensuse-leap" | "opensuse-tumbleweed" | "sles" => "zypper",
    _ => "apt",
  }
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
    ("ruby", "apt") => vec!["ruby", "ruby-dev"],
    ("ruby", "dnf") => vec!["ruby", "ruby-devel"],
    ("ruby", "pacman") => vec!["ruby"],
    ("ruby", "zypper") => vec!["ruby"],
    ("dotnet", "apt") => vec!["dotnet-sdk-8.0"],
    ("dotnet", "dnf") => vec!["dotnet-sdk-8.0"],
    ("dotnet", "pacman") => vec![],
    ("dotnet", "zypper") => vec!["dotnet-sdk-8.0"],
    ("zig", "apt") => vec!["zig"],
    ("zig", "dnf") => vec!["zig"],
    ("zig", "pacman") => vec!["zig"],
    ("zig", "zypper") => vec!["zig"],
    ("c_cpp", "apt") => vec!["gcc", "g++", "make", "cmake", "gdb"],
    ("c_cpp", "dnf") => vec!["gcc", "gcc-c++", "make", "cmake", "gdb"],
    ("c_cpp", "pacman") => vec!["gcc", "make", "cmake", "gdb"],
    ("c_cpp", "zypper") => vec!["gcc", "gcc-c++", "make", "cmake", "gdb"],
    ("matlab", "apt") => vec!["octave"],
    ("matlab", "dnf") => vec!["octave"],
    ("matlab", "pacman") => vec!["octave"],
    ("matlab", "zypper") => vec!["octave"],
    ("julia", "apt") => vec!["julia"],
    ("julia", "dnf") => vec!["julia"],
    ("julia", "pacman") => vec!["julia"],
    ("julia", "zypper") => vec!["julia"],
    ("lua", "apt") => vec!["lua5.4"],
    ("lua", "dnf") => vec!["lua"],
    ("lua", "pacman") => vec!["lua"],
    ("lua", "zypper") => vec!["lua54"],
    ("lisp", "apt") => vec!["sbcl"],
    ("lisp", "dnf") => vec!["sbcl"],
    ("lisp", "pacman") => vec!["sbcl"],
    ("lisp", "zypper") => vec!["sbcl"],
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

pub(crate) async fn runtime_dnf_package_available(pkg: &str) -> bool {
  let cmd = format!("dnf -q list --available '{}' >/dev/null 2>&1", pkg);
  exec_result_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_SHORT)
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
  exec_result_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_SHORT)
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
  exec_result_limit("bash", &["-lc", &cmd], CMD_TIMEOUT_SHORT)
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
