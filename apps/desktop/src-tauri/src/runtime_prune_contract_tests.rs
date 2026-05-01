use super::*;

#[test]
fn runtime_token_edge_cases_are_parsed_stably() {
  assert_eq!(lumina_first_version_token(" go1.22.4 "), Some("1.22.4".to_string()));
  assert_eq!(lumina_first_version_token("stable"), None);
  assert_eq!(lumina_first_version_token("system package"), None);

  assert_eq!(lumina_dotnet_install_channel("v8.0.4"), "8.0");
  assert_eq!(lumina_dotnet_install_channel("system package manager"), "8.0");
}

#[test]
fn dart_channel_release_parsing_handles_slash_and_plain_inputs() {
  assert_eq!(
    lumina_dart_channel_release("beta/3.5.0"),
    ("beta", "3.5.0".to_string())
  );
  assert_eq!(
    lumina_dart_channel_release("dev"),
    ("dev", "latest".to_string())
  );
  assert_eq!(
    lumina_dart_channel_release("3.4.2"),
    ("stable", "3.4.2".to_string())
  );
}

#[test]
fn rust_channel_token_detects_named_channels_only() {
  assert_eq!(lumina_rust_channel_token("nightly"), Some("nightly".to_string()));
  assert_eq!(lumina_rust_channel_token("beta"), Some("beta".to_string()));
  assert_eq!(lumina_rust_channel_token("1.78.0"), None);
}

#[test]
fn prune_preview_payload_contract_shape_is_stable() {
  let payload = docker_prune_preview_payload(2, 3, 4, 5);
  assert_eq!(payload["ok"], json!(true));
  assert_eq!(payload["preview"]["containers"], json!(2));
  assert_eq!(payload["preview"]["images"], json!(3));
  assert_eq!(payload["preview"]["volumes"], json!(4));
  assert_eq!(payload["preview"]["networks"], json!(5));
}

#[test]
fn prune_preview_payload_uses_numeric_counts() {
  let payload = docker_prune_preview_payload(0, 0, 0, 0);
  assert!(payload["preview"]["containers"].is_u64());
  assert!(payload["preview"]["images"].is_u64());
  assert!(payload["preview"]["volumes"].is_u64());
  assert!(payload["preview"]["networks"].is_u64());
}
