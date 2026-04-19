import { CahPhase } from '../types/cah';

export interface CahSleeveSlot {
  sleeveId: number;
  role: 'black' | 'white';
  playerIdx: number | null;  // null for black card sleeve
  handSlot: number | null;   // null for black card sleeve
}

/**
 * Sleeve 1          → black card (prompt)
 * Sleeve 2..1+P*H   → white cards; player p (0-based), hand slot k (0-based)
 *                      sleeveId = 2 + p*handSize + k
 */
export function buildCahSleeveLayout(
  playerCount: number,
  handSize: number,
): Map<number, CahSleeveSlot> {
  const map = new Map<number, CahSleeveSlot>();

  map.set(1, { sleeveId: 1, role: 'black', playerIdx: null, handSlot: null });

  for (let p = 0; p < playerCount; p++) {
    for (let k = 0; k < handSize; k++) {
      const sid = 2 + p * handSize + k;
      map.set(sid, { sleeveId: sid, role: 'white', playerIdx: p, handSlot: k });
    }
  }

  return map;
}

export function cahSleeveId(playerIdx: number, handSlot: number, handSize: number): number {
  return 2 + playerIdx * handSize + handSlot;
}

export function totalCahSleeveCount(playerCount: number, handSize: number): number {
  return 1 + playerCount * handSize;
}

export function isCahSleeveFaceUp(
  slot: CahSleeveSlot,
  phase: CahPhase,
  czarIndex: number,
  submittedPlayers: number[],
  revealOrder: number[],
  revealedCount: number,
): boolean {
  if (slot.role === 'black') {
    return phase !== 'pre_deal';
  }
  // White cards
  const p = slot.playerIdx!;
  const k = slot.handSlot!;

  // During submissions phase, only show submitted card (slot matches submissionSlot)
  // We can't easily check that here without state — keep face-down during submissions
  // and reveal during reveal/winner phases based on revealOrder/revealedCount
  if (phase === 'pre_deal' || phase === 'dealt') return false;
  if (phase === 'submissions') return false;

  if (phase === 'reveal' || phase === 'winner') {
    // The czar's cards stay face-down (czar doesn't submit)
    if (p === czarIndex) return false;
    // Find position of this player in revealOrder
    const revealPos = revealOrder.indexOf(p);
    if (revealPos === -1) return false;
    // Only the submitted slot is relevant — show if revealed
    // We reveal entire player rows at once (all hand slots for that player)
    return revealPos < revealedCount;
  }

  return false;
}
