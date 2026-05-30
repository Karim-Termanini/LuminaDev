import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SshBookmark } from '@linux-dev-home/shared'
import { parseSshBookmarks } from '@linux-dev-home/shared'
import { useTranslation } from 'react-i18next'
import { SettingsCard, SettingsDataTable, SettingsStack } from './SettingsUi'

export function SettingsRemote(): ReactElement {
  const { t } = useTranslation('settings')
  const [bookmarks, setBookmarks] = useState<SshBookmark[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'ssh_bookmarks' }).then((bm) => {
      if (bm.ok) {
        setBookmarks(parseSshBookmarks(bm.data))
      } else {
        setBookmarks([])
        setLoadError(bm.error ?? t('remote.loadError'))
      }
    })
  }, [t])

  return (
    <SettingsStack>
      <SettingsCard
        title={t('remote.savedBookmarks', { count: bookmarks.length })}
        description={t('shell.remoteSubtitle')}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Link to="/ssh" className="hp-btn hp-btn-primary" style={{ textDecoration: 'none' }}>
            <span className="codicon codicon-arrow-right" aria-hidden /> {t('remote.manageOnSsh')}
          </Link>
        </div>
        {loadError ? <div className="hp-status-alert error">{loadError}</div> : null}
        {bookmarks.length === 0 && !loadError ? (
          <p className="settings-feedback settings-feedback-muted" style={{ margin: 0 }}>{t('remote.noBookmarks')}</p>
        ) : null}
        {bookmarks.length > 0 ? (
          <SettingsDataTable>
            <thead>
              <tr>
                <th>{t('remote.name')}</th>
                <th>{t('remote.target')}</th>
                <th style={{ width: 72 }}>{t('remote.port')}</th>
              </tr>
            </thead>
            <tbody>
              {bookmarks.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600 }}>{b.name}</td>
                  <td className="mono">{b.user}@{b.host}</td>
                  <td>{b.port}</td>
                </tr>
              ))}
            </tbody>
          </SettingsDataTable>
        ) : null}
      </SettingsCard>
    </SettingsStack>
  )
}
