use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCredential {
    pub token: String,
    pub username: String,
    pub avatar_url: String,
    pub connected_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedAccount {
    pub provider: String,
    pub username: String,
    pub avatar_url: String,
    pub connected_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CloudPullRequestEntry {
    pub id: String,
    pub title: String,
    pub url: String,
    pub repo: String,
    pub author: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CloudPipelineEntry {
    pub id: String,
    pub name: String,
    pub url: String,
    pub repo: String,
    pub status: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParsedRemoteRepo {
    Github {
        hostname: String,
        full_name: String,
    },
    Gitlab {
        web_origin: String,
        path_with_namespace: String,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct CloudIssueEntry {
    pub id: String,
    pub title: String,
    pub url: String,
    pub repo: String,
    pub state: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudCiCheckEntry {
    pub id: String,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub url: Option<String>,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudPrDetails {
    pub base_branch: String,
    pub mergeable: Option<bool>,
    pub mergeable_state: String,
    #[serde(default)]
    pub pr_merged: bool,
    pub checks: Vec<CloudCiCheckEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CloudReleaseEntry {
    pub id: String,
    pub tag: String,
    pub title: String,
    pub url: String,
    pub repo: String,
    pub published_at: String,
}
