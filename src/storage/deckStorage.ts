import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, Deck } from '../types';

const KEY = 'decks_v1';
const SETTINGS_KEY = 'app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  sleeveCount: 5,
  physicalZones: ['LIB', 'HND', 'BTFLD'],
  librarySleeveDepth: 1,
};

export async function loadDecks(): Promise<Deck[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Deck[]) : [];
}

export async function getDeck(id: string): Promise<Deck | null> {
  const decks = await loadDecks();
  return decks.find(d => d.id === id) ?? null;
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
  };
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
