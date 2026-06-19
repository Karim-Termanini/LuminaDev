mod common;

use std::fs;
use std::process::Command;

#[test]
fn proc_meminfo_smoke() {
    if !common::on_linux() {
        eprintln!("Skipping test: /proc/meminfo not available (non-Linux)");
        return;
    }

    let mem = fs::read_to_string("/proc/meminfo").expect("read /proc/meminfo");
    assert!(mem.contains("MemTotal:"));
    assert!(mem.contains("MemAvailable:"));
}

#[test]
fn proc_stat_smoke() {
    if !common::on_linux() {
        eprintln!("Skipping test: /proc/stat not available (non-Linux)");
        return;
    }

    let stat = fs::read_to_string("/proc/stat").expect("read /proc/stat");
    assert!(stat.lines().next().is_some_and(|l| l.starts_with("cpu ")));
}

#[test]
fn ps_top_processes_smoke() {
    let output = Command::new("ps")
        .args(["-eo", "pid,comm,%cpu,%mem", "--sort=-%cpu"])
        .output();
    let Some(output) = output.ok() else {
        eprintln!("Skipping test: ps not available");
        return;
    };
    assert!(
        output.status.success(),
        "ps failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let text = String::from_utf8_lossy(&output.stdout);
    assert!(text.contains("PID") || text.lines().count() > 1);
}

#[test]
fn ss_listening_ports_smoke() {
    let output = Command::new("ss").args(["-tulpn"]).output();
    let Some(output) = output.ok() else {
        eprintln!("Skipping test: ss not available");
        return;
    };
    assert!(
        output.status.success(),
        "ss -tulpn failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}
