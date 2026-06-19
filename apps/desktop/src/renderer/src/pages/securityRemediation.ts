import type { HostExecCommand, HostSecuritySnapshot } from '@linux-dev-home/shared'

export type SecurityRemediationKind = 'enableUfw' | 'copyCommand' | 'navigate' | 'hostExec'

export type SecurityRemediationItem = {
  id: string
  hintKey: string
  hintParams?: Record<string, unknown>
  actionKey: string
  /** Secondary copy action label (hostExec items). */
  actionKeyCopy?: string
  kind: SecurityRemediationKind
  command?: string
  hostExecCommand?: HostExecCommand
  /** Shown after successful hostExec (i18n key). */
  successKey?: string
  /** Terminal fallback when pkexec / polkit is unavailable */
  fallbackCommand?: string
  href?: string
  /** Beginner-facing order within a fix group (e.g. SSH hardening 1 → 2). */
  step?: number
}

const DISABLE_PASSWORD_FALLBACK =
  "sudo sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo systemctl reload sshd"

const DISABLE_ROOT_FALLBACK =
  "sudo sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && sudo systemctl reload sshd"

export function buildSecurityRemediations(security: HostSecuritySnapshot | null): SecurityRemediationItem[] {
  if (!security) return []
  const items: SecurityRemediationItem[] = []

  if (security.firewall !== 'active') {
    items.push({
      id: 'firewall',
      hintKey: 'security.fix.firewallHint',
      actionKey: 'security.fix.enableFirewall',
      kind: 'enableUfw',
      fallbackCommand:
        'sudo ufw allow OpenSSH 2>/dev/null || sudo ufw allow ssh; sudo ufw --force enable && sudo ufw status',
    })
  }

  if (security.sshPasswordAuth === 'yes') {
    if (!security.sshHostKeyPresent) {
      items.push({
        id: 'ssh-keys',
        step: 1,
        hintKey: 'security.fix.sshPasswordHint',
        actionKey: 'security.fix.setupSshKeys',
        kind: 'navigate',
        href: '/ssh?wizard=1',
      })
    }
    items.push({
      id: 'ssh-password-off',
      step: security.sshHostKeyPresent ? 1 : 2,
      hintKey: security.sshHostKeyPresent
        ? 'security.fix.sshPasswordDisableHintKeyReady'
        : 'security.fix.sshPasswordDisableHint',
      actionKey: 'security.fix.disablePasswordLogin',
      actionKeyCopy: 'security.fix.copyDisablePasswordCmd',
      kind: 'hostExec',
      hostExecCommand: 'security_sshd_disable_password',
      successKey: 'security.fix.passwordDisabled',
      fallbackCommand: DISABLE_PASSWORD_FALLBACK,
      command: DISABLE_PASSWORD_FALLBACK,
    })
  }

  if (security.sshPermitRootLogin === 'yes') {
    items.push({
      id: 'ssh-root-off',
      hintKey: 'security.fix.sshRootHint',
      actionKey: 'security.fix.disableRootLogin',
      actionKeyCopy: 'security.fix.copyDisableRootCmd',
      kind: 'hostExec',
      hostExecCommand: 'security_sshd_disable_root',
      successKey: 'security.fix.rootDisabled',
      fallbackCommand: DISABLE_ROOT_FALLBACK,
      command: DISABLE_ROOT_FALLBACK,
    })
  }

  if ((security.riskyOpenPorts?.length ?? 0) > 0) {
    items.push({
      id: 'risky-ports',
      hintKey: 'security.fix.riskyPortsHint',
      hintParams: { ports: security.riskyOpenPorts.join(', ') },
      actionKey: 'security.fix.openDocker',
      kind: 'navigate',
      href: '/docker',
    })
  }

  return items
}
