import type { DoctorFinding } from '@linux-dev-home/shared'

import type { GitSetupChecklistItemId } from './gitAssistantSetup'

const FINDING_IDS_BY_SETUP: Record<Exclude<GitSetupChecklistItemId, 'github'>, string[]> = {
  identity: ['no-name', 'no-email', 'bad-email'],
  credential: ['no-cred', 'plaintext-cred'],
  defaultBranch: ['no-branch'],
}

export function findingForSetupItem(
  itemId: GitSetupChecklistItemId,
  findings: DoctorFinding[],
): DoctorFinding | null {
  if (itemId === 'github') return null
  const ids = FINDING_IDS_BY_SETUP[itemId]
  return findings.find((f) => ids.includes(f.id) && f.severity !== 'ok') ?? null
}

export async function applyDoctorFixAction(
  action: string | undefined,
  setKey: (key: string, value: string) => Promise<void>,
): Promise<boolean> {
  switch (action) {
    case 'set-credential-cache':
      await setKey('credential.helper', 'cache --timeout=3600')
      return true
    case 'git-config-set':
    case 'set-default-branch':
      await setKey('init.defaultBranch', 'main')
      return true
    case 'enable-ssl':
      await setKey('http.sslverify', 'true')
      return true
    case 'enable-gpg-sign':
      await setKey('commit.gpgsign', 'true')
      return true
    case 'enable-preload':
      await setKey('core.preloadindex', 'true')
      return true
    case 'enable-prune':
      await setKey('fetch.prune', 'true')
      return true
    default:
      return false
  }
}
