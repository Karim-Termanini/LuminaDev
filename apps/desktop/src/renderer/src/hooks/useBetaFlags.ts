import { useEffect, useState } from 'react';

export const useBetaFlags = () => {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFlags = async () => {
      try {
        setLoading(true);
        const res = await window.dh.storeGet({ key: 'beta_features_state' });
        if (res.ok && res.data && typeof res.data === 'object') {
          setFlags(res.data as Record<string, boolean>);
        } else {
          setFlags({});
        }
      } catch (e) {
        console.error('Failed to load beta features:', e);
        setFlags({});
      } finally {
        setLoading(false);
      }
    };

    loadFlags();
  }, []);

  return flags;
};