export interface CardInstance {
  /** Canonical Scryfall name, e.g. "Lightning Bolt" */
  baseName: string;
  /** Human-readable label — adds a counter for duplicates: "Lightning Bolt 2" */
  displayName: string;
  /** Absolute local file path, e.g. .../cards/Lightning_Bolt.jpg */
  imagePath: string;
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
}

export interface AppSettings {
  /** How many physical sleeves are available (default 5) */
  sleeveCount: number;
  /** Which zones get pushed to sleeves (default ['LIB', 'HND', 'BTFLD']) */
  physicalZones: string[];
  /** How many top-of-library cards get a physical sleeve (default 1) */
  librarySleeveDepth: number;
}
