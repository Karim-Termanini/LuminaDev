export type AccessibilitySnapshot = {
  unlabeledInputs: number
  unlabeledButtons: number
  imagesMissingAlt: number
  focusableCount: number
  landmarksCount: number
}

export function collectAccessibilitySnapshot(doc: Pick<Document, 'querySelectorAll'>): AccessibilitySnapshot {
  const inputs = Array.from(doc.querySelectorAll('input:not([type="hidden"]), select, textarea'))
  const unlabeledInputs = inputs.filter((el) => {
    const hasLabel = Boolean(el.closest('label'))
    const ariaLabel = el.getAttribute('aria-label')
    const labelledBy = el.getAttribute('aria-labelledby')
    return !hasLabel && !ariaLabel && !labelledBy
  }).length

  const buttons = Array.from(doc.querySelectorAll('button'))
  const unlabeledButtons = buttons.filter((btn) => {
    const text = (btn.textContent ?? '').trim()
    const ariaLabel = btn.getAttribute('aria-label')
    const labelledBy = btn.getAttribute('aria-labelledby')
    return !text && !ariaLabel && !labelledBy
  }).length

  const imagesMissingAlt = Array.from(doc.querySelectorAll('img')).filter((img) => !img.hasAttribute('alt')).length

  const focusableCount = doc.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  ).length

  const landmarksCount = doc.querySelectorAll('main, nav, header, footer, aside, section').length

  return { unlabeledInputs, unlabeledButtons, imagesMissingAlt, focusableCount, landmarksCount }
}

export function evaluateAccessibilitySnapshot(snapshot: AccessibilitySnapshot): { ok: boolean; details: string } {
  const ok =
    snapshot.unlabeledInputs === 0 &&
    snapshot.unlabeledButtons === 0 &&
    snapshot.imagesMissingAlt === 0 &&
    snapshot.focusableCount >= 5 &&
    snapshot.landmarksCount >= 1

  return {
    ok,
    details:
      `focusable=${snapshot.focusableCount}, landmarks=${snapshot.landmarksCount}, ` +
      `unlabeledInputs=${snapshot.unlabeledInputs}, unlabeledButtons=${snapshot.unlabeledButtons}, imagesMissingAlt=${snapshot.imagesMissingAlt}`,
  }
}
