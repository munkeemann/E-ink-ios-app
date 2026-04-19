export interface CardInstance {
  /** Canonical Scryfall name, e.g. "Lightning Bolt" */
  baseName: string;
  /** Human-readable label — adds a counter for duplicates: "Lightning Bolt 2" */
  displayName: string;
  /** Scryfall image URL for the front face */
  imagePath: string;
  /** Scryfall image URL for the back face; empty string if card is single-faced */
  backImagePath: string;
  /** True when the card is showing its back face */
  isFlipped: boolean;
  /**
   * Deck position:
   *   "commander" → always sleeve 1
   *   "1", "2", … → library position; sleeve_id = parseInt(place) + 1
   *   large timestamp string for tokens (not in Pi loop)
   */
  place: string;
  /** Zone: "LIB" | "HND" | "BTFLD" | "GRV" | "EXL" | "CMD" */
  zone: string;
  /** True for token cards — tokens are deleted from the deck when they leave the battlefield */
  isToken?: boolean;
  /**
   * Permanent physical sleeve assignment.
   * null = this card has no physical sleeve (virtual zone or unassigned).
   * Set at game-start and transferred when the card moves zones.
   */
  sleeveId: number | null;
  /** Scryfall set code for this specific printing, e.g. "C21". Absent = default printing. */
  setCode?: string;
  /** Scryfall collector number for this printing, e.g. "234". Absent = default printing. */
  collectorNumber?: string;
  /** Scryfall UUID for this exact printing. Used to identify the card for printing swaps. */
  scryfallId?: string;
}

export interface TokenTemplate {
  name: string;
  power: string;
  toughness: string;
  colors: string[];
}

export interface Deck {
  id: string;
  name: string;
  /** Local file path to commander art */
  commanderImagePath: string;
  /** MTG color identity letters: "W" "U" "B" "R" "G" */
  colors: string[];
  cards: CardInstance[];
  tokens?: TokenTemplate[];
  /** True while a game session is active for this deck */
  gameInProgress?: boolean;
  /** Unix ms timestamp of the last time a game was started — used to pick the most recent resume candidate */
  lastPlayedAt?: number;
  /**
   * 1 (or absent) = original schema, no printing metadata.
   * 2 = cards may carry setCode / collectorNumber / scryfallId.
   */
  schemaVersion?: number;
}

export interface AppSettings {
  /** How many physical sleeves are available (default 5) */
  sleeveCount: number;
  /** Which zones get pushed to sleeves (default ['LIB', 'HND', 'BTFLD']) */
  physicalZones: string[];
  /** How many top-of-library cards get a physical sleeve (default 1) */
  librarySleeveDepth: number;
  /** Reveals actual deck order and position numbers in the deck preview (default false) */
  devMode: boolean;
  /** Show blocking debug alerts from Pi network calls (only active when devMode is true) */
  piDebugAlerts: boolean;
}
