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

/**
 * White (response) card descriptor — labels intentionally omitted.
 * Player and card identifiers would defeat the bluff mechanic if rendered
 * on the physical sleeve; identity is tracked app-side only. The firmware
 * renders a blank merged region when both labels are absent.
 * The (playerIdx, handSlot) args are kept in the signature so callers
 * don't need to change; they're no longer used to build the descriptor.
 */
function whiteCardDescriptor(_playerIdx: number, _handSlot: number): Descriptor {
  return { v: 2 };
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
        // Show white card text on physical sleeve (not face-down)
        updates.push({
          sleeveId: sid,
          descriptor: whiteCardDescriptor(p, k),
          cardText: card.text,
          cardScheme: 'white',
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
  // CAH_RULES_DISABLED: submission tracking removed
  // if (state.phase !== 'submissions') return { newState: state, sleeveUpdates: [] };
  // if (state.submittedPlayers.includes(playerIdx)) return { newState: state, sleeveUpdates: [] };
  // if (playerIdx === state.czarIndex) return { newState: state, sleeveUpdates: [] };

  // const newSubmitted = [...state.submittedPlayers, playerIdx];
  // const newSlots = { ...state.submissionSlots, [playerIdx]: handSlot };

  // const nonCzarCount = state.playerCount - 1;
  // const allSubmitted = newSubmitted.length >= nonCzarCount;

  // const newPhase: CahPhase = allSubmitted ? 'reveal' : 'submissions';
  // const revealOrder = allSubmitted ? shuffle(
  //   Array.from({ length: state.playerCount }, (_, i) => i).filter(i => i !== state.czarIndex)
  // ) : state.revealOrder;

  // const newState: CahGameState = {
  //   ...state,
  //   phase: newPhase,
  //   submittedPlayers: newSubmitted,
  //   submissionSlots: newSlots,
  //   revealOrder,
  //   revealedCount: 0,
  // };

  // // Sleeve update: flip submitted card face-down (no reveal yet)
  // const sid = cahSleeveId(playerIdx, handSlot, state.handSize);
  // const sleeveUpdates: CahSleeveUpdate[] = [{
  //   sleeveId: sid,
  //   descriptor: faceDownDescriptor(`P${playerIdx + 1}`, `Submitted`),
  // }];

  // return { newState, sleeveUpdates };
  return { newState: state, sleeveUpdates: [] };
}

export function pickWinner(
  state: CahGameState,
  winnerIdx: number,
): { newState: CahGameState; sleeveUpdates: CahSleeveUpdate[] } {
  // CAH_RULES_DISABLED: voting / winner selection / scoreboard
  // if (state.phase !== 'winner') return { newState: state, sleeveUpdates: [] };

  // const newScores = [...state.scores];
  // newScores[winnerIdx] += 1;

  // const newState: CahGameState = { ...state, scores: newScores, roundWinner: winnerIdx };
  // return { newState, sleeveUpdates: [] };
  return { newState: state, sleeveUpdates: [] };
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
      // CAH_RULES_DISABLED: no longer opens submissions pipeline
      // "Next Round" cycles directly to fresh black card + fresh white hands for all players
      let blackDeck = [...state.blackDeck];
      if (blackDeck.length === 0) blackDeck = shuffle(state.allBlackCards);
      const nextBlack = blackDeck[0];
      blackDeck = blackDeck.slice(1);

      let whiteDeck = [...state.whiteDeck];
      const playerHands: CahCard[][] = [];
      for (let p = 0; p < state.playerCount; p++) {
        const hand: CahCard[] = [];
        for (let k = 0; k < state.handSize; k++) {
          if (whiteDeck.length === 0) {
            const inHand = new Set(playerHands.flat().map(c => c.id));
            whiteDeck = shuffle(state.allWhiteCards.filter(c => !inHand.has(c.id)));
          }
          if (whiteDeck.length > 0) hand.push(whiteDeck.shift()!);
        }
        playerHands.push(hand);
      }

      const newState: CahGameState = {
        ...state,
        phase: 'dealt',
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

    // CAH_RULES_DISABLED: submissions phase — players, turns, submission tracking
    // case 'submissions': {
    //   const nonCzarPlayers = Array.from({ length: state.playerCount }, (_, i) => i)
    //     .filter(i => i !== state.czarIndex);
    //   const revealOrder = shuffle(nonCzarPlayers);
    //   const newState: CahGameState = {
    //     ...state,
    //     phase: 'reveal',
    //     revealOrder,
    //     revealedCount: 0,
    //   };
    //   return { newState, sleeveUpdates: [] };
    // }

    // CAH_RULES_DISABLED: reveal phase — card reveal sequencing
    // case 'reveal': {
    //   if (state.revealedCount < state.revealOrder.length) {
    //     const newState: CahGameState = {
    //       ...state,
    //       revealedCount: state.revealedCount + 1,
    //     };
    //     return { newState, sleeveUpdates: deltaRevealUpdates(newState) };
    //   }
    //   const newState: CahGameState = { ...state, phase: 'winner' };
    //   return { newState, sleeveUpdates: [] };
    // }

    // CAH_RULES_DISABLED: winner phase — voting, czar rotation, scoreboard, round winners
    // case 'winner': {
    //   return startNextRound(state);
    // }

    case 'submissions':
    case 'reveal':
    case 'winner':
      return { newState: state, sleeveUpdates: [] };
  }
}

// ── Next round ───────────────────────────────────────────────────────────────

function startNextRound(state: CahGameState): {
  newState: CahGameState;
  sleeveUpdates: CahSleeveUpdate[];
} {
  // CAH_RULES_DISABLED: czar rotation
  // const nextCzar = (state.czarIndex + 1) % state.playerCount;
  const nextCzar = state.czarIndex;

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

  // No sleeve push here — "Deal Cards" (pre_deal→dealt) is the single
  // button that owns the visible push, consistent with Hold'em semantics.
  return { newState, sleeveUpdates: [] };
}

// ── Phase button labels ───────────────────────────────────────────────────────

export const CAH_PHASE_BUTTON_LABEL: Record<CahPhase, string> = {
  pre_deal: 'Deal Cards',
  dealt: 'Next Round',
  submissions: 'Force Reveal',
  reveal: 'Reveal Next',
  winner: 'Next Round',
};

export { totalCahSleeveCount };
