pub mod types;
pub mod helpers;
pub mod remotes;
pub mod store;
pub mod github;
pub mod gitlab;

pub use types::{ParsedRemoteRepo, PollResult, StoredCredential};
pub use helpers::{app_encrypted_credential_store, chrono_now, compose_github_client_id, compose_gitlab_client_id};
pub use remotes::parse_remote_for_repo_scoped_pipelines;
pub use store::{CredentialStore, EncryptedFileStore};
pub use github::GitHubProvider;
pub use gitlab::GitLabProvider;
