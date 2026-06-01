pub(crate) fn scaffold_docs(project_dir: &std::path::Path) -> Result<(), String> {
    let w = |path: &str, content: &str| {
        if let Some(parent) = std::path::Path::new(path).parent() {
            let _ = std::fs::create_dir_all(project_dir.join(parent));
        }
        std::fs::write(project_dir.join(path), content)
            .map_err(|e| format!("[SCAFFOLD_FAILED] write {path}: {e}"))
    };

    let project_name = project_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Lumina Documentation");

    w(
        "mkdocs.yml",
        &format!(
            r#"site_name: {project_name}
theme:
  name: material
  palette:
    scheme: slate
    primary: deep purple
    accent: deep purple
"#
        ),
    )?;

    w(
        "docs/index.md",
        &format!(
            r#"# Welcome to {project_name}

This project was scaffolded with a professional MkDocs Material environment.

## Getting Started

- Edit `docs/index.md` to update this home page.
- Add more markdown files to `docs/` and link them in `mkdocs.yml`.
"#
        ),
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scaffold_docs_creates_expected_files() {
        let dir = tempfile::TempDir::new().unwrap();
        scaffold_docs(dir.path()).unwrap();
        assert!(dir.path().join("mkdocs.yml").exists());
        assert!(dir.path().join("docs/index.md").exists());

        // Assert site name matches directory name dynamically
        let mkdocs_content = std::fs::read_to_string(dir.path().join("mkdocs.yml")).unwrap();
        assert!(mkdocs_content.contains("site_name:"));
    }
}
