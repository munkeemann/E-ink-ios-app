/**
 * Shared UI palette for E-Cards. Consumed by all four game sections plus the
 * landing screen. MTG game-state colors (zones) live in src/mtg/zoneColors.ts;
 * mana letters (W/U/B/R/G) live inline in the in-game screen as game data.
 */
export const colors = {
  bg: {
    app:      '#060c14',
    surface:  '#071a2a',
    elevated: '#0c2340',
  },
  text: {
    primary:   '#e0f7ff',
    secondary: '#64b5c8',
    muted:     '#3a6070',
    disabled:  '#444',
  },
  accent: {
    primary: '#22d3ee',
    dark:    '#0e7490',
  },
  border:  '#3a6070',
  divider: '#1a2535',
  status: {
    warning: '#f59e0b',
    danger:  '#f87171',
    success: '#6ee7b7',
  },
  overlay: {
    accent40: 'rgba(34,211,238,0.4)',
    accent50: 'rgba(34,211,238,0.5)',
    dark:     'rgba(0,0,0,0.6)',
    darker:   'rgba(0,0,0,0.92)',
    light:    'rgba(255,255,255,0.12)',
  },
};
