export interface CahCard {
  id: number;
  text: string;
}

export interface CahBlackCard extends CahCard {
  pick: number;
}

export type CahPhase = 'pre_deal' | 'dealt' | 'submissions' | 'reveal' | 'winner';

export interface CahGameState {
  phase: CahPhase;
  playerCount: number;
  handSize: number;
  czarIndex: number;                         // 0-based, cycles each round
  scores: number[];                          // indexed 0-based, length = playerCount

  // Full packs kept in state for deck cycling when remainder runs out
  allBlackCards: CahBlackCard[];
  allWhiteCards: CahCard[];

  blackDeck: CahBlackCard[];                 // shuffled remainder
  whiteDeck: CahCard[];                      // shuffled remainder

  currentBlackCard: CahBlackCard;
  playerHands: CahCard[][];                  // [playerIdx][handSlot], 0-based

  // submissions phase
  submittedPlayers: number[];                // 0-based playerIdxs who have submitted
  submissionSlots: Record<number, number>;   // playerIdx → handSlot (0-based)

  // reveal phase
  revealOrder: number[];                     // shuffled non-Czar playerIdxs, reveal sequence
  revealedCount: number;                     // 0 = nothing shown; increments each tap

  // winner phase
  roundWinner: number | null;                // 0-based playerIdx, null until Czar picks

  startedAt: number;
}
