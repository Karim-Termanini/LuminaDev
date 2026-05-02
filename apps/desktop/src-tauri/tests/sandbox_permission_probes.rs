// Sandbox Permission Probe Tests
// Verify that LuminaDev can access critical resources within Flatpak sandbox constraints

use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::process::Command;

/// Test: Docker socket accessibility inside sandbox
/// Probes: /var/run/docker.sock, /run/docker.sock, and ~/.docker/desktop/docker.sock
#[test]
fn sandbox_docker_socket_accessible() {
  eprintln!("Probe: Docker socket accessibility in sandbox");

  // List of common Docker socket locations
  let home = std::env::var("HOME").unwrap_or_default();
  let user_docker_sock = format!("{}/.docker/desktop/docker.sock", home);
  let socket_paths = [
    "/var/run/docker.sock",
    "/run/docker.sock",
    user_docker_sock.as_str(),
  ];

  let mut any_found = false;

  for socket_path in socket_paths {
    let path = Path::new(socket_path);

    if !path.exists() {
      eprintln!("  ✗ Socket not found: {}", socket_path);
      continue;
    }

    // Check if it's a socket
    match fs::metadata(path) {
      Ok(metadata) => {
        let mode = metadata.mode();
        let is_socket = (mode & 0o170000) == 0o140000; // S_IFSOCK

        if is_socket {
          eprintln!("  ✓ Found socket: {} (readable: {})", socket_path, metadata.permissions().readonly());
          any_found = true;
        } else {
          eprintln!("  ✗ Path exists but is not a socket: {}", socket_path);
        }
      }
      Err(e) => {
        eprintln!("  ✗ Error checking {}: {}", socket_path, e);
      }
    }
  }

  if any_found {
    eprintln!("✓ Docker socket accessibility probe PASSED");
  } else {
    eprintln!("⚠ No Docker socket found - this is expected in non-container environments");
  }
}

/// Test: Docker daemon connectivity via socket
/// Attempts to connect to Docker daemon and run `docker info`
#[test]
fn sandbox_docker_daemon_connectivity() {
  eprintln!("Probe: Docker daemon connectivity");

  let output = Command::new("docker")
    .arg("info")
    .output();

  match output {
    Ok(result) => {
      if result.status.success() {
        let stdout = String::from_utf8_lossy(&result.stdout);
        if stdout.contains("Containers:") || stdout.contains("Docker Root Dir:") {
          eprintln!("✓ Docker daemon connectivity PASSED");
        } else {
          eprintln!("⚠ Docker info succeeded but output looks unexpected");
        }
      } else {
        let stderr = String::from_utf8_lossy(&result.stderr);
        if stderr.contains("permission denied") || stderr.contains("Permission denied") {
          eprintln!("⚠ Docker socket permission denied - Flatpak override may be needed");
          eprintln!("   Try: flatpak override --user --socket=session-bus io.github.karimodora.LinuxDevHome");
        } else {
          eprintln!("⚠ Docker daemon not available: {}", stderr);
        }
      }
    }
    Err(e) => {
      eprintln!("⚠ Could not execute docker command: {}", e);
    }
  }
}

/// Test: PTY (pseudo-terminal) allocation success
/// Attempts to allocate a PTY and verify it works
#[test]
fn sandbox_pty_allocation_succeeds() {
  eprintln!("Probe: PTY allocation in sandbox");

  // Try to open a PTY using /dev/ptmx
  let ptmx_result = fs::OpenOptions::new()
    .read(true)
    .write(true)
    .open("/dev/ptmx");

  match ptmx_result {
    Ok(_pty) => {
      eprintln!("✓ PTY allocation PASSED - /dev/ptmx is accessible");
    }
    Err(e) => {
      eprintln!("✗ PTY allocation FAILED: {} (sandboxing may be too restrictive)", e);
    }
  }

  // Check if /dev/pts/ exists and is writable
  let pts_dir = Path::new("/dev/pts");
  if pts_dir.exists() && pts_dir.is_dir() {
    match fs::metadata(pts_dir) {
      Ok(metadata) => {
        eprintln!("✓ /dev/pts exists with permissions: {:?}", metadata.permissions());
      }
      Err(e) => {
        eprintln!("✗ /dev/pts exists but metadata check failed: {}", e);
      }
    }
  } else {
    eprintln!("⚠ /dev/pts directory not found");
  }
}

/// Test: SSH access within sandbox
/// Verifies that ~/.ssh directory is accessible
#[test]
fn sandbox_ssh_dir_accessible() {
  eprintln!("Probe: SSH directory accessibility in sandbox");

  if let Ok(home) = std::env::var("HOME") {
    let ssh_dir = format!("{}/.ssh", home);
    let path = Path::new(&ssh_dir);

    if path.exists() && path.is_dir() {
      eprintln!("✓ SSH directory found: {}", ssh_dir);

      // Try to list keys
      match fs::read_dir(path) {
        Ok(entries) => {
          let key_count = entries.filter_map(|e| e.ok()).count();
          eprintln!("✓ Found {} SSH key files", key_count);
        }
        Err(e) => {
          eprintln!("✗ Cannot read SSH directory: {}", e);
          eprintln!("   Try: flatpak override --user --filesystem=~/.ssh io.github.karimodora.LinuxDevHome");
        }
      }
    } else {
      eprintln!("⚠ SSH directory not found at {}", ssh_dir);
    }
  } else {
    eprintln!("⚠ HOME environment variable not set");
  }
}

/// Test: /proc filesystem access for monitoring
/// Verifies that process monitoring can read /proc
#[test]
fn sandbox_proc_filesystem_readable() {
  eprintln!("Probe: /proc filesystem accessibility for monitoring");

  let proc_path = Path::new("/proc");
  if !proc_path.exists() {
    eprintln!("⚠ /proc filesystem not found");
    return;
  }

  // Try to read current process info
  let pid = std::process::id();
  let stat_file = format!("/proc/{}/stat", pid);
  let stat_path = Path::new(&stat_file);

  match fs::read_to_string(stat_path) {
    Ok(content) => {
      if content.contains(&pid.to_string()) {
        eprintln!("✓ /proc filesystem readable for process monitoring");
      } else {
        eprintln!("⚠ /proc readable but content looks unexpected");
      }
    }
    Err(e) => {
      eprintln!("✗ Cannot read /proc/{}/stat: {}", pid, e);
      eprintln!("   Monitoring features may be limited in this sandbox");
    }
  }
}

/// Test: Host filesystem access via bind-mount
/// Verifies that common host paths are accessible
#[test]
fn sandbox_host_filesystem_bind_mounts() {
  eprintln!("Probe: Host filesystem bind-mount accessibility");

  let bind_paths = vec![
    ("/home", "User home directory"),
    ("/opt", "Optional software directory"),
    ("/usr", "System utilities"),
    ("/var", "System variable data"),
  ];

  for (path_str, description) in bind_paths {
    let path = Path::new(path_str);
    match fs::metadata(path) {
      Ok(_) => {
        eprintln!("✓ {} ({}) accessible", description, path_str);
      }
      Err(e) => {
        eprintln!("✗ {} ({}) not accessible: {}", description, path_str, e);
      }
    }
  }
}

/// Test: Terminal environment variables
/// Verifies TERM and COLORTERM are set correctly
#[test]
fn sandbox_terminal_env_vars() {
  eprintln!("Probe: Terminal environment variables");

  match std::env::var("TERM") {
    Ok(term) => eprintln!("✓ TERM={}", term),
    Err(_) => eprintln!("⚠ TERM environment variable not set"),
  }

  match std::env::var("COLORTERM") {
    Ok(colorterm) => eprintln!("✓ COLORTERM={}", colorterm),
    Err(_) => eprintln!("⚠ COLORTERM environment variable not set"),
  }

  match std::env::var("DISPLAY") {
    Ok(display) => eprintln!("✓ DISPLAY={}", display),
    Err(_) => eprintln!("⚠ DISPLAY environment variable not set (headless mode)"),
  }
}

/// Test: Dbus session accessibility
/// Required for many Flatpak integrations
#[test]
fn sandbox_dbus_session_available() {
  eprintln!("Probe: D-Bus session accessibility");

  if let Ok(dbus_addr) = std::env::var("DBUS_SESSION_BUS_ADDRESS") {
    eprintln!("✓ DBUS_SESSION_BUS_ADDRESS={}", dbus_addr.split_once('=').map(|(_, v)| v).unwrap_or("set"));
  } else {
    eprintln!("⚠ DBUS_SESSION_BUS_ADDRESS not set");
  }

  // Try connecting to session bus (optional - may not work in CI)
  let result = Command::new("dbus-send")
    .arg("--session")
    .arg("--print-reply")
    .arg("--dest=org.freedesktop.DBus")
    .arg("/org/freedesktop/DBus")
    .arg("org.freedesktop.DBus.ListNames")
    .output();

  match result {
    Ok(output) if output.status.success() => {
      eprintln!("✓ D-Bus session bus connectivity confirmed");
    }
    _ => {
      eprintln!("⚠ D-Bus session bus not accessible (may be normal in CI/container)");
    }
  }
}
