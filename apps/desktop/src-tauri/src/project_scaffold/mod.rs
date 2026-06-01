pub(crate) mod deps_install;
pub(crate) mod editor_configs;
pub(crate) mod ports;
pub(crate) mod r_packages;
mod templates;

#[cfg(test)]
mod tests;

pub(crate) use deps_install::handle_project_install_deps;
pub(crate) use editor_configs::scaffold_editor_configs;

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub(crate) fn expand_tilde_path(path_str: &str) -> String {
    if path_str.starts_with("~/") {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
        path_str.replacen("~/", &format!("{}/", home), 1)
    } else {
        path_str.to_string()
    }
}

pub fn apply_project_scaffold(
    project_dir: &Path,
    template: &str,
    options: &Value,
    sub_template: Option<&str>,
) -> Result<(), String> {
    match template {
        "data-science" => templates::data_science::scaffold_data_science(project_dir, options),
        "web-dev" => templates::web_dev::scaffold_web_dev(project_dir, options),
        "mobile" => {
            let sub = sub_template.unwrap_or("react-native");
            let env_pairs: Vec<(&str, &str)> = vec![];
            if sub == "flutter" {
                templates::mobile::scaffold_mobile_flutter(project_dir, &env_pairs)
            } else {
                templates::mobile::scaffold_mobile_react_native(project_dir, &env_pairs)
            }
        }
        "ai-ml" => {
            let env_pairs: Vec<(&str, &str)> = vec![];
            templates::ai_ml::scaffold_ai_ml(project_dir, &env_pairs)
        }
        "docs" => templates::docs::scaffold_docs(project_dir),
        _ => Ok(()),
    }
}

pub async fn handle_project_scaffold(body: Value) -> Value {
    let path_str = body
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let template = body
        .get("template")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let options = body.get("options").cloned().unwrap_or_else(|| json!({}));

    if path_str.is_empty() {
        return json!({ "ok": false, "error": "[SCAFFOLD_FAILED] Missing path." });
    }

    let expanded = expand_tilde_path(path_str);
    let project_dir = PathBuf::from(&expanded);
    if let Err(e) = std::fs::create_dir_all(&project_dir) {
        return json!({
            "ok": false,
            "error": format!("[SCAFFOLD_FAILED] Could not create directory: {}", e),
        });
    }

    let sub = body.get("subTemplate").and_then(|v| v.as_str());
    match apply_project_scaffold(&project_dir, template, &options, sub) {
        Ok(()) => json!({ "ok": true, "path": expanded }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub fn detect_template(project_dir: &Path) -> String {
    if project_dir.join("package.json").exists() {
        "web-dev".to_string()
    } else {
        "data-science".to_string()
    }
}
