/**
 * FirstRunWizard error humanization — convert error codes to user-friendly messages.
 */

export function humanizeFirstRunWizardError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()

  if (code === 'STORE_KEY_DENIED')
    return `Cannot save wizard preferences — the store key was rejected. ${detail}`.trim()
  if (code === 'GIT_CONFIG_KEY_DENIED')
    return `Cannot save Git configuration — the key is not permitted. ${detail}`.trim()
  if (code === 'GIT_CONFIG_SET_FAILED')
    return `Git configuration failed. ${detail}`.trim()

  return detail || 'Wizard operation failed.'
}
