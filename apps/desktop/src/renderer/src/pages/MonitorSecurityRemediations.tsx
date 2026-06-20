import type { HostSecuritySnapshot } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { buildSecurityRemediations, type SecurityRemediationItem } from './securityRemediation'

function humanizeHostExecError(raw: string, t: (key: string) => string): string {
  if (raw.includes('[PKEXEC_NO_AGENT]')) return t('security.fix.noPolkitAgent')
  if (raw.includes('[PKEXEC_CANCELLED]')) return t('security.fix.authCancelled')
  if (raw.includes('[HOST_COMMAND_TIMEOUT]')) return t('security.fix.timeout')
  return raw.replace(/^\[[A-Z_]+\]\s*/, '').trim() || t('security.fix.failed')
}

export function MonitorSecurityRemediations({
  security,
  onRefresh,
}: {
  security: HostSecuritySnapshot | null
  onRefresh: () => void
}): ReactElement | null {
  const { t } = useTranslation('monitor')
  const items = buildSecurityRemediations(security)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    null
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [fallbackId, setFallbackId] = useState<string | null>(null)

  useEffect(() => {
    if (status?.tone !== 'ok') return
    const stillNeedsFix = items.some(
      (i) => i.kind === 'enableUfw' || i.kind === 'hostExec'
    )
    if (!stillNeedsFix) setStatus(null)
  }, [items, status])

  if (items.length === 0) return null

  async function runHostExec(item: SecurityRemediationItem): Promise<void> {
    if (!item.hostExecCommand) return
    setBusyId(item.id)
    setStatus({ tone: 'info', text: t('security.fix.waitingAuth') })
    setFallbackId(null)
    try {
      const res = (await window.dh.hostExec({ command: item.hostExecCommand })) as {
        ok: boolean
        result?: string
        error?: string
      }
      if (!res.ok) {
        const msg = humanizeHostExecError(res.error ?? t('security.fix.failed'), t)
        setStatus({ tone: 'error', text: msg })
        if (item.fallbackCommand) setFallbackId(item.id)
        return
      }
      setStatus({
        tone: 'ok',
        text: t(item.successKey ?? 'security.fix.passwordDisabled'),
      })
      onRefresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('security.fix.failed')
      setStatus({ tone: 'error', text: humanizeHostExecError(msg, t) })
      if (item.fallbackCommand) setFallbackId(item.id)
    } finally {
      setBusyId(null)
    }
  }

  async function enableUfw(fallbackCommand?: string): Promise<void> {
    setBusyId('firewall')
    setStatus({ tone: 'info', text: t('security.fix.waitingAuth') })
    setFallbackId(null)
    try {
      const res = (await window.dh.hostExec({ command: 'security_ufw_enable' })) as {
        ok: boolean
        result?: string
        error?: string
      }
      if (!res.ok) {
        const msg = humanizeHostExecError(res.error ?? t('security.fix.failed'), t)
        setStatus({ tone: 'error', text: msg })
        if (fallbackCommand) setFallbackId('firewall')
        return
      }
      setStatus({ tone: 'ok', text: t('security.fix.firewallEnabled') })
      onRefresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('security.fix.failed')
      setStatus({ tone: 'error', text: humanizeHostExecError(msg, t) })
      if (fallbackCommand) setFallbackId('firewall')
    } finally {
      setBusyId(null)
    }
  }

  async function copyCommand(id: string, command: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(command)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setStatus({ tone: 'error', text: t('security.fix.copyFailed') })
    }
  }

  const firewallItem = items.find((i) => i.id === 'firewall')
  const showSshPasswordGuide = items.some((i) => i.id === 'ssh-keys' || i.id === 'ssh-password-off')
  const sshGuideKey = security?.sshHostKeyPresent
    ? 'security.fix.sshPasswordGuideKeyReady'
    : 'security.fix.sshPasswordGuide'
  const fallbackItem = fallbackId ? items.find((i) => i.id === fallbackId) : null

  return (
    <div className="monitor-security-fixes">
      <div className="monitor-panel-block-title">{t('security.fix.title')}</div>
      <p className="hp-muted monitor-security-fixes-lead">{t('security.fix.lead')}</p>
      {showSshPasswordGuide ? (
        <div className="monitor-security-fix-guide">
          <div className="monitor-security-fix-guide-title">{t('security.fix.sshPasswordGuideTitle')}</div>
          <p className="monitor-security-fix-guide-body">{t(sshGuideKey)}</p>
        </div>
      ) : null}
      <div className="monitor-security-fixes-list">
        {items.map((item) => (
          <div key={item.id} className="monitor-security-fix-row">
            {item.step ? (
              <div className="monitor-security-fix-step" aria-hidden>
                {item.step}
              </div>
            ) : null}
            <div className="monitor-security-fix-row-body">
            <p className="monitor-security-fix-hint">{t(item.hintKey, item.hintParams)}</p>
            <div className="monitor-security-fix-actions">
              {item.kind === 'enableUfw' ? (
                <button
                  type="button"
                  className="hp-btn hp-btn-primary"
                  disabled={busyId !== null}
                  onClick={() => void enableUfw(item.fallbackCommand)}
                >
                  <span className="codicon codicon-shield" aria-hidden />
                  {busyId === item.id ? t('security.fix.running') : t(item.actionKey)}
                </button>
              ) : null}
              {item.kind === 'hostExec' && item.hostExecCommand ? (
                <>
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    disabled={busyId !== null}
                    onClick={() => void runHostExec(item)}
                  >
                    <span className="codicon codicon-lock" aria-hidden />
                    {busyId === item.id ? t('security.fix.running') : t(item.actionKey)}
                  </button>
                  {item.command && item.actionKeyCopy ? (
                    <button
                      type="button"
                      className="hp-btn"
                      disabled={busyId !== null}
                      onClick={() => void copyCommand(item.id, item.command!)}
                    >
                      <span className="codicon codicon-copy" aria-hidden />
                      {copiedId === item.id ? t('security.fix.copied') : t(item.actionKeyCopy)}
                    </button>
                  ) : null}
                </>
              ) : null}
              {item.kind === 'navigate' && item.href ? (
                <Link to={item.href} className="hp-btn hp-btn-primary" style={{ textDecoration: 'none' }}>
                  <span className="codicon codicon-arrow-right" aria-hidden />
                  {t(item.actionKey)}
                </Link>
              ) : null}
              {item.kind === 'copyCommand' && item.command ? (
                <button
                  type="button"
                  className="hp-btn"
                  onClick={() => void copyCommand(item.id, item.command!)}
                >
                  <span className="codicon codicon-copy" aria-hidden />
                  {copiedId === item.id ? t('security.fix.copied') : t(item.actionKey)}
                </button>
              ) : null}
            </div>
            </div>
          </div>
        ))}
      </div>
      {status ? (
        <div
          className={`monitor-security-fix-status is-${status.tone}`}
          role="status"
          aria-live="polite"
        >
          {status.text}
        </div>
      ) : null}
      {fallbackId === 'firewall' && firewallItem?.fallbackCommand ? (
        <div className="monitor-security-fix-fallback">
          <p className="hp-muted">{t('security.fix.fallbackHint')}</p>
          <button
            type="button"
            className="hp-btn"
            onClick={() => void copyCommand('firewall-fallback', firewallItem.fallbackCommand!)}
          >
            <span className="codicon codicon-copy" aria-hidden />
            {copiedId === 'firewall-fallback'
              ? t('security.fix.copied')
              : t('security.fix.copyFallback')}
          </button>
        </div>
      ) : null}
      {fallbackItem?.fallbackCommand && fallbackId !== 'firewall' ? (
        <div className="monitor-security-fix-fallback">
          <p className="hp-muted">{t('security.fix.fallbackHint')}</p>
          <button
            type="button"
            className="hp-btn"
            onClick={() => void copyCommand(`${fallbackItem.id}-fallback`, fallbackItem.fallbackCommand!)}
          >
            <span className="codicon codicon-copy" aria-hidden />
            {copiedId === `${fallbackItem.id}-fallback`
              ? t('security.fix.copied')
              : t('security.fix.copyFallback')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
