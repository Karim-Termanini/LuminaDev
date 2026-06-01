use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncBufReadExt;
use tokio::sync::Mutex;

use crate::utils::sanitize_compose_project_name;
use crate::project_scaffold::r_packages::CRAN_MIRROR;

use super::expand_tilde_path;

pub(crate) struct DepsInstallPlan {
    pub container_name: String,
    pub work_dir: &'static str,
    pub run_pip: bool,
    pub run_r: bool,
}

pub(crate) fn deps_install_plan(
    template: &str,
    toolchain: &str,
    profile_name: &str,
    project_dir: &Path,
) -> Result<DepsInstallPlan, String> {
    let compose_project = sanitize_compose_project_name(profile_name);
    if compose_project.is_empty() {
        return Err("[INSTALL_ERROR] Missing profile name for container lookup.".to_string());
    }

    let (service, work_dir) = if template == "web-dev" {
        ("node", "/app")
    } else {
        ("jupyter", "/home/jovyan/work")
    };

    let has_requirements = project_dir.join("requirements.txt").is_file();
    let has_install_r = project_dir.join("install.R").is_file();

    let run_pip = if template == "web-dev" {
        true
    } else {
        matches!(toolchain, "python" | "both") && has_requirements
    };
    let run_r = has_install_r && matches!(toolchain, "r" | "both");

    if !run_pip && !run_r {
        if template != "web-dev" && matches!(toolchain, "python" | "both") && !has_requirements {
            return Err(
                "[INSTALL_ERROR] requirements.txt not found — recreate the project or add the file."
                    .to_string(),
            );
        }
        return Ok(DepsInstallPlan {
            container_name: format!("{compose_project}-{service}-1"),
            work_dir,
            run_pip: false,
            run_r: false,
        });
    }

    Ok(DepsInstallPlan {
        container_name: format!("{compose_project}-{service}-1"),
        work_dir,
        run_pip,
        run_r,
    })
}

async fn container_path_exists(container_name: &str, path: &str) -> bool {
    tokio::process::Command::new("docker")
        .args(["exec", container_name, "test", "-e", path])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// FULL compose overlay used a named volume and hid host projects — copy scaffold files in when needed.
async fn sync_project_into_container(
    app: &AppHandle,
    container_name: &str,
    work_dir: &str,
    project_dir: &Path,
) -> Result<(), String> {
    let work = work_dir.trim_end_matches('/');
    let needs_req = project_dir.join("requirements.txt").is_file();
    let needs_r = project_dir.join("install.R").is_file();
    if !needs_req && !needs_r {
        return Ok(());
    }
    let req_in_container = if needs_req {
        container_path_exists(container_name, &format!("{work}/requirements.txt")).await
    } else {
        true
    };
    let r_in_container = if needs_r {
        container_path_exists(container_name, &format!("{work}/install.R")).await
    } else {
        true
    };
    if req_in_container && r_in_container {
        return Ok(());
    }

    let _ = app.emit(
        "project-install-log",
        "Copying project files into the workspace container...",
    );
    let src = format!("{}/.", project_dir.display());
    let dest = format!("{container_name}:{work}/.");
    let output = tokio::process::Command::new("docker")
        .args(["cp", &src, &dest])
        .output()
        .await
        .map_err(|e| format!("[INSTALL_ERROR] docker cp: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "[INSTALL_ERROR] Could not copy project into container. {}",
            stderr.trim()
        ));
    }
    Ok(())
}

async fn push_install_log_line(tail: &Mutex<Vec<String>>, line: &str) {
    let t = line.trim();
    if t.is_empty() {
        return;
    }
    let mut guard = tail.lock().await;
    if guard.len() >= 24 {
        guard.remove(0);
    }
    guard.push(t.to_string());
}

async fn run_docker_exec_logged(app: &AppHandle, args: &[&str]) -> Result<(), String> {
    let mut child = tokio::process::Command::new("docker")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("[INSTALL_ERROR] {}", e))?;

    let log_tail = Arc::new(Mutex::new(Vec::<String>::new()));

    if let Some(stdout) = child.stdout.take() {
        let app_clone = app.clone();
        let tail = log_tail.clone();
        tokio::spawn(async move {
            let mut reader = tokio::io::BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                push_install_log_line(&tail, &line).await;
                let _ = app_clone.emit("project-install-log", &line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        let tail = log_tail.clone();
        tokio::spawn(async move {
            let mut reader = tokio::io::BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                push_install_log_line(&tail, &line).await;
                let _ = app_clone.emit("project-install-log", &line);
            }
        });
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("[INSTALL_ERROR] Wait failed: {}", e))?;
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    if status.success() {
        Ok(())
    } else {
        let guard = log_tail.lock().await;
        let hint: String = guard
            .iter()
            .rev()
            .take(6)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .map(|s| s.as_str())
            .collect::<Vec<_>>()
            .join(" | ");
        let detail = if hint.is_empty() {
            "Check Docker logs.".to_string()
        } else {
            hint
        };
        Err(format!(
            "[INSTALL_ERROR] Package install failed inside the container. {}",
            detail
        ))
    }
}

pub async fn handle_project_install_deps(body: Value, app: AppHandle) -> Value {
    let project_name = body
        .get("projectName")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let template = body
        .get("template")
        .and_then(|v| v.as_str())
        .unwrap_or("data-science");

    if project_name.is_empty() {
        return json!({ "ok": false, "error": "Missing projectName" });
    }

    let profile_name_arg = body
        .get("profileName")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let profile_name = if !profile_name_arg.is_empty() {
        profile_name_arg.to_string()
    } else {
        let mut p_name = String::new();
        if let Ok(store_path) = crate::app_file(&app, "store.json") {
            let store = crate::read_json(&store_path);
            if let Some(act) = store.get("active_profile").and_then(|v| v.as_str()) {
                p_name = act.to_string();
            }
        }
        if p_name.is_empty() {
            template.to_string()
        } else {
            p_name
        }
    };

    let toolchain = body
        .get("toolchain")
        .and_then(|v| v.as_str())
        .unwrap_or("python");

    let project_dir = if let Some(path) = body.get("projectPath").and_then(|v| v.as_str()) {
        PathBuf::from(expand_tilde_path(path))
    } else {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
        let mut base = PathBuf::from(home).join("LuminaProjects");
        if let Ok(store_path) = crate::app_file(&app, "store.json") {
            let store = crate::read_json(&store_path);
            if let Some(dir) = store.get("projects_home_dir").and_then(|v| v.as_str()) {
                base = PathBuf::from(expand_tilde_path(dir));
            }
        }
        base.join(&profile_name).join(project_name)
    };

    let plan = match deps_install_plan(template, toolchain, &profile_name, &project_dir) {
        Ok(p) => p,
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    if !plan.run_pip && !plan.run_r {
        return json!({
            "ok": true,
            "log": "No dependency install step required for this project."
        });
    }

    let container_name = plan.container_name;
    let work_dir = plan.work_dir;
    let run_pip = plan.run_pip;
    let run_r = plan.run_r;

    let fut = async {
        let _ = app.emit(
            "project-install-log",
            &format!("Waiting for container '{}' to start...", container_name),
        );

        // Wait up to ~2 minutes for the container to become responsive
        let mut container_ready = false;
        for _ in 0..60 {
            let out = tokio::process::Command::new("docker")
                .args(["exec", &container_name, "echo", "ready"])
                .output()
                .await
                .unwrap_or_else(|_| std::process::Output {
                    status: std::os::unix::process::ExitStatusExt::from_raw(1),
                    stdout: vec![],
                    stderr: vec![],
                });
            if out.status.success() {
                container_ready = true;
                let _ = app.emit("project-install-log", "Container is ready.");
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
        }
        if !container_ready {
            return Err(format!(
                "[INSTALL_ERROR] Container '{}' is not running. Start the profile stack first, then retry.",
                container_name
            ));
        }

        sync_project_into_container(&app, &container_name, work_dir, &project_dir).await?;

        if run_pip {
            let pip_cmd = if template == "web-dev" {
                "npm install"
            } else {
                "python -m pip install -r requirements.txt"
            };
            let _ = app.emit(
                "project-install-log",
                &format!("Running {pip_cmd} inside container..."),
            );
            let pip_args: Vec<String> = if template == "web-dev" {
                vec![
                    "exec".into(),
                    "-w".into(),
                    work_dir.into(),
                    container_name.clone(),
                    "npm".into(),
                    "install".into(),
                ]
            } else {
                vec![
                    "exec".into(),
                    "-w".into(),
                    work_dir.into(),
                    container_name.clone(),
                    "python".into(),
                    "-m".into(),
                    "pip".into(),
                    "install".into(),
                    "-v".into(),
                    "--progress-bar".into(),
                    "on".into(),
                    "-r".into(),
                    "requirements.txt".into(),
                ]
            };
            let pip_refs: Vec<&str> = pip_args.iter().map(String::as_str).collect();
            run_docker_exec_logged(&app, &pip_refs).await?;
        }

        if run_r {
            let _ = app.emit(
                "project-install-log",
                "Installing R packages from install.R...",
            );
            let work = work_dir.trim_end_matches('/');
            let r_expr = format!(
                "options(repos=c(CRAN='{CRAN_MIRROR}')); source('{work}/install.R')"
            );
            let r_args = [
                "exec".to_string(),
                "-w".into(),
                work_dir.into(),
                container_name.clone(),
                "Rscript".into(),
                "-e".into(),
                r_expr,
            ];
            let r_refs: Vec<&str> = r_args.iter().map(String::as_str).collect();
            run_docker_exec_logged(&app, &r_refs).await?;
        }

        Ok((
            "Dependencies installed successfully".to_string(),
            "".to_string(),
        ))
    };

    let install_timeout_secs = if run_pip && run_r { 900 } else { 300 };
    match tokio::time::timeout(std::time::Duration::from_secs(install_timeout_secs), fut).await {
        Ok(Ok((stdout, _))) => json!({ "ok": true, "log": stdout }),
        Ok(Err(e)) => json!({ "ok": false, "error": e }),
        Err(_) => json!({ "ok": false, "error": "Timeout installing dependencies" }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deps_install_plan_r_toolchain_skips_pip() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::write(dir.path().join("install.R"), "install.packages(\"tidyverse\")\n").unwrap();
        let plan = deps_install_plan("data-science", "r", "My Lab", dir.path()).unwrap();
        assert_eq!(plan.container_name, "my-lab-jupyter-1");
        assert!(!plan.run_pip);
        assert!(plan.run_r);
    }

    #[test]
    fn deps_install_plan_python_toolchain_uses_pip() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::write(dir.path().join("requirements.txt"), "pandas\n").unwrap();
        let plan = deps_install_plan("data-science", "python", "lab", dir.path()).unwrap();
        assert!(plan.run_pip);
        assert!(!plan.run_r);
    }

    #[test]
    fn deps_install_plan_both_toolchain_runs_pip_and_r() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::write(dir.path().join("requirements.txt"), "pandas\n").unwrap();
        std::fs::write(dir.path().join("install.R"), "install.packages(\"ggplot2\")\n").unwrap();
        let plan = deps_install_plan("data-science", "both", "lab", dir.path()).unwrap();
        assert!(plan.run_pip);
        assert!(plan.run_r);
    }
}
