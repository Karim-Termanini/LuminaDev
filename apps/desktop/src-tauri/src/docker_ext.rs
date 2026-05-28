use super::*;

pub(crate) fn docker_install_build_steps(
    distro: &str,
    components: Option<&Vec<Value>>,
) -> Option<Vec<String>> {
    let comp: Vec<String> = components
        .map(|v| {
            v.iter()
                .filter_map(|x| x.as_str().map(std::string::ToString::to_string))
                .collect()
        })
        .unwrap_or_default();

    let mut steps: Vec<String> = match distro {
    "ubuntu" => vec![
      "apt-get update && apt-get install -y ca-certificates curl && install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && chmod a+r /etc/apt/keyrings/docker.asc".into(),
      "echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable\" | tee /etc/apt/sources.list.d/docker.list > /dev/null && apt-get update".into(),
      "apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin".into(),
      "systemctl enable --now docker && docker --version".into(),
    ],
    "fedora" => vec![
      "dnf -y install dnf-plugins-core && curl -fsSL https://download.docker.com/linux/fedora/docker-ce.repo -o /etc/yum.repos.d/docker-ce.repo".into(),
      "dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin".into(),
      "systemctl enable --now docker && docker --version".into(),
    ],
    "arch" => vec![
      "pacman -S --needed --noconfirm docker docker-compose".into(),
      "systemctl enable --now docker && docker --version".into(),
    ],
    _ => return None,
  };

    if !comp.is_empty() {
        if distro == "ubuntu" || distro == "fedora" {
            let pkg_cmd = if distro == "ubuntu" {
                "apt-get install -y"
            } else {
                "dnf install -y"
            };
            let mut packages: Vec<&'static str> = vec![];
            if comp.iter().any(|c| c == "docker") {
                packages.extend(["docker-ce", "docker-ce-cli", "containerd.io"]);
            }
            if comp.iter().any(|c| c == "compose") {
                packages.push("docker-compose-plugin");
            }
            if comp.iter().any(|c| c == "buildx") {
                packages.push("docker-buildx-plugin");
            }
            if !packages.is_empty() {
                let joined = packages.join(" ");
                steps = steps
                    .into_iter()
                    .map(|s| {
                        if s.contains("apt-get install -y docker-ce")
                            || s.contains("dnf install -y docker-ce")
                        {
                            format!("{pkg_cmd} {joined}")
                        } else {
                            s
                        }
                    })
                    .collect();
            }
        } else if distro == "arch" {
            let mut packages: Vec<&'static str> = vec![];
            if comp.iter().any(|c| c == "docker") {
                packages.push("docker");
            }
            if comp.iter().any(|c| c == "compose") {
                packages.push("docker-compose");
            }
            if !packages.is_empty() {
                let joined = packages.join(" ");
                steps = steps
                    .into_iter()
                    .map(|s| {
                        if s.contains("pacman -S") {
                            format!("pacman -S --needed --noconfirm {joined}")
                        } else {
                            s
                        }
                    })
                    .collect();
            }
        }
    }

    Some(steps)
}

pub(crate) async fn docker_install_invoke(body: &Value) -> Value {
    if std::env::var("FLATPAK_ID").is_ok() {
        return json!({
          "ok": false,
          "log": vec![
            "Blocked: Flatpak sandbox cannot run privileged host package managers (apt/dnf/pacman).".to_string()
          ],
          "error": "[DOCKER_INSTALL_FAILED] Install Docker on the host outside Flatpak (see https://docs.docker.com/engine/install/), grant socket access to this app, then retry."
        });
    }

    let distro = body
        .get("distro")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if !matches!(distro, "ubuntu" | "fedora" | "arch") {
        return json!({ "ok": false, "log": Vec::<String>::new(), "error": "[DOCKER_INVALID_REQUEST] Unsupported distro." });
    }
    let host_distro_id = std::fs::read_to_string("/etc/os-release")
        .unwrap_or_default()
        .lines()
        .find(|l| l.starts_with("ID="))
        .map(|l| l.trim_start_matches("ID=").trim_matches('"').to_string())
        .unwrap_or_else(|| "linux".to_string())
        .to_lowercase();
    let distro_family = |id: &str| -> &'static str {
        match id {
            "ubuntu" | "debian" | "linuxmint" | "pop" | "elementary" | "raspbian" => "ubuntu",
            "fedora" | "rhel" | "centos" | "rocky" | "alma" | "amzn" => "fedora",
            "arch" | "manjaro" | "endeavouros" | "garuda" => "arch",
            _ => "unknown",
        }
    };
    let host_family = distro_family(&host_distro_id);
    if host_family != "unknown" && host_family != distro {
        return json!({
          "ok": false,
          "log": vec![format!("Host distro detected as '{}' (family: {}). Installer selection was '{}'.", host_distro_id, host_family, distro)],
          "error": format!("[DOCKER_INSTALL_FAILED] Selected distro '{}' does not match host distro '{}'. Choose '{}' in the installer.", distro, host_distro_id, host_family),
        });
    }
    let password = body.get("password").and_then(|v| v.as_str());

    let requested_components: Vec<String> = body
        .get("components")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(std::string::ToString::to_string))
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();
    let docker_installed = exec_output_limit("docker", &["--version"], cmd_timeout_short())
        .await
        .is_ok();
    let compose_installed =
        exec_output_limit("docker", &["compose", "version"], cmd_timeout_short())
            .await
            .is_ok();
    let buildx_installed = exec_output_limit("docker", &["buildx", "version"], cmd_timeout_short())
        .await
        .is_ok();

    let mut effective_components = requested_components;
    if effective_components.is_empty() {
        effective_components = vec!["docker".into(), "compose".into(), "buildx".into()];
    }
    effective_components.retain(|c| match c.as_str() {
        "docker" => !docker_installed,
        "compose" => !compose_installed,
        "buildx" => !buildx_installed,
        _ => false,
    });

    let mut logs: Vec<String> = Vec::new();
    logs.push(format!(
        "Detected install status => docker: {}, compose: {}, buildx: {}",
        docker_installed, compose_installed, buildx_installed
    ));
    if effective_components.is_empty() {
        logs.push(
            "Nothing to install: requested Docker components are already present.".to_string(),
        );
        return json!({ "ok": true, "log": logs });
    }
    let effective_json: Vec<Value> = effective_components
        .into_iter()
        .map(Value::String)
        .collect();
    let Some(steps) = docker_install_build_steps(distro, Some(&effective_json)) else {
        return json!({ "ok": false, "log": Vec::<String>::new(), "error": "[DOCKER_INVALID_REQUEST] Unsupported distro." });
    };

    for cmd in steps {
        match sudo_bash_install_step(&cmd, password, &mut logs, None, None, 0, 0).await {
            Ok(()) => {}
            Err(e) => return json!({ "ok": false, "log": logs, "error": e }),
        }
    }
    json!({ "ok": true, "log": logs })
}

pub(crate) fn container_inspect_data_from_json(info: &Value) -> Value {
    let mut ports: Vec<Value> = Vec::new();
    if let Some(bindings) = info
        .pointer("/HostConfig/PortBindings")
        .and_then(|v| v.as_object())
    {
        for (ctr_key, arr_val) in bindings {
            let parts: Vec<&str> = ctr_key.split('/').collect();
            if parts.len() != 2 {
                continue;
            }
            let (ctr_port, proto) = (parts[0], parts[1]);
            if let Some(arr) = arr_val.as_array() {
                for b in arr {
                    let hp = b.get("HostPort").and_then(|v| v.as_str()).unwrap_or("");
                    if hp.is_empty() {
                        continue;
                    }
                    if let (Ok(h), Ok(c)) = (hp.parse::<u64>(), ctr_port.parse::<u64>()) {
                        ports.push(json!({
                          "hostPort": h,
                          "containerPort": c,
                          "protocol": proto,
                        }));
                    }
                }
            }
        }
    }

    let env: Vec<Value> = info
        .pointer("/Config/Env")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| e.as_str().map(|s| Value::String(s.to_string())))
                .collect()
        })
        .unwrap_or_default();

    let mut networks: Vec<String> = Vec::new();
    if let Some(net_mode) = info
        .pointer("/HostConfig/NetworkMode")
        .and_then(|v| v.as_str())
    {
        if !net_mode.is_empty() {
            networks.push(net_mode.to_string());
        }
    }
    if let Some(net_map) = info
        .pointer("/NetworkSettings/Networks")
        .and_then(|v| v.as_object())
    {
        for key in net_map.keys() {
            if !networks.iter().any(|n| n == key) {
                networks.push(key.clone());
            }
        }
    }

    let volumes: Vec<Value> = info
        .pointer("/HostConfig/Binds")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|b| b.as_str().map(|s| Value::String(s.to_string())))
                .collect()
        })
        .unwrap_or_default();

    let restart_policy = info
        .pointer("/HostConfig/RestartPolicy/Name")
        .and_then(|v| v.as_str())
        .unwrap_or("no")
        .to_string();

    json!({
      "id": info.pointer("/Id").and_then(|v| v.as_str()).unwrap_or(""),
      "name": info.pointer("/Name").and_then(|v| v.as_str()).unwrap_or("").trim_start_matches('/'),
      "image": info.pointer("/Config/Image").and_then(|v| v.as_str()).unwrap_or(""),
      "state": info.pointer("/State/Status").and_then(|v| v.as_str()).unwrap_or(""),
      "ports": ports,
      "env": env,
      "networks": networks,
      "volumes": volumes,
      "restartPolicy": restart_policy,
    })
}

pub(crate) async fn docker_inspect_invoke(body: &Value) -> Value {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
    if id.is_empty() {
        return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] id is required." });
    }
    let inspect_raw = match exec_output("docker", &["inspect", id]).await {
        Ok(s) => s,
        Err(e) => {
            return json!({ "ok": false, "error": format!("[DOCKER_NOT_FOUND] {}", e.trim()) })
        }
    };
    let arr: Vec<Value> = match serde_json::from_str(&inspect_raw) {
        Ok(a) => a,
        Err(e) => {
            return json!({ "ok": false, "error": format!("[DOCKER_INVALID_REQUEST] inspect parse: {}", e) })
        }
    };
    let Some(info) = arr.first() else {
        return json!({ "ok": false, "error": "[DOCKER_NOT_FOUND] empty inspect result." });
    };
    json!({ "ok": true, "data": container_inspect_data_from_json(info) })
}

pub(crate) async fn docker_reconfigure_invoke(body: &Value) -> Value {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
    if id.is_empty() {
        return json!({ "ok": false, "error": "[DOCKER_RECONFIG_FAILED] id is required." });
    }

    let inspect_raw = match exec_output("docker", &["inspect", id]).await {
        Ok(s) => s,
        Err(e) => {
            return json!({ "ok": false, "error": format!("[DOCKER_RECONFIG_NOT_FOUND] {}", e.trim()) })
        }
    };
    let arr: Vec<Value> = match serde_json::from_str(&inspect_raw) {
        Ok(a) => a,
        Err(e) => {
            return json!({ "ok": false, "error": format!("[DOCKER_RECONFIG_FAILED] inspect parse: {}", e) })
        }
    };
    let Some(info) = arr.first() else {
        return json!({ "ok": false, "error": "[DOCKER_RECONFIG_NOT_FOUND] empty inspect result." });
    };

    let image = info
        .pointer("/Config/Image")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if image.is_empty() {
        return json!({ "ok": false, "error": "[DOCKER_RECONFIG_FAILED] container image missing from inspect." });
    }

    let name_raw = info.pointer("/Name").and_then(|v| v.as_str()).unwrap_or("");
    let container_name = name_raw.trim_start_matches('/').to_string();

    let network_mode = body
        .get("networkMode")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            info.pointer("/HostConfig/NetworkMode")
                .and_then(|v| v.as_str())
                .unwrap_or("bridge")
        })
        .to_string();

    let restart_policy = body
        .get("restartPolicy")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            info.pointer("/HostConfig/RestartPolicy/Name")
                .and_then(|v| v.as_str())
                .unwrap_or("no")
        })
        .to_string();

    let mut args: Vec<String> = vec!["create".into(), "--name".into(), container_name.clone()];
    args.push("--network".into());
    args.push(network_mode.clone());
    if restart_policy != "no" && !restart_policy.is_empty() {
        args.push("--restart".into());
        args.push(restart_policy.clone());
    }
    if let Some(true) = info.pointer("/Config/Tty").and_then(|v| v.as_bool()) {
        args.push("-t".into());
    }
    if let Some(true) = info.pointer("/Config/OpenStdin").and_then(|v| v.as_bool()) {
        args.push("-i".into());
    }

    if let Some(port_arr) = body.get("ports").and_then(|v| v.as_array()) {
        for p in port_arr {
            let hp = p.get("hostPort").and_then(|v| v.as_u64()).unwrap_or(0);
            let cp = p.get("containerPort").and_then(|v| v.as_u64()).unwrap_or(0);
            let proto = p.get("protocol").and_then(|v| v.as_str()).unwrap_or("tcp");
            if hp > 0 && cp > 0 {
                args.push("-p".into());
                args.push(format!("{hp}:{cp}/{proto}"));
            }
        }
    } else if let Some(bindings) = info
        .pointer("/HostConfig/PortBindings")
        .and_then(|v| v.as_object())
    {
        for (ctr_key, arr_val) in bindings.iter() {
            let parts: Vec<&str> = ctr_key.split('/').collect();
            if parts.len() != 2 {
                continue;
            }
            let (ctr_port, proto) = (parts[0], parts[1]);
            if let Some(arr) = arr_val.as_array() {
                for b in arr {
                    let hp = b.get("HostPort").and_then(|v| v.as_str()).unwrap_or("");
                    if hp.is_empty() {
                        continue;
                    }
                    args.push("-p".into());
                    args.push(format!("{hp}:{ctr_port}/{proto}"));
                }
            }
        }
    }

    if let Some(env_arr) = body.get("env").and_then(|v| v.as_array()) {
        for e in env_arr {
            if let Some(s) = e.as_str() {
                if !s.is_empty() {
                    args.push("-e".into());
                    args.push(s.to_string());
                }
            }
        }
    } else if let Some(envs) = info.pointer("/Config/Env").and_then(|v| v.as_array()) {
        for e in envs {
            if let Some(s) = e.as_str() {
                args.push("-e".into());
                args.push(s.to_string());
            }
        }
    }

    if let Some(binds) = info.pointer("/HostConfig/Binds").and_then(|v| v.as_array()) {
        for b in binds {
            if let Some(s) = b.as_str() {
                args.push("-v".into());
                args.push(s.to_string());
            }
        }
    }

    args.push(image.to_string());
    if let Some(cmd_arr) = info.pointer("/Config/Cmd").and_then(|v| v.as_array()) {
        for c in cmd_arr {
            if let Some(s) = c.as_str() {
                args.push(s.to_string());
            }
        }
    }

    let temp_name = format!("{}-reconfig-tmp", &container_name);
    let mut create_args = args.clone();
    if let Some(ni) = create_args.iter().position(|a| a == "--name") {
        if create_args.len() > ni + 1 {
            create_args[ni + 1] = temp_name.clone();
        }
    }
    let create_refs: Vec<&str> = create_args.iter().map(|s| s.as_str()).collect();
    let new_id = match exec_output("docker", &create_refs).await {
        Ok(out) => out.trim().to_string(),
        Err(e) => {
            return json!({ "ok": false, "error": format!("[DOCKER_RECONFIG_CREATE_FAILED] {}", e.trim()) })
        }
    };
    if new_id.is_empty() {
        return json!({ "ok": false, "error": "[DOCKER_RECONFIG_CREATE_FAILED] docker create returned empty id." });
    }

    let _ = exec_output("docker", &["stop", id]).await;
    let _ = exec_output("docker", &["rm", id]).await;

    if let Err(e) = exec_output("docker", &["rename", &temp_name, &container_name]).await {
        return json!({ "ok": false, "error": format!("[DOCKER_RECONFIG_FAILED] rename failed: {}", e.trim()) });
    }

    if let Err(e) = exec_output("docker", &["start", &container_name]).await {
        return json!({ "ok": false, "error": format!("[DOCKER_RECONFIG_START_FAILED] {}", e.trim()) });
    }

    json!({ "ok": true, "name": container_name })
}

pub(crate) async fn docker_remap_port_invoke(body: &Value) -> Value {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or_default();
    let old_hp = body
        .get("oldHostPort")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let new_hp = body
        .get("newHostPort")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let container_port = body
        .get("containerPort")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let protocol = body
        .get("protocol")
        .and_then(|v| v.as_str())
        .unwrap_or("tcp")
        .to_string();
    let add_mode = old_hp == 0;
    let requested_network = body
        .get("networkMode")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    if id.is_empty()
        || new_hp == 0
        || (add_mode && container_port == 0)
        || (!add_mode && old_hp == 0)
    {
        return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] id and host ports (1-65535) are required." });
    }

    let inspect_raw = match exec_output("docker", &["inspect", id]).await {
        Ok(s) => s,
        Err(e) => {
            return json!({ "ok": false, "error": format!("[DOCKER_NOT_FOUND] {}", e.trim()) })
        }
    };
    let arr: Vec<Value> = match serde_json::from_str(&inspect_raw) {
        Ok(a) => a,
        Err(e) => {
            return json!({ "ok": false, "error": format!("[DOCKER_INVALID_REQUEST] inspect parse: {}", e) })
        }
    };
    let Some(info) = arr.first() else {
        return json!({ "ok": false, "error": "[DOCKER_NOT_FOUND] empty inspect result." });
    };

    let image = info
        .pointer("/Config/Image")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if image.is_empty() {
        return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] container image missing from inspect." });
    }

    let name_raw = info.pointer("/Name").and_then(|v| v.as_str()).unwrap_or("");
    let old_name = name_raw.trim_start_matches('/');
    let base = if old_name.is_empty() {
        format!("ctr-{}", &id[..id.len().min(12)])
    } else {
        old_name.to_string()
    };
    let mut new_name = sanitize_docker_name(&format!("{base}-p{new_hp}"));
    let current_network_mode = info
        .pointer("/HostConfig/NetworkMode")
        .and_then(|v| v.as_str())
        .unwrap_or("bridge")
        .to_string();
    let target_network_mode = requested_network
        .unwrap_or(current_network_mode.as_str())
        .to_string();

    if !add_mode && old_hp == new_hp && target_network_mode == current_network_mode {
        return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] port and network are identical — nothing to change." });
    }

    let mut bindings = info
        .pointer("/HostConfig/PortBindings")
        .cloned()
        .unwrap_or(json!({}));
    let Some(bind_obj) = bindings.as_object() else {
        return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] PortBindings missing or invalid." });
    };
    if bind_obj.is_empty() && !add_mode {
        return json!({ "ok": false, "error": "[DOCKER_INVALID_REQUEST] no published host ports to remap." });
    }

    let mut matched = !add_mode;
    if add_mode {
        let key = format!("{}/{}", container_port, protocol);
        if let Some(obj) = bindings.as_object_mut() {
            obj.entry(key.clone()).or_insert_with(|| json!([]));
            if let Some(arr) = obj.get_mut(&key).and_then(|v| v.as_array_mut()) {
                arr.push(json!({ "HostPort": new_hp.to_string() }));
            }
        }
    } else {
        if let Some(obj) = bindings.as_object_mut() {
            for arr_val in obj.values_mut() {
                let Some(arr) = arr_val.as_array_mut() else {
                    continue;
                };
                for b in arr.iter_mut() {
                    let Some(o) = b.as_object_mut() else {
                        continue;
                    };
                    if let Some(hp) = o.get("HostPort").and_then(|v| v.as_str()) {
                        if hp.parse::<u64>().ok() == Some(old_hp) {
                            o.insert("HostPort".to_string(), json!(new_hp.to_string()));
                            matched = true;
                        }
                    }
                }
            }
        }
        if !matched {
            return json!({
              "ok": false,
              "error": format!("[DOCKER_INVALID_REQUEST] host port {old_hp} not found in container port bindings.")
            });
        }
    }

    let build_create_args = |name_try: &str| -> Vec<String> {
        let mut args: Vec<String> = vec!["create".into(), "--name".into(), name_try.to_string()];
        args.push("--network".into());
        args.push(target_network_mode.to_string());
        if let Some(true) = info.pointer("/Config/Tty").and_then(|v| v.as_bool()) {
            args.push("-t".into());
        }
        if let Some(true) = info.pointer("/Config/OpenStdin").and_then(|v| v.as_bool()) {
            args.push("-i".into());
        }
        if let Some(rp) = info
            .pointer("/HostConfig/RestartPolicy/Name")
            .and_then(|v| v.as_str())
        {
            if !rp.is_empty() && rp != "no" {
                args.push("--restart".into());
                args.push(rp.to_string());
            }
        }
        if let Some(binds) = info.pointer("/HostConfig/Binds").and_then(|v| v.as_array()) {
            for b in binds {
                if let Some(s) = b.as_str() {
                    args.push("-v".into());
                    args.push(s.to_string());
                }
            }
        }
        if let Some(envs) = info.pointer("/Config/Env").and_then(|v| v.as_array()) {
            for e in envs {
                if let Some(s) = e.as_str() {
                    args.push("-e".into());
                    args.push(s.to_string());
                }
            }
        }
        if let Some(obj) = bindings.as_object() {
            for (ctr_key, arr_val) in obj.iter() {
                let parts: Vec<&str> = ctr_key.split('/').collect();
                if parts.len() != 2 {
                    continue;
                }
                let ctr_port = parts[0];
                let proto = parts[1];
                if let Some(arr) = arr_val.as_array() {
                    for b in arr {
                        let hp = b.get("HostPort").and_then(|v| v.as_str()).unwrap_or("");
                        if hp.is_empty() {
                            continue;
                        }
                        args.push("-p".into());
                        args.push(format!("{hp}:{ctr_port}/{proto}"));
                    }
                }
            }
        }
        args.push(image.to_string());
        if let Some(cmd_arr) = info.pointer("/Config/Cmd").and_then(|v| v.as_array()) {
            for c in cmd_arr {
                if let Some(s) = c.as_str() {
                    args.push(s.to_string());
                }
            }
        }
        args
    };

    for attempt in 0u32..4u32 {
        if attempt > 0 {
            let suf = Uuid::new_v4().to_string();
            let short = suf.split('-').next().unwrap_or("x");
            new_name = sanitize_docker_name(&format!("{base}-p{new_hp}-{short}"));
        }
        let args = build_create_args(&new_name);
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        match exec_output("docker", &refs).await {
            Ok(out) => {
                let cid = out.trim().to_string();
                if cid.is_empty() {
                    return json!({ "ok": false, "error": "[DOCKER_REMAP_FAILED] docker create returned empty id." });
                }
                if let Err(e) = exec_output("docker", &["start", &cid]).await {
                    let _ = exec_output("docker", &["rm", "-f", &cid]).await;
                    return json!({ "ok": false, "error": format!("[DOCKER_REMAP_FAILED] start: {}", e.trim()) });
                }
                let mut source_stopped = false;
                let mut source_stop_note = serde_json::Value::Null;
                let mut source_removed = false;
                let mut source_remove_note = serde_json::Value::Null;
                match exec_output("docker", &["stop", id]).await {
                    Ok(_) => {
                        source_stopped = true;
                        match exec_output("docker", &["rm", id]).await {
                            Ok(_) => source_removed = true,
                            Err(e) => source_remove_note = json!(e.trim()),
                        }
                    }
                    Err(e) => {
                        source_stop_note = json!(format!("source still running: {}", e.trim()))
                    }
                }
                return json!({
                  "ok": true,
                  "id": cid,
                  "name": new_name,
                  "sourceStopped": source_stopped,
                  "sourceStopNote": source_stop_note,
                  "sourceRemoved": source_removed,
                  "sourceRemoveNote": source_remove_note,
                });
            }
            Err(e) => {
                let msg = e.to_lowercase();
                if msg.contains("already in use")
                    || msg.contains("conflict")
                    || msg.contains("already exists")
                {
                    continue;
                }
                return json!({ "ok": false, "error": format!("[DOCKER_REMAP_FAILED] {}", e.trim()) });
            }
        }
    }
    json!({ "ok": false, "error": "[DOCKER_REMAP_FAILED] could not allocate a unique container name." })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
}
