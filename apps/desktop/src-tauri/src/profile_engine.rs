use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

use crate::host_exec::{cmd_timeout_long, cmd_timeout_short, exec_output_limit};
use crate::utils::{app_file, find_free_port, read_json, sanitize_compose_project_name};

fn template_needs_project_dir(template: &str) -> bool {
    matches!(template, "web-dev" | "data-science" | "docs")
}

fn default_project_dir_from_store(store: &Value, profile: &str) -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
    let mut base = PathBuf::from(home).join("LuminaProjects");
    if let Some(dir) = store.get("projects_home_dir").and_then(|v| v.as_str()) {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            base = PathBuf::from(crate::project_scaffold::expand_tilde_path(trimmed));
        }
    }
    crate::project_scaffold::expand_tilde_path(
        base.join(profile)
            .join("default")
            .to_string_lossy()
            .as_ref(),
    )
}

fn resolve_profile_project_dir(
    _store_path: &PathBuf,
    store: &Value,
    profile: &str,
    template: &str,
) -> Option<String> {
    if !template_needs_project_dir(template) {
        return None;
    }

    let from_store = store
        .get(format!("project_dir_{}", profile))
        .or_else(|| store.get(format!("project_dir_{}", template)))
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(crate::project_scaffold::expand_tilde_path);

    if let Some(dir) = from_store {
        let _ = std::fs::create_dir_all(&dir);
        return Some(dir);
    }

    // Compose needs a mount path, but do not persist it as the user's linked workspace.
    let default = default_project_dir_from_store(store, profile);
    let _ = std::fs::create_dir_all(&default);
    Some(default)
}

pub(crate) fn format_profile_switch_error(raw: &str) -> String {
    let mut s = raw.trim();
    while let Some(rest) = s.strip_prefix("[PROFILE_SWITCH_FAILED]") {
        s = rest.trim();
    }
    if s.is_empty() {
        s = "docker compose up failed";
    }
    format!("[PROFILE_SWITCH_FAILED] {}", s)
}

pub(crate) fn resolve_profile_template(app: &AppHandle, profile: &str) -> String {
    let profile = profile.trim();
    if let Ok(store_path) = app_file(app, "store.json") {
        let store = read_json(&store_path);
        if let Some(custom_profiles) = store.get("custom_profiles").and_then(|v| v.as_array()) {
            for p in custom_profiles {
                if let Some(name) = p.get("name").and_then(|v| v.as_str()) {
                    if name == profile {
                        if let Some(base) = p.get("baseTemplate").and_then(|v| v.as_str()) {
                            return base.to_string();
                        }
                    }
                }
            }
        }
    }
    profile.to_string()
}

pub(crate) fn get_profile_extra_env(app: &AppHandle, profile: &str) -> HashMap<String, String> {
    let mut env = HashMap::new();
    let template = resolve_profile_template(app, profile);

    if let Ok(store_path) = app_file(app, "store.json") {
        let store = read_json(&store_path);

        let ref_profile = &template;
        if let Some(py_ver) = store
            .get(format!("python_version_{}", ref_profile))
            .and_then(|v| v.as_str())
        {
            if !py_ver.is_empty() {
                let tag = if py_ver == "latest" {
                    "latest".to_string()
                } else {
                    format!("python-{}", py_ver)
                };
                env.insert("PYTHON_IMAGE_TAG".to_string(), tag);
            }
        }
        if let Some(pg_ver) = store
            .get(format!("postgres_version_{}", ref_profile))
            .and_then(|v| v.as_str())
        {
            if !pg_ver.is_empty() {
                let tag = if pg_ver == "latest" {
                    "latest".to_string()
                } else {
                    format!("{}-alpine", pg_ver)
                };
                env.insert("POSTGRES_IMAGE_TAG".to_string(), tag);
            }
        }
        if let Some(node_ver) = store
            .get(format!("node_version_{}", ref_profile))
            .and_then(|v| v.as_str())
        {
            if !node_ver.is_empty() {
                let tag = if node_ver == "latest" {
                    "alpine".to_string()
                } else {
                    format!("{}-alpine", node_ver)
                };
                env.insert("NODE_IMAGE_TAG".to_string(), tag);
            }
        }

        if let Some(custom_profiles) = store.get("custom_profiles").and_then(|v| v.as_array()) {
            for p in custom_profiles {
                if let Some(name) = p.get("name").and_then(|v| v.as_str()) {
                    if name == profile {
                        if let Some(env_vars) = p.get("envVars").and_then(|v| v.as_array()) {
                            for ev in env_vars {
                                if let (Some(k), Some(v)) = (
                                    ev.get("key").and_then(|x| x.as_str()),
                                    ev.get("value").and_then(|x| x.as_str()),
                                ) {
                                    if !k.trim().is_empty() && !v.trim().is_empty() {
                                        env.insert(k.trim().to_string(), v.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Runtime-assigned ports in store win; canonical defaults fill gaps (see compose_ports.rs).
        crate::compose_ports::apply_profile_ports(&mut env, &template, profile, &store);

        let project_dir = env.get("PROJECT_DIR").map(|s| s.trim()).unwrap_or("");
        if project_dir.is_empty() {
            if let Some(dir) =
                resolve_profile_project_dir(&store_path, &store, profile, ref_profile)
            {
                env.insert("PROJECT_DIR".to_string(), dir);
            }
        } else {
            let expanded = crate::project_scaffold::expand_tilde_path(project_dir);
            let _ = std::fs::create_dir_all(&expanded);
            env.insert("PROJECT_DIR".to_string(), expanded);
        }
    }
    env
}

fn resolve_profile_name_from_compose_project(app: &AppHandle, project: &str) -> Option<String> {
    if project.trim().is_empty() {
        return None;
    }
    if let Ok(store_path) = app_file(app, "store.json") {
        let store = read_json(&store_path);
        if let Some(custom_profiles) = store.get("custom_profiles").and_then(|v| v.as_array()) {
            for p in custom_profiles {
                if let Some(name) = p.get("name").and_then(|v| v.as_str()) {
                    if sanitize_compose_project_name(name) == project {
                        return Some(name.to_string());
                    }
                }
            }
        }
    }
    Some(project.to_string())
}

async fn stop_compose_profile(app: &AppHandle, profile_name: &str, logs: &mut String) {
    let template = resolve_profile_template(app, profile_name);
    let dir = crate::compose_profiles::compose_profile_workdir(app, &template);
    if !dir.is_dir() {
        return;
    }
    let use_full = crate::compose_profiles::profile_wants_full_stack(app, profile_name, &dir);
    match crate::compose_engine::expose_exec_docker_compose_in_dir(
        &dir,
        &["stop"],
        cmd_timeout_long(),
        Some(profile_name),
        Some(get_profile_extra_env(app, profile_name)),
        use_full,
    )
    .await
    {
        Ok((stdout, stderr)) => {
            logs.push_str(&format!(
                "Stopped {}:\n{}{}\n",
                profile_name, stdout, stderr
            ));
        }
        Err(e) => logs.push_str(&format!(
            "Warning: failed to stop {}: {}\n",
            profile_name,
            e.trim()
        )),
    }
}

pub(crate) async fn profile_switch(app: &AppHandle, body: &Value) -> Value {
    let to_profile = body.get("to").and_then(|v| v.as_str()).unwrap_or_default();

    let _env_vars = body
        .get("envVars")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    if to_profile.is_empty() {
        return json!({ "ok": false, "log": "", "error": "[PROFILE_SWITCH_INVALID] 'to' profile required" });
    }

    let emit_step = |step: &str, progress: u8| {
        let _ = app.emit(
            "profile-switch-progress",
            serde_json::json!({ "step": step, "progress": progress }),
        );
    };

    emit_step("Checking Docker...", 3);
    match exec_output_limit(
        "docker",
        &["info", "--format", "{{.ServerVersion}}"],
        cmd_timeout_short(),
    )
    .await
    {
        Err(_) => {
            return json!({ "ok": false, "log": "", "error": "[DOCKER_UNAVAILABLE] Docker daemon is not reachable" })
        }
        Ok(ref out) if out.trim().is_empty() => {
            return json!({ "ok": false, "log": "", "error": "[DOCKER_UNAVAILABLE] Docker daemon is not reachable" })
        }
        Ok(_) => {}
    }

    let mut logs = String::new();

    let to_key = sanitize_compose_project_name(to_profile);
    let running = crate::monitor_handlers::running_compose_project_names().await;
    let other_running: Vec<String> = running
        .into_iter()
        .filter(|project| project != &to_key)
        .collect();
    if !other_running.is_empty() {
        emit_step("Stopping other profiles...", 12);
        for project in other_running {
            if let Some(profile_name) = resolve_profile_name_from_compose_project(app, &project) {
                stop_compose_profile(app, &profile_name, &mut logs).await;
            }
        }
    }

    let to_template = resolve_profile_template(app, to_profile);
    let to_dir = crate::compose_profiles::compose_profile_workdir(app, &to_template);
    if !to_dir.is_dir() {
        return json!({
          "ok": false,
          "log": logs,
          "error": format!("[PROFILE_SWITCH_FAILED] missing compose directory: {} (set LUMINA_DEV_COMPOSE_ROOT or run from a checkout with docker/compose)", to_dir.display())
        });
    }

    emit_step("Assigning ports...", 15);
    if let Ok(store_path) = app_file(app, "store.json") {
        let mut store = read_json(&store_path);
        let mut changed = false;
        let port_specs: &[(&str, u16)] = match to_template.as_str() {
            "data-science" => &[("jupyter_port", 8888), ("postgres_port", 54320)],
            "web-dev" => &[
                ("node_port", 3000),
                ("node_hmr_port", 5173),
                ("postgres_port", 54321),
            ],
            "ai-ml" => &[("jupyter_port", 18888), ("ollama_port", 11434)],
            _ => &[],
        };
        for (store_key_suffix, preferred) in port_specs {
            let store_key = format!("{}_{}", store_key_suffix, to_profile);
            if store.get(&store_key).is_none() {
                let free = find_free_port(*preferred);
                store[&store_key] = serde_json::json!(free);
                changed = true;
            }
        }
        if changed {
            let _ = std::fs::write(
                &store_path,
                serde_json::to_string_pretty(&store).unwrap_or_default(),
            );
        }
    }

    let use_full_stack =
        crate::compose_profiles::profile_wants_full_stack(app, to_profile, &to_dir);
    emit_step(
        &format!(
            "Starting {} (pulling images, building containers)...",
            to_profile
        ),
        18,
    );
    let env_vars = get_profile_extra_env(app, to_profile);
    match crate::compose_engine::exec_docker_compose_up_streaming(
        app,
        &to_dir,
        to_profile,
        Some(env_vars.clone()),
        use_full_stack,
    )
    .await
    {
        Ok(extra_log) => {
            if !extra_log.is_empty() {
                logs.push_str(&extra_log);
            }
            emit_step("Verifying containers are running...", 71);
            let mut running = false;
            for attempt in 0..45 {
                if crate::monitor_handlers::is_compose_profile_running(to_profile).await {
                    running = true;
                    break;
                }
                let pct = 71u8.saturating_add(((attempt + 1) * 8 / 45).min(8));
                emit_step(
                    &format!("Waiting for containers to start ({}/45)...", attempt + 1),
                    pct,
                );
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
            if !running {
                logs.push_str("Compose up finished but no running containers were detected.\n");
                return json!({
                    "ok": false,
                    "log": logs,
                    "error": "[PROFILE_SWITCH_FAILED] Stack started but containers are not running. Enable FULL stack on the profile or check Docker logs."
                });
            }
            logs.push_str("Containers are running.\n");
            if let Ok(store_path) = app_file(app, "store.json") {
                let mut store = read_json(&store_path);
                if !store.is_object() {
                    store = serde_json::json!({});
                }
                if let Some(map) = store.as_object_mut() {
                    map.insert("active_profile".to_string(), serde_json::json!(to_profile));
                }
                let _ = std::fs::write(
                    &store_path,
                    serde_json::to_string_pretty(&store).unwrap_or_default(),
                );
            }
            emit_step("Stack is running", 80);
            json!({ "ok": true, "log": logs })
        }
        Err(e) => {
            let err_str = e.trim().to_string();
            // Auto-retry on port conflict: reassign conflicting ports and try once more
            if err_str.contains("port is already allocated") {
                logs.push_str(&format!(
                    "Port conflict detected, reassigning ports...\n{}",
                    err_str
                ));
                if let Ok(store_path) = app_file(app, "store.json") {
                    let mut store = read_json(&store_path);
                    let mut changed = false;
                    // Extract the port number from the error message
                    let port_specs: &[(&str, u16)] = match to_template.as_str() {
                        "data-science" => &[("jupyter_port", 8888), ("postgres_port", 54320)],
                        "web-dev" => &[
                            ("node_port", 3000),
                            ("node_hmr_port", 5173),
                            ("postgres_port", 54321),
                        ],
                        _ => &[],
                    };
                    for (store_key_suffix, _preferred) in port_specs {
                        let store_key = format!("{}_{}", store_key_suffix, to_profile);
                        if let Some(port) = store.get(&store_key).and_then(|v| v.as_u64()) {
                            // Check if this port is in the error (likely the culprit)
                            if err_str.contains(&port.to_string()) {
                                let free = find_free_port(port as u16 + 1);
                                logs.push_str(&format!(
                                    "Reassigning {}: {} -> {}\n",
                                    store_key, port, free
                                ));
                                store[&store_key] = serde_json::json!(free);
                                changed = true;
                            }
                        }
                    }
                    if changed {
                        let _ = std::fs::write(
                            &store_path,
                            serde_json::to_string_pretty(&store).unwrap_or_default(),
                        );
                        // Retry with new ports
                        let env_vars_retry = get_profile_extra_env(app, to_profile);
                        match crate::compose_engine::exec_docker_compose_up_streaming(
                            app,
                            &to_dir,
                            to_profile,
                            Some(env_vars_retry),
                            use_full_stack,
                        )
                        .await
                        {
                            Ok(_) => {
                                if crate::monitor_handlers::is_compose_profile_running(to_profile)
                                    .await
                                {
                                    if let Ok(store_path) = app_file(app, "store.json") {
                                        let mut store = read_json(&store_path);
                                        if let Some(map) = store.as_object_mut() {
                                            map.insert(
                                                "active_profile".to_string(),
                                                serde_json::json!(to_profile),
                                            );
                                        }
                                        let _ = std::fs::write(
                                            &store_path,
                                            serde_json::to_string_pretty(&store)
                                                .unwrap_or_default(),
                                        );
                                    }
                                    emit_step("Stack is running", 80);
                                    return json!({ "ok": true, "log": logs });
                                }
                                logs.push_str(
                                    "Retry up succeeded but containers are still not running.\n",
                                );
                            }
                            Err(e2) => {
                                logs.push_str(&format!("Retry also failed: {}\n", e2.trim()));
                                return json!({ "ok": false, "log": logs, "error": format_profile_switch_error(&e2) });
                            }
                        }
                    }
                }
                logs.push_str(&format!("Failed to start new profile: {}\n", err_str));
                json!({ "ok": false, "log": logs, "error": format_profile_switch_error(&err_str) })
            } else {
                logs.push_str(&format!("Failed to start new profile: {}\n", err_str));
                json!({ "ok": false, "log": logs, "error": format_profile_switch_error(&err_str) })
            }
        }
    }
}

fn open_profile_credential_store(app: &AppHandle) -> Result<crate::profile_credentials::ProfileCredentialStore, Value> {
    crate::profile_credentials::app_profile_credential_store(app)
        .map_err(|e| json!({ "ok": false, "error": e }))
}

pub(crate) async fn profile_credentials_store(app: &AppHandle, body: &Value) -> Value {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
    let value = body
        .get("value")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if id.is_empty() || value.is_empty() {
        return json!({ "ok": false, "error": "[PROFILE_CRED_INVALID] 'id' and 'value' required" });
    }
    let store = match open_profile_credential_store(app) {
        Ok(s) => s,
        Err(v) => return v,
    };
    match store.save(id, value) {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn profile_credentials_list(app: &AppHandle, _body: &Value) -> Value {
    let store = match open_profile_credential_store(app) {
        Ok(s) => s,
        Err(v) => return v,
    };
    match store.list_ids() {
        Ok(ids) => json!({ "ok": true, "ids": ids }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn profile_credentials_delete(app: &AppHandle, body: &Value) -> Value {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
    if id.is_empty() {
        return json!({ "ok": false, "error": "[PROFILE_CRED_INVALID] 'id' required" });
    }
    let store = match open_profile_credential_store(app) {
        Ok(s) => s,
        Err(v) => return v,
    };
    match store.delete(id) {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn profile_credentials_get(app: &AppHandle, body: &Value) -> Value {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
    if id.is_empty() {
        return json!({ "ok": false, "error": "[PROFILE_CRED_INVALID] 'id' required" });
    }
    let store = match open_profile_credential_store(app) {
        Ok(s) => s,
        Err(v) => return v,
    };
    match store.load(id) {
        Ok(val) => json!({ "ok": true, "value": val }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn template_needs_project_dir_for_workspace_templates() {
        assert!(template_needs_project_dir("data-science"));
        assert!(template_needs_project_dir("web-dev"));
        assert!(!template_needs_project_dir("empty"));
    }

    #[test]
    fn default_project_dir_uses_projects_home_when_set() {
        let store = json!({ "projects_home_dir": "/tmp/lumina-work" });
        let dir = default_project_dir_from_store(&store, "testing11");
        assert_eq!(dir, "/tmp/lumina-work/testing11/default");
    }

    #[test]
    fn resolve_profile_project_dir_uses_compose_mount_without_persisting() {
        let base = std::env::temp_dir().join(format!("lumina-profile-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("temp dir");
        let store_path = base.join("store.json");
        fs::write(&store_path, r#"{"projects_home_dir":"/tmp/lumina-work"}"#).expect("write store");

        let store = read_json(&store_path);
        let resolved =
            resolve_profile_project_dir(&store_path, &store, "testing11", "data-science")
                .expect("resolved");

        assert_eq!(resolved, "/tmp/lumina-work/testing11/default");
        assert!(PathBuf::from(&resolved).is_dir());

        let updated = read_json(&store_path);
        assert!(
            updated.get("project_dir_testing11").is_none(),
            "auto compose mount must not be stored as linked workspace"
        );

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn resolve_profile_project_dir_honors_explicit_store_link() {
        let base = std::env::temp_dir().join(format!("lumina-profile-link-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("temp dir");
        let store_path = base.join("store.json");
        let linked = "/tmp/lumina-work/testing11/my-project";
        fs::write(
            &store_path,
            format!(r#"{{"project_dir_testing11":"{linked}"}}"#),
        )
        .expect("write store");

        let store = read_json(&store_path);
        let resolved =
            resolve_profile_project_dir(&store_path, &store, "testing11", "data-science")
                .expect("resolved");

        assert_eq!(resolved, linked);

        let _ = fs::remove_dir_all(&base);
    }
}
