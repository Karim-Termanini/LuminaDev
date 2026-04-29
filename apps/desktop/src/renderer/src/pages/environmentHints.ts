export const SSH_FLATPAK_HINT =
  'Flatpak note: if SSH key/files are inaccessible, grant access to `~/.ssh` for the app (for example with `flatpak override --user --filesystem=~/.ssh io.github.karimodora.LinuxDevHome`).'

export const TERMINAL_PTY_HINT =
  'Uses node-pty in the main process. Sandboxed Flatpak builds may block PTYs—use the external launcher as a fallback.'

export const TERMINAL_OPEN_EXTERNAL_HINT = 'Try “Open external terminal”.'
