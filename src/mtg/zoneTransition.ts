import { CardInstance } from '../types';

/**
 * SAM1-72 zone-transition rules. A single pure function used by both
 * polling-driven (sleeve→app) and in-app-driven (move-button) transitions.
 *
 * Physical zones (sleeve attached to card):
 *   CMD (sleeve 1; sleeve 2 for partner — those are owned by SAM1-68/69, not this fn)
 *   HND, BTFLD
 *   Top of LIB whose sleeveId !== null
 *
 * Digital zones (no sleeve binding):
 *   GRV, EXL
 *   LIB cards whose sleeveId === null
 *
 * Source physical/digital is derived from card.sleeveId at call time.
 * Dest physical/digital is derived from the destZone string.
 */

export type TransitionEffect =
  | { type: 'strip'; sleeveId: number; zone: string }
  | { type: 'image'; sleeveId: number; card: CardInstance };

export interface TransitionResult {
  newCards: CardInstance[];
  effects: TransitionEffect[];
  freedSleeves: number[]; // sleeves whose card binding changed — clearMemo before push
}

const PHYSICAL_DEST = new Set(['HND', 'BTFLD', 'LIB']);
const DIGITAL_DEST = new Set(['GRV', 'EXL']);

export function applyZoneTransition(
  cards: CardInstance[],
  card: CardInstance,
  destZone: string,
): TransitionResult {
  const sourcePhysical = card.sleeveId !== null;
  if (PHYSICAL_DEST.has(destZone)) {
    return sourcePhysical
      ? physicalToPhysical(cards, card, destZone)
      : digitalToPhysical(cards, card, destZone);
  }
  if (DIGITAL_DEST.has(destZone)) {
    return sourcePhysical
      ? physicalToDigital(cards, card, destZone)
      : digitalToDigital(cards, card, destZone);
  }
  // Out-of-scope dest (CMD, TKN). Leave to caller.
  return { newCards: cards, effects: [], freedSleeves: [] };
}

function physicalToPhysical(
  cards: CardInstance[],
  card: CardInstance,
  destZone: string,
): TransitionResult {
  const cardIdx = cards.indexOf(card);
  const newCards = cards.map((c, i) => i === cardIdx ? { ...c, zone: destZone } : c);
  const effects: TransitionEffect[] = card.sleeveId !== null
    ? [{ type: 'strip', sleeveId: card.sleeveId, zone: destZone }]
    : [];
  return { newCards, effects, freedSleeves: [] };
}

function physicalToDigital(
  cards: CardInstance[],
  card: CardInstance,
  destZone: string,
): TransitionResult {
  const freedSleeveId = card.sleeveId!;
  const cardIdx = cards.indexOf(card);

  // Find the next-up digital library card: smallest place among LIB with sleeveId === null.
  let nextLibIdx = -1;
  let nextLibPlace = Infinity;
  cards.forEach((c, i) => {
    if (c.zone !== 'LIB' || c.sleeveId !== null || c.place === 'commander') return;
    const p = parseInt(c.place, 10);
    if (!isNaN(p) && p < nextLibPlace) {
      nextLibPlace = p;
      nextLibIdx = i;
    }
  });

  const newCards = cards.map((c, i) => {
    if (i === cardIdx) return { ...c, zone: destZone, sleeveId: null };
    if (i === nextLibIdx) return { ...c, sleeveId: freedSleeveId };
    return c;
  });

  const effects: TransitionEffect[] = [];
  if (nextLibIdx !== -1) {
    effects.push({ type: 'image', sleeveId: freedSleeveId, card: newCards[nextLibIdx] });
  } else {
    // Library empty — no advance; push the destZone strip to the freed sleeve so the
    // last-shown image at least carries the right strip indicator.
    effects.push({ type: 'strip', sleeveId: freedSleeveId, zone: destZone });
  }

  return { newCards, effects, freedSleeves: [freedSleeveId] };
}

function digitalToPhysical(
  cards: CardInstance[],
  card: CardInstance,
  destZone: string,
): TransitionResult {
  const cardIdx = cards.indexOf(card);

  // Build the chain of physical-library cards, sorted by place ascending.
  const chain: Array<{ idx: number; sleeveId: number; place: number }> = [];
  cards.forEach((c, i) => {
    if (c.zone !== 'LIB' || c.sleeveId === null || c.place === 'commander') return;
    const p = parseInt(c.place, 10);
    if (!isNaN(p)) chain.push({ idx: i, sleeveId: c.sleeveId, place: p });
  });
  chain.sort((a, b) => a.place - b.place);

  if (chain.length === 0) {
    // No library to displace — bind to nothing. Just update zone.
    return {
      newCards: cards.map(c => c === card ? { ...c, zone: destZone } : c),
      effects: [],
      freedSleeves: [],
    };
  }

  const topSleeveId = chain[0].sleeveId;

  // Sleeve shift:
  //   chain[i] (i < N-1): sleeveId becomes chain[i+1].sleeveId.
  //   chain[N-1] (deepest): sleeveId becomes null (falls into digital LIB).
  //   moved card: sleeveId becomes topSleeveId.
  const sleeveByIdx = new Map<number, number | null>();
  for (let i = 0; i < chain.length - 1; i++) {
    sleeveByIdx.set(chain[i].idx, chain[i + 1].sleeveId);
  }
  sleeveByIdx.set(chain[chain.length - 1].idx, null);

  const newCards = cards.map((c, i) => {
    if (i === cardIdx) return { ...c, zone: destZone, sleeveId: topSleeveId };
    if (sleeveByIdx.has(i)) return { ...c, sleeveId: sleeveByIdx.get(i) ?? null };
    return c;
  });

  const effects: TransitionEffect[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const newSleeve = chain[i + 1].sleeveId;
    effects.push({ type: 'image', sleeveId: newSleeve, card: newCards[chain[i].idx] });
  }
  effects.push({ type: 'image', sleeveId: topSleeveId, card: newCards[cardIdx] });

  const freedSleeves = effects
    .filter((e): e is Extract<TransitionEffect, { type: 'image' }> => e.type === 'image')
    .map(e => e.sleeveId);

  return { newCards, effects, freedSleeves };
}

function digitalToDigital(
  cards: CardInstance[],
  card: CardInstance,
  destZone: string,
): TransitionResult {
  return {
    newCards: cards.map(c => c === card ? { ...c, zone: destZone } : c),
    effects: [],
    freedSleeves: [],
  };
}
