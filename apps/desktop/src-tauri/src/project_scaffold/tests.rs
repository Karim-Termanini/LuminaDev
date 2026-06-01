use super::*;
use serde_json::json;

#[cfg(test)]
mod scaffold_apply_tests {
    use super::super::apply_project_scaffold;
    use serde_json::json;

    #[test]
    fn apply_project_scaffold_fills_empty_data_science_workspace() {
        let base =
            std::env::temp_dir().join(format!("lumina-scaffold-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("temp dir");

        let options = json!({
            "toolchain": "python",
            "dependencies": {
                "pandas": "latest",
                "numpy": "latest",
                "matplotlib": "latest",
                "scikit-learn": "latest"
            },
            "rDependencies": {},
            "createNotebook": true,
            "createMainScript": false
        });
        apply_project_scaffold(&base, "data-science", &options, None).expect("scaffold");

        assert!(base.join("README.md").is_file());
        assert!(base.join("notebooks/01_exploration.ipynb").is_file());
        assert!(base.join("src/db.py").is_file());
        assert!(base.join("requirements.txt").is_file());

        let _ = std::fs::remove_dir_all(&base);
    }
}

#[tokio::test]
async fn handle_scaffold_mobile_rn_dispatches() {
    let dir = tempfile::TempDir::new().unwrap();
    let body = json!({
        "path": dir.path().to_str().unwrap(),
        "template": "mobile",
        "subTemplate": "react-native"
    });
    let result = handle_project_scaffold(body).await;
    assert_eq!(result["ok"], true);
    assert!(dir.path().join("package.json").exists());
}

#[tokio::test]
async fn handle_scaffold_mobile_flutter_dispatches() {
    let dir = tempfile::TempDir::new().unwrap();
    let body = json!({
        "path": dir.path().to_str().unwrap(),
        "template": "mobile",
        "subTemplate": "flutter"
    });
    let result = handle_project_scaffold(body).await;
    assert_eq!(result["ok"], true);
    assert!(dir.path().join("pubspec.yaml").exists());
}

#[tokio::test]
async fn handle_scaffold_ai_ml_dispatches() {
    let dir = tempfile::TempDir::new().unwrap();
    let body = json!({
        "path": dir.path().to_str().unwrap(),
        "template": "ai-ml"
    });
    let result = handle_project_scaffold(body).await;
    assert_eq!(result["ok"], true);
    assert!(dir.path().join("requirements.txt").exists());
}

#[tokio::test]
async fn handle_scaffold_missing_path_returns_error() {
    let result = handle_project_scaffold(json!({
        "template": "web-dev"
    }))
    .await;
    assert_eq!(result["ok"], false);
    assert!(result["error"]
        .as_str()
        .unwrap_or("")
        .contains("[SCAFFOLD_FAILED]"));
    assert!(result["error"]
        .as_str()
        .unwrap_or("")
        .contains("Missing path"));
}

#[tokio::test]
async fn handle_scaffold_empty_template_creates_dir_only() {
    let dir = tempfile::TempDir::new().unwrap();
    let result = handle_project_scaffold(json!({
        "path": dir.path().to_str().unwrap(),
        "template": ""
    }))
    .await;
    assert_eq!(result["ok"], true);
    assert!(dir.path().exists());
}

#[tokio::test]
async fn handle_scaffold_unknown_template_creates_dir_only() {
    let dir = tempfile::TempDir::new().unwrap();
    let result = handle_project_scaffold(json!({
        "path": dir.path().to_str().unwrap(),
        "template": "nonexistent-template"
    }))
    .await;
    assert_eq!(result["ok"], true);
    assert!(dir.path().exists());
}

#[tokio::test]
async fn handle_scaffold_data_science_creates_full_structure() {
    let dir = tempfile::TempDir::new().unwrap();
    let result = handle_project_scaffold(json!({
        "path": dir.path().to_str().unwrap(),
        "template": "data-science",
        "options": {
            "dependencies": { "pandas": "latest", "numpy": "1.26.0" },
            "createMainScript": true,
            "createNotebook": true
        }
    }))
    .await;
    assert_eq!(
        result["ok"],
        true,
        "data-science scaffold failed: {:?}",
        result.get("error")
    );

    assert!(dir.path().join("data/raw/.gitkeep").exists());
    assert!(dir.path().join("data/processed/.gitkeep").exists());
    assert!(dir.path().join("src/__init__.py").exists());
    assert!(dir.path().join("src/db.py").exists());
    assert!(dir.path().join("src/data_loader.py").exists());
    assert!(dir.path().join("tests/test_db.py").exists());
    assert!(dir.path().join(".env").exists());
    assert!(dir.path().join(".gitignore").exists());
    assert!(dir.path().join("README.md").exists());
    assert!(dir.path().join("main.py").exists());
    assert!(dir.path().join("notebooks/01_exploration.ipynb").exists());

    let reqs = std::fs::read_to_string(dir.path().join("requirements.txt")).unwrap();
    assert!(reqs.contains("pandas"), "expected pandas in requirements");
    assert!(
        reqs.contains("numpy==1.26.0"),
        "expected numpy==1.26.0 in requirements"
    );

    let vscode = dir.path().join(".vscode").join("extensions.json");
    assert!(vscode.exists());
    let vscode_content = std::fs::read_to_string(vscode).unwrap();
    assert!(vscode_content.contains("ms-python.python"));

    let pyright = dir.path().join("pyrightconfig.json");
    assert!(pyright.exists());
}

#[tokio::test]
async fn handle_scaffold_data_science_r_toolchain() {
    let dir = tempfile::TempDir::new().unwrap();
    let result = handle_project_scaffold(json!({
        "path": dir.path().to_str().unwrap(),
        "template": "data-science",
        "options": {
            "toolchain": "r",
            "dependencies": { "tidyverse": "latest" },
            "createMainScript": true,
            "createNotebook": true
        }
    }))
    .await;
    assert_eq!(
        result["ok"],
        true,
        "R scaffold failed: {:?}",
        result.get("error")
    );

    // Directories always created
    assert!(dir.path().join("data/raw/.gitkeep").exists());
    assert!(dir.path().join("data/processed/.gitkeep").exists());

    // R files exist
    assert!(dir.path().join("src/db.R").exists());
    assert!(dir.path().join("src/data_loader.R").exists());
    assert!(dir.path().join("main.R").exists());
    assert!(dir.path().join("install.R").exists());
    assert!(dir.path().join("notebooks/01_exploration.ipynb").exists());

    // Python files should NOT exist
    assert!(!dir.path().join("src/__init__.py").exists());
    assert!(!dir.path().join("src/db.py").exists());
    assert!(!dir.path().join("src/data_loader.py").exists());
    assert!(!dir.path().join("tests/test_db.py").exists());
    assert!(!dir.path().join("main.py").exists());
    assert!(!dir.path().join("requirements.txt").exists());

    let install_r = std::fs::read_to_string(dir.path().join("install.R")).unwrap();
    assert!(install_r.contains("tidyverse"));
    assert!(install_r.contains("cloud.r-project.org"));

    // VS Code extensions include R support
    let vscode = dir.path().join(".vscode").join("extensions.json");
    assert!(vscode.exists());
    let vscode_content = std::fs::read_to_string(vscode).unwrap();
    assert!(
        vscode_content.contains("reditorsupport.r"),
        "expected R extension in vscode"
    );
}

#[tokio::test]
async fn handle_scaffold_data_science_both_toolchain() {
    let dir = tempfile::TempDir::new().unwrap();
    let result = handle_project_scaffold(json!({
        "path": dir.path().to_str().unwrap(),
        "template": "data-science",
        "options": {
            "toolchain": "both",
            "dependencies": { "pandas": "latest" },
            "rDependencies": { "tidyverse": "latest" },
            "createMainScript": true,
            "createNotebook": true
        }
    }))
    .await;
    assert_eq!(
        result["ok"],
        true,
        "both scaffold failed: {:?}",
        result.get("error")
    );

    // Python files exist
    assert!(dir.path().join("src/__init__.py").exists());
    assert!(dir.path().join("src/db.py").exists());
    assert!(dir.path().join("src/data_loader.py").exists());
    assert!(dir.path().join("main.py").exists());
    assert!(dir.path().join("requirements.txt").exists());
    let reqs = std::fs::read_to_string(dir.path().join("requirements.txt")).unwrap();
    assert!(reqs.contains("pandas"));
    assert!(!reqs.contains("tidyverse"));
    let install_r = std::fs::read_to_string(dir.path().join("install.R")).unwrap();
    assert!(install_r.contains("tidyverse"));
    assert!(install_r.contains("cloud.r-project.org"));

    // R files also exist
    assert!(dir.path().join("src/db.R").exists());
    assert!(dir.path().join("src/data_loader.R").exists());
    assert!(dir.path().join("main.R").exists());
    assert!(dir.path().join("install.R").exists());

    // Both notebooks exist
    assert!(dir.path().join("notebooks/01_exploration.ipynb").exists());
    assert!(dir.path().join("notebooks/02_exploration_r.ipynb").exists());

    // VS Code extensions include R support
    let vscode = dir.path().join(".vscode").join("extensions.json");
    assert!(vscode.exists());
    let vscode_content = std::fs::read_to_string(vscode).unwrap();
    assert!(
        vscode_content.contains("reditorsupport.r"),
        "expected R extension in vscode for both"
    );
}

#[tokio::test]
async fn handle_scaffold_web_dev_creates_full_structure() {
    let dir = tempfile::TempDir::new().unwrap();
    let result = handle_project_scaffold(json!({
        "path": dir.path().to_str().unwrap(),
        "template": "web-dev",
        "options": {
            "dependencies": { "axios": "^1.6.0" }
        }
    }))
    .await;
    assert_eq!(
        result["ok"],
        true,
        "web-dev scaffold failed: {:?}",
        result.get("error")
    );

    assert!(dir.path().join("src/components/.gitkeep").exists());
    assert!(dir.path().join("src/pages/.gitkeep").exists());
    assert!(dir.path().join("public/.gitkeep").exists());
    assert!(dir.path().join("src/main.tsx").exists());
    assert!(dir.path().join("index.html").exists());
    assert!(dir.path().join("vite.config.ts").exists());
    assert!(dir.path().join(".env").exists());
    assert!(dir.path().join(".gitignore").exists());
    assert!(dir.path().join("README.md").exists());

    let pkg = std::fs::read_to_string(dir.path().join("package.json")).unwrap();
    assert!(pkg.contains("react"));
    assert!(pkg.contains("vite"));
    assert!(pkg.contains("axios"), "expected axios in dependencies");

    let vscode = dir.path().join(".vscode").join("extensions.json");
    assert!(vscode.exists());
    let vscode_content = std::fs::read_to_string(vscode).unwrap();
    assert!(vscode_content.contains("dbaeumer.vscode-eslint"));
}

#[test]
fn detect_template_returns_data_science_by_default() {
    let dir = tempfile::TempDir::new().unwrap();
    assert_eq!(detect_template(dir.path()), "data-science");
}

#[test]
fn test_detect_template() {
    let base_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("test_detect_template");
    let _ = std::fs::remove_dir_all(&base_dir);
    let _ = std::fs::create_dir_all(&base_dir);

    assert_eq!(detect_template(&base_dir), "data-science");

    let _ = std::fs::write(base_dir.join("package.json"), "{}");
    assert_eq!(detect_template(&base_dir), "web-dev");

    let _ = std::fs::remove_dir_all(&base_dir);
}

#[tokio::test]
async fn handle_scaffold_home_dir_fallback_returns_error() {
    let result = handle_project_scaffold(json!({
        "path": "",
        "template": "web-dev"
    }))
    .await;
    assert_eq!(result["ok"], false);
    assert!(result["error"]
        .as_str()
        .unwrap_or("")
        .contains("Missing path"));
}
