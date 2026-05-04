use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// ─── OAuth Client IDs ─────────────────────────────────────────────────────────
// Register a GitHub OAuth App (Device Flow enabled) at github.com/settings/developers
// and a GitLab OAuth Application at gitlab.com/-/profile/applications (enable device flow).
// Resolution order for device flow (same for GitHub / GitLab):
//   1) Optional per-install values in `store.json` → `cloud_oauth_clients` (Cloud Git → Advanced)
//   2) Process environment `LUMINA_*_OAUTH_CLIENT_ID` at app launch
//   3) Compile-time `option_env!("LUMINA_*_OAUTH_CLIENT_ID")`
//   4) Defaults below (placeholders until the project ships real app IDs)
// Client IDs are NOT secrets — security relies on device codes, not on hiding the ID.
pub const GITHUB_OAUTH_CLIENT_ID: &str = "Ov23li9XiY0G9OL1QvcI";
pub const GITLAB_OAUTH_CLIENT_ID: &str = "b300cf76c66e8a7a888e10c648c5243422f089cce232c18415f28399e2dbe4a9";

/// `store_override`: trimmed non-empty value from `cloud_oauth_clients.github_client_id` in store.json, if any.
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

/// `store_override`: trimmed non-empty value from `cloud_oauth_clients.gitlab_client_id` in store.json, if any.
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

fn oauth_client_id_unconfigured(id: &str) -> bool {
    let t = id.trim();
    t.is_empty() || t.contains("REPLACE_WITH") || t.eq_ignore_ascii_case("your_client_id_here")
}

fn device_authorize_error_detail(body: &serde_json::Value) -> String {
    if let Some(s) = body["error_description"].as_str() {
        return s.trim().to_string();
    }
    if let Some(s) = body["error"].as_str() {
        return s.trim().to_string();
    }
    String::new()
}

fn parse_device_authorize_body(
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

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct DeviceAuthChallenge {
    pub user_code: String,
    pub verification_uri: String,
    pub device_code: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Debug)]
pub enum PollResult {
    Pending,
    Complete {
        token: String,
        username: String,
        avatar_url: String,
    },
    Expired,
    Denied,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StoredCredential {
    pub token: String,
    pub username: String,
    pub avatar_url: String,
    pub connected_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConnectedAccount {
    pub provider: String,
    pub username: String,
    pub avatar_url: String,
    pub connected_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CloudPullRequestEntry {
    pub id: String,
    pub title: String,
    pub url: String,
    pub repo: String,
    pub author: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CloudPipelineEntry {
    pub id: String,
    pub name: String,
    pub url: String,
    pub repo: String,
    pub status: String,
    pub updated_at: String,
}

/// Result of parsing a `git remote get-url` for repo-scoped CI (SaaS or self-hosted).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParsedRemoteRepo {
    Github {
        /// `github.com` or GitHub Enterprise hostname (may include `:port`).
        hostname: String,
        full_name: String,
    },
    Gitlab {
        /// Web origin without trailing slash, e.g. `https://gitlab.com` or `https://code.intra`.
        web_origin: String,
        path_with_namespace: String,
    },
}

/// Best-effort: `github.com` / `gitlab.com` clone URLs (https, ssh, git@).
pub fn parse_github_gitlab_remote(url: &str) -> Option<ParsedRemoteRepo> {
    let t = url.trim();
    if t.is_empty() {
        return None;
    }
    if let Some(rest) = t.strip_prefix("git@github.com:") {
        let seg = strip_git_remote_path(rest)?;
        return Some(ParsedRemoteRepo::Github {
            hostname: "github.com".to_string(),
            full_name: seg.to_string(),
        });
    }
    if let Some(rest) = t.strip_prefix("git@gitlab.com:") {
        let seg = strip_git_remote_path(rest)?;
        return Some(ParsedRemoteRepo::Gitlab {
            web_origin: "https://gitlab.com".to_string(),
            path_with_namespace: seg.to_string(),
        });
    }
    if let Some(rest) = t.strip_prefix("ssh://git@github.com/") {
        let seg = strip_git_remote_path(rest)?;
        return Some(ParsedRemoteRepo::Github {
            hostname: "github.com".to_string(),
            full_name: seg.to_string(),
        });
    }
    if let Some(rest) = t.strip_prefix("ssh://git@gitlab.com/") {
        let seg = strip_git_remote_path(rest)?;
        return Some(ParsedRemoteRepo::Gitlab {
            web_origin: "https://gitlab.com".to_string(),
            path_with_namespace: seg.to_string(),
        });
    }
    if let Some(seg) = path_after_host_marker(t, "github.com/") {
        return Some(ParsedRemoteRepo::Github {
            hostname: "github.com".to_string(),
            full_name: seg.to_string(),
        });
    }
    if let Some(seg) = path_after_host_marker(t, "gitlab.com/") {
        return Some(ParsedRemoteRepo::Gitlab {
            web_origin: "https://gitlab.com".to_string(),
            path_with_namespace: seg.to_string(),
        });
    }
    None
}

fn parse_git_at_generic(url: &str) -> Option<(String, String)> {
    let rest = url.strip_prefix("git@")?;
    let (host, pathrest) = rest.split_once(':')?;
    let host = host.trim().to_lowercase();
    if host.is_empty() {
        return None;
    }
    let path = strip_git_remote_path(pathrest)?.to_string();
    if !path.contains('/') {
        return None;
    }
    Some((host, path))
}

fn parse_ssh_git_generic(url: &str) -> Option<(String, String)> {
    let rest = url.strip_prefix("ssh://")?.strip_prefix("git@")?;
    let slash = rest.find('/')?;
    if slash == 0 {
        return None;
    }
    let host_part = rest[..slash].trim().to_lowercase();
    if host_part.is_empty() {
        return None;
    }
    let path = strip_git_remote_path(&rest[slash + 1..])?.to_string();
    if !path.contains('/') {
        return None;
    }
    Some((host_part, path))
}

fn parse_http_https_git_generic(url: &str) -> Option<(String, String, String)> {
    let (scheme, tail) = if let Some(t) = url.strip_prefix("https://") {
        ("https", t)
    } else if let Some(t) = url.strip_prefix("http://") {
        ("http", t)
    } else {
        return None;
    };
    let slash = tail.find('/')?;
    if slash == 0 {
        return None;
    }
    let authority = tail[..slash].trim().to_lowercase();
    if authority.is_empty() {
        return None;
    }
    let path = strip_git_remote_path(&tail[slash + 1..])?.to_string();
    if !path.contains('/') {
        return None;
    }
    Some((scheme.to_string(), authority, path))
}

fn parse_self_hosted_github_remote(url: &str) -> Result<ParsedRemoteRepo, String> {
    let (hostname, full_name) = parse_git_at_generic(url)
        .or_else(|| parse_ssh_git_generic(url))
        .or_else(|| {
            parse_http_https_git_generic(url).map(|(_s, auth, path)| (auth, path))
        })
        .ok_or_else(|| {
            "[CLOUD_GIT_SCOPE] Remote is not a parseable Git URL (https, ssh://git@, or git@).".to_string()
        })?;
    if hostname == "gitlab.com" {
        return Err(
            "[CLOUD_GIT_SCOPE] This remote points to GitLab.com; switch the Cloud account tab to GitLab."
                .to_string(),
        );
    }
    Ok(ParsedRemoteRepo::Github {
        hostname,
        full_name,
    })
}

fn parse_self_hosted_gitlab_remote(url: &str) -> Result<ParsedRemoteRepo, String> {
    if let Some((scheme, authority, path)) = parse_http_https_git_generic(url) {
        if authority == "github.com" {
            return Err(
                "[CLOUD_GIT_SCOPE] This remote points to GitHub; switch the Cloud account tab to GitHub."
                    .to_string(),
            );
        }
        let web_origin = format!("{}://{}", scheme, authority);
        return Ok(ParsedRemoteRepo::Gitlab {
            web_origin,
            path_with_namespace: path,
        });
    }
    let (authority, path) = parse_git_at_generic(url)
        .or_else(|| parse_ssh_git_generic(url))
        .ok_or_else(|| {
            "[CLOUD_GIT_SCOPE] Remote is not a parseable Git URL (https, ssh://git@, or git@).".to_string()
        })?;
    if authority == "github.com" {
        return Err(
            "[CLOUD_GIT_SCOPE] This remote points to GitHub; switch the Cloud account tab to GitHub.".to_string(),
        );
    }
    let web_origin = format!("https://{}", authority);
    Ok(ParsedRemoteRepo::Gitlab {
        web_origin,
        path_with_namespace: path,
    })
}

/// Parses `git remote get-url` for `dh:cloud:git:pipelines` when `repoPath` is set (repo-scoped CI).
pub fn parse_remote_for_repo_scoped_pipelines(remote_url: &str, provider: &str) -> Result<ParsedRemoteRepo, String> {
    if let Some(pr) = parse_github_gitlab_remote(remote_url) {
        return match (provider, pr) {
            ("github", ParsedRemoteRepo::Github { hostname, full_name }) => {
                Ok(ParsedRemoteRepo::Github { hostname, full_name })
            }
            ("gitlab", ParsedRemoteRepo::Gitlab {
                web_origin,
                path_with_namespace,
            }) => Ok(ParsedRemoteRepo::Gitlab {
                web_origin,
                path_with_namespace,
            }),
            ("github", ParsedRemoteRepo::Gitlab { .. }) => Err(
                "[CLOUD_GIT_SCOPE] This remote points to GitLab; open Git VCS with a GitHub remote or switch the Cloud account tab to GitLab."
                    .to_string(),
            ),
            ("gitlab", ParsedRemoteRepo::Github { .. }) => Err(
                "[CLOUD_GIT_SCOPE] This remote points to GitHub; open Git VCS with a GitLab remote or switch the Cloud account tab to GitHub."
                    .to_string(),
            ),
            _ => Err("[CLOUD_GIT_NETWORK] Unknown provider".to_string()),
        };
    }

    match provider {
        "github" => parse_self_hosted_github_remote(remote_url),
        "gitlab" => parse_self_hosted_gitlab_remote(remote_url),
        _ => Err("[CLOUD_GIT_NETWORK] Unknown provider".to_string()),
    }
}

fn github_actions_runs_list_url(hostname: &str, full_name: &str) -> String {
    let h = hostname.trim();
    if h.eq_ignore_ascii_case("github.com") {
        format!("https://api.github.com/repos/{}/actions/runs", full_name)
    } else {
        format!("https://{}/api/v3/repos/{}/actions/runs", h, full_name)
    }
}

fn strip_git_remote_path(s: &str) -> Option<&str> {
    let s = s.split(['?', '#']).next()?.trim();
    let s = s.trim_end_matches('/').trim_end_matches(".git").trim();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn path_after_host_marker<'a>(url: &'a str, host_marker: &str) -> Option<&'a str> {
    let idx = url.find(host_marker)?;
    let rest = &url[idx + host_marker.len()..];
    let seg = rest.split(['?', '#']).next()?.trim();
    let seg = seg.trim_end_matches('/').trim_end_matches(".git").trim();
    if seg.is_empty() {
        None
    } else {
        Some(seg)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CloudIssueEntry {
    pub id: String,
    pub title: String,
    pub url: String,
    pub repo: String,
    pub state: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CloudCiCheckEntry {
    pub id: String,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub url: Option<String>,
    pub details: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CloudPrDetails {
    pub base_branch: String,
    pub mergeable: Option<bool>,
    pub mergeable_state: String, // 'clean', 'dirty', 'unstable', etc.
    /// True when there is no open PR for this head but a merged closed MR/PR exists (host merged).
    #[serde(default)]
    pub pr_merged: bool,
    pub checks: Vec<CloudCiCheckEntry>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CloudReleaseEntry {
    pub id: String,
    pub tag: String,
    pub title: String,
    pub url: String,
    pub repo: String,
    pub published_at: String,
}

// ─── CredentialStore trait ────────────────────────────────────────────────────

pub trait CredentialStore {
    fn save(&self, provider: &str, cred: &StoredCredential) -> Result<(), String>;
    fn load(&self, provider: &str) -> Result<Option<StoredCredential>, String>;
    fn delete(&self, provider: &str) -> Result<(), String>;
    fn load_all(&self) -> Result<Vec<ConnectedAccount>, String>;
}

// ─── EncryptedFileStore ───────────────────────────────────────────────────────

pub struct EncryptedFileStore {
    path: PathBuf,
}

impl EncryptedFileStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn derive_key(&self) -> Result<[u8; 32], String> {
        let machine_id = std::fs::read_to_string("/etc/machine-id")
            .unwrap_or_else(|_| "fallback-no-machine-id".to_string());
        let salt = b"lumina-dev-cloud-creds-v1";
        let mut hasher = Sha256::new();
        hasher.update(machine_id.trim().as_bytes());
        hasher.update(salt);
        Ok(hasher.finalize().into())
    }

    fn read_store(&self) -> Result<serde_json::Value, String> {
        if !self.path.exists() {
            return Ok(serde_json::json!({}));
        }
        let raw = std::fs::read(&self.path)
            .map_err(|e| format!("[CLOUD_AUTH_STORE_READ] {}", e))?;
        if raw.len() < 12 {
            return Ok(serde_json::json!({}));
        }
        let key_bytes = self.derive_key()?;
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(&raw[..12]);
        let plaintext = cipher
            .decrypt(nonce, &raw[12..])
            .map_err(|_| "[CLOUD_AUTH_STORE_DECRYPT] Failed to decrypt credentials".to_string())?;
        serde_json::from_slice(&plaintext)
            .map_err(|e| format!("[CLOUD_AUTH_STORE_PARSE] {}", e))
    }

    fn write_store(&self, value: &serde_json::Value) -> Result<(), String> {
        let plaintext = serde_json::to_vec(value)
            .map_err(|e| format!("[CLOUD_AUTH_STORE_ENCODE] {}", e))?;
        let key_bytes = self.derive_key()?;
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = cipher
            .encrypt(&nonce, plaintext.as_ref())
            .map_err(|e| format!("[CLOUD_AUTH_STORE_ENCRYPT] {}", e))?;
        let mut blob = nonce.to_vec();
        blob.extend_from_slice(&ciphertext);
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("[CLOUD_AUTH_STORE_DIR] {}", e))?;
        }
        std::fs::write(&self.path, &blob)
            .map_err(|e| format!("[CLOUD_AUTH_STORE_WRITE] {}", e))
    }
}

impl CredentialStore for EncryptedFileStore {
    fn save(&self, provider: &str, cred: &StoredCredential) -> Result<(), String> {
        let mut store = self.read_store()?;
        store[provider] = serde_json::to_value(cred)
            .map_err(|e| format!("[CLOUD_AUTH_STORE_ENCODE] {}", e))?;
        self.write_store(&store)
    }

    fn load(&self, provider: &str) -> Result<Option<StoredCredential>, String> {
        let store = self.read_store()?;
        match store.get(provider) {
            None | Some(serde_json::Value::Null) => Ok(None),
            Some(v) => {
                let cred: StoredCredential = serde_json::from_value(v.clone())
                    .map_err(|e| format!("[CLOUD_AUTH_STORE_PARSE] {}", e))?;
                Ok(Some(cred))
            }
        }
    }

    fn delete(&self, provider: &str) -> Result<(), String> {
        let mut store = self.read_store()?;
        store[provider] = serde_json::Value::Null;
        self.write_store(&store)
    }

    fn load_all(&self) -> Result<Vec<ConnectedAccount>, String> {
        let store = self.read_store()?;
        let mut accounts = Vec::new();
        for provider in &["github", "gitlab"] {
            if let Some(v) = store.get(*provider) {
                if !v.is_null() {
                    if let Ok(cred) = serde_json::from_value::<StoredCredential>(v.clone()) {
                        accounts.push(ConnectedAccount {
                            provider: provider.to_string(),
                            username: cred.username,
                            avatar_url: cred.avatar_url,
                            connected_at: cred.connected_at,
                        });
                    }
                }
            }
        }
        Ok(accounts)
    }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

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

// ─── GitHubProvider ───────────────────────────────────────────────────────────

pub struct GitHubProvider;

impl GitHubProvider {
    pub async fn device_auth_start(scopes: &[&str], client_id: &str) -> Result<DeviceAuthChallenge, String> {
        if oauth_client_id_unconfigured(client_id) {
            return Err(
                "[CLOUD_AUTH_OAUTH_NOT_CONFIGURED] GitHub device flow needs a registered OAuth app client ID. Add it under Cloud Git → Advanced (saved locally), set environment variable LUMINA_GITHUB_OAUTH_CLIENT_ID, compile with that var, replace GITHUB_OAUTH_CLIENT_ID in cloud_auth.rs, or use a personal access token."
                    .to_string(),
            );
        }
        let client = reqwest::Client::new();
        let scope = scopes.join(" ");
        let resp = client
            .post("https://github.com/login/device/code")
            .header("Accept", "application/json")
            .form(&[("client_id", client_id), ("scope", scope.as_str())])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub device start: {}", e))?;
        let status = resp.status();
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub device start parse: {}", e))?;
        parse_device_authorize_body("GitHub", status, body, 900)
    }

    pub async fn device_auth_poll(device_code: &str, client_id: &str) -> Result<PollResult, String> {
        let client = reqwest::Client::new();
        let resp = client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub poll: {}", e))?;
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub poll parse: {}", e))?;
        if let Some(token) = body["access_token"].as_str() {
            let profile = Self::validate_pat(token).await?;
            return Ok(PollResult::Complete {
                token: token.to_string(),
                username: profile.username,
                avatar_url: profile.avatar_url,
            });
        }
        match body["error"].as_str() {
            Some("authorization_pending") | Some("slow_down") => Ok(PollResult::Pending),
            Some("expired_token") => Ok(PollResult::Expired),
            Some("access_denied") => Ok(PollResult::Denied),
            other => Err(format!(
                "[CLOUD_AUTH_NETWORK] GitHub poll unexpected error: {:?}",
                other
            )),
        }
    }

    pub async fn validate_pat(token: &str) -> Result<StoredCredential, String> {
        let client = reqwest::Client::new();
        let resp = client
            .get("https://api.github.com/user")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub validate: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitHub token is invalid or expired.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_AUTH_NETWORK] GitHub validate returned {}",
                resp.status()
            ));
        }
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitHub validate parse: {}", e))?;
        Ok(StoredCredential {
            token: token.to_string(),
            username: body["login"].as_str().unwrap_or("unknown").to_string(),
            avatar_url: body["avatar_url"].as_str().unwrap_or("").to_string(),
            connected_at: chrono_now(),
        })
    }

    pub async fn revoke_token(_token: &str) -> Result<(), String> {
        // GitHub device flow apps have no client_secret — programmatic revocation
        // is not available. Credential is deleted locally by the disconnect handler.
        Ok(())
    }

    pub async fn list_open_pull_requests(
        token: &str,
        limit: usize,
    ) -> Result<Vec<CloudPullRequestEntry>, String> {
        let client = reqwest::Client::new();
        let resp = client
            .get("https://api.github.com/search/issues")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .query(&[
                ("q", "is:pr is:open author:@me"),
                ("sort", "updated"),
                ("order", "desc"),
                ("per_page", &limit.to_string()),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub PRs: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitHub token is invalid or expired.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitHub PR list returned {}",
                resp.status()
            ));
        }
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub PR parse: {}", e))?;
        let items = body["items"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|it| {
                let repo_url = it["repository_url"].as_str().unwrap_or("");
                let repo = repo_url
                    .trim_start_matches("https://api.github.com/repos/")
                    .to_string();
                CloudPullRequestEntry {
                    id: it["id"].as_i64().unwrap_or_default().to_string(),
                    title: it["title"].as_str().unwrap_or("").to_string(),
                    url: it["html_url"].as_str().unwrap_or("").to_string(),
                    repo,
                    author: it["user"]["login"].as_str().unwrap_or("").to_string(),
                    updated_at: it["updated_at"].as_str().unwrap_or("").to_string(),
                }
            })
            .filter(|x| !x.id.is_empty() && !x.url.is_empty())
            .collect();
        Ok(items)
    }

    pub async fn list_review_requested_pull_requests(
        token: &str,
        login: &str,
        limit: usize,
    ) -> Result<Vec<CloudPullRequestEntry>, String> {
        let login = login.trim();
        if login.is_empty() {
            return Ok(vec![]);
        }
        let q = format!("is:pr is:open review-requested:{}", login);
        let client = reqwest::Client::new();
        let resp = client
            .get("https://api.github.com/search/issues")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .query(&[
                ("q", q.as_str()),
                ("sort", "updated"),
                ("order", "desc"),
                ("per_page", &limit.to_string()),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub review requests: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitHub token is invalid or expired.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitHub review requests returned {}",
                resp.status()
            ));
        }
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub review requests parse: {}", e))?;
        let items = body["items"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|it| {
                let repo_url = it["repository_url"].as_str().unwrap_or("");
                let repo = repo_url
                    .trim_start_matches("https://api.github.com/repos/")
                    .to_string();
                CloudPullRequestEntry {
                    id: it["id"].as_i64().unwrap_or_default().to_string(),
                    title: it["title"].as_str().unwrap_or("").to_string(),
                    url: it["html_url"].as_str().unwrap_or("").to_string(),
                    repo,
                    author: it["user"]["login"].as_str().unwrap_or("").to_string(),
                    updated_at: it["updated_at"].as_str().unwrap_or("").to_string(),
                }
            })
            .filter(|x| !x.id.is_empty() && !x.url.is_empty())
            .collect();
        Ok(items)
    }

    pub async fn list_recent_pipelines(
        token: &str,
        limit: usize,
    ) -> Result<Vec<CloudPipelineEntry>, String> {
        let client = reqwest::Client::new();
        let repos_resp = client
            .get("https://api.github.com/user/repos")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .query(&[
                ("sort", "updated"),
                ("direction", "desc"),
                ("per_page", "20"),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub repos: {}", e))?;
        if repos_resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitHub token is invalid or expired.".to_string());
        }
        if !repos_resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitHub repos returned {}",
                repos_resp.status()
            ));
        }
        let repos: Vec<serde_json::Value> = repos_resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub repos parse: {}", e))?;

        // Fetch several runs per repo so accounts with few repos still fill the UI cap.
        let per_repo = limit.clamp(3, 15);
        let mut out: Vec<CloudPipelineEntry> = Vec::new();
        for repo in repos.into_iter().take(20) {
            let full_name = repo["full_name"].as_str().unwrap_or("").to_string();
            if full_name.is_empty() {
                continue;
            }
            let runs_resp = client
                .get(format!(
                    "https://api.github.com/repos/{}/actions/runs",
                    full_name
                ))
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", "LuminaDev/0.2.0")
                .header("Accept", "application/vnd.github+json")
                .query(&[("per_page", &per_repo.to_string())])
                .send()
                .await;
            let Ok(runs_resp) = runs_resp else {
                continue;
            };
            if !runs_resp.status().is_success() {
                continue;
            }
            let body: serde_json::Value = match runs_resp.json().await {
                Ok(v) => v,
                Err(_) => continue,
            };
            let runs = body["workflow_runs"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            for run in runs.into_iter().take(per_repo) {
                let id = run["id"].as_i64().unwrap_or_default();
                if id <= 0 {
                    continue;
                }
                out.push(CloudPipelineEntry {
                    id: id.to_string(),
                    name: run["name"]
                        .as_str()
                        .or_else(|| run["display_title"].as_str())
                        .unwrap_or("Workflow run")
                        .to_string(),
                    url: run["html_url"].as_str().unwrap_or("").to_string(),
                    repo: full_name.clone(),
                    status: run["conclusion"]
                        .as_str()
                        .or_else(|| run["status"].as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    updated_at: run["updated_at"].as_str().unwrap_or("").to_string(),
                });
            }
        }
        out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        out.retain(|x| !x.id.is_empty() && !x.url.is_empty());
        out.truncate(limit);
        Ok(out)
    }

    /// Fetches detailed CI check runs (status, conclusion, name, etc.) and mergeable status.
    pub async fn list_pr_checks(
        token: &str,
        hostname: &str,
        full_name: &str,
        reference: &str,
    ) -> Result<CloudPrDetails, String> {
        let client = reqwest::Client::new();
        let base_url = if hostname == "github.com" {
            "https://api.github.com".to_string()
        } else {
            format!("https://{}/api/v3", hostname)
        };

        // 1. Try to find the PR for this branch to get mergeable status
        // head format: owner:branch
        let owner = full_name.split('/').next().unwrap_or("");
        let pr_search_url = format!("{}/repos/{}/pulls", base_url, full_name);
        let mut mergeable = None;
        let mut mergeable_state = "unknown".to_string();
        let mut base_branch = "main".to_string(); // fallback
        let mut pr_merged = false;
        let mut found_open_pr = false;

        let prs_resp = client
            .get(&pr_search_url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .query(&[("head", format!("{}:{}", owner, reference)), ("state", "open".to_string())])
            .send()
            .await;

        if let Ok(resp) = prs_resp {
            if resp.status().is_success() {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    if let Some(pr) = body.as_array().and_then(|a| a.first()) {
                        found_open_pr = true;
                        base_branch = pr["base"]["ref"].as_str().unwrap_or("main").to_string();
                        // We found the PR. Now get its detailed info (for mergeable status)
                        let pr_url = pr["url"].as_str().unwrap_or("");
                        if !pr_url.is_empty() {
                            if let Ok(detail_resp) = client.get(pr_url)
                                .header("Authorization", format!("Bearer {}", token))
                                .header("User-Agent", "LuminaDev/0.2.0")
                                .send().await {
                                if let Ok(detail) = detail_resp.json::<serde_json::Value>().await {
                                    mergeable = detail["mergeable"].as_bool();
                                    mergeable_state = detail["mergeable_state"].as_str().unwrap_or("unknown").to_string();
                                }
                            }
                        }
                    }
                }
            }
        }

        // After merge, GitHub returns no open PR for this head — detect merged closed PR so the UI can dismiss CI tracking.
        if !found_open_pr {
            let closed_resp = client
                .get(&pr_search_url)
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", "LuminaDev/0.2.0")
                .header("Accept", "application/vnd.github+json")
                .query(&[
                    ("head", format!("{}:{}", owner, reference)),
                    ("state", "closed".to_string()),
                    ("sort", "updated".to_string()),
                    ("direction", "desc".to_string()),
                    ("per_page", "1".to_string()),
                ])
                .send()
                .await;
            if let Ok(resp) = closed_resp {
                if resp.status().is_success() {
                    if let Ok(body) = resp.json::<serde_json::Value>().await {
                        if let Some(pr) = body.as_array().and_then(|a| a.first()) {
                            if pr["merged_at"].as_str().map_or(false, |s| !s.is_empty()) {
                                pr_merged = true;
                                base_branch = pr["base"]["ref"].as_str().unwrap_or(&base_branch).to_string();
                            }
                        }
                    }
                }
            }
        }

        // 2. Fetch Checks
        let url = format!("{}/repos/{}/commits/{}/check-runs", base_url, full_name, reference);
        let resp = client
            .get(url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub checks: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("[CLOUD_GIT_NETWORK] GitHub checks returned {}", resp.status()));
        }

        let body: serde_json::Value = resp.json().await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub checks parse: {}", e))?;

        let checks = body["check_runs"].as_array().cloned().unwrap_or_default();
        let check_entries = checks.into_iter().map(|it| {
            CloudCiCheckEntry {
                id: it["id"].as_i64().unwrap_or_default().to_string(),
                name: it["name"].as_str().unwrap_or("Unknown check").to_string(),
                status: it["status"].as_str().unwrap_or("queued").to_string(),
                conclusion: it["conclusion"].as_str().map(String::from),
                url: it["html_url"].as_str().map(String::from),
                details: it["output"]["summary"].as_str().map(String::from),
            }
        }).collect();

        Ok(CloudPrDetails {
            base_branch,
            mergeable,
            mergeable_state,
            pr_merged,
            checks: check_entries,
        })
    }

    pub async fn list_repo_pipelines(
        token: &str,
        hostname: &str,
        full_name: &str,
        limit: usize,
    ) -> Result<Vec<CloudPipelineEntry>, String> {
        let client = reqwest::Client::new();
        let runs_url = github_actions_runs_list_url(hostname, full_name);
        let runs_resp = client
            .get(runs_url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .query(&[("per_page", &limit.to_string())])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub runs: {}", e))?;
        if runs_resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitHub token is invalid or expired.".to_string());
        }
        if !runs_resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitHub runs for {} returned {}",
                full_name,
                runs_resp.status()
            ));
        }
        let body: serde_json::Value = runs_resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub runs parse: {}", e))?;
        let runs = body["workflow_runs"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let mut out: Vec<CloudPipelineEntry> = Vec::new();
        for run in runs.into_iter().take(limit) {
            let id = run["id"].as_i64().unwrap_or_default();
            if id <= 0 {
                continue;
            }
            out.push(CloudPipelineEntry {
                id: id.to_string(),
                name: run["name"]
                    .as_str()
                    .or_else(|| run["display_title"].as_str())
                    .unwrap_or("Workflow run")
                    .to_string(),
                url: run["html_url"].as_str().unwrap_or("").to_string(),
                repo: full_name.to_string(),
                status: run["conclusion"]
                    .as_str()
                    .or_else(|| run["status"].as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                updated_at: run["updated_at"].as_str().unwrap_or("").to_string(),
            });
        }
        out.retain(|x| !x.id.is_empty() && !x.url.is_empty());
        Ok(out)
    }

    pub async fn list_assigned_issues(
        token: &str,
        limit: usize,
    ) -> Result<Vec<CloudIssueEntry>, String> {
        let client = reqwest::Client::new();
        let resp = client
            .get("https://api.github.com/search/issues")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .query(&[
                ("q", "is:issue is:open assignee:@me"),
                ("sort", "updated"),
                ("order", "desc"),
                ("per_page", &limit.to_string()),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub issues: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitHub token is invalid or expired.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitHub issues search returned {}",
                resp.status()
            ));
        }
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub issues parse: {}", e))?;
        let items = body["items"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|it| {
                let repo_url = it["repository_url"].as_str().unwrap_or("");
                let repo = repo_url
                    .trim_start_matches("https://api.github.com/repos/")
                    .to_string();
                CloudIssueEntry {
                    id: it["id"].as_i64().unwrap_or_default().to_string(),
                    title: it["title"].as_str().unwrap_or("").to_string(),
                    url: it["html_url"].as_str().unwrap_or("").to_string(),
                    repo,
                    state: it["state"].as_str().unwrap_or("open").to_string(),
                    updated_at: it["updated_at"].as_str().unwrap_or("").to_string(),
                }
            })
            .filter(|x| !x.id.is_empty() && !x.url.is_empty())
            .collect();
        Ok(items)
    }

    pub async fn list_recent_releases(
        token: &str,
        limit: usize,
    ) -> Result<Vec<CloudReleaseEntry>, String> {
        let client = reqwest::Client::new();
        let repos_resp = client
            .get("https://api.github.com/user/repos")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .query(&[
                ("sort", "updated"),
                ("direction", "desc"),
                ("per_page", "20"),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub repos (releases): {}", e))?;
        if repos_resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitHub token is invalid or expired.".to_string());
        }
        if !repos_resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitHub repos (releases) returned {}",
                repos_resp.status()
            ));
        }
        let repos: Vec<serde_json::Value> = repos_resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub repos parse: {}", e))?;

        let mut out: Vec<CloudReleaseEntry> = Vec::new();
        for repo in repos.into_iter().take(20) {
            let full_name = repo["full_name"].as_str().unwrap_or("").to_string();
            if full_name.is_empty() {
                continue;
            }
            let rel_resp = client
                .get(format!(
                    "https://api.github.com/repos/{}/releases/latest",
                    full_name
                ))
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", "LuminaDev/0.2.0")
                .header("Accept", "application/vnd.github+json")
                .send()
                .await;
            let Ok(rel_resp) = rel_resp else {
                continue;
            };
            if rel_resp.status() == 404 {
                continue;
            }
            if !rel_resp.status().is_success() {
                continue;
            }
            let body: serde_json::Value = match rel_resp.json().await {
                Ok(v) => v,
                Err(_) => continue,
            };
            let id = body["id"].as_i64().unwrap_or_default().to_string();
            let tag = body["tag_name"].as_str().unwrap_or("").to_string();
            let title = body["name"].as_str().unwrap_or(&tag).to_string();
            let url = body["html_url"].as_str().unwrap_or("").to_string();
            let published_at = body["published_at"].as_str().unwrap_or("").to_string();
            if id.is_empty() || url.is_empty() {
                continue;
            }
            out.push(CloudReleaseEntry {
                id,
                tag,
                title,
                url,
                repo: full_name,
                published_at,
            });
        }
        out.sort_by(|a, b| b.published_at.cmp(&a.published_at));
        out.truncate(limit);
        Ok(out)
    }
}

// ─── GitLabProvider ───────────────────────────────────────────────────────────

pub struct GitLabProvider;

impl GitLabProvider {
    pub async fn device_auth_poll(device_code: &str, client_id: &str) -> Result<PollResult, String> {
        let client = reqwest::Client::new();
        let resp = client
            .post("https://gitlab.com/oauth/token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab poll: {}", e))?;
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab poll parse: {}", e))?;
        if let Some(token) = body["access_token"].as_str() {
            let profile = Self::validate_pat(token).await?;
            return Ok(PollResult::Complete {
                token: token.to_string(),
                username: profile.username,
                avatar_url: profile.avatar_url,
            });
        }
        match body["error"].as_str() {
            Some("authorization_pending") | Some("slow_down") => Ok(PollResult::Pending),
            Some("expired_token") => Ok(PollResult::Expired),
            Some("access_denied") => Ok(PollResult::Denied),
            other => Err(format!(
                "[CLOUD_AUTH_NETWORK] GitLab poll unexpected error: {:?}",
                other
            )),
        }
    }

    pub async fn validate_pat(token: &str) -> Result<StoredCredential, String> {
        let client = reqwest::Client::new();
        let resp = client
            .get("https://gitlab.com/api/v4/user")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab validate: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_AUTH_NETWORK] GitLab validate returned {}",
                resp.status()
            ));
        }

        // Check for 'api' scope in the X-Gitlab-Token-Scopes header
        if let Some(scopes_header) = resp.headers().get("X-Gitlab-Token-Scopes") {
            if let Ok(scopes_str) = scopes_header.to_str() {
                let scopes: Vec<&str> = scopes_str.split(',').map(|s| s.trim()).collect();
                if !scopes.contains(&"api") {
                    return Err("[CLOUD_GIT_INSUFFICIENT_SCOPE] Your GitLab token lacks the 'api' scope needed for full integration (e.g., creating merge requests). Please reconnect with a token that has the 'api' scope enabled.".to_string());
                }
            }
        }
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab validate parse: {}", e))?;
        Ok(StoredCredential {
            token: token.to_string(),
            username: body["username"].as_str().unwrap_or("unknown").to_string(),
            avatar_url: body["avatar_url"].as_str().unwrap_or("").to_string(),
            connected_at: chrono_now(),
        })
    }

    pub async fn revoke_token(token: &str, client_id: &str) -> Result<(), String> {
        let client = reqwest::Client::new();
        let _ = client
            .post("https://gitlab.com/oauth/revoke")
            .form(&[("token", token), ("client_id", client_id)])
            .send()
            .await;
        Ok(())
    }

    pub async fn list_open_pull_requests(
        token: &str,
        limit: usize,
    ) -> Result<Vec<CloudPullRequestEntry>, String> {
        let client = reqwest::Client::new();
        let resp = client
            .get("https://gitlab.com/api/v4/merge_requests")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .query(&[
                ("scope", "created_by_me"),
                ("state", "opened"),
                ("order_by", "updated_at"),
                ("sort", "desc"),
                ("per_page", &limit.to_string()),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab MRs: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitLab MR list returned {}",
                resp.status()
            ));
        }
        let rows: Vec<serde_json::Value> = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab MR parse: {}", e))?;
        let items = rows
            .into_iter()
            .map(|it| {
                let repo = it["references"]["full"]
                    .as_str()
                    .map(|s| s.split('!').next().unwrap_or(s).to_string())
                    .unwrap_or_default();
                CloudPullRequestEntry {
                    id: it["id"].as_i64().unwrap_or_default().to_string(),
                    title: it["title"].as_str().unwrap_or("").to_string(),
                    url: it["web_url"].as_str().unwrap_or("").to_string(),
                    repo,
                    author: it["author"]["username"].as_str().unwrap_or("").to_string(),
                    updated_at: it["updated_at"].as_str().unwrap_or("").to_string(),
                }
            })
            .filter(|x| !x.id.is_empty() && !x.url.is_empty())
            .collect();
        Ok(items)
    }

    pub async fn list_review_requested_merge_requests(
        token: &str,
        username: &str,
        limit: usize,
    ) -> Result<Vec<CloudPullRequestEntry>, String> {
        let username = username.trim();
        if username.is_empty() {
            return Ok(vec![]);
        }
        let client = reqwest::Client::new();
        let resp = client
            .get("https://gitlab.com/api/v4/merge_requests")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .query(&[
                ("reviewer_username", username),
                ("state", "opened"),
                ("scope", "all"),
                ("order_by", "updated_at"),
                ("sort", "desc"),
                ("per_page", &limit.to_string()),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab review MRs: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitLab review MR list returned {}",
                resp.status()
            ));
        }
        let rows: Vec<serde_json::Value> = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab review MR parse: {}", e))?;
        let items = rows
            .into_iter()
            .map(|it| {
                let repo = it["references"]["full"]
                    .as_str()
                    .map(|s| s.split('!').next().unwrap_or(s).to_string())
                    .unwrap_or_default();
                CloudPullRequestEntry {
                    id: it["id"].as_i64().unwrap_or_default().to_string(),
                    title: it["title"].as_str().unwrap_or("").to_string(),
                    url: it["web_url"].as_str().unwrap_or("").to_string(),
                    repo,
                    author: it["author"]["username"].as_str().unwrap_or("").to_string(),
                    updated_at: it["updated_at"].as_str().unwrap_or("").to_string(),
                }
            })
            .filter(|x| !x.id.is_empty() && !x.url.is_empty())
            .collect();
        Ok(items)
    }

    pub async fn list_recent_pipelines(
        token: &str,
        limit: usize,
    ) -> Result<Vec<CloudPipelineEntry>, String> {
        let client = reqwest::Client::new();
        let projects_resp = client
            .get("https://gitlab.com/api/v4/projects")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .query(&[
                ("membership", "true"),
                ("simple", "true"),
                ("order_by", "last_activity_at"),
                ("sort", "desc"),
                ("per_page", "20"),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab projects: {}", e))?;
        if projects_resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string());
        }
        if !projects_resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitLab projects returned {}",
                projects_resp.status()
            ));
        }
        let projects: Vec<serde_json::Value> = projects_resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab projects parse: {}", e))?;

        // Several pipelines per project so a single active repo can fill the UI cap.
        let per_repo = limit.clamp(3, 15);
        let mut out: Vec<CloudPipelineEntry> = Vec::new();
        for project in projects.into_iter().take(20) {
            let id = project["id"].as_i64().unwrap_or_default();
            if id <= 0 {
                continue;
            }
            let repo = project["path_with_namespace"]
                .as_str()
                .unwrap_or("")
                .to_string();
            let list_resp = client
                .get(format!("https://gitlab.com/api/v4/projects/{}/pipelines", id))
                .header("Authorization", format!("Bearer {}", token))
                .query(&[
                    ("order_by", "updated_at"),
                    ("sort", "desc"),
                    ("per_page", &per_repo.to_string()),
                ])
                .send()
                .await;
            let Ok(list_resp) = list_resp else {
                continue;
            };
            if !list_resp.status().is_success() {
                continue;
            }
            let rows: Vec<serde_json::Value> = match list_resp.json().await {
                Ok(v) => v,
                Err(_) => continue,
            };
            for p in rows.into_iter().take(per_repo) {
                let pid = p["id"].as_i64().unwrap_or_default();
                if pid <= 0 {
                    continue;
                }
                let web_url = p["web_url"]
                    .as_str()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("https://gitlab.com/{}/-/pipelines/{}", repo, pid));
                out.push(CloudPipelineEntry {
                    id: pid.to_string(),
                    name: p["ref"].as_str().unwrap_or("pipeline").to_string(),
                    url: web_url,
                    repo: repo.clone(),
                    status: p["status"].as_str().unwrap_or("unknown").to_string(),
                    updated_at: p["updated_at"].as_str().unwrap_or("").to_string(),
                });
            }
        }
        out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        out.retain(|x| !x.id.is_empty() && !x.url.is_empty());
        out.truncate(limit);
        Ok(out)
    }

    /// Fetches detailed CI status (latest pipeline jobs) and mergeability for a specific reference (branch).
    pub async fn list_pr_checks(
        token: &str,
        web_origin: &str,
        path_with_namespace: &str,
        reference: &str,
    ) -> Result<CloudPrDetails, String> {
        let client = reqwest::Client::new();
        let project_id_encoded = urlencoding::encode(path_with_namespace);
        
        let mrs_url = format!("{}/api/v4/projects/{}/merge_requests", web_origin, project_id_encoded);
        let mut mergeable = None;
        let mut mergeable_state = "unknown".to_string();
        let mut base_branch = "main".to_string();
        let mut pr_merged = false;
        let mut found_open_mr = false;

        let mrs_resp = client
            .get(mrs_url.clone())
            .header("Authorization", format!("Bearer {}", token))
            .query(&[("source_branch", reference.to_string()), ("state", "opened".to_string())])
            .send()
            .await;

        if let Ok(resp) = mrs_resp {
            if resp.status().is_success() {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    if let Some(mr) = body.as_array().and_then(|a| a.first()) {
                        found_open_mr = true;
                        base_branch = mr["target_branch"].as_str().unwrap_or("main").to_string();
                        let status = mr["merge_status"].as_str().unwrap_or("unknown");
                        mergeable = Some(status == "can_be_merged");
                        mergeable_state = status.to_string();
                    }
                }
            }
        }

        if !found_open_mr {
            let merged_resp = client
                .get(&mrs_url)
                .header("Authorization", format!("Bearer {}", token))
                .query(&[
                    ("source_branch", reference.to_string()),
                    ("state", "merged".to_string()),
                    ("order_by", "updated_at".to_string()),
                    ("sort", "desc".to_string()),
                ])
                .send()
                .await;
            if let Ok(resp) = merged_resp {
                if resp.status().is_success() {
                    if let Ok(body) = resp.json::<serde_json::Value>().await {
                        if let Some(mr) = body.as_array().and_then(|a| a.first()) {
                            pr_merged = true;
                            base_branch = mr["target_branch"].as_str().unwrap_or(&base_branch).to_string();
                        }
                    }
                }
            }
        }

        // 2. Get Pipeline Jobs
        let pipelines_url = format!("{}/api/v4/projects/{}/pipelines", web_origin, project_id_encoded);
        let pipelines_resp = client
            .get(pipelines_url)
            .header("Authorization", format!("Bearer {}", token))
            .query(&[("ref", reference), ("per_page", "1")])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab pipelines: {}", e))?;

        if !pipelines_resp.status().is_success() {
            return Err(format!("[CLOUD_GIT_NETWORK] GitLab pipelines returned {}", pipelines_resp.status()));
        }

        let pipelines: Vec<serde_json::Value> = pipelines_resp.json().await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab pipelines parse: {}", e))?;

        let pipeline_id = match pipelines.first().and_then(|p| p["id"].as_i64()) {
            Some(id) => id,
            None => {
                return Ok(CloudPrDetails {
                    base_branch,
                    mergeable,
                    mergeable_state,
                    pr_merged,
                    checks: vec![],
                });
            }
        };

        let jobs_url = format!("{}/api/v4/projects/{}/pipelines/{}/jobs", web_origin, project_id_encoded, pipeline_id);
        let jobs_resp = client
            .get(jobs_url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab jobs: {}", e))?;

        if !jobs_resp.status().is_success() {
            return Err(format!("[CLOUD_GIT_NETWORK] GitLab jobs returned {}", jobs_resp.status()));
        }

        let jobs: Vec<serde_json::Value> = jobs_resp.json().await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab jobs parse: {}", e))?;

        let check_entries = jobs.into_iter().map(|it| {
            CloudCiCheckEntry {
                id: it["id"].as_i64().unwrap_or_default().to_string(),
                name: it["name"].as_str().unwrap_or("Unknown job").to_string(),
                status: it["status"].as_str().unwrap_or("created").to_string(),
                conclusion: Some(it["status"].as_str().unwrap_or("unknown").to_string()),
                url: it["web_url"].as_str().map(String::from),
                details: None,
            }
        }).collect();

        Ok(CloudPrDetails {
            base_branch,
            mergeable,
            mergeable_state,
            pr_merged,
            checks: check_entries,
        })
    }

    /// Recent CI pipelines for a single `path_with_namespace` project (GitLab.com or self-managed).
    pub async fn list_repo_pipelines(
        token: &str,
        web_origin: &str,
        path_with_namespace: &str,
        limit: usize,
    ) -> Result<Vec<CloudPipelineEntry>, String> {
        let client = reqwest::Client::new();
        let enc = path_with_namespace.replace('/', "%2F");
        let base = web_origin.trim_end_matches('/');
        let list_resp = client
            .get(format!(
                "{}/api/v4/projects/{}/pipelines",
                base, enc
            ))
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .query(&[
                ("order_by", "updated_at"),
                ("sort", "desc"),
                ("per_page", &limit.to_string()),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab repo pipelines: {}", e))?;
        if list_resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string());
        }
        if !list_resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitLab pipelines for {} returned {}",
                path_with_namespace,
                list_resp.status()
            ));
        }
        let rows: Vec<serde_json::Value> = list_resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab repo pipelines parse: {}", e))?;
        let mut out: Vec<CloudPipelineEntry> = Vec::new();
        for p in rows.into_iter().take(limit) {
            let pid = p["id"].as_i64().unwrap_or_default();
            if pid <= 0 {
                continue;
            }
            let web_url = p["web_url"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    format!(
                        "{}/{}/-/pipelines/{}",
                        base,
                        path_with_namespace, pid
                    )
                });
            out.push(CloudPipelineEntry {
                id: pid.to_string(),
                name: p["ref"].as_str().unwrap_or("pipeline").to_string(),
                url: web_url,
                repo: path_with_namespace.to_string(),
                status: p["status"].as_str().unwrap_or("unknown").to_string(),
                updated_at: p["updated_at"].as_str().unwrap_or("").to_string(),
            });
        }
        out.retain(|x| !x.id.is_empty() && !x.url.is_empty());
        Ok(out)
    }

    pub async fn list_assigned_issues(
        token: &str,
        username: &str,
        limit: usize,
    ) -> Result<Vec<CloudIssueEntry>, String> {
        let client = reqwest::Client::new();
        let resp = client
            .get("https://gitlab.com/api/v4/issues")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .query(&[
                ("assignee_username", username),
                ("state", "opened"),
                ("scope", "all"),
                ("order_by", "updated_at"),
                ("sort", "desc"),
                ("per_page", &limit.to_string()),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab issues: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitLab issues returned {}",
                resp.status()
            ));
        }
        let rows: Vec<serde_json::Value> = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab issues parse: {}", e))?;
        let items = rows
            .into_iter()
            .map(|it| {
                let references = it["references"]["full"].as_str().unwrap_or("");
                let repo = references
                    .split('#')
                    .next()
                    .unwrap_or(references)
                    .to_string();
                CloudIssueEntry {
                    id: it["id"].as_i64().unwrap_or_default().to_string(),
                    title: it["title"].as_str().unwrap_or("").to_string(),
                    url: it["web_url"].as_str().unwrap_or("").to_string(),
                    repo,
                    state: it["state"].as_str().unwrap_or("opened").to_string(),
                    updated_at: it["updated_at"].as_str().unwrap_or("").to_string(),
                }
            })
            .filter(|x| !x.id.is_empty() && !x.url.is_empty())
            .collect();
        Ok(items)
    }

    pub async fn list_recent_releases(
        token: &str,
        limit: usize,
    ) -> Result<Vec<CloudReleaseEntry>, String> {
        let client = reqwest::Client::new();
        let projects_resp = client
            .get("https://gitlab.com/api/v4/projects")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .query(&[
                ("membership", "true"),
                ("simple", "true"),
                ("order_by", "last_activity_at"),
                ("sort", "desc"),
                ("per_page", "20"),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab projects (releases): {}", e))?;
        if projects_resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string());
        }
        if !projects_resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitLab projects (releases) returned {}",
                projects_resp.status()
            ));
        }
        let projects: Vec<serde_json::Value> = projects_resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab projects parse: {}", e))?;

        let mut out: Vec<CloudReleaseEntry> = Vec::new();
        for project in projects.into_iter().take(20) {
            let id = project["id"].as_i64().unwrap_or_default();
            if id <= 0 {
                continue;
            }
            let repo = project["path_with_namespace"]
                .as_str()
                .unwrap_or("")
                .to_string();
            let rel_resp = client
                .get(format!(
                    "https://gitlab.com/api/v4/projects/{}/releases",
                    id
                ))
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", "LuminaDev/0.2.0")
                .query(&[("per_page", "1")])
                .send()
                .await;
            let Ok(rel_resp) = rel_resp else {
                continue;
            };
            if !rel_resp.status().is_success() {
                continue;
            }
            let rows: Vec<serde_json::Value> = match rel_resp.json().await {
                Ok(v) => v,
                Err(_) => continue,
            };
            let Some(rel) = rows.first() else {
                continue;
            };
            let tag = rel["tag_name"].as_str().unwrap_or("").to_string();
            if tag.is_empty() {
                continue;
            }
            let title = rel["name"].as_str().unwrap_or(&tag).to_string();
            let published_at = rel["released_at"]
                .as_str()
                .or_else(|| rel["created_at"].as_str())
                .unwrap_or("")
                .to_string();
            let web = format!("https://gitlab.com/{}/-/releases/{}", repo, tag);
            out.push(CloudReleaseEntry {
                id: format!("{}:{}", id, tag),
                tag,
                title,
                url: web,
                repo,
                published_at,
            });
        }
        out.sort_by(|a, b| b.published_at.cmp(&a.published_at));
        out.truncate(limit);
        Ok(out)
    }
}

impl GitHubProvider {
    /// Creates a pull request on GitHub. Returns the PR HTML URL.
    pub async fn create_pull_request(
        token: &str,
        owner: &str,
        repo: &str,
        title: &str,
        body: &str,
        head: &str,
        base: &str,
    ) -> Result<String, String> {
        let client = reqwest::Client::new();
        let url = format!("https://api.github.com/repos/{}/{}/pulls", owner, repo);
        let payload = serde_json::json!({ "title": title, "body": body, "head": head, "base": base });
        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub create PR: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitHub token is invalid or expired.".to_string());
        }
        if resp.status() == 403 {
            return Err("[CLOUD_GIT_INSUFFICIENT_SCOPE] Your GitHub token lacks the 'repo' scope needed to create pull requests. Reconnect in Cloud Git with a token that has the 'repo' scope enabled.".to_string());
        }
        if resp.status() == 422 {
            return Err("[CLOUD_GIT_PR_EXISTS] A pull request for this branch already exists.".to_string());
        }
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("[CLOUD_GIT_NETWORK] GitHub create PR returned {}: {}", status, text.chars().take(200).collect::<String>()));
        }
        let data: serde_json::Value = resp.json().await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub create PR parse: {}", e))?;
        data["html_url"].as_str().map(|s| s.to_string())
            .ok_or_else(|| "[CLOUD_GIT_NETWORK] GitHub create PR: missing html_url in response".to_string())
    }
}

impl GitLabProvider {
    /// Creates a merge request on GitLab. Returns the MR web URL.
    pub async fn create_merge_request(
        token: &str,
        web_origin: &str,
        path_with_namespace: &str,
        title: &str,
        description: &str,
        source_branch: &str,
        target_branch: &str,
    ) -> Result<String, String> {
        let client = reqwest::Client::new();
        // Percent-encode the project path for the URL segment (/ → %2F).
        let project_id: String = path_with_namespace
            .chars()
            .flat_map(|c| if c == '/' { vec!['%', '2', 'F'] } else { vec![c] })
            .collect();
        let url = format!("{}/api/v4/projects/{}/merge_requests", web_origin, project_id);
        let payload = serde_json::json!({
            "title": title,
            "description": description,
            "source_branch": source_branch,
            "target_branch": target_branch,
        });
        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab create MR: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string());
        }
        if resp.status() == 403 {
            let mut has_api_scope = true; 
            if let Some(scopes_header) = resp.headers().get("X-Gitlab-Token-Scopes") {
                if let Ok(scopes_str) = scopes_header.to_str() {
                    let scopes: Vec<&str> = scopes_str.split(',').map(|s| s.trim()).collect();
                    has_api_scope = scopes.contains(&"api");
                }
            }
            
            if !has_api_scope {
                return Err("[CLOUD_GIT_INSUFFICIENT_SCOPE] Your GitLab token lacks the 'api' scope needed to create merge requests. Reconnect in Cloud Git with a token that has the 'api' scope enabled.".to_string());
            } else {
                return Err("[CLOUD_GIT_PERMISSION_DENIED] GitLab denied creation (403). Your token has the 'api' scope, but you may lack 'Developer' or higher permissions in this specific project.".to_string());
            }
        }
        if resp.status() == 409 {
            return Err("[CLOUD_GIT_PR_EXISTS] A merge request for this branch already exists.".to_string());
        }
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("[CLOUD_GIT_NETWORK] GitLab create MR returned {}: {}", status, text.chars().take(200).collect::<String>()));
        }
        let data: serde_json::Value = resp.json().await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab create MR parse: {}", e))?;
        data["web_url"].as_str().map(|s| s.to_string())
            .ok_or_else(|| "[CLOUD_GIT_NETWORK] GitLab create MR: missing web_url in response".to_string())
    }
}

/// Encrypted credential file next to app data (`cloud_credentials.enc`).
pub fn app_encrypted_credential_store(app: &AppHandle) -> EncryptedFileStore {
    let path = app
        .path()
        .app_data_dir()
        .map(|d| d.join("cloud_credentials.enc"))
        .unwrap_or_else(|_| PathBuf::from("/tmp/cloud_credentials.enc"));
    EncryptedFileStore::new(path)
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn temp_store() -> (EncryptedFileStore, TempDir) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("test_creds.enc");
        (EncryptedFileStore::new(path), dir)
    }

    fn sample_cred(provider: &str) -> StoredCredential {
        StoredCredential {
            token: format!("tok_{}", provider),
            username: format!("user_{}", provider),
            avatar_url: format!("https://example.com/{}.png", provider),
            connected_at: "2026-05-02T12:00:00Z".to_string(),
        }
    }

    #[test]
    fn store_save_load_roundtrip() {
        let (store, _dir) = temp_store();
        let cred = sample_cred("github");
        store.save("github", &cred).unwrap();
        let loaded = store.load("github").unwrap().expect("should exist");
        assert_eq!(loaded.token, "tok_github");
        assert_eq!(loaded.username, "user_github");
    }

    #[test]
    fn store_load_missing_returns_none() {
        let (store, _dir) = temp_store();
        let result = store.load("github").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn store_delete_removes_entry() {
        let (store, _dir) = temp_store();
        store.save("github", &sample_cred("github")).unwrap();
        store.delete("github").unwrap();
        assert!(store.load("github").unwrap().is_none());
    }

    #[test]
    fn store_load_all_returns_connected() {
        let (store, _dir) = temp_store();
        store.save("github", &sample_cred("github")).unwrap();
        store.save("gitlab", &sample_cred("gitlab")).unwrap();
        let all = store.load_all().unwrap();
        assert_eq!(all.len(), 2);
        let providers: Vec<&str> = all.iter().map(|a| a.provider.as_str()).collect();
        assert!(providers.contains(&"github"));
        assert!(providers.contains(&"gitlab"));
    }

    #[test]
    fn store_delete_does_not_remove_other_provider() {
        let (store, _dir) = temp_store();
        store.save("github", &sample_cred("github")).unwrap();
        store.save("gitlab", &sample_cred("gitlab")).unwrap();
        store.delete("github").unwrap();
        assert!(store.load("github").unwrap().is_none());
        assert!(store.load("gitlab").unwrap().is_some());
    }

    #[test]
    fn derive_key_is_deterministic() {
        let (store, _dir) = temp_store();
        let k1 = store.derive_key().unwrap();
        let k2 = store.derive_key().unwrap();
        assert_eq!(k1, k2);
    }

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

    #[test]
    fn parse_github_https_remote() {
        assert_eq!(
            parse_github_gitlab_remote("https://github.com/acme/widget.git"),
            Some(ParsedRemoteRepo::Github {
                hostname: "github.com".to_string(),
                full_name: "acme/widget".to_string()
            })
        );
    }

    #[test]
    fn parse_github_git_ssh_remote() {
        assert_eq!(
            parse_github_gitlab_remote("git@github.com:Acme/Widget.git"),
            Some(ParsedRemoteRepo::Github {
                hostname: "github.com".to_string(),
                full_name: "Acme/Widget".to_string()
            })
        );
    }

    #[test]
    fn parse_gitlab_https_nested() {
        assert_eq!(
            parse_github_gitlab_remote("https://gitlab.com/group/sub/repo"),
            Some(ParsedRemoteRepo::Gitlab {
                web_origin: "https://gitlab.com".to_string(),
                path_with_namespace: "group/sub/repo".to_string()
            })
        );
    }

    #[test]
    fn parse_unknown_host_returns_none() {
        assert!(parse_github_gitlab_remote("https://codeberg.org/foo/bar").is_none());
    }

    #[test]
    fn parse_ghe_https_for_github_provider() {
        let r = parse_remote_for_repo_scoped_pipelines(
            "https://git.corp.example/acme/widget.git",
            "github",
        )
        .unwrap();
        assert_eq!(
            r,
            ParsedRemoteRepo::Github {
                hostname: "git.corp.example".to_string(),
                full_name: "acme/widget".to_string(),
            }
        );
    }

    #[test]
    fn parse_self_hosted_gitlab_https() {
        let r = parse_remote_for_repo_scoped_pipelines(
            "https://gitlab.internal/monorepo/backend",
            "gitlab",
        )
        .unwrap();
        assert_eq!(
            r,
            ParsedRemoteRepo::Gitlab {
                web_origin: "https://gitlab.internal".to_string(),
                path_with_namespace: "monorepo/backend".to_string(),
            }
        );
    }

    #[test]
    fn github_actions_runs_url_ghe() {
        assert_eq!(
            super::github_actions_runs_list_url("git.example.com:8443", "o/r"),
            "https://git.example.com:8443/api/v3/repos/o/r/actions/runs"
        );
        assert_eq!(
            super::github_actions_runs_list_url("github.com", "o/r"),
            "https://api.github.com/repos/o/r/actions/runs"
        );
    }

}
