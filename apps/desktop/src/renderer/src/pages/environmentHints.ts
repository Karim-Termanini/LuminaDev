export const SSH_FLATPAK_HINT =
  'Flatpak note: if SSH key/files are inaccessible, grant access to `~/.ssh` for the app (for example with `flatpak override --user --filesystem=~/.ssh io.github.karimodora.LinuxDevHome`).'

export const TERMINAL_PTY_HINT =
  'Terminal runs via Rust (tokio process). Sandboxed Flatpak builds may block PTYs—use the external launcher as a fallback.'

export const TERMINAL_OPEN_EXTERNAL_HINT = 'Try “Open external terminal”.'
