export type GitSetupChecklistItemId = 'identity' | 'credential' | 'cloud' | 'defaultBranch'

export type GitSetupChecklistItem = {
  id: GitSetupChecklistItemId
  ok: boolean
}

export function evaluateGitSetupChecklist(cfg: Map<string, string>, cloudConnected: boolean): GitSetupChecklistItem[] {
  const name = cfg.get('user.name')?.trim() ?? ''
  const email = cfg.get('user.email')?.trim() ?? ''
  const helper = cfg.get('credential.helper')?.trim() ?? ''
  const defaultBranch = (cfg.get('init.defaultbranch') ?? cfg.get('init.defaultBranch') ?? '').trim()

  const identityOk = name.length > 0 && email.length > 0
  const credentialOk = helper.length > 0 && !/^store$/i.test(helper)
  const cloudOk = cloudConnected
  const defaultBranchOk = defaultBranch === 'main'

  return [
    { id: 'identity', ok: identityOk },
    { id: 'credential', ok: credentialOk },
    { id: 'cloud', ok: cloudOk },
    { id: 'defaultBranch', ok: defaultBranchOk },
  ]
}

/** GitHub is optional for local Git; only identity, credential helper, and default branch gate Setup. */
export function isGitSetupComplete(items: GitSetupChecklistItem[]): boolean {
  return items.filter((i) => i.id !== 'cloud').every((i) => i.ok)
}
