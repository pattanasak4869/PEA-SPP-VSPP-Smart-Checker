
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { safeGetLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize state synchronously to avoid flash
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = safeGetLocalStorage('app_theme');
    if (saved === 'light' || saved === 'dark') {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(saved);
      }
      return saved as Theme;
    }
    
    if (typeof window !== 'undefined') {
       const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
       const defaultTheme = sysDark ? 'dark' : 'light';
       document.documentElement.classList.add(defaultTheme);
       return defaultTheme;
    }
    return 'dark';
  });

  const setTheme = (newTheme: Theme) => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(newTheme);
    safeSetLocalStorage('app_theme', newTheme);
    setThemeState(newTheme);
  };

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    toggleTheme,
    setTheme
  }), [theme, toggleTheme]);

  // Sync if system preference changes while app is open (optional but good UX)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
        if (!safeGetLocalStorage('app_theme')) {
            setTheme(mediaQuery.matches ? 'dark' : 'light');
        }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
