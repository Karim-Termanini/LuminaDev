use crate::cloud_auth::helpers::{self, oauth_client_id_unconfigured};
use crate::cloud_auth::remotes::github_actions_runs_list_url;
use crate::cloud_auth::types::{
    CloudCiCheckEntry, CloudIssueEntry, CloudPipelineEntry, CloudPrDetails,
    CloudPullRequestEntry, CloudReleaseEntry, DeviceAuthChallenge, PollResult, StoredCredential,
};

fn github_api_base(hostname: &str) -> String {
    let h = hostname.trim();
    if h.is_empty() || h.eq_ignore_ascii_case("github.com") {
        "https://api.github.com".to_string()
    } else {
        if h.starts_with("http://") || h.starts_with("https://") {
            let base = h.trim_end_matches('/');
            format!("{}/api/v3", base)
        } else {
            format!("https://{}/api/v3", h)
        }
    }
}

pub struct GitHubProvider;

impl GitHubProvider {
    pub async fn device_auth_start(scopes: &[&str], client_id: &str) -> Result<DeviceAuthChallenge, String> {
        if oauth_client_id_unconfigured(client_id) {
            return Err(
                "[CLOUD_AUTH_OAUTH_NOT_CONFIGURED] GitHub device flow needs a registered OAuth app client ID. Add it under Cloud Git → Advanced (saved locally), set environment variable LUMINA_GITHUB_OAUTH_CLIENT_ID, compile with that var, replace GITHUB_OAUTH_CLIENT_ID in cloud_auth/mod.rs, or use a personal access token."
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
        helpers::parse_device_authorize_body("GitHub", status, body, 900)
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
            let profile = Self::validate_pat(token, None).await?;
            return Ok(PollResult::Complete {
                token: token.to_string(),
                username: profile.username,
                avatar_url: profile.avatar_url,
            });
        }
        let err = body.get("error").and_then(|v| v.as_str());
        let desc = body
            .get("error_description")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("");
        match err {
            Some("authorization_pending") | Some("slow_down") => Ok(PollResult::Pending),
            Some("expired_token") => Ok(PollResult::Expired),
            Some("access_denied") => Ok(PollResult::Denied),
            Some(e) => Err(format!(
                "[CLOUD_AUTH_DEVICE_POLL_REJECTED] GitHub token step returned error `{}`. {}",
                e,
                if desc.is_empty() {
                    "If this mentions the client or redirect URL, create a GitHub OAuth App (Device flow) and set its Client ID under Cloud Git → Advanced, or use a personal access token instead."
                        .to_string()
                } else {
                    desc.to_string()
                }
            )),
            None => Err(format!(
                "[CLOUD_AUTH_DEVICE_POLL_REJECTED] GitHub returned JSON without access_token or error field. {}",
                body.to_string().chars().take(240).collect::<String>()
            )),
        }
    }

    pub async fn validate_pat(token: &str, web_origin: Option<&str>) -> Result<StoredCredential, String> {
        let client = reqwest::Client::new();
        let hostname = web_origin.unwrap_or("github.com");
        let api_base = github_api_base(hostname);
        let url = format!("{}/user", api_base);
        let resp = client
            .get(&url)
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
            connected_at: helpers::chrono_now(),
            web_origin: Some(hostname.to_string()),
        })
    }

    pub async fn revoke_token(_token: &str) -> Result<(), String> {
        Ok(())
    }

    pub async fn list_open_pull_requests(
        token: &str,
        limit: usize,
        hostname: &str,
    ) -> Result<Vec<CloudPullRequestEntry>, String> {
        let client = reqwest::Client::new();
        let api_base = github_api_base(hostname);
        let url = format!("{}/search/issues", api_base);
        let resp = client
            .get(&url)
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
        let prefix = format!("{}/repos/", api_base);
        let items = body["items"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|it| {
                let repo_url = it["repository_url"].as_str().unwrap_or("");
                let repo = repo_url
                    .trim_start_matches(&prefix)
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
        hostname: &str,
    ) -> Result<Vec<CloudPullRequestEntry>, String> {
        let login = login.trim();
        if login.is_empty() {
            return Ok(vec![]);
        }
        let q = format!("is:pr is:open review-requested:{}", login);
        let client = reqwest::Client::new();
        let api_base = github_api_base(hostname);
        let url = format!("{}/search/issues", api_base);
        let resp = client
            .get(&url)
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
        let prefix = format!("{}/repos/", api_base);
        let items = body["items"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|it| {
                let repo_url = it["repository_url"].as_str().unwrap_or("");
                let repo = repo_url
                    .trim_start_matches(&prefix)
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
        hostname: &str,
    ) -> Result<Vec<CloudPipelineEntry>, String> {
        let client = reqwest::Client::new();
        let api_base = github_api_base(hostname);
        let url = format!("{}/user/repos", api_base);
        let repos_resp = client
            .get(&url)
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

        let per_repo = limit.clamp(3, 15);
        let mut out: Vec<CloudPipelineEntry> = Vec::new();
        for repo in repos.into_iter().take(20) {
            let full_name = repo["full_name"].as_str().unwrap_or("").to_string();
            if full_name.is_empty() {
                continue;
            }
            let runs_url = format!("{}/repos/{}/actions/runs", api_base, full_name);
            let runs_resp = client
                .get(&runs_url)
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

        let owner = full_name.split('/').next().unwrap_or("");
        let pr_search_url = format!("{}/repos/{}/pulls", base_url, full_name);
        let mut mergeable = None;
        let mut mergeable_state = "unknown".to_string();
        let mut base_branch = "main".to_string();
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
                            if pr["merged_at"].as_str().is_some_and(|s| !s.is_empty()) {
                                pr_merged = true;
                                base_branch = pr["base"]["ref"].as_str().unwrap_or(&base_branch).to_string();
                            }
                        }
                    }
                }
            }
        }

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
        hostname: &str,
    ) -> Result<Vec<CloudIssueEntry>, String> {
        let client = reqwest::Client::new();
        let api_base = github_api_base(hostname);
        let url = format!("{}/search/issues", api_base);
        let resp = client
            .get(&url)
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
        let prefix = format!("{}/repos/", api_base);
        let items = body["items"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|it| {
                let repo_url = it["repository_url"].as_str().unwrap_or("");
                let repo = repo_url
                    .trim_start_matches(&prefix)
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
        hostname: &str,
    ) -> Result<Vec<CloudReleaseEntry>, String> {
        let client = reqwest::Client::new();
        let api_base = github_api_base(hostname);
        let url = format!("{}/user/repos", api_base);
        let repos_resp = client
            .get(&url)
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
            let rel_url = format!("{}/repos/{}/releases/latest", api_base, full_name);
            let rel_resp = client
                .get(&rel_url)
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

     #[allow(clippy::too_many_arguments)]
     pub async fn create_pull_request(
         token: &str,
         hostname: &str,
         owner: &str,
         repo: &str,
         title: &str,
         body: &str,
         head: &str,
         base: &str,
     ) -> Result<String, String> {
        let client = reqwest::Client::new();
        let api_base = github_api_base(hostname);
        let url = format!("{}/repos/{}/{}/pulls", api_base, owner, repo);
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

    pub async fn merge_pull_request(
        token: &str,
        hostname: &str,
        full_name: &str,
        pull_number: u32,
    ) -> Result<String, String> {
        let client = reqwest::Client::new();
        let base_url = if hostname == "github.com" {
            "https://api.github.com".to_string()
        } else {
            format!("https://{}/api/v3", hostname)
        };
        let url = format!(
            "{}/repos/{}/pulls/{}/merge",
            base_url, full_name, pull_number
        );
        let payload = serde_json::json!({ "merge_method": "merge" });
        let resp = client
            .put(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .header("Accept", "application/vnd.github+json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitHub merge PR: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitHub token is invalid or expired.".to_string());
        }
        if resp.status() == 403 {
            return Err("[CLOUD_GIT_INSUFFICIENT_SCOPE] Your GitHub token cannot merge this pull request (needs merge rights and a token with the 'repo' scope).".to_string());
        }
        if resp.status() == 404 {
            return Err("[CLOUD_GIT_MERGE_PR] Pull request not found, or the URL does not match this repository.".to_string());
        }
        if resp.status() == 405 {
            return Err(format!(
                "[CLOUD_GIT_MERGE_PR] GitHub requires at least one approved review before merging (branch protection rule). As repo owner, disable 'Require pull request reviews' in Settings → Branches, or approve the PR yourself on GitHub. PR: https://github.com/{}/pull/{}",
                full_name, pull_number
            ));
        }
        if resp.status() == 409 {
            return Err("[CLOUD_GIT_MERGE_PR] Merge could not be completed (empty merge commit or merge already in progress).".to_string());
        }
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitHub merge PR returned {}: {}",
                status,
                text.chars().take(240).collect::<String>()
            ));
        }
        let web = if hostname == "github.com" {
            format!("https://github.com/{}/pull/{}", full_name, pull_number)
        } else {
            format!("https://{}/{}/pull/{}", hostname, full_name, pull_number)
        };
        Ok(web)
    }
}
