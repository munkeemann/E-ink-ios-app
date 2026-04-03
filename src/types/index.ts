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
   */
  place: string;
  /** Zone: "LIB" | "HND" | "BTFLD" | "GRV" | "EXL" */
  zone: string;
}

export interface Deck {
  id: string;
  name: string;
  /** Local file path to commander art */
  commanderImagePath: string;
  /** MTG color identity letters: "W" "U" "B" "R" "G" */
  colors: string[];
  cards: CardInstance[];
}
