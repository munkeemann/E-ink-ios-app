export interface ParsedDeckLine {
  quantity: number;
  name: string;
}

/**
 * Parses a plain-text deck list.
 * Supported:  "4 Lightning Bolt", "4x Lightning Bolt", "Lightning Bolt"
 * Skipped:    blank lines, "// comments", lines ending with ":"
 *
 * Strips set codes "(SNC)", collector numbers "123 A", and special chars ★✪*.
 */
export function parseDeckList(text: string): ParsedDeckLine[] {
  const results: ParsedDeckLine[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.endsWith(':')) {
      continue;
    }

    let name: string;
    let quantity: number;

    const withQty = line.match(/^(\d+)x?\s+(.+)$/);
    if (withQty) {
      quantity = parseInt(withQty[1], 10);
      name = withQty[2].trim();
    } else {
      quantity = 1;
      name = line;
    }

    // Strip set codes (SNC), collector numbers trailing after the name, and special chars
    name = name
      .replace(/\(.*?\)/g, '')
      .replace(/[★✪*]/g, '')
      .replace(/\s+\d+\s*[A-Z]?$/, '')
      .trim();

    if (name) {
      results.push({quantity, name});
    }
  }

  return results;
}

export interface DeckListEntry {
  quantity: number;
  name: string;
}

/**
 * Expand a parsed deck list into individual card name entries, one per copy.
 * The very first card (first line, first copy) is flagged as the commander.
 *
 * Returns flat list of { name, isCommander, copyIndex } matching the
 * Kotlin parseDeckListWithCommander logic.
 */
export interface ExpandedCard {
  name: string;
  displayName: string;
  isCommander: boolean;
  /** 1-indexed library position; 0 for commander */
  placeIndex: number;
}

export function expandDeckList(lines: ParsedDeckLine[]): ExpandedCard[] {
  const result: ExpandedCard[] = [];
  let currentIndex = 1; // 0 is reserved for commander (place "commander")
  let isFirstCard = true;

  for (const {quantity, name} of lines) {
    for (let i = 1; i <= quantity; i++) {
      const displayName = quantity > 1 ? `${name} ${i}` : name;
      const isCommander = isFirstCard && i === 1;
      const placeIndex = isCommander ? 0 : currentIndex++;

      result.push({name, displayName, isCommander, placeIndex});
    }
    isFirstCard = false;
  }

  return result;
}
