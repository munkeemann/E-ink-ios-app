import {
  CahMaxsGameState,
  CahMaxsPrompt,
  CahMaxsResponse,
  CahMaxsSleeveUpdate,
} from '../types/cah_maxs';
import { getAllPrompts, getAllResponses } from './CahContent';
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

export function createMaxsGame(playerCount: number, K: number): CahMaxsGameState {
  const prompts = shuffle(getAllPrompts());
  const responses = shuffle(getAllResponses());
  console.log(`[CAH-MAXS] createMaxsGame P=${playerCount} K=${K}  prompts=${prompts.length}  responses=${responses.length}`);
  return {
    variant: 'maxs',
    playerCount,
    K,
    round: 0,
    czarIndex: 0,
    scores: Array(playerCount).fill(0),
    promptDeck: prompts,
    promptDiscard: [],
    responseDeck: responses,
    responseDiscard: [],
    currentPrompt: null,
    playerHands: Array.from({ length: playerCount }, () => []),
    phase: 'pre_deal',
    roundWinner: null,
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
 * Deal a new round: draw 1 prompt + P*K responses, set phase='dealt'.
 * Called from 'pre_deal' (first deal) or 'judging' (next round).
 * Does NOT advance czarIndex — that happens in pickWinner.
 */
export function advanceMaxs(state: CahMaxsGameState): CahMaxsGameState {
  if (state.phase === 'dealt') {
    console.warn('[CAH-MAXS] advanceMaxs called while phase=dealt — no-op');
    return state;
  }
  let next = state;
  const promptDraw = drawPrompt(next);
  next = { ...promptDraw.next, currentPrompt: promptDraw.card };

  const hands: CahMaxsResponse[][] = Array.from({ length: state.playerCount }, () => []);
  for (let p = 0; p < state.playerCount; p++) {
    for (let k = 0; k < state.K; k++) {
      const r = drawResponse(next);
      next = r.next;
      hands[p].push(r.card);
    }
  }
  const newRound = state.round + 1;
  console.log(`[CAH-MAXS] advanceMaxs → round=${newRound}  czar=P${state.czarIndex + 1}  prompt="${promptDraw.card.text.slice(0, 60)}"`);
  return {
    ...next,
    playerHands: hands,
    phase: 'dealt',
    round: newRound,
    roundWinner: null,
  };
}

/**
 * Award 1 point to winnerIdx, discard current prompt + all dealt hands,
 * rotate czar, set phase='judging'. From 'judging', the next advanceMaxs
 * call deals the next round.
 */
export function pickWinner(state: CahMaxsGameState, winnerIdx: number): CahMaxsGameState {
  if (state.phase !== 'dealt') {
    console.warn(`[CAH-MAXS] pickWinner ignored — phase=${state.phase}`);
    return state;
  }
  if (winnerIdx < 0 || winnerIdx >= state.playerCount) {
    console.warn(`[CAH-MAXS] pickWinner ignored — invalid winnerIdx=${winnerIdx}`);
    return state;
  }

  const scores = [...state.scores];
  scores[winnerIdx] += 1;

  const promptDiscard = state.currentPrompt
    ? [...state.promptDiscard, state.currentPrompt]
    : state.promptDiscard;
  const flatHand = state.playerHands.flat();
  const responseDiscard = [...state.responseDiscard, ...flatHand];
  const nextCzar = (state.czarIndex + 1) % state.playerCount;

  console.log(`[CAH-MAXS] pickWinner → P${winnerIdx + 1} wins round ${state.round}  scores=[${scores.join(',')}]  nextCzar=P${nextCzar + 1}`);
  return {
    ...state,
    scores,
    promptDiscard,
    responseDiscard,
    currentPrompt: null,
    playerHands: Array.from({ length: state.playerCount }, () => []),
    czarIndex: nextCzar,
    roundWinner: winnerIdx,
    phase: 'judging',
  };
}

/**
 * Full sleeve push for the current dealt state: 1 prompt + P*K responses.
 * Call from 'dealt' phase only (pre_deal/judging have no cards to show).
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
  // buildMaxsLayout() for scoring and deal logic — secrecy is a render
  // concern, not a state concern.
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
