import { invoke } from '@tauri-apps/api/core'

const PREFERRED_EDITOR_KEY = 'dh:preferred_editor_cmd'

type EditorEntry = { name: string; cmd: string }

/** Resolve editor command: saved preference → first detected IDE → `code`. */
export async function resolveGitAssistantEditorCmd(): Promise<{ cmd: string; name: string }> {
  let editors: EditorEntry[] = []
  try {
    const res = (await invoke('ipc_invoke', { channel: 'dh:editor:list', payload: {} })) as {
      ok?: boolean
      editors?: EditorEntry[]
    }
    if (res.ok && Array.isArray(res.editors)) editors = res.editors
  } catch {
    /* fallback below */
  }

  try {
    const store = await window.dh.storeGet({ key: PREFERRED_EDITOR_KEY as 'dh:preferred_editor_cmd' })
    if (store.ok && typeof store.data === 'string') {
      const saved = store.data.trim()
      const match = editors.find((e) => e.cmd === saved)
      if (match) return { cmd: match.cmd, name: match.name }
      if (saved) return { cmd: saved, name: saved }
    }
  } catch {
    /* ignore */
  }

  if (editors.length > 0) return { cmd: editors[0].cmd, name: editors[0].name }
  return { cmd: 'code', name: 'VS Code' }
}

export async function openRepoInEditor(repoPath: string): Promise<void> {
  const { cmd } = await resolveGitAssistantEditorCmd()
  const res = (await invoke('ipc_invoke', {
    channel: 'dh:editor:open',
    payload: { path: repoPath.trim(), cmd },
  })) as { ok?: boolean; error?: string }
  if (!res.ok) throw new Error(res.error ?? 'Could not open editor.')
}
