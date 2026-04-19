import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, Deck } from '../types';

const KEY = 'decks_v1';
const SETTINGS_KEY = 'app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  sleeveCount: 5,
  physicalZones: ['LIB', 'HND', 'BTFLD'],
  librarySleeveDepth: 1,
  devMode: false,
  piDebugAlerts: false,
};

export async function loadDecks(): Promise<Deck[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Deck[]) : [];
}

function deduplicateCommander(deck: Deck): Deck {
  const commander = deck.cards.find(c => c.place === 'commander');
  if (!commander) return deck;
  const removed: string[] = [];
  const cleanedCards = deck.cards.filter(c => {
    if (c === commander) return true;
    if (c.baseName === commander.baseName && c.place !== 'commander') {
      removed.push(`${c.displayName} (place=${c.place}, zone=${c.zone})`);
      return false;
    }
    return true;
  });
  if (removed.length === 0) return deck;
  console.warn(`[DeckMigration] "${deck.name}": removed ${removed.length} orphaned commander duplicate(s): ${removed.join(', ')}`);
  return { ...deck, cards: cleanedCards };
}

export async function getDeck(id: string): Promise<Deck | null> {
  const decks = await loadDecks();
  const idx = decks.findIndex(d => d.id === id);
  if (idx < 0) return null;
  const deck = decks[idx];
  const cleaned = deduplicateCommander(deck);
  if (cleaned !== deck) {
    decks[idx] = cleaned;
    await AsyncStorage.setItem(KEY, JSON.stringify(decks));
  }
  return cleaned;
}

export async function saveDeck(deck: Deck): Promise<void> {
  const decks = await loadDecks();
  const idx = decks.findIndex(d => d.id === deck.id);
  if (idx >= 0) {
    decks[idx] = deck;
  } else {
    decks.push(deck);
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(decks));
}

export async function deleteDeck(id: string): Promise<void> {
  const decks = await loadDecks();
  await AsyncStorage.setItem(KEY, JSON.stringify(decks.filter(d => d.id !== id)));
}

export async function loadSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  const parsed = JSON.parse(raw) as Partial<AppSettings>;
  return {
    sleeveCount: parsed.sleeveCount ?? DEFAULT_SETTINGS.sleeveCount,
    physicalZones: parsed.physicalZones ?? DEFAULT_SETTINGS.physicalZones,
    librarySleeveDepth: parsed.librarySleeveDepth ?? DEFAULT_SETTINGS.librarySleeveDepth,
    devMode: parsed.devMode ?? DEFAULT_SETTINGS.devMode,
    piDebugAlerts: parsed.piDebugAlerts ?? DEFAULT_SETTINGS.piDebugAlerts,
  };
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
