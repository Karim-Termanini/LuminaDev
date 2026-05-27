export function humanizeScaffoldError(raw: string): string {
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? '').trim()

  const messages: Record<string, string> = {
    SCAFFOLD_FAILED: 'Could not scaffold project. Check path and template name.',
    PROJECT_CREATE_FAILED: 'Could not create project directory.',
    INSTALL_ERROR: 'Failed to install project dependencies.',
    EDITOR_OPEN_FAILED: 'Could not open editor for the project.',
  }

  const base = messages[code]
  if (base) return detail ? `${base} (${detail})` : base
  return raw || 'Project operation failed.'
}
