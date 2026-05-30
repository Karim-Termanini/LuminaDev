import { parseOnLoginAutomation, parseStoredActiveProfile, type ComposeProfile } from '@linux-dev-home/shared'
import { useEffect } from 'react'

/** Survives React StrictMode double-mount so hooks run at most once per process. */
let onLoginAutomationRan = false

/**
 * Runs optional post-start actions once per app launch (after wizard, inside `AppShell`).
 * Preferences live in store key `on_login_automation`.
 */
export function OnLoginAutomationRunner(): null {
  useEffect(() => {
    if (onLoginAutomationRan) return
    onLoginAutomationRan = true

    void (async () => {
      try {
        const prefsRaw = await window.dh.storeGet({ key: 'on_login_automation' })
        const prefsBag = prefsRaw as { ok?: boolean; data?: unknown }
        const prefs = parseOnLoginAutomation(prefsBag.ok ? prefsBag.data : null)
        if (!prefs.composeUpForActiveProfile) return

        const ap = await window.dh.storeGet({ key: 'active_profile' })
        const apBag = ap as { ok?: boolean; data?: unknown }
        const profile = apBag.ok ? parseStoredActiveProfile(apBag.data) : null
        if (profile) {
          await window.dh.composeUp({ profile: profile as ComposeProfile })
        }
      } catch (e) {
        console.warn('[onLoginAutomation]', e)
      }
    })()
  }, [])

  return null
}
