/* eslint-disable react-refresh/only-export-components -- context exports provider + hook */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

const STORAGE_KEY = 'bench-theme';

/** Theme identifier. */
export type ThemeId = 'tokyo-night' | 'tokyo-day';

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function loadStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return 'tokyo-night';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'tokyo-day' || stored === 'tokyo-night') return stored;
  return 'tokyo-night';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(loadStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'tokyo-night') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) =>
      prev === 'tokyo-night' ? 'tokyo-day' : 'tokyo-night'
    );
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
