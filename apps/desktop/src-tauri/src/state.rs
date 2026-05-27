use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::Instant;

use portable_pty::{Child, MasterPty};
use serde_json::Value;
use tokio::sync::Mutex;

pub(crate) static START_TIME: OnceLock<Instant> = OnceLock::new();

pub(crate) struct TerminalSession {
  pub master: Arc<StdMutex<Box<dyn MasterPty + Send>>>,
  pub child: Arc<StdMutex<Box<dyn Child + Send + Sync>>>,
  pub writer: Arc<StdMutex<Box<dyn Write + Send>>>,
}

#[derive(Default)]
pub(crate) struct AppState {
  pub terminals: Mutex<HashMap<String, TerminalSession>>,
  pub jobs: Mutex<Vec<Value>>,
  pub net_prev: Mutex<Option<(u64, u64, Instant)>>,
  pub disk_prev: Mutex<Option<(u64, u64, Instant)>>,
  pub cpu_prev: Mutex<Option<(u64, u64, Instant)>>,
}
