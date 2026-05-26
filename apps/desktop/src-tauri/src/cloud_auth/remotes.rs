use crate::cloud_auth::types::ParsedRemoteRepo;

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

pub fn github_actions_runs_list_url(hostname: &str, full_name: &str) -> String {
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

#[cfg(test)]
mod tests {
    use super::*;

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
