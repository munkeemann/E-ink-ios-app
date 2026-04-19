import { HoldemPhase } from '../types/holdem';

export type HoleSlot = {
  type: 'hole';
  playerNumber: number;
  cardIndex: 1 | 2;
};

export type CommunitySlot = {
  type: 'community';
  label: string;
  /** The phase at which this sleeve transitions from face-down to face-up */
  revealPhase: HoldemPhase;
};

export type SleeveSlot = HoleSlot | CommunitySlot;

const COMMUNITY_DEFS: Array<{ label: string; revealPhase: HoldemPhase }> = [
  { label: 'Flop 1', revealPhase: 'flop' },
  { label: 'Flop 2', revealPhase: 'flop' },
  { label: 'Flop 3', revealPhase: 'flop' },
  { label: 'Turn',   revealPhase: 'turn' },
  { label: 'River',  revealPhase: 'river' },
];

/**
 * Returns sleeveId → SleeveSlot for a given player count.
 *   Sleeves 1..2N        — hole cards: player k gets sleeves 2k-1 and 2k
 *   Sleeves 2N+1..2N+5   — community: Flop 1/2/3, Turn, River
 */
export function buildSleeveLayout(playerCount: number): Map<number, SleeveSlot> {
  const layout = new Map<number, SleeveSlot>();

  for (let p = 1; p <= playerCount; p++) {
    const base = (p - 1) * 2;
    layout.set(base + 1, { type: 'hole', playerNumber: p, cardIndex: 1 });
    layout.set(base + 2, { type: 'hole', playerNumber: p, cardIndex: 2 });
  }

  const communityBase = playerCount * 2;
  COMMUNITY_DEFS.forEach((def, i) => {
    layout.set(communityBase + i + 1, { type: 'community', ...def });
  });

  return layout;
}

export function totalSleeveCount(playerCount: number): number {
  return playerCount * 2 + 5;
}

const PHASE_ORDER: Record<HoldemPhase, number> = {
  pre_deal: 0, dealt: 1, flop: 2, turn: 3, river: 4, showdown: 5,
};

/** True when the sleeve should be showing its face (not face-down) in the given phase. */
export function isFaceUp(slot: SleeveSlot, phase: HoldemPhase): boolean {
  if (slot.type === 'hole') return PHASE_ORDER[phase] >= PHASE_ORDER['dealt'];
  return PHASE_ORDER[phase] >= PHASE_ORDER[slot.revealPhase];
}
