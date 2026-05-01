export const SSH_FLATPAK_HINT =
  'Flatpak note: if SSH key/files are inaccessible, grant access to `~/.ssh` for the app (for example with `flatpak override --user --filesystem=~/.ssh io.github.karimodora.LinuxDevHome`).'

export const DOCKER_FLATPAK_SOCKET_HINT =
  'Flatpak note: if Docker daemon/socket is unavailable, grant the Docker socket and session bus (for example: `flatpak override --user --socket=session-bus --filesystem=/var/run/docker.sock io.github.karimodora.LinuxDevHome`).'

export const TERMINAL_PTY_HINT =
  'Flatpak note: embedded terminal is integrated into the app. If input seems blocked, click inside the terminal pane to focus it.'

export const TERMINAL_OPEN_EXTERNAL_HINT = 'Open external terminal is not required; use the in-app terminal pane.'
