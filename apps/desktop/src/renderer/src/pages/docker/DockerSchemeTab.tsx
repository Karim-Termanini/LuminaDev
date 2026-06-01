import type { ContainerRow, NetworkRow } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'

import { DockerSchemeView } from '../../components/DockerSchemeView'

interface DockerSchemeTabProps {
  t: (key: string, options?: Record<string, unknown>) => string
  rows: ContainerRow[]
  networks: NetworkRow[]
}

const tableWrap = {
  width: '100%',
  overflowX: 'auto' as const,
}

const table = {
  width: '100%',
  minWidth: 760,
  borderCollapse: 'collapse' as const,
  fontSize: 13,
  tableLayout: 'fixed' as const,
}

const monoCell = {
  fontSize: 11,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

export function DockerSchemeTab({ t, rows, networks }: DockerSchemeTabProps): ReactElement {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <DockerSchemeView containers={rows} networks={networks} />
      <div className="hp-card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('scheme.relationship')}</div>
        {rows.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('scheme.none')}</div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>{t('scheme.col.container')}</th>
                  <th>{t('scheme.col.image')}</th>
                  <th>{t('scheme.col.networks')}</th>
                  <th>{t('scheme.col.volumes')}</th>
                  <th>{t('scheme.col.ports')}</th>
                  <th>{t('scheme.col.state')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 6px', fontWeight: 600 }}>{r.name}</td>
                    <td className="mono" style={monoCell} title={r.image}>
                      {r.image}
                    </td>
                    <td
                      className="mono"
                      style={monoCell}
                      title={(r.networks ?? []).join(', ')}
                    >
                      {(r.networks ?? []).length > 0 ? (r.networks ?? []).join(', ') : '—'}
                    </td>
                    <td
                      className="mono"
                      style={monoCell}
                      title={(r.volumes ?? []).join(', ')}
                    >
                      {(r.volumes ?? []).length > 0 ? (r.volumes ?? []).join(', ') : '—'}
                    </td>
                    <td className="mono" style={monoCell} data-ltr title={r.ports}>
                      {r.ports}
                    </td>
                    <td>{t(`common:status.${r.state}`, { defaultValue: r.state })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
