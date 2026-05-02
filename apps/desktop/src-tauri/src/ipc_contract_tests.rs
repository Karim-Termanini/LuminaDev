//! Contract tests: every `dh:*` channel declared in `packages/shared/src/ipc.ts` must appear
//! as a string literal in `lib.rs` match arms (`ipc_invoke` and/or `ipc_send`), so renames or
//! drift between TypeScript and Rust fail at `cargo test` time.

const IPC_TS: &str = include_str!(concat!(
  env!("CARGO_MANIFEST_DIR"),
  "/../../../packages/shared/src/ipc.ts"
));

const LIB_RS: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"));

/// Renderer `IPC` entries that do not go through `ipc_invoke` / `ipc_send` in this crate (Tauri dialog plugin, etc.).
const CHANNELS_NOT_IN_DISPATCHER: &[&str] = &[
  "dh:dialog:folder",
  "dh:dialog:file:open",
  "dh:dialog:file:save",
];

fn channels_declared_in_ipc_ts() -> Vec<String> {
  let mut out = Vec::new();
  for line in IPC_TS.lines() {
    let line = line.trim();
    let Some(idx) = line.find("'dh:") else {
      continue;
    };
    let tail = &line[idx + 1..];
    let Some(end) = tail.find('\'') else {
      continue;
    };
    let ch = tail[..end].to_string();
    if ch.starts_with("dh:") && ch.len() > 3 {
      out.push(ch);
    }
  }
  out.sort();
  out.dedup();
  out
}

#[test]
fn ipc_ts_declares_channels_that_lib_rs_dispatches() {
  let channels = channels_declared_in_ipc_ts();
  assert!(
    channels.len() >= 40,
    "expected many IPC channels parsed from ipc.ts, got {}",
    channels.len()
  );

  for ch in &channels {
    if CHANNELS_NOT_IN_DISPATCHER.contains(&ch.as_str()) {
      continue;
    }
    let needle = format!("\"{ch}\"");
    assert!(
      LIB_RS.contains(&needle),
      "channel `{ch}` from packages/shared/src/ipc.ts must appear as a match arm in src/lib.rs (ipc_invoke and/or ipc_send), or add it to CHANNELS_NOT_IN_DISPATCHER with a comment"
    );
  }
}

#[test]
fn terminal_fire_and_forget_channels_use_ipc_send() {
  for ch in ["dh:terminal:write", "dh:terminal:resize", "dh:terminal:close"] {
    assert!(
      LIB_RS.contains(&format!("\"{ch}\"")),
      "ipc_send must list `{ch}`"
    );
  }
}
