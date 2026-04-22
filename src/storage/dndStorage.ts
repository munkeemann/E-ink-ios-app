import AsyncStorage from '@react-native-async-storage/async-storage';
import { DndDeck } from '../types/dnd';

const KEY = 'dnd_decks_v1';

type DecksById = Record<string, DndDeck>;

async function loadAll(): Promise<DecksById> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as DecksById;
  } catch {
    return {};
  }
}

async function saveAll(decks: DecksById): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(decks));
}

/** Returns all saved D&D decks, sorted by createdAt descending (newest first). */
export async function listDecks(): Promise<DndDeck[]> {
  const decks = await loadAll();
  return Object.values(decks).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDeck(id: string): Promise<DndDeck | null> {
  const decks = await loadAll();
  return decks[id] ?? null;
}

export async function saveDeck(deck: DndDeck): Promise<void> {
  const decks = await loadAll();
  decks[deck.id] = deck;
  await saveAll(decks);
}

export async function deleteDeck(id: string): Promise<void> {
  const decks = await loadAll();
  delete decks[id];
  await saveAll(decks);
}
