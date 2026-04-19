import { CahCard, CahBlackCard, CahGameState, CahPhase } from '../types/cah';
import { Descriptor, faceDownDescriptor } from '../api/sleeveService';
import { cahSleeveId, totalCahSleeveCount } from './CahSleeveLayout';

export interface CahSleeveUpdate {
  sleeveId: number;
  descriptor: Descriptor;
  cardText?: string;
  cardScheme?: 'black' | 'white';
}

// ── Shuffle ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Create ───────────────────────────────────────────────────────────────────

export function createCahGame(
  playerCount: number,
  handSize: number,
  allBlackCards: CahBlackCard[],
  allWhiteCards: CahCard[],
): CahGameState {
  const blackDeck = shuffle(allBlackCards);
  const whiteDeck = shuffle(allWhiteCards);

  const playerHands: CahCard[][] = [];
  const remaining = [...whiteDeck];
  for (let p = 0; p < playerCount; p++) {
    playerHands.push(remaining.splice(0, handSize));
  }

  const currentBlackCard = blackDeck[0];

  return {
    phase: 'pre_deal',
    playerCount,
    handSize,
    czarIndex: 0,
    scores: Array(playerCount).fill(0),
    allBlackCards,
    allWhiteCards,
    blackDeck: blackDeck.slice(1),
    whiteDeck: remaining,
    currentBlackCard,
    playerHands,
    submittedPlayers: [],
    submissionSlots: {},
    revealOrder: [],
    revealedCount: 0,
    roundWinner: null,
    startedAt: Date.now(),
  };
}

// ── Descriptor builders ──────────────────────────────────────────────────────

function blackCardDescriptor(): Descriptor {
  return { v: 2, primary_label: 'CAH', secondary_label: 'Prompt' };
}

function whiteCardDescriptor(playerIdx: number, handSlot: number): Descriptor {
  return {
    v: 2,
    primary_label: `P${playerIdx + 1}`,
    secondary_label: `Card ${handSlot + 1}`,
  };
}

// ── Sleeve update helpers ────────────────────────────────────────────────────

export function allSleeveUpdates(state: CahGameState): CahSleeveUpdate[] {
  const updates: CahSleeveUpdate[] = [];
  const { playerCount, handSize, playerHands, currentBlackCard, czarIndex,
          submissionSlots, revealOrder, revealedCount, phase } = state;

  // Sleeve 1: black card
  updates.push({
    sleeveId: 1,
    descriptor: blackCardDescriptor(),
    cardText: currentBlackCard.text,
    cardScheme: 'black',
  });

  for (let p = 0; p < playerCount; p++) {
    for (let k = 0; k < handSize; k++) {
      const sid = cahSleeveId(p, k, handSize);
      const card = playerHands[p]?.[k];

      const isRevealed = (() => {
        if (phase === 'reveal' || phase === 'winner') {
          if (p === czarIndex) return false;
          const pos = revealOrder.indexOf(p);
          return pos !== -1 && pos < revealedCount;
        }
        return false;
      })();

      if (isRevealed && card) {
        updates.push({
          sleeveId: sid,
          descriptor: whiteCardDescriptor(p, k),
          cardText: card.text,
          cardScheme: 'white',
        });
      } else if (card) {
        updates.push({
          sleeveId: sid,
          descriptor: faceDownDescriptor(`P${p + 1}`, `Card ${k + 1}`),
        });
      } else {
        updates.push({
          sleeveId: sid,
          descriptor: faceDownDescriptor(),
        });
      }
    }
  }

  return updates;
}

// Only the newly-revealed player's sleeve(s)
function deltaRevealUpdates(state: CahGameState): CahSleeveUpdate[] {
  const { revealOrder, revealedCount, handSize, playerHands, submissionSlots } = state;
  const revealedIdx = revealedCount - 1;
  if (revealedIdx < 0 || revealedIdx >= revealOrder.length) return [];

  const p = revealOrder[revealedIdx];
  const submittedSlot = submissionSlots[p];
  const updates: CahSleeveUpdate[] = [];

  for (let k = 0; k < handSize; k++) {
    const sid = cahSleeveId(p, k, handSize);
    const card = playerHands[p]?.[k];
    if (k === submittedSlot && card) {
      updates.push({
        sleeveId: sid,
        descriptor: whiteCardDescriptor(p, k),
        cardText: card.text,
        cardScheme: 'white',
      });
    } else {
      updates.push({
        sleeveId: sid,
        descriptor: faceDownDescriptor(`P${p + 1}`, `Card ${k + 1}`),
      });
    }
  }

  return updates;
}

// ── Submit / pick ────────────────────────────────────────────────────────────

export function submitCard(
  state: CahGameState,
  playerIdx: number,
  handSlot: number,
): { newState: CahGameState; sleeveUpdates: CahSleeveUpdate[] } {
  if (state.phase !== 'submissions') return { newState: state, sleeveUpdates: [] };
  if (state.submittedPlayers.includes(playerIdx)) return { newState: state, sleeveUpdates: [] };
  if (playerIdx === state.czarIndex) return { newState: state, sleeveUpdates: [] };

  const newSubmitted = [...state.submittedPlayers, playerIdx];
  const newSlots = { ...state.submissionSlots, [playerIdx]: handSlot };

  const nonCzarCount = state.playerCount - 1;
  const allSubmitted = newSubmitted.length >= nonCzarCount;

  const newPhase: CahPhase = allSubmitted ? 'reveal' : 'submissions';
  const revealOrder = allSubmitted ? shuffle(
    Array.from({ length: state.playerCount }, (_, i) => i).filter(i => i !== state.czarIndex)
  ) : state.revealOrder;

  const newState: CahGameState = {
    ...state,
    phase: newPhase,
    submittedPlayers: newSubmitted,
    submissionSlots: newSlots,
    revealOrder,
    revealedCount: 0,
  };

  // Sleeve update: flip submitted card face-down (no reveal yet)
  const sid = cahSleeveId(playerIdx, handSlot, state.handSize);
  const sleeveUpdates: CahSleeveUpdate[] = [{
    sleeveId: sid,
    descriptor: faceDownDescriptor(`P${playerIdx + 1}`, `Submitted`),
  }];

  return { newState, sleeveUpdates };
}

export function pickWinner(
  state: CahGameState,
  winnerIdx: number,
): { newState: CahGameState; sleeveUpdates: CahSleeveUpdate[] } {
  if (state.phase !== 'winner') return { newState: state, sleeveUpdates: [] };

  const newScores = [...state.scores];
  newScores[winnerIdx] += 1;

  const newState: CahGameState = { ...state, scores: newScores, roundWinner: winnerIdx };
  return { newState, sleeveUpdates: [] };
}

// ── Advance (tap to progress phase) ─────────────────────────────────────────

export function advanceCah(state: CahGameState): {
  newState: CahGameState;
  sleeveUpdates: CahSleeveUpdate[];
} {
  switch (state.phase) {
    case 'pre_deal': {
      const newState: CahGameState = { ...state, phase: 'dealt' };
      return { newState, sleeveUpdates: allSleeveUpdates(newState) };
    }

    case 'dealt': {
      const newState: CahGameState = { ...state, phase: 'submissions' };
      return { newState, sleeveUpdates: [] };
    }

    case 'submissions': {
      // Auto-advance only happens via submitCard when all have submitted.
      // If czar taps manually (e.g. someone left), force transition.
      const nonCzarPlayers = Array.from({ length: state.playerCount }, (_, i) => i)
        .filter(i => i !== state.czarIndex);
      const revealOrder = shuffle(nonCzarPlayers);
      const newState: CahGameState = {
        ...state,
        phase: 'reveal',
        revealOrder,
        revealedCount: 0,
      };
      return { newState, sleeveUpdates: [] };
    }

    case 'reveal': {
      if (state.revealedCount < state.revealOrder.length) {
        const newState: CahGameState = {
          ...state,
          revealedCount: state.revealedCount + 1,
        };
        return { newState, sleeveUpdates: deltaRevealUpdates(newState) };
      }
      // All revealed → move to winner
      const newState: CahGameState = { ...state, phase: 'winner' };
      return { newState, sleeveUpdates: [] };
    }

    case 'winner': {
      // Start next round
      return startNextRound(state);
    }
  }
}

// ── Next round ───────────────────────────────────────────────────────────────

function startNextRound(state: CahGameState): {
  newState: CahGameState;
  sleeveUpdates: CahSleeveUpdate[];
} {
  const nextCzar = (state.czarIndex + 1) % state.playerCount;

  // Cycle black deck
  let blackDeck = [...state.blackDeck];
  if (blackDeck.length === 0) blackDeck = shuffle(state.allBlackCards);
  const nextBlack = blackDeck[0];
  blackDeck = blackDeck.slice(1);

  // Replenish hands: each non-czar player needs one card back (their submitted card used up)
  let whiteDeck = [...state.whiteDeck];
  const playerHands = state.playerHands.map(hand => [...hand]);

  for (let p = 0; p < state.playerCount; p++) {
    if (p === nextCzar) continue;
    const submittedSlot = state.submissionSlots[p];
    if (submittedSlot === undefined) continue;
    if (whiteDeck.length === 0) {
      // Collect all cards not in any hand for reshuffle
      const inHand = new Set(playerHands.flat().map(c => c.id));
      whiteDeck = shuffle(state.allWhiteCards.filter(c => !inHand.has(c.id)));
    }
    if (whiteDeck.length > 0) {
      playerHands[p][submittedSlot] = whiteDeck.shift()!;
    }
  }

  const newState: CahGameState = {
    ...state,
    phase: 'pre_deal',
    czarIndex: nextCzar,
    blackDeck,
    whiteDeck,
    currentBlackCard: nextBlack,
    playerHands,
    submittedPlayers: [],
    submissionSlots: {},
    revealOrder: [],
    revealedCount: 0,
    roundWinner: null,
  };

  return { newState, sleeveUpdates: allSleeveUpdates(newState) };
}

// ── Phase button labels ───────────────────────────────────────────────────────

export const CAH_PHASE_BUTTON_LABEL: Record<CahPhase, string> = {
  pre_deal: 'Deal Cards',
  dealt: 'Open Submissions',
  submissions: 'Force Reveal',
  reveal: 'Reveal Next',
  winner: 'Next Round',
};

export { totalCahSleeveCount };
