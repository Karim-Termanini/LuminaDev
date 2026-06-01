pub(crate) const CRAN_MIRROR: &str = "https://cloud.r-project.org";

pub(crate) fn sanitize_r_package_name(name: &str) -> Option<String> {
    let t = name.trim();
    if t.is_empty()
        || !t
            .chars()
            .all(|c| c.is_alphanumeric() || c == '.' || c == '_')
    {
        return None;
    }
    Some(t.to_string())
}

/// Non-interactive install script for Docker (CRAN mirror required).
pub(crate) fn render_install_r_script(package_names: &[String]) -> String {
    let mut pkgs: Vec<String> = package_names
        .iter()
        .filter_map(|n| sanitize_r_package_name(n))
        .collect();
    if pkgs.is_empty() {
        pkgs.push("ggplot2".to_string());
    }
    let list = pkgs
        .iter()
        .map(|p| format!("\"{}\"", p))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "options(repos = c(CRAN = \"{CRAN_MIRROR}\"))\n\npkgs <- c({list})\ninstall.packages(pkgs, repos = getOption(\"repos\"), dependencies = TRUE)\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_install_r_script_sets_cran_mirror() {
        let script = render_install_r_script(&["ggplot2".to_string(), "dplyr".to_string()]);
        assert!(script.contains("cloud.r-project.org"));
        assert!(script.contains("\"ggplot2\""));
        assert!(script.contains("install.packages(pkgs"));
    }
}
