/**
 * FirstRunWizard contract helpers — validate IPC responses for the first-run wizard.
 */

export type WizardOpResult = { ok: boolean; error?: string }

export function assertFirstRunWizardOk(
  result: unknown,
  fallback = 'Wizard operation failed.',
): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as WizardOpResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}
