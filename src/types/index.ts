// ── Card types ─────────────────────────────────────────────────────────────────

/** A single physical card copy in the deck. Mirrors Kotlin CardInstance. */
export interface CardInstance {
  /** Canonical card name from Scryfall (e.g. "Lightning Bolt") */
  baseName: string;
  /** Display name — adds a counter for duplicates: "Lightning Bolt 1" */
  displayName: string;
  /** Scryfall CDN image URI (normal size) */
  imageUri: string;
  manaCost?: string;
  typeLine?: string;
  colorIdentity: string[];
  set?: string;
  rules?: string;
  /**
   * Position in the deck.
   * "commander" → always sleeve 1 (index 0).
   * "1", "2", ... → 1-indexed library position; sleeve_id = place_number + 1.
   */
  place: string;
  /**
   * Zone the sleeve is currently reporting.
   * "LIB" = library, "GRV" = graveyard, "EXL" = exile, "CMD" = command zone, etc.
   */
  zone: string;
}

/** A saved deck. Mirrors Kotlin Deck. */
export interface Deck {
  name: string;
  /** Scryfall URI of the commander's image — used as the deck tile hero image. */
  commanderImageUri: string;
  /** MTG color identity letters: "W", "U", "B", "R", "G" */
  colors: string[];
  cards: CardInstance[];
}

// ── Pi server types ───────────────────────────────────────────────────────────

export interface Sleeve {
  sleeve_id: number;
  ip: string;
}

/** Zone integer codes used when setting a zone via POST /set_zone */
export const ZONE_CODE = {
  CMD: 1,
  GRV: 2,
  EXL: 3,
  LIB: 4,
} as const;

// ── Navigation ────────────────────────────────────────────────────────────────

export type RootStackParamList = {
  SavedDecks: undefined;
  DeckImport: undefined;
  DeckPreview: {deckName: string};
  Game: {deckName: string};
  Scry: {deckName: string; scryCount: number};
  Graveyard: {deckName: string};
  SleeveManager: undefined;
};
