import { DndClass } from '../types/dnd';

export const PREPARED_CASTERS: ReadonlySet<DndClass> = new Set<DndClass>([
  'Cleric', 'Druid', 'Wizard', 'Paladin',
]);

// Cantrips known per (class, level). Index 0 = level 1, …, index 19 = level 20.
// Paladin and Ranger do not learn cantrips at any level.
const CANTRIPS_KNOWN: Record<DndClass, number[]> = {
  //         L1 L2 L3 L4 L5 L6 L7 L8 L9 L10 L11 L12 L13 L14 L15 L16 L17 L18 L19 L20
  Bard:     [ 2, 2, 2, 3, 3, 3, 3, 3, 3,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4 ],
  Cleric:   [ 3, 3, 3, 4, 4, 4, 4, 4, 4,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5 ],
  Druid:    [ 2, 2, 2, 3, 3, 3, 3, 3, 3,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4 ],
  Paladin:  [ 0, 0, 0, 0, 0, 0, 0, 0, 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0 ],
  Ranger:   [ 0, 0, 0, 0, 0, 0, 0, 0, 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0 ],
  Sorcerer: [ 4, 4, 4, 5, 5, 5, 5, 5, 5,  6,  6,  6,  6,  6,  6,  6,  6,  6,  6,  6 ],
  Warlock:  [ 2, 2, 2, 3, 3, 3, 3, 3, 3,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4 ],
  Wizard:   [ 3, 3, 3, 4, 4, 4, 4, 4, 4,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5 ],
};

// Spells KNOWN per (class, level) — only for known casters.
// Bard is PHB 2014 p.53; Ranger starts casting at L2 (L1=0); Sorcerer PHB 2014 p.101;
// Warlock PHB 2014 p.107.
const SPELLS_KNOWN: Record<'Bard' | 'Ranger' | 'Sorcerer' | 'Warlock', number[]> = {
  //         L1 L2 L3 L4 L5 L6 L7 L8 L9 L10 L11 L12 L13 L14 L15 L16 L17 L18 L19 L20
  Bard:     [ 4, 5, 6, 7, 8, 9,10,11,12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22 ],
  Ranger:   [ 0, 2, 3, 3, 4, 4, 5, 5, 6,  6,  7,  7,  8,  8,  9,  9, 10, 10, 11, 11 ],
  Sorcerer: [ 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15 ],
  Warlock:  [ 2, 3, 4, 5, 6, 7, 8, 9,10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15 ],
};

function clampLevel(level: number): number {
  return Math.max(1, Math.min(20, level));
}

export function cantripsKnown(className: DndClass, level: number): number {
  return CANTRIPS_KNOWN[className][clampLevel(level) - 1];
}

export function spellsKnownOrPrepared(
  className: DndClass,
  level: number,
  abilityMod: number,
): { count: number; label: 'known' | 'prepared' } {
  const L = clampLevel(level);
  switch (className) {
    case 'Bard':
    case 'Ranger':
    case 'Sorcerer':
    case 'Warlock':
      return { count: SPELLS_KNOWN[className][L - 1], label: 'known' };
    case 'Cleric':
    case 'Druid':
    case 'Wizard':
      return { count: Math.max(1, L + abilityMod), label: 'prepared' };
    case 'Paladin':
      if (L < 2) return { count: 0, label: 'prepared' };
      return { count: Math.max(1, Math.floor(L / 2) + abilityMod), label: 'prepared' };
  }
}

// Max spell slot level per (class, level).
// Full casters (Bard, Cleric, Druid, Sorcerer, Wizard): ceil(level/2), capped at 9.
// Half-casters (Paladin, Ranger): 0 at L1, 1st/2nd/3rd/4th/5th at L2-4/5-8/9-12/13-16/17-20.
// Warlock: ceil(level/2) capped at 5 (Mystic Arcanum not modeled in this phase).
export function maxSpellLevel(className: DndClass, level: number): number {
  const L = clampLevel(level);
  switch (className) {
    case 'Bard':
    case 'Cleric':
    case 'Druid':
    case 'Sorcerer':
    case 'Wizard':
      return Math.min(9, Math.ceil(L / 2));
    case 'Paladin':
    case 'Ranger':
      if (L < 2) return 0;
      if (L <= 4) return 1;
      if (L <= 8) return 2;
      if (L <= 12) return 3;
      if (L <= 16) return 4;
      return 5;
    case 'Warlock':
      return Math.min(5, Math.ceil(L / 2));
  }
}
