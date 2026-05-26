use crate::cloud_auth::types::{DeviceAuthChallenge, StoredCredential};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const GITHUB_OAUTH_CLIENT_ID: &str = "Ov23li9XiY0G9OL1QvcI";
pub const GITLAB_OAUTH_CLIENT_ID: &str = "b300cf76c66e8a7a888e10c648c5243422f089cce232c18415f28399e2dbe4a9";

pub fn compose_github_client_id(store_override: Option<&str>) -> String {
    if let Some(s) = store_override {
        let t = s.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    if let Ok(v) = std::env::var("LUMINA_GITHUB_OAUTH_CLIENT_ID") {
        let t = v.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    if let Some(v) = option_env!("LUMINA_GITHUB_OAUTH_CLIENT_ID") {
        if !v.is_empty() {
            return v.to_string();
        }
    }
    GITHUB_OAUTH_CLIENT_ID.to_string()
}

pub fn compose_gitlab_client_id(store_override: Option<&str>) -> String {
    if let Some(s) = store_override {
        let t = s.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    if let Ok(v) = std::env::var("LUMINA_GITLAB_OAUTH_CLIENT_ID") {
        let t = v.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    if let Some(v) = option_env!("LUMINA_GITLAB_OAUTH_CLIENT_ID") {
        if !v.is_empty() {
            return v.to_string();
        }
    }
    GITLAB_OAUTH_CLIENT_ID.to_string()
}

pub fn oauth_client_id_unconfigured(id: &str) -> bool {
    let t = id.trim();
    t.is_empty() || t.contains("REPLACE_WITH") || t.eq_ignore_ascii_case("your_client_id_here")
}

pub fn device_authorize_error_detail(body: &serde_json::Value) -> String {
    if let Some(s) = body["error_description"].as_str() {
        return s.trim().to_string();
    }
    if let Some(s) = body["error"].as_str() {
        return s.trim().to_string();
    }
    String::new()
}

pub fn parse_device_authorize_body(
    provider: &str,
    status: reqwest::StatusCode,
    body: serde_json::Value,
    default_expires_in: u64,
) -> Result<DeviceAuthChallenge, String> {
    let device_code = body["device_code"].as_str().unwrap_or("");
    if !status.is_success() {
        let detail = device_authorize_error_detail(&body);
        return Err(format!(
            "[CLOUD_AUTH_DEVICE_START_REJECTED] {} device authorization returned HTTP {}. {}",
            provider,
            status.as_u16(),
            detail
        ));
    }
    if device_code.is_empty() {
        let detail = device_authorize_error_detail(&body);
        let suffix = if detail.is_empty() {
            "missing device_code in response.".to_string()
        } else {
            detail
        };
        return Err(format!(
            "[CLOUD_AUTH_DEVICE_START_REJECTED] {} {}",
            provider, suffix
        ));
    }
    let default_verify = if provider == "GitLab" {
        "https://gitlab.com/oauth/device"
    } else {
        "https://github.com/login/device"
    };
    Ok(DeviceAuthChallenge {
        user_code: body["user_code"].as_str().unwrap_or_default().to_string(),
        verification_uri: body["verification_uri"]
            .as_str()
            .unwrap_or(default_verify)
            .to_string(),
        device_code: device_code.to_string(),
        interval: body["interval"].as_u64().unwrap_or(5),
        expires_in: body["expires_in"].as_u64().unwrap_or(default_expires_in),
    })
}

pub fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let mut days = secs / 86400;
    let mut y = 1970u64;
    loop {
        let days_in_year = if y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400)) {
            366
        } else {
            365
        };
        if days < days_in_year { break; }
        days -= days_in_year;
        y += 1;
    }
    let month_days: [u64; 12] = [
        31,
        if y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400)) {
            29
        } else {
            28
        },
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut mo = 1u64;
    let mut remaining = days;
    for &md in &month_days {
        if remaining < md { break; }
        remaining -= md;
        mo += 1;
    }
    let d = remaining + 1;
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, m, s)
}

pub fn app_encrypted_credential_store(app: &AppHandle) -> super::store::EncryptedFileStore {
    let path = app
        .path()
        .app_data_dir()
        .map(|d| d.join("cloud_credentials.enc"))
        .unwrap_or_else(|_| PathBuf::from("/tmp/cloud_credentials.enc"));
    super::store::EncryptedFileStore::new(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chrono_now_format() {
        let ts = chrono_now();
        assert_eq!(ts.len(), 20, "timestamp should be 20 chars: {}", ts);
        assert!(ts.ends_with('Z'));
        assert!(ts.contains('T'));
    }

    #[test]
    fn compose_github_prefers_store_override() {
        assert_eq!(super::compose_github_client_id(Some("  myapp  ")), "myapp");
    }

    #[test]
    fn oauth_client_id_placeholder_detection() {
        assert!(oauth_client_id_unconfigured(""));
        assert!(oauth_client_id_unconfigured("   "));
        assert!(oauth_client_id_unconfigured("REPLACE_WITH_GITLAB_CLIENT_ID"));
        assert!(oauth_client_id_unconfigured("YOUR_CLIENT_ID_HERE"));
        assert!(!oauth_client_id_unconfigured("Iv1.8a61f9b3a7aba766"));
    }
}
