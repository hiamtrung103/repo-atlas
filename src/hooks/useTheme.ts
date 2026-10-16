import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
const STORAGE_KEY = 'repo-atlas:theme';
const validPreference = (value: string | null | undefined): ThemePreference =>
  value === 'light' || value === 'dark' ? value : 'system';

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    validPreference(document.documentElement.dataset.themePreference),
  );
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const resolvedTheme: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(query.matches);
    query.addEventListener('change', update);
    update();
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setPreference(validPreference(event.newValue));
      }
    };
    window.addEventListener('storage', sync);
    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = preference;
    root.style.colorScheme = resolvedTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedTheme === 'light' ? '#f5f7f2' : '#101312');
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* Appearance still works without persistent storage. */
    }
  }, [preference, resolvedTheme]);

  return { preference, setPreference, resolvedTheme };
}
