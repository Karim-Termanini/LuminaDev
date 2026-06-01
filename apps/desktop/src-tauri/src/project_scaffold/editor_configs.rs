use std::path::Path;

pub(crate) fn scaffold_editor_configs(project_dir: &Path, template: &str, editor_cmd: &str) {
    // 1. VS Code / Cursor: Always write/ensure .vscode/extensions.json
    let vscode_dir = project_dir.join(".vscode");
    let _ = std::fs::create_dir_all(&vscode_dir);
    let vscode_content = if template == "data-science" {
        r#"{
  "recommendations": [
    "ms-python.python",
    "ms-toolsai.jupyter"
  ]
}"#
    } else {
        r#"{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next"
  ]
}"#
    };
    let _ = std::fs::write(vscode_dir.join("extensions.json"), vscode_content);

    // 2. IntelliJ IDEA: If the editor cmd is idea or webstorm or eclipse
    if editor_cmd.contains("idea")
        || editor_cmd.contains("webstorm")
        || editor_cmd.contains("eclipse")
    {
        let idea_dir = project_dir.join(".idea");
        let _ = std::fs::create_dir_all(&idea_dir);

        let modules_content = r#"<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="ProjectModuleManager">
    <modules>
      <module fileurl="file://$PROJECT_DIR$/.idea/project.iml" filepath="$PROJECT_DIR$/.idea/project.iml" />
    </modules>
  </component>
</project>"#;
        let _ = std::fs::write(idea_dir.join("modules.xml"), modules_content);

        let iml_content = if template == "data-science" {
            r#"<?xml version="1.0" encoding="UTF-8"?>
<module type="PYTHON_MODULE" version="4">
  <component name="NewModuleRootManager">
    <content url="file://$MODULE_DIR$/.." />
    <orderEntry type="inheritedJdk" />
    <orderEntry type="sourceFolder" forTests="false" />
  </component>
</module>"#
        } else {
            r#"<?xml version="1.0" encoding="UTF-8"?>
<module type="WEB_MODULE" version="4">
  <component name="NewModuleRootManager">
    <content url="file://$MODULE_DIR$/.." />
    <orderEntry type="inheritedJdk" />
    <orderEntry type="sourceFolder" forTests="false" />
  </component>
</module>"#
        };
        let _ = std::fs::write(idea_dir.join("project.iml"), iml_content);

        if template == "data-science" {
            let misc_content = r#"<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="ProjectRootManager" version="2" project-jdk-name="Python 3" project-jdk-type="Python SDK" />
</project>"#;
            let _ = std::fs::write(idea_dir.join("misc.xml"), misc_content);
        }
    }

    // 3. Neovim / Pyright
    if template == "data-science" {
        let pyright_content = r#"{
  "include": ["src", "tests", "main.py"],
  "exclude": ["**/node_modules", "**/__pycache__"]
}"#;
        let _ = std::fs::write(project_dir.join("pyrightconfig.json"), pyright_content);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_scaffold_editor_configs_vscode_data_science() {
        let base_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test_scaffold_vscode_ds");
        let _ = std::fs::remove_dir_all(&base_dir);
        let _ = std::fs::create_dir_all(&base_dir);

        scaffold_editor_configs(&base_dir, "data-science", "code");

        let ext_file = base_dir.join(".vscode").join("extensions.json");
        assert!(ext_file.exists());

        let content = std::fs::read_to_string(ext_file).unwrap();
        assert!(content.contains("ms-python.python"));
        assert!(content.contains("ms-toolsai.jupyter"));

        let pyright_file = base_dir.join("pyrightconfig.json");
        assert!(pyright_file.exists());

        let _ = std::fs::remove_dir_all(&base_dir);
    }

    #[test]
    fn test_scaffold_editor_configs_intellij_web_dev() {
        let base_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test_scaffold_idea_web");
        let _ = std::fs::remove_dir_all(&base_dir);
        let _ = std::fs::create_dir_all(&base_dir);

        scaffold_editor_configs(&base_dir, "web-dev", "idea");

        let ext_file = base_dir.join(".vscode").join("extensions.json");
        assert!(ext_file.exists());

        let content = std::fs::read_to_string(ext_file).unwrap();
        assert!(content.contains("esbenp.prettier-vscode"));

        let idea_modules = base_dir.join(".idea").join("modules.xml");
        let idea_iml = base_dir.join(".idea").join("project.iml");
        assert!(idea_modules.exists());
        assert!(idea_iml.exists());

        let iml_content = std::fs::read_to_string(idea_iml).unwrap();
        assert!(iml_content.contains("WEB_MODULE"));

        let _ = std::fs::remove_dir_all(&base_dir);
    }

    #[test]
    fn scaffold_editor_configs_no_intellij_when_not_requested() {
        let dir = tempfile::TempDir::new().unwrap();
        scaffold_editor_configs(dir.path(), "web-dev", "code");
        let idea_dir = dir.path().join(".idea");
        assert!(
            !idea_dir.exists(),
            "should not create .idea when editor is 'code'"
        );
    }

    #[test]
    fn scaffold_editor_configs_webstorm_triggers_intellij() {
        let dir = tempfile::TempDir::new().unwrap();
        scaffold_editor_configs(dir.path(), "web-dev", "webstorm");
        assert!(dir.path().join(".idea/modules.xml").exists());
        assert!(dir.path().join(".idea/project.iml").exists());

        let iml = std::fs::read_to_string(dir.path().join(".idea/project.iml")).unwrap();
        assert!(iml.contains("WEB_MODULE"));
    }

    #[test]
    fn scaffold_editor_configs_eclipse_triggers_intellij_data_science() {
        let dir = tempfile::TempDir::new().unwrap();
        scaffold_editor_configs(dir.path(), "data-science", "eclipse");
        assert!(dir.path().join(".idea/modules.xml").exists());
        let iml = std::fs::read_to_string(dir.path().join(".idea/project.iml")).unwrap();
        assert!(iml.contains("PYTHON_MODULE"));
        assert!(dir.path().join(".idea/misc.xml").exists());
    }

    #[test]
    fn scaffold_editor_configs_empty_editor_skips_intellij() {
        let dir = tempfile::TempDir::new().unwrap();
        scaffold_editor_configs(dir.path(), "data-science", "");
        assert!(dir.path().join(".vscode/extensions.json").exists());
        let idea_dir = dir.path().join(".idea");
        assert!(
            !idea_dir.exists(),
            "should not create .idea when editor_cmd is empty"
        );
        assert!(dir.path().join("pyrightconfig.json").exists());
    }
}
