import type { CloudGitInboxItem } from '@linux-dev-home/shared'
import { useCallback, useEffect, useState } from 'react'
import { humanizeCloudAuthError } from '../pages/cloudAuthError'

const INBOX_POLL_MS = 60_000

export function useCloudGitInbox(enabled: boolean) {
  const [items, setItems] = useState<CloudGitInboxItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.dh.cloudGitInbox({ limit: 30 })
      if (res.ok && Array.isArray(res.items)) {
        setItems(res.items)
      } else {
        setItems([])
        setError(humanizeCloudAuthError(res.error ?? 'Inbox unavailable'))
      }
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    const intervalId = window.setInterval(() => void refresh(), INBOX_POLL_MS)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, refresh])

  return { items, loading, error, refresh }
}
