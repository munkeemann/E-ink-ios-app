export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K';

export interface PlayingCard {
  rank: Rank;
  suit: Suit;
}

export type HoldemPhase = 'pre_deal' | 'dealt' | 'flop' | 'turn' | 'river' | 'showdown';

export interface HoldemGameState {
  phase: HoldemPhase;
  playerCount: number;
  /** sleeveId (1-based) → card assigned to that sleeve for this hand */
  sleeveCards: Record<number, PlayingCard>;
  /** Unix ms when the current hand started — used for resume ordering */
  startedAt: number;
  /** Active card skin directory name; "default" = programmatic renders */
  cardSkin?: string;
}
