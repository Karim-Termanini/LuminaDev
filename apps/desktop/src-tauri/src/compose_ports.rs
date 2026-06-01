//! Canonical host port defaults per compose profile template.
//! Injected via `get_profile_extra_env` so two profiles never bind the same host port.

use std::collections::HashMap;

use serde_json::Value;

/// `(compose env var, store.json key prefix, default host port)`
#[allow(dead_code)]
const PORT_DEFAULTS: &[(&str, &str, u16)] = &[
    ("NODE_PORT", "node_port", 30000),
    ("NODE_HMR_PORT", "node_hmr_port", 30001),
    ("POSTGRES_PORT", "postgres_port", 30002),
    ("NGINX_PORT", "nginx_port", 30003),
    ("JUPYTER_PORT", "jupyter_port", 30100),
    ("OLLAMA_PORT", "ollama_port", 30101),
    ("TRAEFIK_HTTP_PORT", "traefik_http_port", 30300),
    ("TRAEFIK_HTTPS_PORT", "traefik_https_port", 30301),
    ("TRAEFIK_API_PORT", "traefik_api_port", 30302),
    ("PORTAINER_PORT", "portainer_port", 30303),
    ("PROMETHEUS_PORT", "prometheus_port", 30304),
    ("REDIS_PORT", "redis_port", 30400),
    ("GAME_SERVER_PORT", "game_server_port", 30401),
    ("APPIUM_PORT", "appium_port", 30500),
    ("JSON_SERVER_PORT", "json_server_port", 30501),
    ("XPRA_PORT", "xpra_port", 30600),
    ("MKDOCS_PORT", "mkdocs_port", 30700),
];

/// Ports relevant to each template (subset of [`PORT_DEFAULTS`]).
pub(crate) fn template_port_keys(template: &str) -> &'static [(&'static str, &'static str, u16)] {
    match template {
        "web-dev" => &[
            ("NODE_PORT", "node_port", 30000),
            ("NODE_HMR_PORT", "node_hmr_port", 30001),
            ("POSTGRES_PORT", "postgres_port", 30002),
            ("NGINX_PORT", "nginx_port", 30003),
        ],
        "ai-ml" => &[
            ("JUPYTER_PORT", "jupyter_port", 30100),
            ("OLLAMA_PORT", "ollama_port", 30101),
        ],
        "data-science" => &[
            ("JUPYTER_PORT", "jupyter_port", 30200),
            ("POSTGRES_PORT", "postgres_port", 30201),
        ],
        "infra" => &[
            ("TRAEFIK_HTTP_PORT", "traefik_http_port", 30300),
            ("TRAEFIK_HTTPS_PORT", "traefik_https_port", 30301),
            ("TRAEFIK_API_PORT", "traefik_api_port", 30302),
            ("PORTAINER_PORT", "portainer_port", 30303),
            ("PROMETHEUS_PORT", "prometheus_port", 30304),
        ],
        "game-dev" => &[
            ("REDIS_PORT", "redis_port", 30400),
            ("GAME_SERVER_PORT", "game_server_port", 30401),
        ],
        "mobile" => &[
            ("APPIUM_PORT", "appium_port", 30500),
            ("JSON_SERVER_PORT", "json_server_port", 30501),
        ],
        "desktop-gui" => &[("XPRA_PORT", "xpra_port", 30600)],
        "docs" => &[("MKDOCS_PORT", "mkdocs_port", 30700)],
        _ => &[],
    }
}

/// Apply store overrides, then canonical defaults for keys not yet set.
pub(crate) fn apply_profile_ports(
    env: &mut HashMap<String, String>,
    template: &str,
    profile: &str,
    store: &Value,
) {
    for (env_key, store_prefix, default) in template_port_keys(template) {
        let store_key = format!("{}_{}", store_prefix, profile);
        if let Some(val) = store.get(&store_key).and_then(|v| v.as_u64()) {
            env.insert(env_key.to_string(), val.to_string());
        } else if !env.contains_key(*env_key) {
            env.insert(env_key.to_string(), default.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn web_dev_ports_non_colliding_block() {
        let mut env = HashMap::new();
        apply_profile_ports(&mut env, "web-dev", "web-dev", &json!({}));
        assert_eq!(env.get("NODE_PORT").map(String::as_str), Some("30000"));
        assert_eq!(env.get("NGINX_PORT").map(String::as_str), Some("30003"));
    }

    #[test]
    fn data_science_uses_302xx_block() {
        let mut env = HashMap::new();
        apply_profile_ports(&mut env, "data-science", "data-science", &json!({}));
        assert_eq!(env.get("JUPYTER_PORT").map(String::as_str), Some("30200"));
        assert_eq!(env.get("POSTGRES_PORT").map(String::as_str), Some("30201"));
    }

    #[test]
    fn store_override_wins_over_default() {
        let mut env = HashMap::new();
        let store = json!({ "jupyter_port_my-ds": 39999 });
        apply_profile_ports(&mut env, "data-science", "my-ds", &store);
        assert_eq!(env.get("JUPYTER_PORT").map(String::as_str), Some("39999"));
    }

    #[test]
    fn registry_has_unique_defaults() {
        let mut seen = std::collections::HashSet::new();
        for (_, _, port) in PORT_DEFAULTS {
            assert!(seen.insert(*port), "duplicate default port {}", port);
        }
    }
}
