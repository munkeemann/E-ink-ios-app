export interface MaxsSleeveSlot {
  sleeveId: number;
  role: 'prompt' | 'response';
  playerIdx: number | null;
  cardIdx: number | null;
}

/**
 * Sleeve 1          → prompt (black card)
 * Sleeve 2..1+P*K   → responses (white cards); player p, card k (both 0-based)
 *                     sleeveId = 2 + p*K + k
 */
export function maxsSleeveId(playerIdx: number, cardIdx: number, K: number): number {
  return 2 + playerIdx * K + cardIdx;
}

export function totalMaxsSleeveCount(playerCount: number, K: number): number {
  return 1 + playerCount * K;
}

export function buildMaxsLayout(playerCount: number, K: number): Map<number, MaxsSleeveSlot> {
  const m = new Map<number, MaxsSleeveSlot>();
  m.set(1, { sleeveId: 1, role: 'prompt', playerIdx: null, cardIdx: null });
  for (let p = 0; p < playerCount; p++) {
    for (let k = 0; k < K; k++) {
      const sid = maxsSleeveId(p, k, K);
      m.set(sid, { sleeveId: sid, role: 'response', playerIdx: p, cardIdx: k });
    }
  }
  return m;
}
