use super::*;
use crate::host_exec::exec_result_limit;
use crate::runtime_packages::{
    runtime_java_system_packages_for_version, runtime_read_host_distro,
    runtime_system_package_available,
};
use crate::runtime_versioning::lumina_probe_meaningful_line;
use crate::{
    active_binary_script, list_installed_versions_script, list_mise_runtime_script,
    parse_version_path_lines, status_probe_script,
};

pub(crate) fn effective_runtime_job_final_state(
    default_state: &str,
    current_state: &str,
) -> &'static str {
    if current_state == "cancelled" {
        "cancelled"
    } else if default_state == "failed" {
        "failed"
    } else {
        "completed"
    }
}

pub(crate) fn cancel_runtime_job(jobs: &mut [Value], id: &str) -> bool {
    if let Some(j) = jobs
        .iter_mut()
        .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(id))
    {
        if j.get("state").and_then(|v| v.as_str()) == Some("running") {
            j["state"] = json!("cancelled");
            j["logTail"] = json!(["Cancelled by user."]);
            return true;
        }
    }
    false
}

pub(crate) async fn handle_runtime_status() -> Value {
    // (id, display name, primary command, args, fallback commands)
    // Use a login shell so ~/.bashrc / ~/.profile PATH additions are active
    // (covers juliaup, nvm, bun, pyenv, etc. installed to user home dirs).
    let checks: &[(&str, &str)] = &[
        ("node", "Node.js"),
        ("python", "Python"),
        ("java", "Java"),
        ("go", "Go"),
        ("rust", "Rust"),
        ("php", "PHP"),
        ("dotnet", ".NET"),
    ];

    let mut tasks: Vec<(String, String, _)> = Vec::new();
    for &(id, name) in checks {
        let shell_cmd = status_probe_script(id).unwrap_or_default();
        if shell_cmd.is_empty() {
            continue;
        }
        let id = id.to_string();
        let name = name.to_string();
        let id_clone = id.clone();
        let name_clone = name.clone();
        tasks.push((
            id_clone,
            name_clone,
            tokio::spawn(async move {
                match exec_result_limit("bash", &["-lc", &shell_cmd], cmd_timeout_short()).await {
                    Ok((stdout, stderr)) => {
                        let version = lumina_probe_meaningful_line(&stdout, &stderr);
                        if version.is_empty() {
                            json!({ "id": id, "name": name, "installed": false })
                        } else {
                            json!({ "id": id, "name": name, "installed": true, "version": version })
                        }
                    }
                    Err(_) => json!({ "id": id, "name": name, "installed": false }),
                }
            }),
        ));
    }

    let mut runtimes = Vec::new();
    for (id, name, t) in tasks {
        match t.await {
            Ok(val) => runtimes.push(val),
            Err(_) => runtimes.push(json!({ "id": id, "name": name, "installed": false })),
        }
    }
    json!({ "ok": true, "runtimes": runtimes })
}

async fn collect_discovered_tab_versions(script: String, versions: &mut Vec<Value>) {
    if let Ok(raw) = exec_output_limit("bash", &["-lc", &script], cmd_timeout_short()).await {
        for (v, p, explicit_label, java_home) in parse_version_path_lines(&raw) {
            let mut row = json!({ "version": v, "path": p });
            if let Some(label) = explicit_label {
                row["label"] = json!(label);
            } else {
                let label = flutter_or_short_label(&v);
                if label != v {
                    row["label"] = json!(label);
                }
            }
            if let Some(home) = java_home {
                row["javaHome"] = json!(home);
            }
            versions.push(row);
        }
    }
}

fn sort_java_developer_versions(versions: &mut [Value]) {
    versions.sort_by(|a, b| {
        let va = a.get("version").and_then(|v| v.as_str()).unwrap_or("");
        let vb = b.get("version").and_then(|v| v.as_str()).unwrap_or("");
        vb.cmp(va)
    });
}

fn flutter_or_short_label(version: &str) -> String {
    if version.starts_with("Flutter ") {
        version
            .strip_prefix("Flutter ")
            .unwrap_or(version)
            .split_whitespace()
            .next()
            .unwrap_or(version)
            .to_string()
    } else {
        version.to_string()
    }
}

async fn collect_rust_installed_versions(versions: &mut Vec<Value>) {
    if let Ok(raw) = exec_output_limit(
        "bash",
        &["-lc", "unset RUSTUP_TOOLCHAIN; [ -x \"$HOME/.cargo/bin/rustup\" ] && \"$HOME/.cargo/bin/rustup\" toolchain list 2>/dev/null || true"],
        cmd_timeout_short(),
    )
    .await
    {
        let home = std::env::var("HOME").unwrap_or_default();
        for line in raw.lines() {
            let Some((tc, is_default)) = parse_rustup_toolchain_line(line) else {
                continue;
            };
            let rustc_bin = format!("{}/.rustup/toolchains/{}/bin/rustc", home, tc);
            if !std::path::Path::new(&rustc_bin).exists() {
                continue;
            }
            let label = exec_output_limit(
                "bash",
                &["-lc", &format!("\"{}\" --version 2>/dev/null | head -1", rustc_bin.replace('\"', "\\\""))],
                cmd_timeout_short(),
            )
            .await
            .ok()
            .map(|s| rust_toolchain_display_label(&tc, s.trim()))
            .unwrap_or_else(|| rust_toolchain_short_name(&tc));
            versions.push(json!({
                "version": tc,
                "path": rustc_bin,
                "label": label,
                "isDefault": is_default,
            }));
        }
    }
}

pub(crate) async fn handle_runtime_installed_versions(body: &Value) -> Value {
    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    if runtime_id.is_empty() {
        return json!({ "ok": false, "error": "[RUNTIME_INSTALLED_VERSIONS_INVALID] Missing runtimeId." });
    }

    let mut versions: Vec<Value> = Vec::new();

    match runtime_id {
        "rust" => collect_rust_installed_versions(&mut versions).await,
        "php" => {
            collect_discovered_tab_versions(
                list_mise_runtime_script("php", "php", "php"),
                &mut versions,
            )
            .await;
        }
        id => {
            if let Some(script) = list_installed_versions_script(id) {
                collect_discovered_tab_versions(script, &mut versions).await;
            }
        }
    }

    if runtime_id == "java" {
        sort_java_developer_versions(&mut versions);
    }

    if runtime_id != "rust" {
        if let Some(active) = runtime_active_binary_path(runtime_id).await {
            mark_default_installed_versions(&mut versions, &active);
        }
    }
    if versions.is_empty() {
        if let Some(entry) = probe_single_installed_version(runtime_id).await {
            versions.push(entry);
        }
    }
    ensure_single_installed_version_default(&mut versions);

    json!({ "ok": true, "versions": versions })
}

pub(crate) async fn handle_runtime_get_versions(body: &Value) -> Value {
    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or("node");
    let method = body
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("local");
    let mut versions: Vec<String> = Vec::new();
    if method == "system" {
        let (_distro, pkg_mgr_owned) = runtime_read_host_distro();
        let pkg_mgr = pkg_mgr_owned.as_str();
        match runtime_id {
            "node" | "python" | "go" | "php" => {
                versions.push("system (repo default)".into());
            }
            "rust" => {
                versions.push("local installer (recommended)".into());
            }
            "java" => {
                for label in ["21 (LTS)", "17 (LTS)", "11 (LTS)", "8 (LTS)"] {
                    if let Some(pkg) = runtime_java_system_packages_for_version(pkg_mgr, label)
                        .into_iter()
                        .next()
                    {
                        if runtime_system_package_available(pkg_mgr, &pkg).await {
                            versions.push(label.to_string());
                        }
                    }
                }
                let latest_pkg = if pkg_mgr == "dnf" {
                    "java-latest-openjdk-devel"
                } else {
                    ""
                };
                if !latest_pkg.is_empty()
                    && runtime_system_package_available(pkg_mgr, latest_pkg).await
                {
                    versions.push("latest (repo)".into());
                }
                if versions.is_empty() {
                    versions.push("system (repo default)".into());
                }
            }
            "dotnet" => versions.push("8.0 (LTS)".into()),
            _ => versions.push("system (repo default)".into()),
        }
        return json!({ "ok": true, "versions": versions });
    }
    match runtime_id {
        "node" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &["-fsSL", "https://nodejs.org/dist/index.json"],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
                    if let Some(list) = arr.as_array() {
                        for item in list.iter().take(25) {
                            if let (Some(v), Some(lts)) = (
                                item.get("version").and_then(|x| x.as_str()),
                                item.get("lts"),
                            ) {
                                let label = if lts.is_string() {
                                    format!("{} (LTS: {})", v, lts.as_str().unwrap())
                                } else if lts.as_bool().unwrap_or(false) {
                                    format!("{} (LTS)", v)
                                } else {
                                    v.to_string()
                                };
                                versions.push(label);
                            }
                        }
                    }
                }
            }
        }
        "rust" => versions.extend(["stable".into(), "beta".into(), "nightly".into()]),
        "python" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &["-fsSL", "https://endoflife.date/api/python.json"],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
                    if let Some(list) = arr.as_array() {
                        for item in list.iter() {
                            let is_eol = !matches!(item.get("eol"), Some(Value::Bool(false)));
                            if is_eol {
                                continue;
                            }
                            if let Some(v) = item.get("latest").and_then(|x| x.as_str()) {
                                versions.push(v.to_string());
                            }
                            if versions.len() >= 8 {
                                break;
                            }
                        }
                    }
                }
            }
            if versions.is_empty() {
                versions.extend([
                    "3.13.3".into(),
                    "3.12.10".into(),
                    "3.11.12".into(),
                    "3.10.17".into(),
                ]);
            }
        }
        "go" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &["-fsSL", "https://go.dev/dl/?mode=json&include=all"],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
                    if let Some(list) = arr.as_array() {
                        for item in list.iter().take(30) {
                            if let Some(v) = item.get("version").and_then(|x| x.as_str()) {
                                versions.push(v.trim_start_matches("go").to_string());
                            }
                        }
                    }
                }
            }
        }
        "java" => {
            versions.extend([
                "21 (LTS)".into(),
                "17 (LTS)".into(),
                "11 (LTS)".into(),
                "8 (LTS)".into(),
            ]);
        }
        "php" => {
            if let Ok(raw) = exec_output_limit(
                "curl",
                &["-fsSL", "https://endoflife.date/api/php.json"],
                cmd_timeout_short(),
            )
            .await
            {
                if let Ok(arr) = serde_json::from_str::<Value>(&raw) {
                    if let Some(list) = arr.as_array() {
                        for item in list.iter().take(10) {
                            if let Some(v) = item.get("latest").and_then(|x| x.as_str()) {
                                versions.push(v.to_string());
                            }
                        }
                    }
                }
            }
            if versions.is_empty() {
                versions.extend(["8.3".into(), "8.2".into(), "8.1".into(), "8.0".into()]);
            }
        }
        "dotnet" => versions.extend([
            "9.0".into(),
            "8.0 (LTS)".into(),
            "7.0".into(),
            "6.0 (LTS)".into(),
        ]),
        _ => {}
    }
    if versions.is_empty() {
        versions.push("latest".into());
    }
    json!({ "ok": true, "versions": versions })
}

pub(crate) async fn handle_runtime_check_deps(body: &Value) -> Value {
    let runtime_id = body
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or("node");
    let tools: Vec<(&str, &str)> = match runtime_id {
        "node" => vec![
            ("node", "node --version"),
            ("npm", "npm --version"),
            ("curl", "curl --version"),
        ],
        "python" => vec![
            ("python3", "python3 --version 2>&1 || python --version 2>&1"),
            ("pip3", "pip3 --version 2>&1 || pip --version 2>&1"),
        ],
        "go" => vec![("go", "go version"), ("gcc", "gcc --version")],
        "rust" => vec![
            ("rustc", "rustc --version"),
            ("cargo", "cargo --version"),
            ("rustup", "rustup --version"),
        ],
        "java" => vec![
            ("java", "java -version 2>&1"),
            ("javac", "javac -version 2>&1"),
        ],
        "php" => vec![(
            "php",
            "command -v php >/dev/null 2>&1 && php --version 2>&1 | head -1",
        )],
        "dotnet" => vec![(
            "dotnet",
            "dotnet --version 2>/dev/null || ~/.dotnet/dotnet --version 2>/dev/null",
        )],
        _ => vec![],
    };
    let mut deps: Vec<Value> = Vec::new();
    for (name, shell_cmd) in tools {
        let ok = exec_result_limit("bash", &["-lc", shell_cmd], cmd_timeout_short())
            .await
            .map(|(so, se)| !format!("{}{}", so, se).trim().is_empty())
            .unwrap_or(false);
        deps.push(
            json!({ "name": name, "status": if ok { "installed" } else { "missing" }, "ok": ok }),
        );
    }
    json!({ "ok": true, "dependencies": deps })
}

async fn runtime_active_binary_path(runtime_id: &str) -> Option<String> {
    let script = active_binary_script(runtime_id)?;
    let out = exec_output_limit("bash", &["-lc", &script], cmd_timeout_short())
        .await
        .ok()?;
    let path = out
        .lines()
        .find(|l| !l.trim().is_empty())?
        .trim()
        .to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

fn paths_refer_to_same_binary(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => false,
    }
}

fn active_match_score(path: &str, active_path: &str, label: Option<&str>) -> Option<u8> {
    if path != active_path && !paths_refer_to_same_binary(path, active_path) {
        return None;
    }
    if path == active_path {
        return Some(0);
    }
    let rank = match label {
        Some(l) if l.starts_with("JDK ") && !l.starts_with("JDK compiler") => 1,
        Some(l) if l.starts_with("System default") => 2,
        Some(l) if l.starts_with("JRE ") => 3,
        Some(l) if l.starts_with("JDK compiler") => 4,
        _ => 5,
    };
    Some(rank)
}

fn mark_default_installed_versions(versions: &mut [Value], active_path: &str) {
    let mut best: Option<(usize, u8)> = None;
    for (i, entry) in versions.iter().enumerate() {
        let Some(path) = entry.get("path").and_then(|v| v.as_str()) else {
            continue;
        };
        let label = entry.get("label").and_then(|v| v.as_str());
        let Some(score) = active_match_score(path, active_path, label) else {
            continue;
        };
        if best.map(|(_, s)| score < s).unwrap_or(true) {
            best = Some((i, score));
        }
    }
    for entry in versions.iter_mut() {
        if let Some(obj) = entry.as_object_mut() {
            obj.remove("isDefault");
        }
    }
    if let Some((i, _)) = best {
        if let Some(obj) = versions[i].as_object_mut() {
            obj.insert("isDefault".to_string(), json!(true));
        }
    }
}

fn ensure_single_installed_version_default(versions: &mut [Value]) {
    if versions.len() != 1 {
        return;
    }
    let already = versions
        .first()
        .and_then(|v| v.get("isDefault").and_then(|x| x.as_bool()))
        .unwrap_or(false);
    if already {
        return;
    }
    if let Some(obj) = versions[0].as_object_mut() {
        obj.insert("isDefault".to_string(), json!(true));
    }
}

fn parse_rustup_toolchain_line(line: &str) -> Option<(String, bool)> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let is_default = trimmed.contains("(default)") || trimmed.contains(", default)");
    let tc = trimmed.split('(').next()?.trim();
    if tc.is_empty() {
        None
    } else {
        Some((tc.to_string(), is_default))
    }
}

fn rust_toolchain_short_name(tc: &str) -> String {
    tc.split('-').next().unwrap_or(tc).to_string()
}

fn rust_toolchain_display_label(tc: &str, rustc_version_line: &str) -> String {
    let channel = rust_toolchain_short_name(tc);
    let ver = rustc_version_line
        .trim()
        .strip_prefix("rustc ")
        .unwrap_or(rustc_version_line)
        .split_whitespace()
        .next()
        .unwrap_or(channel.as_str());
    format!("{} ({})", ver, channel)
}

async fn probe_single_installed_version(runtime_id: &str) -> Option<Value> {
    let path = runtime_active_binary_path(runtime_id).await?;
    let probe = status_probe_script(runtime_id)?;
    let raw = exec_output_limit("bash", &["-lc", &probe], cmd_timeout_short())
        .await
        .ok()?;
    let label = lumina_probe_meaningful_line(&raw, "");
    if label.is_empty() {
        return None;
    }
    Some(json!({
        "version": "system",
        "path": path,
        "label": label,
        "isDefault": true,
    }))
}

pub(crate) async fn handle_job_cancel(state: &AppState, body: &Value) -> Value {
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let mut jobs = state.jobs.lock().await;
    let _ = cancel_runtime_job(&mut jobs, id.as_str());
    json!({ "ok": true })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn job_runner_cancel_marks_running_job() {
        let mut jobs = vec![json!({
          "id": "job-1",
          "state": "running",
          "logTail": ["start"]
        })];
        let changed = cancel_runtime_job(&mut jobs, "job-1");
        assert!(changed, "expected running job to be cancelled");
        assert_eq!(jobs[0]["state"], json!("cancelled"));
        assert_eq!(jobs[0]["logTail"], json!(["Cancelled by user."]));
    }

    #[test]
    fn job_runner_cancel_does_not_change_non_running_job() {
        let mut jobs = vec![json!({
          "id": "job-2",
          "state": "completed",
          "logTail": ["done"]
        })];
        let changed = cancel_runtime_job(&mut jobs, "job-2");
        assert!(!changed, "completed job should not be modified");
        assert_eq!(jobs[0]["state"], json!("completed"));
        assert_eq!(jobs[0]["logTail"], json!(["done"]));
    }

    #[test]
    fn parse_rustup_toolchain_active_default() {
        let (tc, is_default) =
            parse_rustup_toolchain_line("stable-x86_64-unknown-linux-gnu (active, default)")
                .unwrap();
        assert_eq!(tc, "stable-x86_64-unknown-linux-gnu");
        assert!(is_default);
    }

    #[test]
    fn parse_rustup_toolchain_beta_not_default() {
        let (tc, is_default) =
            parse_rustup_toolchain_line("beta-x86_64-unknown-linux-gnu").unwrap();
        assert_eq!(tc, "beta-x86_64-unknown-linux-gnu");
        assert!(!is_default);
    }

    #[test]
    fn rust_toolchain_display_label_formats_channel() {
        let label = rust_toolchain_display_label(
            "stable-x86_64-unknown-linux-gnu",
            "rustc 1.96.0 (ac68faa20 2026-05-25)",
        );
        assert_eq!(label, "1.96.0 (stable)");
    }

    #[test]
    fn mark_default_installed_versions_by_path() {
        let mut versions = vec![
            json!({ "version": "3.12.0", "path": "/home/u/.pyenv/versions/3.12.0/bin/python" }),
            json!({ "version": "3.14.5", "path": "/home/u/.pyenv/versions/3.14.5/bin/python" }),
        ];
        mark_default_installed_versions(&mut versions, "/home/u/.pyenv/versions/3.14.5/bin/python");
        assert_eq!(versions[0].get("isDefault"), None);
        assert_eq!(versions[1].get("isDefault"), Some(&json!(true)));
    }

    #[test]
    fn ensure_single_installed_version_default_marks_lone_entry() {
        let mut versions = vec![
            json!({ "version": "v25.2.0", "path": "/home/u/.nvm/versions/node/v25.2.0/bin/node" }),
        ];
        ensure_single_installed_version_default(&mut versions);
        assert_eq!(versions[0].get("isDefault"), Some(&json!(true)));
    }

    #[test]
    fn effective_final_state_prefers_cancelled_state() {
        assert_eq!(
            effective_runtime_job_final_state("completed", "cancelled"),
            "cancelled"
        );
        assert_eq!(
            effective_runtime_job_final_state("failed", "cancelled"),
            "cancelled"
        );
        assert_eq!(
            effective_runtime_job_final_state("failed", "running"),
            "failed"
        );
        assert_eq!(
            effective_runtime_job_final_state("completed", "running"),
            "completed"
        );
    }
}
