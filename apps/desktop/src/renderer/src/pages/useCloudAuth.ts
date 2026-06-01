import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectedAccount } from '@linux-dev-home/shared'
import { CloudOauthClientsStoreSchema } from '@linux-dev-home/shared'
import { useTranslation } from 'react-i18next'

import { assertCloudAuthOk } from './cloudAuthContract'
import type { CloudGitProviderId } from './cloudGitTheme'
import { humanizeCloudAuthError, isCloudAuthOauthNotConfigured } from './cloudAuthError'

export type CloudAuthDeviceFlow = {
  provider: CloudGitProviderId
  user_code: string
  verification_uri: string
  device_code: string
  interval: number
}

export function useCloudAuth(activeProvider: CloudGitProviderId): {
  accounts: ConnectedAccount[]
  loading: boolean
  error: string | null
  oauthSetupNotice: string | null
  patError: string | null
  connecting: boolean
  deviceFlow: CloudAuthDeviceFlow | null
  patProvider: CloudGitProviderId | null
  patToken: string
  patHost: string
  advGithub: string
  advMsg: string | null
  advSaving: boolean
  account: ConnectedAccount | null
  showPatForm: boolean
  setPatToken: (v: string) => void
  setPatHost: (v: string) => void
  setPatProvider: (v: CloudGitProviderId | null) => void
  setAdvGithub: (v: string) => void
  dismissError: () => void
  dismissOauthNotice: () => void
  reportError: (msg: string) => void
  refreshStatus: () => Promise<void>
  startDeviceFlow: (provider: CloudGitProviderId) => Promise<void>
  cancelDeviceFlow: () => void
  submitPat: () => Promise<void>
  disconnect: (provider: CloudGitProviderId) => Promise<void>
  saveAdvOauth: () => Promise<void>
} {
  const { t } = useTranslation('cloudGit')
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [deviceFlow, setDeviceFlow] = useState<CloudAuthDeviceFlow | null>(null)
  const [patProvider, setPatProvider] = useState<CloudGitProviderId | null>(null)
  const [patToken, setPatToken] = useState('')
  const [patHost, setPatHost] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [oauthSetupNotice, setOauthSetupNotice] = useState<string | null>(null)
  const [patError, setPatError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [advGithub, setAdvGithub] = useState('')
  const [advMsg, setAdvMsg] = useState<string | null>(null)
  const [advSaving, setAdvSaving] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const account = accounts.find((a) => a.provider === activeProvider) ?? null
  const effectivePatProvider: CloudGitProviderId | null =
    patProvider ?? (activeProvider === 'gitlab' && !account ? 'gitlab' : null)
  const showPatForm = effectivePatProvider === activeProvider

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const res = await window.dh.cloudAuthStatus()
      if (res.ok && Array.isArray(res.accounts)) setAccounts(res.accounts)
      else setAccounts([])
    } catch {
      setAccounts([])
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await refreshStatus()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      stopPoll()
    }
  }, [refreshStatus, stopPoll])

  useEffect(() => {
    void (async () => {
      const raw = await window.dh.storeGet({ key: 'cloud_oauth_clients' })
      const bag = raw as { ok?: boolean; data?: unknown }
      if (!bag.ok || bag.data == null || typeof bag.data !== 'object') return
      const parsed = CloudOauthClientsStoreSchema.safeParse(bag.data)
      if (parsed.success) setAdvGithub(parsed.data.github_client_id ?? '')
    })()
  }, [])

  const [patActiveProvider, setPatActiveProvider] = useState(activeProvider)
  if (activeProvider !== patActiveProvider) {
    setPatActiveProvider(activeProvider)
    if (patProvider && patProvider !== activeProvider) {
      setPatProvider(null)
      setPatToken('')
      setPatError(null)
    }
  }

  const applyCloudAuthFailure = useCallback((e: unknown): void => {
    if (isCloudAuthOauthNotConfigured(e)) {
      setOauthSetupNotice(humanizeCloudAuthError(e))
      setError(null)
      return
    }
    setOauthSetupNotice(null)
    setError(humanizeCloudAuthError(e))
  }, [])

  const startPoll = useCallback((provider: CloudGitProviderId, device_code: string, interval: number): void => {
    stopPoll()
    const ms = Math.max(interval, 3) * 1000
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const res = await window.dh.cloudAuthConnectPoll({ provider, device_code })
          if (!res.ok) {
            stopPoll()
            setDeviceFlow(null)
            applyCloudAuthFailure(new Error(res.error ?? t('oauth.pollFailed')))
            return
          }
          if (res.status === 'complete') {
            stopPoll()
            setDeviceFlow(null)
            await refreshStatus()
          } else if (res.status === 'expired') {
            stopPoll()
            setDeviceFlow(null)
            setError(t('oauth.expired'))
          } else if (res.status === 'denied') {
            stopPoll()
            setDeviceFlow(null)
            setError(t('oauth.denied'))
          }
        } catch {
          // Network hiccup — keep polling
        }
      })()
    }, ms)
  }, [applyCloudAuthFailure, refreshStatus, stopPoll, t])

  const startDeviceFlow = useCallback(async (provider: CloudGitProviderId): Promise<void> => {
    setError(null)
    setOauthSetupNotice(null)
    setConnecting(true)
    try {
      const res = await window.dh.cloudAuthConnectStart(provider)
      assertCloudAuthOk(res)
      setDeviceFlow({
        provider,
        user_code: res.user_code!,
        verification_uri: res.verification_uri!,
        device_code: res.device_code!,
        interval: res.interval ?? 5,
      })
      startPoll(provider, res.device_code!, res.interval ?? 5)
    } catch (e) {
      applyCloudAuthFailure(e)
    } finally {
      setConnecting(false)
    }
  }, [applyCloudAuthFailure, startPoll])

  const cancelDeviceFlow = useCallback((): void => {
    stopPoll()
    setDeviceFlow(null)
    setError(null)
    setOauthSetupNotice(null)
  }, [stopPoll])

  const submitPat = useCallback(async (): Promise<void> => {
    const provider = patProvider ?? (activeProvider === 'gitlab' && !account ? 'gitlab' : null)
    if (!provider || !patToken.trim()) return
    setPatError(null)
    setConnecting(true)
    try {
      const res = await window.dh.cloudAuthConnectPat({
        provider,
        token: patToken.trim(),
        host: patHost.trim() || undefined,
      })
      assertCloudAuthOk(res)
      setPatProvider(null)
      setPatToken('')
      setPatHost('')
      setOauthSetupNotice(null)
      await refreshStatus()
    } catch (e) {
      setPatError(humanizeCloudAuthError(e))
    } finally {
      setConnecting(false)
    }
  }, [account, activeProvider, patHost, patProvider, patToken, refreshStatus])

  const saveAdvOauth = useCallback(async (): Promise<void> => {
    setAdvMsg(null)
    setAdvSaving(true)
    try {
      const data = CloudOauthClientsStoreSchema.parse({
        github_client_id: advGithub.trim() || undefined,
      })
      const res = await window.dh.storeSet({ key: 'cloud_oauth_clients', data })
      if (!res.ok) throw new Error(res.error ?? t('oauth.couldNotSave'))
      setAdvMsg(t('oauth.saved', { label: t('provider.github') }))
    } catch (e) {
      setAdvMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setAdvSaving(false)
    }
  }, [advGithub, t])

  const disconnect = useCallback(async (provider: CloudGitProviderId): Promise<void> => {
    try {
      const res = await window.dh.cloudAuthDisconnect({ provider })
      assertCloudAuthOk(res)
      await refreshStatus()
    } catch (e) {
      applyCloudAuthFailure(e)
    }
  }, [applyCloudAuthFailure, refreshStatus])

  return {
    accounts,
    loading,
    error,
    oauthSetupNotice,
    patError,
    connecting,
    deviceFlow,
    patProvider,
    patToken,
    patHost,
    advGithub,
    advMsg,
    advSaving,
    account,
    showPatForm,
    setPatToken,
    setPatHost,
    setPatProvider,
    setAdvGithub,
    dismissError: () => setError(null),
    dismissOauthNotice: () => setOauthSetupNotice(null),
    reportError: (msg: string) => setError(msg),
    refreshStatus,
    startDeviceFlow,
    cancelDeviceFlow,
    submitPat,
    disconnect,
    saveAdvOauth,
  }
}
