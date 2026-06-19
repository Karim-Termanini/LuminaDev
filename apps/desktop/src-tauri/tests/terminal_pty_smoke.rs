use std::io::Read;
use std::time::Duration;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

fn open_test_pty() -> Option<portable_pty::PtyPair> {
    let pty_system = native_pty_system();
    match pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(pair) => Some(pair),
        Err(e) => {
            eprintln!("Skipping test: openpty unavailable ({e})");
            None
        }
    }
}

#[test]
fn pty_spawn_echo_smoke() {
    let Some(pair) = open_test_pty() else {
        return;
    };

    let mut cmd = CommandBuilder::new("echo");
    cmd.arg("pty-smoke-ok");
    let mut child = pair.slave.spawn_command(cmd).expect("spawn echo in PTY");
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().expect("clone reader");
    let mut buf = [0u8; 512];
    let mut out = String::new();
    for _ in 0..100 {
        if let Ok(n) = reader.read(&mut buf) {
            if n > 0 {
                out.push_str(&String::from_utf8_lossy(&buf[..n]));
            }
        }
        if out.contains("pty-smoke-ok") {
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }

    let _ = child.wait();
    assert!(
        out.contains("pty-smoke-ok"),
        "expected PTY echo output, got: {out:?}"
    );
}

#[test]
fn pty_resize_smoke() {
    let Some(pair) = open_test_pty() else {
        return;
    };

    pair.master
        .resize(PtySize {
            rows: 30,
            cols: 100,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("resize PTY");
}
