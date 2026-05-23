/**
 * Settings error humanization — convert error codes to user-friendly messages.
 */

export function humanizeSettingsError(code: string): string {
  const messages: Record<string, string> = {
    SETTINGS_SAVE_FAILED: 'Could not save settings. Check file permissions.',
    SETTINGS_LOAD_FAILED: 'Could not load settings. Using defaults.',
    SETTINGS_INVALID_INPUT: 'Invalid input. Please check the values and try again.',
  }
  return messages[code] ?? 'Settings operation failed.'
}
