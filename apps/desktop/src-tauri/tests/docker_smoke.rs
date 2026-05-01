use std::process::Command;

fn docker_cmd(args: &[&str]) -> Option<std::process::Output> {
  Command::new("docker")
    .args(args)
    .output()
    .ok()
}

fn docker_builder_supports_dry_run() -> bool {
  let Some(output) = docker_cmd(&["builder", "prune", "--help"]) else {
    return false;
  };
  if !output.status.success() {
    return false;
  }
  let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
  text.contains("--dry-run")
}

fn docker_available() -> bool {
  docker_cmd(&["--version"])
    .map(|o| o.status.success())
    .unwrap_or(false)
}

fn docker_daemon_available() -> bool {
  docker_cmd(&["info"])
    .map(|o| o.status.success())
    .unwrap_or(false)
}

#[test]
fn docker_version_smoke() {
  if !docker_available() {
    eprintln!("Skipping test: docker CLI not available on PATH");
    return;
  }
  if !docker_daemon_available() {
    eprintln!("Skipping test: docker daemon is not running");
    return;
  }

  let Some(output) = docker_cmd(&["version"]) else {
    eprintln!("Skipping test: docker CLI not available on PATH");
    return;
  };
  assert!(
    output.status.success(),
    "docker version failed: {}",
    String::from_utf8_lossy(&output.stderr)
  );
}

#[test]
fn docker_info_smoke() {
  if !docker_available() {
    eprintln!("Skipping test: docker CLI not available on PATH");
    return;
  }
  if !docker_daemon_available() {
    eprintln!("Skipping test: docker daemon is not running");
    return;
  }

  let Some(output) = docker_cmd(&["info"]) else {
    eprintln!("Skipping test: docker CLI not available on PATH");
    return;
  };
  assert!(
    output.status.success(),
    "docker info failed: {}",
    String::from_utf8_lossy(&output.stderr)
  );
}

#[test]
fn docker_ps_all_smoke() {
  if !docker_available() {
    eprintln!("Skipping test: docker CLI not available on PATH");
    return;
  }
  if !docker_daemon_available() {
    eprintln!("Skipping test: docker daemon is not running");
    return;
  }

  let Some(output) = docker_cmd(&["ps", "--all"]) else {
    eprintln!("Skipping test: docker CLI not available on PATH");
    return;
  };
  assert!(
    output.status.success(),
    "docker ps --all failed: {}",
    String::from_utf8_lossy(&output.stderr)
  );
}

#[test]
fn docker_prune_preview_smoke() {
  if !docker_available() {
    eprintln!("Skipping test: docker CLI not available on PATH");
    return;
  }
  if !docker_daemon_available() {
    eprintln!("Skipping test: docker daemon is not running");
    return;
  }

  // Match the app's prune preview shape: only read/list operations.
  let preview_cmds: [&[&str]; 3] = [
    &["ps", "-a", "-q", "--filter", "status=exited"],
    &["images", "-f", "dangling=true", "-q"],
    &["volume", "ls", "-qf", "dangling=true"],
  ];

  for args in preview_cmds {
    let Some(output) = docker_cmd(args) else {
      eprintln!("Skipping test: docker CLI not available on PATH");
      return;
    };
    assert!(
      output.status.success(),
      "docker {:?} failed: {}",
      args,
      String::from_utf8_lossy(&output.stderr)
    );
  }

  if docker_builder_supports_dry_run() {
    let Some(output) = docker_cmd(&["builder", "prune", "-a", "--dry-run"]) else {
      eprintln!("Skipping buildx dry-run assertion: docker CLI not available");
      return;
    };
    assert!(
      output.status.success(),
      "docker builder prune dry-run failed: {}",
      String::from_utf8_lossy(&output.stderr)
    );
  } else {
    eprintln!("Skipping buildx dry-run assertion: --dry-run not supported");
  }
}

#[test]
fn docker_daemon_not_running_error_case() {
  if !docker_available() {
    eprintln!("Skipping test: docker CLI not available on PATH");
    return;
  }

  // Force an invalid socket to simulate daemon-down behavior.
  let Ok(output) = Command::new("docker")
    .env("DOCKER_HOST", "unix:///tmp/luminadev-nonexistent-docker.sock")
    .args(["info"])
    .output() else {
      eprintln!("Skipping test: docker CLI not available on PATH");
      return;
    };

  assert!(
    !output.status.success(),
    "expected docker info to fail with invalid DOCKER_HOST"
  );

  let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
  assert!(
    stderr.contains("cannot connect")
      || stderr.contains("no such file")
      || stderr.contains("is the docker daemon running")
      || stderr.contains("error during connect"),
    "expected daemon-not-running style error, got: {}",
    String::from_utf8_lossy(&output.stderr)
  );
}
