/**
 * MTG zone identifier colors. Game data, not UI palette — these tag the six
 * zones in ZONE_CONFIG (app/game/[id].tsx) for tile borders, badges, and
 * descriptor strips. Distinct from src/theme/colors.ts.
 */
export const ZONE_COLORS: Record<'CMD' | 'LIB' | 'HND' | 'BTFLD' | 'GRV' | 'EXL', string> = {
  CMD:   '#f59e0b',
  LIB:   '#3b82f6',
  HND:   '#22c55e',
  BTFLD: '#e2e8f0',
  GRV:   '#9ca3af',
  EXL:   '#f97316',
};
