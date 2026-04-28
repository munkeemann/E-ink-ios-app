/**
 * Shared UI palette for E-Cards. Two themes today: 'default' (cyan/teal,
 * SAM1-78) and 'slate' (cream-on-slate, SAM1-79). Theme name is part of
 * AppSettings (see src/storage/deckStorage.ts).
 *
 * Reactivity (SAM1-79 Option A): consumers read the active theme via
 * useTheme(), and wrap their StyleSheet.create call in
 * useMemo(() => StyleSheet.create({...}), [colors]) so styles re-evaluate
 * when the theme changes. ThemeProvider wraps the app in app/_layout.tsx
 * and broadcasts updates to all consumers.
 *
 * MTG game-state colors (zones) live in src/mtg/zoneColors.ts; mana
 * letters (W/U/B/R/G) live inline in the in-game screen as game data.
 */
import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadSettings, saveSettings } from '../storage/deckStorage';

export type ThemeName = 'default' | 'slate';

export type Theme = {
  bg: { app: string; surface: string; elevated: string };
  text: { primary: string; secondary: string; muted: string; disabled: string };
  accent: { primary: string; dark: string };
  border: string;
  divider: string;
  status: { warning: string; danger: string; success: string };
  overlay: {
    accent40: string;
    accent50: string;
    dark: string;
    darker: string;
    light: string;
  };
};

const DEFAULT_THEME: Theme = {
  bg: { app: '#060c14', surface: '#071a2a', elevated: '#0c2340' },
  text: { primary: '#e0f7ff', secondary: '#64b5c8', muted: '#3a6070', disabled: '#444' },
  accent: { primary: '#22d3ee', dark: '#0e7490' },
  border: '#3a6070',
  divider: '#1a2535',
  status: { warning: '#f59e0b', danger: '#f87171', success: '#6ee7b7' },
  overlay: {
    accent40: 'rgba(34,211,238,0.4)',
    accent50: 'rgba(34,211,238,0.5)',
    dark: 'rgba(0,0,0,0.6)',
    darker: 'rgba(0,0,0,0.92)',
    light: 'rgba(255,255,255,0.12)',
  },
};

const SLATE_THEME: Theme = {
  bg: { app: '#2E343A', surface: '#3A4047', elevated: '#454C54' },
  text: { primary: '#E8DDC9', secondary: '#C4B89F', muted: '#9DA5AE', disabled: '#5A626C' },
  accent: { primary: '#E8DDC9', dark: '#C4B89F' },
  border: '#5A626C',
  divider: '#444B53',
  status: { warning: '#f59e0b', danger: '#C97468', success: '#7B9D7E' },
  overlay: {
    accent40: 'rgba(232,221,201,0.4)',
    accent50: 'rgba(232,221,201,0.5)',
    dark: 'rgba(31,36,41,0.6)',
    darker: 'rgba(31,36,41,0.92)',
    light: 'rgba(255,255,255,0.12)',
  },
};

export const THEMES: Record<ThemeName, Theme> = {
  default: DEFAULT_THEME,
  slate: SLATE_THEME,
};

type ThemeCtx = {
  theme: Theme;
  themeName: ThemeName;
  setThemeName: (n: ThemeName) => Promise<void>;
};

const ThemeContext = createContext<ThemeCtx>({
  theme: DEFAULT_THEME,
  themeName: 'default',
  setThemeName: async () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>('default');

  useEffect(() => {
    loadSettings().then(s => {
      if (s.theme && s.theme in THEMES) setThemeNameState(s.theme);
    });
  }, []);

  const setThemeName = async (n: ThemeName) => {
    const s = await loadSettings();
    await saveSettings({ ...s, theme: n });
    setThemeNameState(n);
  };

  const value = useMemo<ThemeCtx>(() => ({
    theme: THEMES[themeName],
    themeName,
    setThemeName,
  }), [themeName]);

  // createElement instead of JSX so this file stays .ts (no rename, no
  // import-path churn across the 15 consumer files).
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

export function useThemeName(): ThemeName {
  return useContext(ThemeContext).themeName;
}

export function useSetThemeName(): (n: ThemeName) => Promise<void> {
  return useContext(ThemeContext).setThemeName;
}

/**
 * Backward-compatibility alias for code that still does
 * `import { colors } from '.../theme/colors'`. Returns the DEFAULT theme.
 * New code should call useTheme() to get the active theme. This export
 * exists only so non-React-component code (helper functions outside the
 * component tree) can keep working — it does not respect the user's
 * theme selection. All UI surfaces must use useTheme().
 */
export const colors = DEFAULT_THEME;
