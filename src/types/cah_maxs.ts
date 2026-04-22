import { ContentPrompt, ContentResponse } from '../cah/CahContent';
import { Descriptor } from '../api/sleeveService';

export type CahMaxsPrompt = ContentPrompt;
export type CahMaxsResponse = ContentResponse;

export type CahMaxsPhase = 'pre_deal' | 'dealt' | 'judging';

export interface CahMaxsGameState {
  variant: 'maxs';
  playerCount: number;
  K: number;
  round: number;                        // 0 before first deal, increments each deal
  czarIndex: number;                    // 0-based, rotates each round
  scores: number[];                     // length = playerCount

  promptDeck: CahMaxsPrompt[];          // shuffled remainder
  promptDiscard: CahMaxsPrompt[];
  responseDeck: CahMaxsResponse[];      // shuffled remainder
  responseDiscard: CahMaxsResponse[];

  currentPrompt: CahMaxsPrompt | null;  // null only in pre_deal / between rounds
  playerHands: CahMaxsResponse[][];     // [playerIdx][cardIdx], length P × K

  phase: CahMaxsPhase;
  roundWinner: number | null;           // 0-based playerIdx; set during 'judging', null otherwise
  startedAt: number;
}

export interface CahMaxsSleeveUpdate {
  sleeveId: number;
  descriptor: Descriptor;
  cardText?: string;
  cardScheme?: 'black' | 'white';
}
