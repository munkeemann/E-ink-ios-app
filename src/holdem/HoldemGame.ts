import { PlayingCard, HoldemGameState, HoldemPhase, Rank, Suit } from '../types/holdem';
import {
  buildSleeveLayout,
  isFaceUp,
  SleeveSlot,
} from './HoldemSleeveLayout';
import {
  Descriptor,
  faceDownDescriptor,
  holdemHoleDescriptor,
  holdemCommunityDescriptor,
} from '../api/sleeveService';

// ── Deck utilities ───────────────────────────────────────────────────────────

const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','T','J','Q','K'];
const SUITS: Suit[] = ['S','H','D','C'];

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠', H: '♥', D: '♦', C: '♣',
};

export function cardLabel(card: PlayingCard): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

function freshDeck(): PlayingCard[] {
  const deck: PlayingCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  return deck;
}

function shuffleDeck(deck: PlayingCard[]): PlayingCard[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ── Phase machine ────────────────────────────────────────────────────────────

const PHASE_SEQUENCE: HoldemPhase[] = [
  'pre_deal', 'dealt', 'flop', 'turn', 'river', 'showdown',
];

export const PHASE_BUTTON_LABEL: Record<HoldemPhase, string> = {
  pre_deal: 'Deal',
  dealt:    'Flop',
  flop:     'Turn',
  turn:     'River',
  river:    'Showdown',
  showdown: 'New Hand',
};

function nextPhase(phase: HoldemPhase): HoldemPhase {
  const idx = PHASE_SEQUENCE.indexOf(phase);
  return PHASE_SEQUENCE[(idx + 1) % PHASE_SEQUENCE.length];
}

// ── Game creation ────────────────────────────────────────────────────────────

/** Shuffle and assign one card to every sleeve for a fresh hand. */
export function createGame(playerCount: number, cardSkin: string): HoldemGameState {
  const deck = shuffleDeck(freshDeck());
  const layout = buildSleeveLayout(playerCount);
  const sleeveCards: Record<number, PlayingCard> = {};

  let idx = 0;
  for (const sleeveId of Array.from(layout.keys()).sort((a, b) => a - b)) {
    sleeveCards[sleeveId] = deck[idx++];
  }

  return { phase: 'pre_deal', playerCount, sleeveCards, startedAt: Date.now(), cardSkin };
}

// ── Sleeve descriptor helpers ─────────────────────────────────────────────────

function descriptorForSlot(slot: SleeveSlot, phase: HoldemPhase): Descriptor {
  if (!isFaceUp(slot, phase)) {
    if (slot.type === 'hole') {
      return faceDownDescriptor(`Player ${slot.playerNumber}`, `Card ${slot.cardIndex}`);
    }
    return faceDownDescriptor('Community', slot.label);
  }
  if (slot.type === 'hole') return holdemHoleDescriptor(slot.playerNumber, slot.cardIndex);
  return holdemCommunityDescriptor(slot.label);
}

// ── Sleeve updates ────────────────────────────────────────────────────────────

export type SleeveUpdate = { sleeveId: number; descriptor: Descriptor; card?: PlayingCard };

/** All sleeve descriptors for the state's current phase — used at game-start. */
export function allSleeveUpdates(state: HoldemGameState): SleeveUpdate[] {
  const layout = buildSleeveLayout(state.playerCount);
  return Array.from(layout.entries())
    .sort(([a], [b]) => a - b)
    .map(([sleeveId, slot]) => ({
      sleeveId,
      descriptor: descriptorForSlot(slot, state.phase),
      card: isFaceUp(slot, state.phase) ? state.sleeveCards[sleeveId] : undefined,
    }));
}

/**
 * Only the sleeves that change when advancing from one phase to the next.
 * Callers apply these as a delta on top of whatever is already on the sleeves.
 */
function deltaSleeveUpdates(
  fromPhase: HoldemPhase,
  toPhase: HoldemPhase,
  state: HoldemGameState,
): SleeveUpdate[] {
  const layout = buildSleeveLayout(state.playerCount);
  const updates: SleeveUpdate[] = [];
  for (const [sleeveId, slot] of layout) {
    const wasUp = isFaceUp(slot, fromPhase);
    const nowUp = isFaceUp(slot, toPhase);
    if (!wasUp && nowUp) {
      updates.push({ sleeveId, descriptor: descriptorForSlot(slot, toPhase), card: state.sleeveCards[sleeveId] });
    }
  }
  return updates.sort((a, b) => a.sleeveId - b.sleeveId);
}

// ── Advance ───────────────────────────────────────────────────────────────────

export type AdvanceResult = {
  newState: HoldemGameState;
  /** Descriptors to push to sleeves. Full set for new hand; delta otherwise. */
  sleeveUpdates: SleeveUpdate[];
};

/**
 * Transitions the game to the next phase.
 * When advancing past showdown, creates a fresh hand (reshuffle + new card assignments).
 */
export function advance(state: HoldemGameState): AdvanceResult {
  const toPhase = nextPhase(state.phase);

  if (toPhase === 'pre_deal') {
    // New hand: reshuffle, reassign cards, send all sleeves face-down
    const newState = createGame(state.playerCount, state.cardSkin ?? 'default');
    return { newState, sleeveUpdates: allSleeveUpdates(newState) };
  }

  const newState: HoldemGameState = { ...state, phase: toPhase };
  return {
    newState,
    sleeveUpdates: deltaSleeveUpdates(state.phase, toPhase, newState),
  };
}
