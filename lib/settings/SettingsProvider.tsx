'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  OptionCategory,
  mergeSettings,
  toLabelMap,
} from '@/lib/settings/defaults';

interface SettingsContextValue {
  settings: AppSettings;
  /** { value: label } maps derived from the live options, for display lookups. */
  labelMaps: Record<OptionCategory, Record<string, string>>;
  loading: boolean;
  /** Re-fetch from the server (call after saving from the editor). */
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (!res.ok) return; // keep current (defaults) on failure
      const json = await res.json();
      setSettings(mergeSettings(json));
    } catch {
      /* keep defaults on network error */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const labelMaps = useMemo(() => {
    const out = {} as Record<OptionCategory, Record<string, string>>;
    (Object.keys(settings.options) as OptionCategory[]).forEach(cat => {
      out[cat] = toLabelMap(settings.options[cat]);
    });
    return out;
  }, [settings]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, labelMaps, loading, refresh }),
    [settings, labelMaps, loading, refresh],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** Access the live (merged) settings. Falls back to defaults outside a provider. */
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (ctx) return ctx;
  // Defensive fallback so a component used outside the provider never crashes.
  const labelMaps = {} as Record<OptionCategory, Record<string, string>>;
  (Object.keys(DEFAULT_SETTINGS.options) as OptionCategory[]).forEach(cat => {
    labelMaps[cat] = toLabelMap(DEFAULT_SETTINGS.options[cat]);
  });
  return {
    settings: DEFAULT_SETTINGS,
    labelMaps,
    loading: false,
    refresh: async () => {},
  };
}
