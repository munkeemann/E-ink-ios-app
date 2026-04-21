import { avatarAssets } from './avatar';

// Maps internal rank codes to filename rank names
export const RANK_NAME: Record<string, string> = {
  A: 'ace', '2': '2', '3': '3', '4': '4', '5': '5',
  '6': '6', '7': '7', '8': '8', '9': '9', T: '10',
  J: 'jack', Q: 'queen', K: 'king',
};

// Maps internal suit codes to filename suit names
export const SUIT_NAME: Record<string, string> = {
  S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs',
};

/** Returns the filename key used in skin asset maps, e.g. "ace_of_spades" */
export function skinCardKey(rank: string, suit: string): string {
  return `${RANK_NAME[rank]}_of_${SUIT_NAME[suit]}`;
}

// Add new skins here: key = directory name, value = imported asset map
export const SKIN_ASSETS: Record<string, Record<string, number>> = {
  default: {},
  avatar: avatarAssets,
};

export const SKIN_NAMES: string[] = Object.keys(SKIN_ASSETS);
