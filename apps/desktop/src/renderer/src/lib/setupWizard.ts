/** Re-open the 3-step onboarding wizard (theme + Git). Not the install/readiness wizard. */
export const SETUP_WIZARD_OPEN_EVENT = 'dh:setup-wizard:open'

export async function openSetupWizard(): Promise<void> {
  await window.dh.storeSet({ key: 'first_run_wizard_complete', data: false })
  window.dispatchEvent(new CustomEvent(SETUP_WIZARD_OPEN_EVENT))
}
