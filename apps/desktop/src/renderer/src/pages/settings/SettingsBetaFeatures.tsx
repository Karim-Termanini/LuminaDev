import React, { useEffect, useState } from 'react';
import { assertSettingsOk } from '../settingsContract';

const Flags = [
  {
    key: 'enable_experimental_terminal_multiplexer',
    label: 'Experimental Terminal multiplexer',
    description: 'xterm.js multi-pane',
  },
  {
    key: 'enable_ai_commit_suggestions',
    label: 'AI commit suggestions',
    description: 'requires API key',
  },
  {
    key: 'enable_profile_auto_switch',
    label: 'Auto-switch profile on project directory change',
    description: '',
  },
];

export const SettingsBetaFeatures: React.FC = () => {
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
        setError(e instanceof Error ? e.message : 'Failed to load flags');
      } finally {
        setLoading(false);
      }
    };

    loadFlags();
  }, []);

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
      setError(e instanceof Error ? e.message : 'Failed to save flag');
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading) {
    return <div className="hp-settings-loading">Loading…</div>;
  }

  return (
    <div className="hp-settings-page">
      {error && (
        <div className="hp-status-alert error" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(248, 81, 73, 0.1)', border: '1px solid var(--red)', borderRadius: 6, fontSize: 13, color: 'var(--red)', marginBottom: 16 }}>
          <span className="codicon codicon-error" />
          <span>{error}</span>
        </div>
      )}
      <form className="hp-settings-form">
        {Flags.map(({ key, label, description }) => (
          <div key={key} className="hp-settings-row">
            <div className="hp-settings-row-label">
              <label>{label}</label>
              {description && (
                <span className="hp-settings-row-description">{description}</span>
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