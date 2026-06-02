use crate::cloud_auth::helpers::{self, oauth_client_id_unconfigured};
use crate::cloud_auth::types::{
    CloudCiCheckEntry, CloudInboxEntry, CloudIssueEntry, CloudPipelineEntry, CloudPrDetails,
    CloudPullRequestEntry, CloudReleaseEntry, DeviceAuthChallenge, PollResult, StoredCredential,
};

fn gitlab_api_base(web_origin: Option<&str>) -> String {
    let origin = web_origin.unwrap_or("https://gitlab.com").trim_end_matches('/');
    let origin_with_scheme = if origin.starts_with("http://") || origin.starts_with("https://") {
        origin.to_string()
    } else {
        format!("https://{}", origin)
    };
    format!("{}/api/v4", origin_with_scheme)
}

pub struct GitLabProvider;

impl GitLabProvider {
    pub async fn device_auth_start(scopes: &[&str], client_id: &str) -> Result<DeviceAuthChallenge, String> {
        if oauth_client_id_unconfigured(client_id) {
            return Err(
                "[CLOUD_AUTH_OAUTH_NOT_CONFIGURED] GitLab device flow needs a registered OAuth app (device grant enabled). Add the client ID under Settings → Connected accounts → Advanced (saved locally), set LUMINA_GITLAB_OAUTH_CLIENT_ID, compile with that var, replace GITLAB_OAUTH_CLIENT_ID in cloud_auth/mod.rs, or use a personal access token."
                    .to_string(),
            );
        }
        let client = reqwest::Client::new();
        let scope = scopes.join(" ");
        let resp = client
            .post("https://gitlab.com/oauth/authorize_device")
            .header("Accept", "application/json")
            .form(&[("client_id", client_id), ("scope", scope.as_str())])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab device start: {}", e))?;
        let status = resp.status();
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_AUTH_NETWORK] GitLab device start parse: {}", e))?;
        helpers::parse_device_authorize_body("GitLab", status, body, 300)
    }

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
            let profile = Self::validate_pat(token, None).await?;
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

    pub async fn validate_pat(token: &str, web_origin: Option<&str>) -> Result<StoredCredential, String> {
        let client = reqwest::Client::new();
        let origin = web_origin.unwrap_or("https://gitlab.com").trim_end_matches('/');
        let origin_with_scheme = if origin.starts_with("http://") || origin.starts_with("https://") {
            origin.to_string()
        } else {
            format!("https://{}", origin)
        };
        let url = format!("{}/api/v4/user", origin_with_scheme);
        let resp = client
            .get(&url)
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
            connected_at: helpers::chrono_now(),
            web_origin: Some(origin_with_scheme),
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
        web_origin: Option<&str>,
    ) -> Result<Vec<CloudPullRequestEntry>, String> {
        let client = reqwest::Client::new();
        let api_base = gitlab_api_base(web_origin);
        let url = format!("{}/merge_requests", api_base);
        let resp = client
            .get(&url)
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
        web_origin: Option<&str>,
    ) -> Result<Vec<CloudPullRequestEntry>, String> {
        let username = username.trim();
        if username.is_empty() {
            return Ok(vec![]);
        }
        let client = reqwest::Client::new();
        let api_base = gitlab_api_base(web_origin);
        let url = format!("{}/merge_requests", api_base);
        let resp = client
            .get(&url)
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
        web_origin: Option<&str>,
    ) -> Result<Vec<CloudPipelineEntry>, String> {
        let client = reqwest::Client::new();
        let api_base = gitlab_api_base(web_origin);
        let url = format!("{}/projects", api_base);
        let projects_resp = client
            .get(&url)
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
            let p_url = format!("{}/projects/{}/pipelines", api_base, id);
            let list_resp = client
                .get(&p_url)
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
                    .unwrap_or_else(|| {
                        let origin = web_origin.unwrap_or("https://gitlab.com").trim_end_matches('/');
                        format!("{}/{}/-/pipelines/{}", origin, repo, pid)
                    });
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
        web_origin: Option<&str>,
    ) -> Result<Vec<CloudIssueEntry>, String> {
        let client = reqwest::Client::new();
        let api_base = gitlab_api_base(web_origin);
        let url = format!("{}/issues", api_base);
        let resp = client
            .get(&url)
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
        web_origin: Option<&str>,
    ) -> Result<Vec<CloudReleaseEntry>, String> {
        let client = reqwest::Client::new();
        let api_base = gitlab_api_base(web_origin);
        let url = format!("{}/projects", api_base);
        let projects_resp = client
            .get(&url)
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
            let rel_url = format!("{}/projects/{}/releases", api_base, id);
            let rel_resp = client
                .get(&rel_url)
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
            let origin = web_origin.unwrap_or("https://gitlab.com").trim_end_matches('/');
            let web = format!("{}/{}/-/releases/{}", origin, repo, tag);
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

    pub async fn find_open_merge_request_url(
        token: &str,
        web_origin: &str,
        path_with_namespace: &str,
        source_branch: &str,
    ) -> Result<Option<String>, String> {
        let client = reqwest::Client::new();
        let project_id: String = path_with_namespace
            .chars()
            .flat_map(|c| if c == '/' { vec!['%', '2', 'F'] } else { vec![c] })
            .collect();
        let url = format!("{}/api/v4/projects/{}/merge_requests", web_origin, project_id);
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .query(&[
                ("state", "opened"),
                ("source_branch", source_branch),
                ("per_page", "5"),
            ])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab find MR: {}", e))?;
        if resp.status() == 401 {
            return Err(
                "[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string(),
            );
        }
        if !resp.status().is_success() {
            return Ok(None);
        }
        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab find MR parse: {}", e))?;
        let items = data.as_array().cloned().unwrap_or_default();
        Ok(items
            .first()
            .and_then(|mr| mr["web_url"].as_str())
            .map(|s| s.to_string()))
    }

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
                return Err("[CLOUD_GIT_INSUFFICIENT_SCOPE] Your GitLab token lacks the 'api' scope needed to create merge requests. Reconnect in Settings → Connected accounts with a token that has the 'api' scope enabled.".to_string());
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
            if status == 400
                && text.contains("source_branch")
                && (text.contains("does not exist") || text.contains("not exist"))
            {
                return Err("[CLOUD_GIT_MR_BRANCH_NOT_ON_REMOTE] GitLab does not have this branch on the project yet. Push your branch to the GitLab remote you selected, then create the merge request again.".to_string());
            }
            return Err(format!("[CLOUD_GIT_NETWORK] GitLab create MR returned {}: {}", status, text.chars().take(200).collect::<String>()));
        }
        let data: serde_json::Value = resp.json().await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab create MR parse: {}", e))?;
        data["web_url"].as_str().map(|s| s.to_string())
            .ok_or_else(|| "[CLOUD_GIT_NETWORK] GitLab create MR: missing web_url in response".to_string())
    }

    pub async fn merge_merge_request(
        token: &str,
        web_origin: &str,
        path_with_namespace: &str,
        merge_request_iid: u32,
        _source_branch_fallback: Option<&str>,
    ) -> Result<String, String> {
        let client = reqwest::Client::new();
        let project_id_encoded = urlencoding::encode(path_with_namespace);
        let url = format!(
            "{}/api/v4/projects/{}/merge_requests/{}/merge",
            web_origin, project_id_encoded, merge_request_iid
        );
        let resp = client
            .put(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab merge MR: {}", e))?;

        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string());
        }
        if resp.status() == 403 {
            return Err("[CLOUD_GIT_INSUFFICIENT_SCOPE] Your GitLab token lacks the 'api' scope, or you lack permission to merge this Merge Request.".to_string());
        }
        if resp.status() == 405 {
            return Err("[CLOUD_GIT_MERGE_PR] GitLab merge failed: Method not allowed (make sure the MR ID is correct).".to_string());
        }
        if resp.status() == 406 {
            return Err("[CLOUD_GIT_MERGE_PR] GitLab merge failed: Merge Request is not in a mergeable state (e.g. has conflicts, unresolved threads, or pipeline failed).".to_string());
        }
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("[CLOUD_GIT_NETWORK] GitLab merge MR returned {}: {}", status, text.chars().take(240).collect::<String>()));
        }
        let data: serde_json::Value = resp.json().await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab merge MR parse: {}", e))?;
        data["web_url"].as_str().map(|s| s.to_string())
            .ok_or_else(|| "[CLOUD_GIT_NETWORK] GitLab merge MR: missing web_url in response".to_string())
    }

    pub async fn list_inbox_notifications(
        token: &str,
        limit: usize,
        web_origin: Option<&str>,
    ) -> Result<Vec<CloudInboxEntry>, String> {
        let client = reqwest::Client::new();
        let api_base = gitlab_api_base(web_origin);
        let url = format!("{}/notifications", api_base);
        let per_page = limit.clamp(1, 50);
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "LuminaDev/0.2.0")
            .query(&[("per_page", &per_page.to_string())])
            .send()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab notifications: {}", e))?;
        if resp.status() == 401 {
            return Err("[CLOUD_AUTH_INVALID_TOKEN] GitLab token is invalid or expired.".to_string());
        }
        if !resp.status().is_success() {
            return Err(format!(
                "[CLOUD_GIT_NETWORK] GitLab notifications returned {}",
                resp.status()
            ));
        }
        let rows: Vec<serde_json::Value> = resp
            .json()
            .await
            .map_err(|e| format!("[CLOUD_GIT_NETWORK] GitLab notifications parse: {}", e))?;
        let mut items = Vec::new();
        for it in rows {
            let action = it["action_name"].as_str().unwrap_or("");
            let target_type = it["target_type"].as_str().unwrap_or("");
            let category = if action == "mentioned" {
                "mention"
            } else if action == "review_requested" || action == "approval_required" {
                "review_request"
            } else if target_type == "MergeRequest" {
                "pr_activity"
            } else {
                continue;
            };
            let title = it["body"]
                .as_str()
                .filter(|s| !s.is_empty())
                .or_else(|| it["target_title"].as_str())
                .unwrap_or("Notification")
                .to_string();
            let url = it["target_url"].as_str().unwrap_or("").to_string();
            if url.is_empty() {
                continue;
            }
            let repo = it["project"]["path_with_namespace"]
                .as_str()
                .unwrap_or("")
                .to_string();
            let id = it["id"]
                .as_i64()
                .map(|n| n.to_string())
                .unwrap_or_else(|| format!("gitlab-{}", items.len()));
            let updated_at = it["updated_at"].as_str().unwrap_or("").to_string();
            let unread = !it["read"].as_bool().unwrap_or(true);
            items.push(CloudInboxEntry {
                id: format!("gitlab:{}", id),
                provider: "gitlab".to_string(),
                category: category.to_string(),
                title,
                url,
                repo,
                updated_at,
                unread,
            });
            if items.len() >= limit {
                break;
            }
        }
        Ok(items)
    }
}
