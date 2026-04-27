import {
  CahMaxsGameState,
  CahMaxsPrompt,
  CahMaxsResponse,
  CahMaxsSleeveUpdate,
} from '../types/cah_maxs';
import { cahBlackCardDescriptor, cahMaxsResponseDescriptor } from '../api/sleeveService';
import { maxsSleeveId } from './CahMaxsLayout';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createMaxsGame(
  playerCount: number,
  K: number,
  promptPool: CahMaxsPrompt[],
  responsePool: CahMaxsResponse[],
): CahMaxsGameState {
  const prompts = shuffle(promptPool);
  const responses = shuffle(responsePool);
  console.log(`[CAH-MAXS] createMaxsGame P=${playerCount} K=${K}  prompts=${prompts.length}  responses=${responses.length}`);
  return {
    variant: 'maxs',
    playerCount,
    K,
    round: 0,
    promptDeck: prompts,
    promptDiscard: [],
    responseDeck: responses,
    responseDiscard: [],
    currentPrompt: null,
    playerHands: Array.from({ length: playerCount }, () => []),
    phase: 'pre_deal',
    startedAt: Date.now(),
  };
}

interface PromptDraw { card: CahMaxsPrompt; next: CahMaxsGameState; }
interface ResponseDraw { card: CahMaxsResponse; next: CahMaxsGameState; }

function drawPrompt(state: CahMaxsGameState): PromptDraw {
  let deck = state.promptDeck;
  let discard = state.promptDiscard;
  if (deck.length === 0) {
    console.log(`[CAH-MAXS] reshuffled prompts  (discard=${discard.length})`);
    deck = shuffle(discard);
    discard = [];
  }
  const [card, ...rest] = deck;
  return { card, next: { ...state, promptDeck: rest, promptDiscard: discard } };
}

function drawResponse(state: CahMaxsGameState): ResponseDraw {
  let deck = state.responseDeck;
  let discard = state.responseDiscard;
  if (deck.length === 0) {
    console.log(`[CAH-MAXS] reshuffled responses  (discard=${discard.length})`);
    deck = shuffle(discard);
    discard = [];
  }
  const [card, ...rest] = deck;
  return { card, next: { ...state, responseDeck: rest, responseDiscard: discard } };
}

/**
 * Deal a new round: discard current prompt + all hands (if any), then draw
 * 1 fresh prompt + P*K responses. Sets phase='dealt'. Works from either
 * 'pre_deal' (first deal, nothing to discard) or 'dealt' (next round).
 * Scoring and judge rotation happen physically at the table — not tracked
 * in app state.
 */
export function advanceMaxs(state: CahMaxsGameState): CahMaxsGameState {
  let next = state;

  // Discard the outgoing round's cards before dealing anew.
  if (state.currentPrompt) {
    next = { ...next, promptDiscard: [...next.promptDiscard, state.currentPrompt] };
  }
  const flatHand = state.playerHands.flat();
  if (flatHand.length > 0) {
    next = { ...next, responseDiscard: [...next.responseDiscard, ...flatHand] };
  }

  // Draw fresh prompt
  const promptDraw = drawPrompt(next);
  next = { ...promptDraw.next, currentPrompt: promptDraw.card };

  // Deal K responses to each player
  const hands: CahMaxsResponse[][] = Array.from({ length: state.playerCount }, () => []);
  for (let p = 0; p < state.playerCount; p++) {
    for (let k = 0; k < state.K; k++) {
      const r = drawResponse(next);
      next = r.next;
      hands[p].push(r.card);
    }
  }
  const newRound = state.round + 1;
  console.log(`[CAH-MAXS] advanceMaxs → round=${newRound}  prompt="${promptDraw.card.text.slice(0, 60)}"`);
  return {
    ...next,
    playerHands: hands,
    phase: 'dealt',
    round: newRound,
  };
}

/**
 * Full sleeve push for the current dealt state: 1 prompt + P*K responses.
 * Call from 'dealt' phase only (pre_deal has no cards to show).
 */
export function maxsSleeveUpdates(state: CahMaxsGameState): CahMaxsSleeveUpdate[] {
  if (state.phase !== 'dealt' || !state.currentPrompt) return [];
  const updates: CahMaxsSleeveUpdate[] = [];
  updates.push({
    sleeveId: 1,
    descriptor: cahBlackCardDescriptor(),
    cardText: state.currentPrompt.text,
    cardScheme: 'black',
  });
  // NOTE: response sleeves use a neutral descriptor — no player/card
  // identifiers leave the app. Who-played-what is a bluff-mechanic secret;
  // putting playerIdx/cardIdx in the wire payload would leak to the Pi log.
  // The app still knows the sleeveId→(p,k) mapping via maxsSleeveId() /
  // buildMaxsLayout() for deal logic — secrecy is a render concern, not a
  // state concern.
  for (let p = 0; p < state.playerCount; p++) {
    for (let k = 0; k < state.K; k++) {
      const card = state.playerHands[p]?.[k];
      if (!card) continue;
      updates.push({
        sleeveId: maxsSleeveId(p, k, state.K),
        descriptor: cahMaxsResponseDescriptor(),
        cardText: card.text,
        cardScheme: 'white',
      });
    }
  }
  return updates;
}
