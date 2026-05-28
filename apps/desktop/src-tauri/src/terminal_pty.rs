use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex as StdMutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::host_exec::{cmd_timeout_short, exec_output_limit};
use crate::state::{AppState, TerminalSession};

// ---------------------------------------------------------------------------
// IPC send handlers (fire-and-forget via ipc_send)
// ---------------------------------------------------------------------------

pub(crate) async fn terminal_write(
  _app: &AppHandle,
  state: &AppState,
  payload: &Value,
) -> Result<(), String> {
  let id = payload
    .get("id")
    .and_then(|v| v.as_str())
    .unwrap_or_default()
    .to_string();
  let data = payload
    .get("data")
    .and_then(|v| v.as_str())
    .unwrap_or_default()
    .to_string();
  let map = state.terminals.lock().await;
  if let Some(session) = map.get(&id) {
    let mut writer = session
      .writer
      .lock()
      .map_err(|_| "[TERMINAL_WRITE_FAILED] writer lock poisoned".to_string())?;
    writer
      .write_all(data.as_bytes())
      .map_err(|e| format!("[TERMINAL_WRITE_FAILED] {}", e))?;
    writer
      .flush()
      .map_err(|e| format!("[TERMINAL_WRITE_FAILED] {}", e))?;
  }
  Ok(())
}

pub(crate) async fn terminal_close(
  _app: &AppHandle,
  state: &AppState,
  payload: &Value,
) -> Result<(), String> {
  let id = payload
    .get("id")
    .and_then(|v| v.as_str())
    .unwrap_or_default()
    .to_string();
  let session = {
    let mut map = state.terminals.lock().await;
    map.remove(&id)
  };
  if let Some(session) = session {
    // Kill child first, then wait for it to exit so the PTY reader thread
    // gets a clean EOF before the master fd is dropped. Without this wait
    // the reader thread can access freed PTY memory → heap corruption.
    tokio::task::spawn_blocking(move || {
      if let Ok(mut child) = session.child.lock() {
        let _ = child.kill();
        let _ = child.wait();
      }
      // session (and master) dropped here, after child has exited
    });
  }
  Ok(())
}

pub(crate) async fn terminal_resize(
  _app: &AppHandle,
  state: &AppState,
  payload: &Value,
) -> Result<(), String> {
  let id = payload
    .get("id")
    .and_then(|v| v.as_str())
    .unwrap_or_default()
    .to_string();
  let cols = payload.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
  let rows = payload.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
  let map = state.terminals.lock().await;
  if let Some(session) = map.get(&id) {
    if let Ok(master) = session.master.lock() {
      let _ = master.resize(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
      });
    }
  }
  Ok(())
}

// ---------------------------------------------------------------------------
// IPC invoke handlers (request/response via ipc_invoke)
// ---------------------------------------------------------------------------

pub(crate) async fn terminal_create(app: &AppHandle, state: &AppState, body: &Value) -> Value {
  let cols = body.get("cols").and_then(|v| v.as_u64()).unwrap_or(120) as u16;
  let rows = body.get("rows").and_then(|v| v.as_u64()).unwrap_or(34) as u16;
  let cmd_name = body
    .get("cmd")
    .and_then(|v| v.as_str())
    .map(|s| s.trim())
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(|| {
      if Path::new("/usr/bin/bash").exists() || Path::new("/bin/bash").exists() {
        "bash".to_string()
      } else {
        "sh".to_string()
      }
    });
  let pty_system = native_pty_system();
  match pty_system.openpty(PtySize {
    rows,
    cols,
    pixel_width: 0,
    pixel_height: 0,
  }) {
    Ok(pair) => {
      let mut cmd = CommandBuilder::new(&cmd_name);
      cmd.env("TERM", "xterm-256color");
      if let Some(env_map) = body.get("env").and_then(|v| v.as_object()) {
        for (key, val) in env_map {
          if let Some(s) = val.as_str() {
            cmd.env(key, s);
          }
        }
      }
      if let Some(args) = body.get("args").and_then(|v| v.as_array()) {
        for arg in args {
          if let Some(s) = arg.as_str() {
            cmd.arg(s);
          }
        }
      } else if cmd_name == "bash" {
        cmd.args(["--noprofile", "--norc", "-i"]);
      } else {
        cmd.arg("-i");
      }
      match pair.slave.spawn_command(cmd) {
        Ok(child) => {
          let id = Uuid::new_v4().to_string();
          let master = Arc::new(StdMutex::new(pair.master));
          let child = Arc::new(StdMutex::new(child));
          let writer = match master.lock() {
            Ok(guard) => match guard.take_writer() {
              Ok(w) => Arc::new(StdMutex::new(w)),
              Err(e) => {
                return json!({ "ok": false, "error": format!("[TERMINAL_CREATE_FAILED] {}", e) })
              }
            },
            Err(_) => {
              return json!({ "ok": false, "error": "[TERMINAL_CREATE_FAILED] PTY lock poisoned." })
            }
          };
          spawn_pty_reader(app.clone(), id.clone(), Arc::clone(&master));
          state
            .terminals
            .lock()
            .await
            .insert(id.clone(), TerminalSession {
              master,
              child,
              writer,
            });
          json!({ "ok": true, "id": id })
        }
        Err(e) => json!({ "ok": false, "error": format!("[TERMINAL_CREATE_FAILED] {}", e) }),
      }
    }
    Err(e) => json!({ "ok": false, "error": format!("[TERMINAL_CREATE_FAILED] {}", e) }),
  }
}

pub(crate) async fn terminal_open_external() -> Value {
  let launched = exec_output_limit(
    "bash",
    &[
      "-lc",
      "for t in xdg-terminal-emulator gnome-console kitty alacritty gnome-terminal konsole xfce4-terminal xterm; do command -v $t >/dev/null 2>&1 && ($t >/dev/null 2>&1 &); if [ $? -eq 0 ]; then echo ok; exit 0; fi; done; exit 1",
    ],
    cmd_timeout_short(),
  )
  .await
  .is_ok();
  if launched {
    json!({ "ok": true })
  } else {
    json!({ "ok": false, "error": "[TERMINAL_NOT_FOUND] Could not spawn host terminal." })
  }
}

pub(crate) async fn terminal_get_all_env() -> Value {
  let envs: HashMap<String, String> = std::env::vars().collect();
  json!({ "ok": true, "env": envs })
}

// ---------------------------------------------------------------------------
// Docker exec terminal (called from docker_engine)
// ---------------------------------------------------------------------------

pub(crate) async fn docker_terminal(app: &AppHandle, state: &AppState, body: &Value) -> Value {
  let container_id = body
    .get("containerId")
    .and_then(|v| v.as_str())
    .unwrap_or_default();
  if container_id.is_empty() {
    return json!({ "ok": false, "error": "[DOCKER_TERMINAL_FAILED] Missing containerId." });
  }
  let cols = body.get("cols").and_then(|v| v.as_u64()).unwrap_or(120) as u16;
  let rows = body.get("rows").and_then(|v| v.as_u64()).unwrap_or(34) as u16;
  let pty_system = native_pty_system();
  match pty_system.openpty(PtySize {
    rows,
    cols,
    pixel_width: 0,
    pixel_height: 0,
  }) {
    Ok(pair) => {
      let mut cmd = CommandBuilder::new("docker");
      cmd.args([
        "exec",
        "-it",
        container_id,
        "sh",
        "-lc",
        "if command -v bash >/dev/null 2>&1; then exec bash --noprofile --norc -i; else exec sh -i; fi",
      ]);
      match pair.slave.spawn_command(cmd) {
        Ok(child) => {
          let id = Uuid::new_v4().to_string();
          let master = Arc::new(StdMutex::new(pair.master));
          let child = Arc::new(StdMutex::new(child));
          let writer = match master.lock() {
            Ok(guard) => match guard.take_writer() {
              Ok(w) => Arc::new(StdMutex::new(w)),
              Err(e) => {
                return json!({ "ok": false, "error": format!("[DOCKER_TERMINAL_FAILED] {}", e) })
              }
            },
            Err(_) => {
              return json!({ "ok": false, "error": "[DOCKER_TERMINAL_FAILED] PTY lock poisoned." })
            }
          };
          spawn_pty_reader(app.clone(), id.clone(), Arc::clone(&master));
          state
            .terminals
            .lock()
            .await
            .insert(id.clone(), TerminalSession {
              master,
              child,
              writer,
            });
          json!({ "ok": true, "id": id })
        }
        Err(e) => json!({ "ok": false, "error": format!("[DOCKER_TERMINAL_FAILED] {}", e) }),
      }
    }
    Err(e) => json!({ "ok": false, "error": format!("[DOCKER_TERMINAL_FAILED] {}", e) }),
  }
}

// ---------------------------------------------------------------------------
// Shared PTY reader thread (used by both native and docker terminals)
// ---------------------------------------------------------------------------

fn spawn_pty_reader(
  app: AppHandle,
  id: String,
  master: Arc<StdMutex<Box<dyn portable_pty::MasterPty + Send>>>,
) {
  std::thread::spawn(move || {
    let mut reader = {
      let guard = match master.lock() {
        Ok(g) => g,
        Err(_) => return,
      };
      match guard.try_clone_reader() {
        Ok(r) => r,
        Err(_) => return,
      }
    };
    let mut buf = [0u8; 8192];
    while let Ok(n) = reader.read(&mut buf) {
      if n == 0 {
        break;
      }
      let data = String::from_utf8_lossy(&buf[..n]).to_string();
      let _ = app.emit("dh:terminal:data", json!({ "id": id.clone(), "data": data }));
    }
    let _ = app.emit("dh:terminal:exit", json!({ "id": id }));
  });
}
