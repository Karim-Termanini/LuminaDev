import type { ComposeProfile, CustomProfileEntry } from '@linux-dev-home/shared'
import { invoke } from '@tauri-apps/api/core'
import { runtimePortsFromSuggest, type RuntimeAssignedPort } from '../profileEnvConflicts'

type PortsSuggestResponse = { ok?: boolean; ports?: Record<string, number> }

export async function invokePortsSuggest(
  template: ComposeProfile,
  profile: string
): Promise<Record<string, number> | null> {
  const res = (await invoke('ipc_invoke', {
    channel: 'dh:ports:suggest',
    payload: { template, profile },
  })) as PortsSuggestResponse
  return res.ok && res.ports ? res.ports : null
}

export async function fetchRuntimePortsForProfiles(
  profileList: CustomProfileEntry[],
  excludeIdx: number | null,
  current?: { template: ComposeProfile; profileName: string }
): Promise<{ others: RuntimeAssignedPort[]; suggested: Record<string, number> | null }> {
  const others: RuntimeAssignedPort[] = []
  await Promise.all(
    profileList.map(async (p, idx) => {
      if (excludeIdx !== null && idx === excludeIdx) return
      const ports = await invokePortsSuggest(p.baseTemplate, p.name)
      if (ports) others.push(...runtimePortsFromSuggest(p.name, ports))
    })
  )
  const suggested = current
    ? await invokePortsSuggest(current.template, current.profileName)
    : null
  return { others, suggested }
}
