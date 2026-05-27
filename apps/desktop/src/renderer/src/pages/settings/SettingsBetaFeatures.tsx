import React, { useEffect, useState } from 'react';
import { assertSettingsOk } from '../settingsContract';
import { useTranslation } from 'react-i18next';

const Flags = [
  {
    key: 'enable_experimental_terminal_multiplexer',
    labelKey: 'beta.labelExperimentalTerminalMultiplexer',
    descKey: 'beta.descExperimentalTerminalMultiplexer',
  },
  {
    key: 'enable_ai_commit_suggestions',
    labelKey: 'beta.labelAiCommitSuggestions',
    descKey: 'beta.descAiCommitSuggestions',
  },
  {
    key: 'enable_profile_auto_switch',
    labelKey: 'beta.labelAutoSwitchProfile',
    descKey: 'beta.descAutoSwitchProfile',
  },
];

export const SettingsBetaFeatures: React.FC = () => {
  const { t } = useTranslation('settings')
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loadFlags = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await window.dh.storeGet({ key: 'beta_features_state' });
        assertSettingsOk(res);
        setFlags((res.data as Record<string, boolean>) ?? {});
      } catch (e) {
        setError(e instanceof Error ? e.message : t('beta.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    loadFlags();
  }, [t]);

  const handleToggle = async (key: string) => {
    try {
      setSaving((prev) => ({ ...prev, [key]: true }));
      const res = await window.dh.storeSet({
        key: 'beta_features_state',
        data: { ...flags, [key]: !flags[key] },
      });
      assertSettingsOk(res);
      setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('beta.saveFailed'));
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading) {
    return <div className="hp-settings-loading">{t('beta.loading')}</div>;
  }

  return (
    <div className="hp-settings-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(234, 88, 12, 0.08)', border: '1px solid rgba(234, 88, 12, 0.25)', borderRadius: 6, fontSize: 12, color: 'var(--orange, #ea580c)', marginBottom: 16 }}>
        <span className="codicon codicon-warning" />
        {t('beta.warning')}
      </div>
      {error && (
        <div className="hp-status-alert error" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(248, 81, 73, 0.1)', border: '1px solid var(--red)', borderRadius: 6, fontSize: 13, color: 'var(--red)', marginBottom: 16 }}>
          <span className="codicon codicon-error" />
          <span>{error}</span>
        </div>
      )}
      <form className="hp-settings-form">
        {Flags.map(({ key, labelKey, descKey }) => (
          <div key={key} className="hp-settings-row">
            <div className="hp-settings-row-label">
              <label>{t(labelKey)}</label>
              {descKey && t(descKey) && (
                <span className="hp-settings-row-description">{t(descKey)}</span>
              )}
            </div>
            <div className="hp-settings-row-control">
              <input
                type="checkbox"
                checked={flags[key] ?? false}
                onChange={() => handleToggle(key)}
                disabled={saving[key]}
                className="hp-toggle"
              />
            </div>
          </div>
        ))}
      </form>
    </div>
  );
};