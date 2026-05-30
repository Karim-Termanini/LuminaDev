use serde_json::{json, Value};
use std::ffi::OsStr;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

mod project_scaffold;
mod state;
pub(crate) use state::{AppState, START_TIME};
mod utils;
#[allow(unused_imports)]
pub(crate) use utils::{app_file, docker_prune_preview_payload, read_json, sanitize_docker_name};

mod host_exec;
use host_exec::{
    set_global_daemon_auto_restart, set_global_ipc_timeout, set_global_thread_pool_size,
};
// Re-exports needed by child modules that use `use super::*;`
pub(crate) use host_exec::{
    cmd_timeout_install_step, cmd_timeout_short, exec_output, exec_output_limit,
};

mod runtime_packages;
pub(crate) use runtime_packages::{
    pkg_remove_cmd, pkg_upgrade_cmd, runtime_dnf_package_available, runtime_java_major,
    runtime_system_package_installed,
};
mod runtime_versioning;
#[allow(unused_imports)]
pub(crate) use runtime_versioning::{
    lumina_dart_channel_release, lumina_dotnet_install_channel, lumina_first_version_token,
    lumina_rust_channel_token,
};
mod runtime_paths;
pub(crate) use runtime_paths::{
    lumina_home_dir, lumina_path_must_be_under_home, lumina_replace_symlink,
};
mod runtime_discover;
pub(crate) use runtime_discover::{
    active_binary_script, list_installed_versions_script, list_mise_runtime_script,
    parse_version_path_lines, status_probe_script,
};
mod runtime_verify;
pub(crate) use runtime_verify::runtime_append_verify;
mod runtime_jobs;
#[allow(unused_imports)]
pub(crate) use runtime_jobs::{
    cancel_runtime_job, effective_runtime_job_final_state, runtime_set_active_invoke,
};

mod cloud_auth;
mod cloud_git_ipc;
mod compose_engine;
mod compose_profiles;
mod docker_engine;
mod docker_ext;
mod executor;
pub(crate) use executor::{runtime_bash_user_step, sudo_bash_install_step};
mod git_doctor;
mod git_vcs_file_diff;
mod git_vcs_ipc;
mod git_vcs_network;
mod git_vcs_repo_state;
mod profile_credentials;
mod profile_engine;
mod readiness;
mod readiness_ipc;
mod store_engine;
mod system_info;
pub(crate) use system_info::startup_update_check;
mod runtime_logs;
mod terminal_pty;

#[tauri::command]
async fn ipc_send(
    channel: String,
    payload: Value,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    match channel.as_str() {
        "dh:terminal:write" => terminal_pty::terminal_write(&app, &state, &payload).await,
        "dh:terminal:close" => terminal_pty::terminal_close(&app, &state, &payload).await,
        "dh:terminal:resize" => terminal_pty::terminal_resize(&app, &state, &payload).await,
        _ => {
            let _ = app.emit(
                "dh:warn",
                json!({ "channel": channel, "kind": "unknown_ipc_send" }),
            );
            Ok(())
        }
    }
}

#[tauri::command]
async fn ipc_invoke(
    channel: String,
    payload: Option<Value>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let body = payload.unwrap_or_else(|| json!({}));
    let res = match channel.as_str() {
        "dh:app:info" => system_info::app_info(),
        "dh:session:info" => system_info::session_info(),
        "dh:store:get" => store_engine::store_get(&app, &body).await,
        "dh:store:set" => store_engine::store_set(&app, &body).await,
        "dh:store:delete" => store_engine::store_delete(&app, &body).await,
        "dh:system:readiness:check" | "dh:system:readiness:fix" => {
            readiness_ipc::invoke(&app, channel.as_str(), &body).await
        }
        "dh:perf:snapshot" => system_info::handle_perf_snapshot(&app).await,
        "dh:host:distro" => system_info::host_distro(),
        "dh:host:sysinfo" => system_info::host_sysinfo().await,
        "dh:host:ports" => system_info::host_ports().await,
        "dh:host:exec" => system_info::host_exec_handler(&body).await,
        "dh:docker:check-installed" => docker_engine::docker_check_installed().await,
        "dh:docker:list" => docker_engine::docker_list().await,
        "dh:docker:action" => docker_engine::docker_action(&body).await,
        "dh:docker:logs" => docker_engine::docker_logs(&body).await,
        "dh:docker:images:list" => docker_engine::docker_images_list().await,
        "dh:docker:image:action" => docker_engine::docker_image_action(&body).await,
        "dh:docker:volumes:list" => docker_engine::docker_volumes_list().await,
        "dh:docker:volume:create" => docker_engine::docker_volume_create(&body).await,
        "dh:docker:volume:action" => docker_engine::docker_volume_action(&body).await,
        "dh:docker:networks:list" => docker_engine::docker_networks_list().await,
        "dh:docker:network:create" => docker_engine::docker_network_create(&body).await,
        "dh:docker:network:action" => docker_engine::docker_network_action(&body).await,
        "dh:docker:prune" => docker_engine::docker_prune().await,
        "dh:docker:prune:preview" => docker_engine::docker_prune_preview(&body).await,
        "dh:docker:cleanup:run" => docker_engine::docker_cleanup_run(&body).await,
        "dh:docker:pull" => docker_engine::docker_pull(&body).await,
        "dh:docker:search" => docker_engine::docker_search(&body).await,
        "dh:docker:tags" => docker_engine::docker_tags(&body).await,
        "dh:docker:create" => docker_engine::docker_create(&body).await,
        "dh:docker:remap-port" => docker_engine::docker_remap_port(&body).await,
        "dh:docker:inspect" => docker_engine::docker_inspect(&body).await,
        "dh:docker:reconfigure" => docker_engine::docker_reconfigure(&body).await,
        "dh:docker:install" => docker_engine::docker_install(&body).await,
        "dh:compose:up" => compose_engine::docker_compose_up(&app, &body).await,
        "dh:compose:logs" => compose_engine::docker_compose_logs(&app, &body).await,
        "dh:compose:down" => compose_engine::docker_compose_down(&app, &body).await,
        "dh:compose:stop" => compose_engine::docker_compose_stop(&app, &body).await,
        "dh:ports:suggest" => system_info::handle_ports_suggest(&app, &body).await,
        "dh:profile:switch" => profile_engine::profile_switch(&app, &body).await,
        "dh:profile:credentials:store" => {
            profile_engine::profile_credentials_store(&app, &body).await
        }
        "dh:profile:credentials:list" => {
            profile_engine::profile_credentials_list(&app, &body).await
        }
        "dh:profile:credentials:delete" => {
            profile_engine::profile_credentials_delete(&app, &body).await
        }
        "dh:profile:credentials:get" => profile_engine::profile_credentials_get(&app, &body).await,
        "dh:terminal:openExternal" => terminal_pty::terminal_open_external().await,
        "dh:terminal:create" => terminal_pty::terminal_create(&app, &state, &body).await,
        "dh:terminal:get-all-env" => terminal_pty::terminal_get_all_env().await,
        "dh:docker:terminal" => terminal_pty::docker_terminal(&app, &state, &body).await,
        "dh:job:list" => json!(state.jobs.lock().await.clone()),
        "dh:job:start" => runtime_jobs::handle_job_start(&app, &state, &body).await,
        "dh:job:cancel" => runtime_jobs::handle_job_cancel(&state, &body).await,
        "dh:editor:list" => system_info::editor_list().await,
        "dh:editor:open" => system_info::editor_open(&app, &body).await,
        "dh:project:ensure_dir" => system_info::handle_project_ensure_dir(&body),
        "dh:fs:exists" => system_info::handle_fs_exists(&body),
        "dh:fs:open" => system_info::handle_fs_open(&body),
        "dh:project:scaffold" => project_scaffold::handle_project_scaffold(body).await,
        "dh:project:install_deps" => {
            project_scaffold::handle_project_install_deps(body, app.clone()).await
        }
        "dh:git:recent:list" => store_engine::handle_git_recent_list(&app).await,
        "dh:git:recent:add" => store_engine::handle_git_recent_add(&app, &body).await,
        "dh:git:config:set" => store_engine::handle_git_config_set(&body).await,
        "dh:git:config:set-key" => store_engine::handle_git_config_set_key(&body).await,
        "dh:git:config:list" => store_engine::handle_git_config_list().await,
        "dh:git:clone" => store_engine::handle_git_clone(&body).await,
        "dh:git:status" => store_engine::handle_git_status(&body).await,
        "dh:git:doctor:scan" => git_doctor::handle_doctor_scan().await,
        "dh:cloud:auth:connect-start" => {
            cloud_git_ipc::handle_cloud_auth_connect_start(&app, &body).await
        }
        "dh:cloud:auth:connect-poll" => {
            cloud_git_ipc::handle_cloud_auth_connect_poll(&app, &body).await
        }
        "dh:cloud:auth:connect-pat" => {
            cloud_git_ipc::handle_cloud_auth_connect_pat(&app, &body).await
        }
        "dh:cloud:auth:disconnect" => {
            cloud_git_ipc::handle_cloud_auth_disconnect(&app, &body).await
        }
        "dh:cloud:auth:status" => cloud_git_ipc::handle_cloud_auth_status(&app).await,
        "dh:cloud:git:prs"
        | "dh:cloud:git:review-requests"
        | "dh:cloud:git:pipelines"
        | "dh:cloud:git:issues"
        | "dh:cloud:git:releases"
        | "dh:cloud:git:create-pr"
        | "dh:cloud:git:get-pr-checks"
        | "dh:cloud:git:merge-pr" => cloud_git_ipc::invoke(&app, channel.as_str(), &body).await,
        "dh:git:vcs:status" => git_vcs_ipc::handle_vcs_status(&app, &body).await,
        "dh:git:vcs:remotes" => git_vcs_ipc::handle_vcs_remotes(&body).await,
        "dh:git:vcs:diff" => git_vcs_ipc::handle_vcs_diff(&body).await,
        "dh:git:vcs:stage" => git_vcs_ipc::handle_vcs_stage(&body).await,
        "dh:git:vcs:unstage" => git_vcs_ipc::handle_vcs_unstage(&body).await,
        "dh:git:vcs:commit" => git_vcs_ipc::handle_vcs_commit(&body).await,
        "dh:git:vcs:branches" => git_vcs_ipc::handle_vcs_branches(&body).await,
        "dh:git:vcs:checkout" => git_vcs_ipc::handle_vcs_checkout(&body).await,
        "dh:git:vcs:stash" => git_vcs_ipc::handle_vcs_stash(&body).await,
        "dh:git:vcs:push" => git_vcs_ipc::handle_vcs_push(&app, &body).await,
        "dh:git:vcs:pull" => git_vcs_ipc::handle_vcs_pull(&app, &body).await,
        "dh:git:vcs:fetch" => git_vcs_ipc::handle_vcs_fetch(&app, &body).await,
        "dh:git:vcs:merge"
        | "dh:git:vcs:rebase"
        | "dh:git:vcs:stash-pop"
        | "dh:git:vcs:merge-abort"
        | "dh:git:vcs:rebase-abort"
        | "dh:git:vcs:merge-continue"
        | "dh:git:vcs:rebase-continue"
        | "dh:git:vcs:rebase-skip"
        | "dh:git:vcs:rename-branch"
        | "dh:git:vcs:conflict-diff"
        | "dh:git:vcs:conflict-hunks"
        | "dh:git:vcs:resolve-conflict"
        | "dh:git:vcs:resolve-hunk" => git_vcs_ipc::invoke_extended(channel.as_str(), &body).await,
        "dh:ssh:generate" => system_info::handle_ssh_generate(&body).await,
        "dh:ssh:get:pub" => system_info::handle_ssh_get_pub().await,
        "dh:ssh:test:github" => system_info::handle_ssh_test_github().await,
        "dh:ssh:list:dir" => system_info::handle_ssh_list_dir(&body).await,
        "dh:ssh:setup:remote:key" => system_info::handle_ssh_setup_remote_key(&body).await,
        "dh:ssh:enable:local" => system_info::handle_ssh_enable_local().await,
        "dh:runtime:status" => runtime_jobs::handle_runtime_status().await,
        "dh:runtime:installed-versions" => {
            runtime_jobs::handle_runtime_installed_versions(&body).await
        }
        "dh:runtime:get-versions" => runtime_jobs::handle_runtime_get_versions(&body).await,
        "dh:runtime:check-deps" => runtime_jobs::handle_runtime_check_deps(&body).await,
        "dh:runtime:uninstall:preview" => {
            runtime_jobs::handle_runtime_uninstall_preview(&body).await
        }
        "dh:runtime:set-active" => runtime_set_active_invoke(&body).await,
        "dh:runtime:remove-version" => runtime_jobs::handle_runtime_remove_version(&body).await,
        "dh:diagnostics:bundle:create" => system_info::diagnostics_bundle_create(&app, &body).await,
        "dh:monitor:top-processes" => system_info::handle_monitor_top_processes().await,
        "dh:monitor:security" => system_info::handle_monitor_security().await,
        "dh:monitor:security-drilldown" => system_info::handle_monitor_security_drilldown().await,
        "dh:metrics" => system_info::handle_metrics(&state).await,
        "dh:app:update:check" => system_info::app_update_check(&app, &body).await,
        "dh:profile:running-status" => {
            system_info::handle_profile_running_status(&app, &body).await
        }
        "dh:docker:container:stats" => docker_engine::handle_container_stats(&body).await,
        "dh:log:stream:start" => {
            runtime_logs::handle_log_stream_start(app.clone(), &body, &state).await
        }
        "dh:log:stream:stop" => runtime_logs::handle_log_stream_stop(&body, &state).await,
        _ => json!({ "ok": false, "error": format!("[UNKNOWN_CHANNEL] {}", channel) }),
    };
    Ok(res)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    START_TIME.set(Instant::now()).ok();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            let handle = app.handle();
            if let Ok(store_path) = app_file(handle, "store.json") {
                let store = read_json(&store_path);
                if let Some(engine) = store.get("app_engine_settings") {
                    if let Some(ms) = engine.get("ipcTimeoutMs").and_then(|v| v.as_u64()) {
                        set_global_ipc_timeout(ms);
                    }
                    if let Some(n) = engine.get("threadPoolSize").and_then(|v| v.as_u64()) {
                        set_global_thread_pool_size(n);
                    }
                    if let Some(v) = engine.get("daemonAutoRestart").and_then(|v| v.as_bool()) {
                        set_global_daemon_auto_restart(v);
                    }
                }
                if let Some(update) = store.get("update_settings") {
                    if update.get("checkOnStartup").and_then(|v| v.as_bool()) == Some(true) {
                        let h = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            startup_update_check(h).await;
                        });
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = app_handle.state::<AppState>();
                    let mut streams = state.streams.lock().await;
                    for handle in streams.drain().map(|(_, h)| h) {
                        handle.abort();
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![ipc_invoke, ipc_send])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
#[allow(unused_imports)]
mod tests {
    use super::*;
    use crate::docker_ext::docker_install_build_steps;
    use crate::runtime_packages::{
        pkg_remove_cmd, pkg_upgrade_cmd, runtime_java_system_packages_for_version, runtime_pkg_mgr,
    };
    use crate::runtime_versioning::{
        lumina_dotnet_install_channel, lumina_first_version_token, lumina_probe_meaningful_line,
    };
    use crate::utils::{
        docker_prune_preview_payload, is_allowed_store_key, is_physical_disk_name,
        parse_porcelain_v1, parse_size_mb, sanitize_docker_name, ss_process_from_line,
        truncate_probe_output,
    };

    #[cfg(test)]
    use crate::runtime_versioning::{
        lumina_rust_channel_token, lumina_version_token_matches_probe_line,
    };

    #[tokio::test]
    async fn job_runner_long_task_completes_and_collects_logs() {
        let mut logs = Vec::new();
        let cmd = r#"for i in 1 2 3; do echo "long-step-$i"; sleep 0.05; done"#;
        let res = runtime_bash_user_step(cmd, &mut logs, None, None, 0, 100).await;
        assert!(res.is_ok(), "expected long task to complete: {res:?}");
        assert!(logs.iter().any(|l| l.contains("long-step-1")));
        assert!(logs.iter().any(|l| l.contains("long-step-3")));
    }

    #[tokio::test]
    async fn job_runner_streaming_captures_multiple_lines() {
        let mut logs = Vec::new();
        let cmd = r#"for i in 1 2 3 4 5; do echo "stream-$i"; sleep 0.02; done"#;
        runtime_bash_user_step(cmd, &mut logs, None, None, 0, 100)
            .await
            .expect("streaming command should succeed");

        let stream_lines = logs
            .iter()
            .filter(|l| l.contains("stream-") && !l.contains("echo"))
            .count();
        assert!(
            stream_lines >= 5,
            "expected at least 5 streamed lines, got {stream_lines}"
        );
    }

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

    #[test]
    fn parse_size_mb_parses_common_units() {
        assert_eq!(parse_size_mb("1gb"), 1024);
        assert_eq!(parse_size_mb("512 mb"), 512);
        assert_eq!(parse_size_mb("2048kb"), 2);
        assert_eq!(parse_size_mb("1048576b"), 1);
    }

    #[test]
    fn sanitize_docker_name_normalizes_and_limits() {
        assert_eq!(sanitize_docker_name("My App/Name"), "My-App-Name");
        assert_eq!(sanitize_docker_name("---bad"), "bad");
        assert_eq!(sanitize_docker_name("////"), "remap");
        let long = "a".repeat(300);
        assert_eq!(sanitize_docker_name(&long).len(), 220);
    }

    #[test]
    fn docker_install_steps_respect_selected_components() {
        let components = vec![json!("docker"), json!("compose")];
        let ubuntu = docker_install_build_steps("ubuntu", Some(&components)).expect("ubuntu steps");
        let joined = ubuntu.join(" || ");
        assert!(joined.contains("docker-ce"));
        assert!(joined.contains("docker-compose-plugin"));
        assert!(!joined.contains("docker-buildx-plugin"));

        let arch = docker_install_build_steps("arch", Some(&components)).expect("arch steps");
        let arch_joined = arch.join(" || ");
        assert!(arch_joined.contains("docker-compose"));
    }

    #[test]
    fn distro_pkg_manager_mapping_is_stable() {
        assert_eq!(runtime_pkg_mgr("ubuntu"), "apt");
        assert_eq!(runtime_pkg_mgr("fedora"), "dnf");
        assert_eq!(runtime_pkg_mgr("arch"), "pacman");
        assert_eq!(runtime_pkg_mgr("opensuse"), "zypper");
        assert_eq!(runtime_pkg_mgr("unknown-distro"), "apt");
    }

    #[test]
    fn java_package_selection_honors_major_version() {
        assert_eq!(
            runtime_java_system_packages_for_version("dnf", "17"),
            vec!["java-17-openjdk-devel".to_string()]
        );
        assert_eq!(
            runtime_java_system_packages_for_version("apt", "11.0.22"),
            vec!["openjdk-11-jdk".to_string()]
        );
        assert_eq!(
            runtime_java_system_packages_for_version("pacman", "stable"),
            vec!["jdk21-openjdk".to_string()]
        );
        assert_eq!(
            runtime_java_system_packages_for_version("dnf", "11.0.23"),
            vec!["java-11-openjdk-devel".to_string()]
        );
        assert_eq!(
            runtime_java_system_packages_for_version("dnf", "8"),
            vec!["java-1.8.0-openjdk-devel".to_string()]
        );
        assert_eq!(
            runtime_java_system_packages_for_version("dnf", "latest"),
            vec!["java-21-openjdk-devel".to_string()]
        );
    }

    #[test]
    fn version_token_helpers_handle_expected_inputs() {
        assert_eq!(
            lumina_first_version_token("v22.1.0 (LTS)"),
            Some("v22.1.0".to_string())
        );
        assert_eq!(lumina_first_version_token("latest"), None);
        assert_eq!(lumina_dotnet_install_channel("9.0.1"), "9.0.1");
        assert_eq!(lumina_dotnet_install_channel(""), "8.0");
    }

    #[test]
    fn version_matching_allows_prerelease_probe_lines() {
        assert!(lumina_version_token_matches_probe_line(
            "0.13.0",
            "0.13.0-dev.20240201"
        ));
        assert!(lumina_version_token_matches_probe_line(
            "v22.2.0",
            "node v22.2.0"
        ));
        assert!(!lumina_version_token_matches_probe_line("1.2.3", "1.2.4"));
    }

    #[test]
    fn probe_line_filter_ignores_shell_noise() {
        let stdout = "bash: /home/me/.bashrc: line 1: foo: command not found\n";
        let stderr = "Python 3.12.2\n";
        assert_eq!(
            lumina_probe_meaningful_line(stdout, stderr),
            "Python 3.12.2"
        );
    }

    #[test]
    fn pkg_command_builders_generate_expected_strings() {
        assert_eq!(
            pkg_upgrade_cmd("apt", &["nodejs", "npm"]),
            "DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y nodejs npm"
        );
        assert_eq!(
            pkg_remove_cmd("pacman", &["go"]),
            "pacman -R --noconfirm go"
        );
    }

    #[test]
    fn truncate_probe_output_caps_large_buffers() {
        let short = "ok";
        assert_eq!(truncate_probe_output(short), "ok");
        let long = "x".repeat(50_100);
        let out = truncate_probe_output(&long);
        assert!(out.contains("(output truncated)"));
        assert!(out.len() < long.len());
    }

    #[test]
    fn disk_and_ss_parsers_extract_expected_values() {
        assert!(is_physical_disk_name("sda"));
        assert!(is_physical_disk_name("nvme0n1"));
        assert!(!is_physical_disk_name("nvme0n1p1"));
        assert_eq!(
            ss_process_from_line("users:((\"docker-proxy\",pid=123,fd=4))"),
            "docker-proxy"
        );
        assert_eq!(ss_process_from_line("no users payload"), "unknown");
    }

    #[test]
    fn porcelain_parses_modified_staged() {
        let input = "M  src/main.rs";
        let (staged, unstaged) = parse_porcelain_v1(input);
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0]["status"], "M");
        assert_eq!(staged[0]["path"], "src/main.rs");
        assert_eq!(unstaged.len(), 0);
    }

    #[test]
    fn porcelain_preserves_apps_prefix_worktree_modified() {
        let input = " M apps/desktop/src/renderer/src/pages/GitVcsPage.tsx";
        let (staged, unstaged) = parse_porcelain_v1(input);
        assert_eq!(staged.len(), 0);
        assert_eq!(unstaged.len(), 1);
        assert_eq!(
            unstaged[0]["path"],
            "apps/desktop/src/renderer/src/pages/GitVcsPage.tsx"
        );
    }

    #[test]
    fn porcelain_parses_untracked() {
        let input = "?? new_file.rs";
        let (staged, unstaged) = parse_porcelain_v1(input);
        assert_eq!(staged.len(), 0);
        assert_eq!(unstaged.len(), 1);
        assert_eq!(unstaged[0]["status"], "?");
    }

    #[test]
    fn porcelain_parses_conflict() {
        let input = "UU conflict.rs";
        let (staged, unstaged) = parse_porcelain_v1(input);
        assert_eq!(staged.len(), 0);
        assert_eq!(unstaged.len(), 1);
        assert_eq!(unstaged[0]["status"], "C");
    }

    #[test]
    fn porcelain_parses_both_added_unmerged() {
        let input = "AA both.rs";
        let (staged, unstaged) = parse_porcelain_v1(input);
        assert_eq!(staged.len(), 0);
        assert_eq!(unstaged.len(), 1);
        assert_eq!(unstaged[0]["status"], "C");
        assert_eq!(unstaged[0]["path"], "both.rs");
    }

    #[test]
    fn porcelain_parses_ud_unmerged() {
        let input = "UD deleted-by-us.rs";
        let (staged, unstaged) = parse_porcelain_v1(input);
        assert_eq!(staged.len(), 0);
        assert_eq!(unstaged.len(), 1);
        assert_eq!(unstaged[0]["status"], "C");
    }

    #[test]
    fn porcelain_parses_renamed() {
        let input = "R  old_name.rs -> new_name.rs";
        let (staged, unstaged) = parse_porcelain_v1(input);
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0]["status"], "R");
        assert_eq!(staged[0]["path"], "new_name.rs");
        assert_eq!(staged[0]["oldPath"], "old_name.rs");
        assert_eq!(unstaged.len(), 0);
    }

    #[test]
    fn porcelain_parses_staged_and_unstaged() {
        let input = "MM src/lib.rs";
        let (staged, unstaged) = parse_porcelain_v1(input);
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0]["status"], "M");
        assert_eq!(unstaged.len(), 1);
        assert_eq!(unstaged[0]["status"], "M");
    }

    #[test]
    fn diff_cap_check() {
        let big = "a".repeat(524289);
        assert!(big.len() > 512 * 1024);
    }

    #[test]
    fn store_keys_allow_cloud_oauth_clients() {
        assert!(is_allowed_store_key("cloud_oauth_clients"));
    }

    #[test]
    fn store_keys_allow_active_profile() {
        assert!(is_allowed_store_key("active_profile"));
    }

    #[test]
    fn store_keys_allow_custom_profiles() {
        assert!(is_allowed_store_key("custom_profiles"));
    }

    #[test]
    fn store_keys_allow_dynamic_prefixes() {
        assert!(is_allowed_store_key("project_dir_web-dev"));
        assert!(is_allowed_store_key("python_version_data-science"));
        assert!(is_allowed_store_key("postgres_version_ai-ml"));
        assert!(is_allowed_store_key("node_version_mobile"));
    }

    #[test]
    fn store_keys_reject_unknown_keys() {
        assert!(!is_allowed_store_key("foo"));
        assert!(!is_allowed_store_key("secret_data"));
        assert!(!is_allowed_store_key(""));
    }

    #[test]
    fn store_keys_reject_unknown_dynamic_prefixes() {
        assert!(!is_allowed_store_key("unknown_prefix_web-dev"));
        assert!(!is_allowed_store_key("secret_project_dir_web-dev"));
    }

    #[test]
    fn store_keys_allow_all_configured_static_keys() {
        for key in &[
            "custom_profiles",
            "wizard_state",
            "ssh_bookmarks",
            "maintenance_state",
            "active_profile",
            "on_login_automation",
            "appearance",
            "cloud_oauth_clients",
            "readiness_wizard_complete",
            "general_settings",
            "update_settings",
            "profile_credentials",
            "onboarding_profile",
            "projects_home_dir",
            "app_engine_settings",
            "builder_settings",
            "beta_features_state",
            "notification_settings",
            "shortcuts_settings",
            "datetime_settings",
            "language_settings",
        ] {
            assert!(
                is_allowed_store_key(key),
                "expected key '{}' to be allowed",
                key
            );
        }
    }
}

#[cfg(test)]
mod ipc_contract_tests;
#[cfg(test)]
mod runtime_prune_contract_tests;
