import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, Deck } from '../types';
import { getRegisteredSleeves } from '../api/piServer';
import { bakeForSleeve } from '../api/sleeveCache';

const KEY = 'decks_v1';
const SETTINGS_KEY = 'app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  sleeveCount: 5,
  physicalZones: ['LIB', 'HND', 'BTFLD'],
  librarySleeveDepth: 1,
  devMode: false,
  piDebugAlerts: false,
  theme: 'arcane',
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
  const themeValid = parsed.theme === 'default' || parsed.theme === 'slate' || parsed.theme === 'arcane';
  if (parsed.theme && !themeValid) {
    console.warn(`[settings] unknown theme "${parsed.theme}", falling back to ${DEFAULT_SETTINGS.theme}`);
  }
  return {
    sleeveCount: parsed.sleeveCount ?? DEFAULT_SETTINGS.sleeveCount,
    physicalZones: parsed.physicalZones ?? DEFAULT_SETTINGS.physicalZones,
    librarySleeveDepth: parsed.librarySleeveDepth ?? DEFAULT_SETTINGS.librarySleeveDepth,
    devMode: parsed.devMode ?? DEFAULT_SETTINGS.devMode,
    piDebugAlerts: parsed.piDebugAlerts ?? DEFAULT_SETTINGS.piDebugAlerts,
    theme: themeValid ? parsed.theme as 'default' | 'slate' | 'arcane' : DEFAULT_SETTINGS.theme,
  };
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/**
 * Bumps stored sleeveCount upward to match the Pi's registered-sleeve count
 * when more sleeves are registered than configured. Never lowers the count —
 * a transiently offline sleeve shouldn't clobber a manually configured value
 * (e.g. partner-commander setups where the user pre-allocated extra slots).
 * Persists the bump so subsequent launches without Pi reachability keep it.
 * Returns the (possibly updated) AppSettings; never throws — getRegisteredSleeves
 * already handles network failure by returning [].
 */
export async function syncSleeveCountFromPi(): Promise<AppSettings> {
  const stored = await loadSettings();
  const registered = await getRegisteredSleeves();
  const newCount = Math.max(stored.sleeveCount, registered.length);
  if (newCount === stored.sleeveCount) return stored;
  console.log(`[settings] Auto-synced sleeveCount: stored=${stored.sleeveCount}, registered=${registered.length}, new=${newCount}`);
  const updated = { ...stored, sleeveCount: newCount };
  await saveSettings(updated);
  return updated;
}

/**
 * One-time migration: walks every saved deck and runs bakeForSleeve for
 * each card that has a scryfallId. Updates `sleeveImagePath` and saves.
 *
 * Driven by a manual button in Settings — not auto-run, so users can wait
 * until the Pi is reachable before kicking it off. Best-effort: per-card
 * bake failures (logged inside bakeForSleeve) leave that card's
 * sleeveImagePath unchanged. Concurrency cap mirrors fetchCards (8).
 *
 * onProgress fires after each deck completes (not per card) — granularity
 * suitable for a deck-level progress bar.
 */
export async function bakeAllDecks(
  onProgress?: (decksDone: number, decksTotal: number) => void,
  options?: { force?: boolean },
): Promise<{ deckCount: number; cardsBaked: number; cardsSkipped: number }> {
  const force = options?.force ?? false;
  const decks = await loadDecks();
  let cardsBaked = 0;
  let cardsSkipped = 0;
  const sem = makeSemaphore(8);

  for (let d = 0; d < decks.length; d++) {
    const deck = decks[d];
    const tasks = deck.cards.map(async card => {
      if (!card.scryfallId || !card.imagePath) { cardsSkipped++; return; }
      if (!force && card.sleeveImagePath) { cardsSkipped++; return; }
      await sem.acquire();
      try {
        const path = await bakeForSleeve(card.imagePath, card.scryfallId, force);
        if (path) { card.sleeveImagePath = path; cardsBaked++; }
        else cardsSkipped++;
      } finally {
        sem.release();
      }
    });
    await Promise.allSettled(tasks);
    deck.schemaVersion = Math.max(deck.schemaVersion ?? 1, 3);
    await saveDeck(deck);
    onProgress?.(d + 1, decks.length);
  }

  const withSleeveImagePath = decks.reduce(
    (n, d) => n + d.cards.filter(c => !!c.sleeveImagePath).length,
    0,
  );
  console.log(
    '[migrate] decks:', decks.length,
    'cards processed:', cardsBaked + cardsSkipped,
    'with sleeveImagePath:', withSleeveImagePath,
  );

  return { deckCount: decks.length, cardsBaked, cardsSkipped };
}

function makeSemaphore(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return {
    acquire: (): Promise<void> => new Promise(resolve => {
      if (active < max) { active++; resolve(); }
      else queue.push(() => { active++; resolve(); });
    }),
    release: () => { active--; const next = queue.shift(); if (next) next(); },
  };
}
