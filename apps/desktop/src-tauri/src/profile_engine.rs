use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

use crate::host_exec::{
    cmd_timeout_long, cmd_timeout_short, exec_output_limit,
};
use crate::utils::{app_file, find_free_port, read_json};

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

        let proj_dir = store
            .get(format!("project_dir_{}", profile))
            .or_else(|| store.get(format!("project_dir_{}", ref_profile)))
            .and_then(|v| v.as_str());
        if let Some(dir_str) = proj_dir {
            if !dir_str.is_empty() {
                env.insert("PROJECT_DIR".to_string(), dir_str.to_string());
            }
        }

        for (env_key, store_prefix) in &[
            ("JUPYTER_PORT", "jupyter_port"),
            ("POSTGRES_PORT", "postgres_port"),
            ("NODE_PORT", "node_port"),
            ("NODE_HMR_PORT", "node_hmr_port"),
            ("APPIUM_PORT", "appium_port"),
            ("JSON_SERVER_PORT", "json_server_port"),
            ("OLLAMA_PORT", "ollama_port"),
        ] {
            let store_key = format!("{}_{}", store_prefix, profile);
            if let Some(val) = store.get(&store_key).and_then(|v| v.as_u64()) {
                env.insert(env_key.to_string(), val.to_string());
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
                                    if !k.trim().is_empty() {
                                        env.insert(k.trim().to_string(), v.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    env
}

pub(crate) async fn profile_switch(app: &AppHandle, body: &Value) -> Value {
    let from_profile = body.get("from").and_then(|v| v.as_str());
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

    if let Some(from) = from_profile {
        emit_step(&format!("Stopping {}...", from), 12);
        let from_template = resolve_profile_template(app, from);
        let from_dir = crate::compose_profiles::compose_profile_workdir(app, &from_template);
        if from_dir.is_dir() {
            match crate::compose_engine::expose_exec_docker_compose_in_dir(
                &from_dir,
                &["stop"],
                cmd_timeout_long(),
                Some(from),
                Some(get_profile_extra_env(app, from)),
            )
            .await
            {
                Ok((stdout, stderr)) => {
                    logs.push_str(&format!("Stopped old profile:\n{}{}\n", stdout, stderr))
                }
                Err(e) => logs.push_str(&format!(
                    "Warning: failed to stop old profile: {}\n",
                    e.trim()
                )),
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

    emit_step(
        &format!(
            "Starting {} (pulling images, building containers)...",
            to_profile
        ),
        60,
    );
    match crate::compose_engine::expose_exec_docker_compose_in_dir(
        &to_dir,
        &["up", "-d"],
        cmd_timeout_long(),
        Some(to_profile),
        Some(get_profile_extra_env(app, to_profile)),
    )
    .await
    {
        Ok((stdout, stderr)) => {
            logs.push_str(&format!("Started new profile:\n{}{}\n", stdout, stderr));
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
            emit_step("Done", 100);
            json!({ "ok": true, "log": logs })
        }
        Err(e) => {
            logs.push_str(&format!("Failed to start new profile: {}\n", e.trim()));
            json!({ "ok": false, "log": logs, "error": format!("[PROFILE_SWITCH_FAILED] {}", e.trim()) })
        }
    }
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
    let store = crate::profile_credentials::app_profile_credential_store(app);
    match store.save(id, value) {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub(crate) async fn profile_credentials_list(app: &AppHandle, _body: &Value) -> Value {
    let store = crate::profile_credentials::app_profile_credential_store(app);
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
    let store = crate::profile_credentials::app_profile_credential_store(app);
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
    let store = crate::profile_credentials::app_profile_credential_store(app);
    match store.load(id) {
        Ok(val) => json!({ "ok": true, "value": val }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}
