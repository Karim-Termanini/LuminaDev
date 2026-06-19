export type MaintenanceDiagnosticCheck = {
  id: string
  label: string
  ok: boolean
  details: string
  severity?: 'pass' | 'warn' | 'fail'
}

export type MaintenanceDiagnosticAction = {
  labelKey: string
  href: string
}

export type HumanizedMaintenanceDiagnostic = {
  summary: string
  hint: string
  technical: string
  action?: MaintenanceDiagnosticAction
}

type TFn = (key: string, opts?: Record<string, unknown>) => string

function parseBoolFlag(details: string, key: string): boolean | null {
  const m = details.match(new RegExp(`${key}=([a-z]+)`, 'i'))
  if (!m) return null
  return m[1]?.toLowerCase() === 'true'
}

function parseKv(details: string, key: string): string | null {
  const m = details.match(new RegExp(`${key}=([^,\\s]+)`, 'i'))
  return m?.[1] ?? null
}

export function humanizeMaintenanceDiagnostic(
  check: MaintenanceDiagnosticCheck,
  t: TFn,
): HumanizedMaintenanceDiagnostic {
  const technical = check.details
  const base = `diag.${check.id}`

  switch (check.id) {
    case 'docker': {
      const docker = parseBoolFlag(check.details, 'docker')
      const compose = parseBoolFlag(check.details, 'compose')
      const buildx = parseBoolFlag(check.details, 'buildx')
      if (check.ok) {
        return {
          summary: t(`${base}.pass.summary`),
          hint: t(`${base}.pass.hint`, { compose: String(compose ?? true), buildx: String(buildx ?? true) }),
          technical,
        }
      }
      return {
        summary: t(`${base}.fail.summary`),
        hint: t(`${base}.fail.hint`, {
          docker: String(docker ?? false),
          compose: String(compose ?? false),
        }),
        technical,
        action: { labelKey: `${base}.action`, href: '/docker' },
      }
    }
    case 'security': {
      const firewall = parseKv(check.details, 'firewall')
      const sshPassword = parseKv(check.details, 'sshPasswordAuth')
      if (check.ok) {
        return {
          summary: t(`${base}.pass.summary`),
          hint: t(`${base}.pass.hint`),
          technical,
        }
      }
      if (check.severity === 'warn' && firewall === 'active' && sshPassword === 'yes') {
        return {
          summary: t(`${base}.warn.summary`),
          hint: t(`${base}.fail.hintSshPassword`),
          technical,
          action: { labelKey: `${base}.actionSsh`, href: '/ssh?wizard=1' },
        }
      }
      const issues: string[] = []
      if (firewall && firewall !== 'active') issues.push('firewall')
      if (sshPassword === 'yes') issues.push('sshPassword')
      return {
        summary: t(`${base}.fail.summary`),
        hint:
          issues.includes('sshPassword') && issues.includes('firewall')
            ? t(`${base}.fail.hintBoth`)
            : issues.includes('sshPassword')
              ? t(`${base}.fail.hintSshPassword`)
              : issues.includes('firewall')
                ? t(`${base}.fail.hintFirewall`)
                : t(`${base}.fail.hintGeneric`),
        technical,
        action: { labelKey: `${base}.action`, href: '/dashboard/monitor?tab=overview&focus=security' },
      }
    }
    case 'git': {
      const hasName = parseBoolFlag(check.details, 'user.name')
      const hasEmail = parseBoolFlag(check.details, 'user.email')
      if (check.ok) {
        return { summary: t(`${base}.pass.summary`), hint: t(`${base}.pass.hint`), technical }
      }
      return {
        summary: t(`${base}.fail.summary`),
        hint: t(`${base}.fail.hint`, {
          name: String(hasName ?? false),
          email: String(hasEmail ?? false),
        }),
        technical,
        action: { labelKey: `${base}.action`, href: '/git' },
      }
    }
    case 'ssh':
      if (check.ok) {
        return { summary: t(`${base}.pass.summary`), hint: t(`${base}.pass.hint`), technical }
      }
      return {
        summary: t(`${base}.fail.summary`),
        hint: t(`${base}.fail.hint`),
        technical,
        action: { labelKey: `${base}.action`, href: '/ssh' },
      }
    case 'runtimes': {
      const m = check.details.match(/(\d+)\/3/)
      const count = m ? Number(m[1]) : 0
      if (check.ok) {
        return {
          summary: t(`${base}.pass.summary`),
          hint: t(`${base}.pass.hint`, { count }),
          technical,
        }
      }
      return {
        summary: t(`${base}.fail.summary`),
        hint: t(`${base}.fail.hint`, { count }),
        technical,
        action: { labelKey: `${base}.action`, href: '/runtimes' },
      }
    }
    case 'perf': {
      const rss = check.details.match(/rss=(\d+)MB/)?.[1]
      if (check.ok) {
        return {
          summary: t(`${base}.pass.summary`),
          hint: t(`${base}.pass.hint`, { rss: rss ?? '—' }),
          technical,
        }
      }
      return {
        summary: t(`${base}.fail.summary`),
        hint: t(`${base}.fail.hint`, { rss: rss ?? '—' }),
        technical,
      }
    }
    case 'a11y': {
      const unlabeledInputs = Number(check.details.match(/unlabeledInputs=(\d+)/)?.[1] ?? 0)
      const unlabeledButtons = Number(check.details.match(/unlabeledButtons=(\d+)/)?.[1] ?? 0)
      const imagesMissingAlt = Number(check.details.match(/imagesMissingAlt=(\d+)/)?.[1] ?? 0)
      if (check.ok) {
        return { summary: t(`${base}.pass.summary`), hint: t(`${base}.pass.hint`), technical }
      }
      return {
        summary: t(`${base}.fail.summary`),
        hint: t(`${base}.fail.hint`, { unlabeledInputs, unlabeledButtons, imagesMissingAlt }),
        technical,
      }
    }
    default:
      return {
        summary: check.ok ? t('diag.generic.pass') : t('diag.generic.fail'),
        hint: check.details,
        technical,
      }
  }
}
