import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { assertSshOk } from '../sshContract'
import { humanizeSshError } from '../sshError'
import { GITHUB_SSH_KEYS_URL, isGithubPublicKeyDenied } from './githubTest'

export const SSH_SETUP_WIZARD_STEPS = 6

const DISABLE_PASSWORD_CMD =
  "sudo sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo systemctl reload sshd"

type WizardStore = {
  step: number
  completed: boolean
  githubSkipped?: boolean
}

export function useSshSetupWizard(onComplete: () => void, initialStep?: number) {
  const { t } = useTranslation('ssh')
  const [step, setStep] = useState(1)
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const [email, setEmail] = useState('')
  const [pubKey, setPubKey] = useState('')
  const [fingerprint, setFingerprint] = useState('')

  const [testOk, setTestOk] = useState<boolean | null>(null)
  const [testResult, setTestResult] = useState('')
  const [githubSkipped, setGithubSkipped] = useState(false)

  const [localSshEnabled, setLocalSshEnabled] = useState<boolean | null>(null)
  const [enableLocalLog, setEnableLocalLog] = useState('')
  const [enableLocalBusy, setEnableLocalBusy] = useState(false)
  const [passwordCmdCopied, setPasswordCmdCopied] = useState(false)
  const [disablePasswordBusy, setDisablePasswordBusy] = useState(false)

  const persist = useCallback(async (patch: Partial<WizardStore>) => {
    try {
      const raw = await window.dh.storeGet({ key: 'ssh_setup_wizard' })
      const prev =
        raw.ok && raw.data && typeof raw.data === 'object'
          ? (raw.data as WizardStore)
          : { step: 1, completed: false }
      await window.dh.storeSet({
        key: 'ssh_setup_wizard',
        data: { ...prev, ...patch },
      })
    } catch {
      /* best effort */
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const raw = await window.dh.storeGet({ key: 'ssh_setup_wizard' })
        if (initialStep && initialStep >= 1 && initialStep <= SSH_SETUP_WIZARD_STEPS) {
          setStep(initialStep)
        } else if (raw.ok && raw.data && typeof raw.data === 'object') {
          const w = raw.data as WizardStore
          if (!w.completed && w.step >= 1 && w.step <= SSH_SETUP_WIZARD_STEPS) {
            setStep(w.step)
          }
          if (w.githubSkipped) setGithubSkipped(true)
        }
        await loadPub()
        await probeLocalSshStatus()
      } finally {
        setHydrated(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    void persist({ step, githubSkipped })
  }, [step, githubSkipped, hydrated, persist])

  async function loadPub(): Promise<void> {
    try {
      const res = await window.dh.sshGetPub({ target: 'host' })
      if (res.ok && res.pub) {
        setPubKey(res.pub)
        setFingerprint(res.fingerprint ?? '')
      }
    } catch {
      /* ignore */
    }
  }

  async function probeLocalSshStatus(): Promise<boolean> {
    try {
      const res = (await window.dh.hostExec({
        command: 'systemctl_is_active_fallback',
        units: ['sshd', 'ssh'],
      })) as { ok: boolean; result?: string }
      const active = res.ok && res.result === 'active'
      setLocalSshEnabled(active)
      return active
    } catch {
      setLocalSshEnabled(false)
      return false
    }
  }

  async function generate(): Promise<void> {
    setBusy(true)
    setStatus(t('generate.inProgress'))
    try {
      const res = await window.dh.sshGenerate({ target: 'host', email })
      assertSshOk(res, 'Failed to generate SSH key.', t)
      setStatus(t('generate.success'))
      await loadPub()
    } catch (e) {
      setStatus(humanizeSshError(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function copyPub(): Promise<void> {
    if (!pubKey) {
      setStatus(t('copyPubAlert'))
      return
    }
    try {
      await navigator.clipboard.writeText(pubKey)
      setStatus(t('identity.copySuccess'))
    } catch {
      setStatus(t('wizard.copyFailed'))
    }
  }

  async function testGithub(): Promise<void> {
    setBusy(true)
    setStatus(t('identity.testInProgress'))
    setTestOk(null)
    setTestResult('')
    setGithubSkipped(false)
    try {
      const res = await window.dh.sshTestGithub({ target: 'host' })
      setTestResult(res.output)
      setTestOk(res.ok)
      if (!res.ok && isGithubPublicKeyDenied(res.output)) {
        await loadPub()
        setStatus(t('identity.githubPublickeyHelp'))
      } else {
        setStatus(res.ok ? t('identity.testSuccess') : humanizeSshError(res.error ?? res.output, t))
      }
    } catch (e) {
      setTestOk(false)
      setStatus(humanizeSshError(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function enableLocalSsh(): Promise<void> {
    if (localSshEnabled) return
    setEnableLocalBusy(true)
    setEnableLocalLog(t('enable.waitingAuth'))
    try {
      const res = await window.dh.sshEnableLocal()
      if (res.ok) {
        setLocalSshEnabled(true)
        setEnableLocalLog(res.log.trim())
      } else {
        setEnableLocalLog(res.log + (res.error ? `\n✗ ${humanizeSshError(res.error, t)}` : ''))
        await probeLocalSshStatus()
      }
    } catch (e) {
      setEnableLocalLog(`✗ ${humanizeSshError(e, t)}`)
      await probeLocalSshStatus()
    } finally {
      setEnableLocalBusy(false)
    }
  }

  async function runDisablePasswordAuth(): Promise<void> {
    setDisablePasswordBusy(true)
    setStatus(t('enable.waitingAuth'))
    try {
      const res = (await window.dh.hostExec({ command: 'security_sshd_disable_password' })) as {
        ok: boolean
        error?: string
      }
      if (!res.ok) {
        const raw = res.error ?? ''
        if (raw.includes('[PKEXEC_NO_AGENT]')) setStatus(t('error.noPolkitAgent'))
        else if (raw.includes('[PKEXEC_CANCELLED]')) setStatus(t('wizard.harden.authCancelled'))
        else setStatus(t('wizard.harden.failed'))
        return
      }
      setStatus(t('wizard.harden.success'))
    } catch {
      setStatus(t('wizard.harden.failed'))
    } finally {
      setDisablePasswordBusy(false)
    }
  }

  async function copyDisablePasswordCmd(): Promise<void> {
    try {
      await navigator.clipboard.writeText(DISABLE_PASSWORD_CMD)
      setPasswordCmdCopied(true)
      setStatus(t('wizard.harden.copied'))
      window.setTimeout(() => setPasswordCmdCopied(false), 2500)
    } catch {
      setStatus(t('wizard.copyFailed'))
    }
  }

  function canProceed(): boolean {
    switch (step) {
      case 1:
        return true
      case 2:
        return Boolean(pubKey.trim())
      case 3:
        return testOk === true || githubSkipped
      case 4:
      case 5:
        return true
      case 6:
        return true
      default:
        return false
    }
  }

  function skipGithub(): void {
    setGithubSkipped(true)
    setStatus(t('wizard.github.skipped'))
  }

  async function finishWizard(): Promise<void> {
    await persist({ completed: true, step: SSH_SETUP_WIZARD_STEPS })
    onComplete()
  }

  function next(): void {
    if (!canProceed()) return
    if (step >= SSH_SETUP_WIZARD_STEPS) {
      void finishWizard()
      return
    }
    setStep((s) => Math.min(s + 1, SSH_SETUP_WIZARD_STEPS))
    setStatus('')
  }

  function back(): void {
    if (step > 1) {
      setStep((s) => s - 1)
      setStatus('')
    }
  }

  return {
    t,
    step,
    setStep,
    hydrated,
    busy,
    status,
    email,
    setEmail,
    pubKey,
    fingerprint,
    testOk,
    testResult,
    githubSkipped,
    localSshEnabled,
    enableLocalLog,
    enableLocalBusy,
    passwordCmdCopied,
    disablePasswordBusy,
    generate,
    copyPub,
    testGithub,
    enableLocalSsh,
    runDisablePasswordAuth,
    copyDisablePasswordCmd,
    skipGithub,
    canProceed,
    next,
    back,
    finishWizard,
    githubUrl: GITHUB_SSH_KEYS_URL,
    disablePasswordCmd: DISABLE_PASSWORD_CMD,
  }
}
