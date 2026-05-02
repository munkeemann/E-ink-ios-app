import AsyncStorage from '@react-native-async-storage/async-storage';
import { bakeForSleeve } from './sleeveCache';
import { alertWait } from './piServer';

// Bumped from v3 → v4 to force a fresh download: v3 SlimCards lacked the
// Scryfall printing UUID, which is now required as the sleeve-bake cache key.
const BULK_DATA_KEY = 'scryfall_bulk_data_v4';
const BULK_TIMESTAMP_KEY = 'scryfall_bulk_last_fetched_v4';
const BULK_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_CACHE_PREFIX = 'token_cache_';
const BAKE_CONCURRENCY = 8;

export interface FetchedCard {
  imagePath: string;
  backImagePath: string;
  colorIdentity: string[];
  scryfallId?: string;
  setCode?: string;
  collectorNumber?: string;
  manaValue?: number;
  keywords?: string[];
  /** Local file URI of the baked sleeve JPEG; absent if bake failed/skipped. */
  sleeveImagePath?: string;
}

// Minimal counting semaphore — caps concurrent /bake calls during deck import
// so a 100-card deck doesn't fire 100 simultaneous POSTs at the Pi.
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

async function bakeAll(cards: FetchedCard[]): Promise<void> {
  const startMsg = `${cards.length} cards; missing imagePath: ${cards.filter(c => !c.imagePath).length}; missing scryfallId: ${cards.filter(c => !c.scryfallId).length}`;
  console.log(`[bake] ${startMsg}`);
  await alertWait('[bake]', startMsg);
  const sem = makeSemaphore(BAKE_CONCURRENCY);
  await Promise.allSettled(
    cards.map(async card => {
      if (!card.imagePath || !card.scryfallId) return;
      await sem.acquire();
      try {
        const path = await bakeForSleeve(card.imagePath, card.scryfallId);
        if (path) card.sleeveImagePath = path;
      } finally {
        sem.release();
      }
    }),
  );
  const baked = cards.filter(c => c.sleeveImagePath).length;
  await alertWait('[bake] done', `${baked}/${cards.length} cards have sleeveImagePath set`);
}

export interface ScryfallPrinting {
  id: string;
  set: string;
  setName: string;
  collectorNumber: string;
  releasedAt: string;
  imagePath: string;
  backImagePath: string;
}

interface SlimCard {
  name: string;
  /** Scryfall printing UUID — required as the sleeve-bake cache key. */
  id: string;
  imagePath: string;
  backImagePath: string;
  colorIdentity: string[];
  manaValue?: number;
  keywords?: string[];
}

function extractImageUrl(card: Record<string, unknown>): string | null {
  const uris = card.image_uris as Record<string, string> | undefined;
  if (uris?.large) return uris.large;
  const faces = card.card_faces as Array<Record<string, unknown>> | undefined;
  if (faces && faces.length > 0) {
    const faceUris = faces[0].image_uris as Record<string, string> | undefined;
    if (faceUris?.large) return faceUris.large;
  }
  return null;
}

function extractBackImageUrl(card: Record<string, unknown>): string {
  const faces = card.card_faces as Array<Record<string, unknown>> | undefined;
  if (faces && faces.length > 1) {
    const backUris = faces[1].image_uris as Record<string, string> | undefined;
    if (backUris?.large) return backUris.large;
  }
  return '';
}

async function downloadBulkData(
  onDownloadProgress?: (percent: number) => void,
): Promise<SlimCard[]> {
  const manifestResp = await fetch('https://api.scryfall.com/bulk-data', {
    headers: { 'User-Agent': 'ECardsApp/1.0', Accept: 'application/json' },
  });
  if (!manifestResp.ok) throw new Error('Failed to fetch Scryfall bulk data manifest');
  const manifest = await manifestResp.json() as {
    data: Array<{ type: string; download_uri: string }>;
  };
  const entry = manifest.data.find(e => e.type === 'oracle_cards');
  if (!entry) throw new Error('oracle_cards bulk data not found in manifest');

  const dataResp = await fetch(entry.download_uri, {
    headers: { 'User-Agent': 'ECardsApp/1.0' },
  });
  if (!dataResp.ok) throw new Error('Failed to download bulk card data');

  const contentLength = dataResp.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  let text: string;
  if (total > 0 && dataResp.body) {
    const reader = dataResp.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onDownloadProgress?.(Math.round((received / total) * 100));
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    text = new TextDecoder().decode(merged);
  } else {
    onDownloadProgress?.(50);
    text = await dataResp.text();
    onDownloadProgress?.(100);
  }

  const allCards = JSON.parse(text) as Array<Record<string, unknown>>;

  // Store only the fields we need to keep AsyncStorage size manageable
  return allCards.map(card => ({
    name: card.name as string,
    id: card.id as string,
    imagePath: extractImageUrl(card) ?? '',
    backImagePath: extractBackImageUrl(card),
    colorIdentity: Array.isArray(card.color_identity)
      ? (card.color_identity as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    manaValue: typeof card.cmc === 'number' ? card.cmc : undefined,
    keywords: Array.isArray(card.keywords)
      ? (card.keywords as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined,
  }));
}

async function ensureBulkData(
  onDownloadProgress?: (percent: number) => void,
): Promise<SlimCard[]> {
  const lastFetched = await AsyncStorage.getItem(BULK_TIMESTAMP_KEY);
  if (lastFetched && Date.now() - parseInt(lastFetched, 10) < BULK_TTL_MS) {
    const cached = await AsyncStorage.getItem(BULK_DATA_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as SlimCard[];
      // Self-heal pre-v4 shape: an install whose v4-keyed blob predates the
      // SlimCard.id field would silently break bake (Guard A drops every
      // card in scryfall.ts:bakeAll). Treat missing `id` as expired.
      if (parsed.length > 0 && !parsed[0].id) {
        console.warn('[bulk] cached data is pre-v4 shape (missing id), forcing redownload');
      } else {
        return parsed;
      }
    }
  }
  const cards = await downloadBulkData(onDownloadProgress);
  await AsyncStorage.setItem(BULK_DATA_KEY, JSON.stringify(cards));
  await AsyncStorage.setItem(BULK_TIMESTAMP_KEY, String(Date.now()));
  return cards;
}

/**
 * Manual reset: drops the bulk-data blob and its timestamp so the next
 * fetchCards triggers a full Scryfall redownload (~100MB). Exposed for the
 * Settings "Reset Scryfall bulk cache" diagnostic button.
 */
export async function clearBulkCache(): Promise<void> {
  await AsyncStorage.removeItem(BULK_DATA_KEY);
  await AsyncStorage.removeItem(BULK_TIMESTAMP_KEY);
}

/**
 * Fetches a token card image URL from Scryfall using exact name match.
 * Uses layout:token (not t:token) to exclude double-faced tokens whose back face
 * shares the searched name (e.g. "Dinosaur // Treasure" matching `!"Treasure"`).
 * Filter chain: prefer (colors AND P/T match) → (colors match) → first result.
 * One retry on network/non-200 failure. Empty result list is not retried.
 */
export async function fetchTokenImage(
  name: string,
  colors: string[],
  power?: string,
  toughness?: string,
): Promise<string> {
  const sortedColors = [...colors].sort().join('');
  const cacheKey = `${TOKEN_CACHE_PREFIX}${name.toLowerCase()}_${sortedColors}_${power ?? ''}_${toughness ?? ''}`;
  const cached = await AsyncStorage.getItem(cacheKey);
  if (cached) return cached;

  const query = encodeURIComponent(`layout:token !"${name}"`);
  const url = `https://api.scryfall.com/cards/search?q=${query}`;
  const headers = { 'User-Agent': 'ECardsApp/1.0', Accept: 'application/json' };

  let results: Array<Record<string, unknown>> = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(url, { headers });
      if (resp.ok) {
        const data = await resp.json() as { data?: Array<Record<string, unknown>> };
        results = data.data ?? [];
        break;
      }
    } catch {
      // network error
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 500));
  }

  if (results.length === 0) return '';

  const matchesColors = (card: Record<string, unknown>) => {
    const cardColors = Array.isArray(card.colors) ? (card.colors as string[]) : [];
    return colors.every(c => cardColors.includes(c));
  };
  const matchesPT = (card: Record<string, unknown>) =>
    String(card.power ?? '') === power && String(card.toughness ?? '') === toughness;

  let match: Record<string, unknown> | undefined;
  if (power && toughness) match = results.find(c => matchesColors(c) && matchesPT(c));
  if (!match && colors.length > 0) match = results.find(matchesColors);
  match = match ?? results[0];

  const imageUrl = extractImageUrl(match);
  if (!imageUrl) return '';

  await AsyncStorage.setItem(cacheKey, imageUrl);
  return imageUrl;
}

export async function fetchCards(
  names: string[],
  onProgress?: (done: number, total: number) => void,
  onDownloadProgress?: (percent: number) => void,
): Promise<{ results: Record<string, FetchedCard>; errors: string[] }> {
  const bulkData = await ensureBulkData(onDownloadProgress);

  const index = new Map<string, SlimCard>();
  for (const card of bulkData) index.set(card.name.toLowerCase(), card);

  const results: Record<string, FetchedCard> = {};
  const errors: string[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const card = index.get(name.toLowerCase());
    if (card && card.imagePath) {
      results[name] = {
        imagePath: card.imagePath,
        backImagePath: card.backImagePath ?? '',
        colorIdentity: card.colorIdentity,
        scryfallId: card.id,
        manaValue: card.manaValue,
        keywords: card.keywords,
      };
    } else {
      // Bulk index miss — try Scryfall fuzzy search as fallback
      try {
        const fuzzyResp = await fetch(
          `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
          { headers: { 'User-Agent': 'ECardsApp/1.0', Accept: 'application/json' } },
        );
        if (!fuzzyResp.ok) throw new Error(`Fuzzy search failed (${fuzzyResp.status})`);
        const fuzzyCard = await fuzzyResp.json() as Record<string, unknown>;
        const imagePath = extractImageUrl(fuzzyCard) ?? '';
        const backImagePath = extractBackImageUrl(fuzzyCard);
        const colorIdentity = Array.isArray(fuzzyCard.color_identity)
          ? (fuzzyCard.color_identity as unknown[]).filter((x): x is string => typeof x === 'string')
          : [];
        results[name] = {
          imagePath,
          backImagePath,
          colorIdentity,
          scryfallId: fuzzyCard.id as string | undefined,
          setCode: fuzzyCard.set as string | undefined,
          collectorNumber: fuzzyCard.collector_number as string | undefined,
          manaValue: typeof fuzzyCard.cmc === 'number' ? fuzzyCard.cmc : undefined,
          keywords: Array.isArray(fuzzyCard.keywords)
            ? (fuzzyCard.keywords as unknown[]).filter((x): x is string => typeof x === 'string')
            : undefined,
        };
      } catch {
        errors.push(`${name}: Card not found in local database`);
        results[name] = { imagePath: '', backImagePath: '', colorIdentity: [] };
      }
    }
    onProgress?.(i + 1, names.length);
  }

  // Bake every resolved card's image into a sleeve-ready JPEG and cache it.
  // Best-effort: failures (Pi offline, Scryfall non-200) leave sleeveImagePath
  // unset; beginGame falls back to fetching imagePath at game start.
  await bakeAll(Object.values(results));

  return { results, errors };
}

/**
 * Fetches the exact printing of a card via /cards/{set}/{collector_number}.
 * Returns null on 404 (caller falls back to default printing).
 */
export async function fetchCardByPrinting(
  setCode: string,
  collectorNumber: string,
): Promise<FetchedCard | null> {
  try {
    const resp = await fetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(setCode.toLowerCase())}/${encodeURIComponent(collectorNumber)}`,
      { headers: { 'User-Agent': 'ECardsApp/1.0', Accept: 'application/json' } },
    );
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const card = await resp.json() as Record<string, unknown>;
    const colorIdentity = Array.isArray(card.color_identity)
      ? (card.color_identity as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const fetched: FetchedCard = {
      imagePath: extractImageUrl(card) ?? '',
      backImagePath: extractBackImageUrl(card),
      colorIdentity,
      scryfallId: card.id as string,
      setCode: card.set as string,
      collectorNumber: card.collector_number as string,
      manaValue: typeof card.cmc === 'number' ? card.cmc : undefined,
      keywords: Array.isArray(card.keywords)
        ? (card.keywords as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined,
    };
    await bakeAll([fetched]);
    return fetched;
  } catch {
    return null;
  }
}

/**
 * Returns all printings for a card by exact name, sorted newest-first.
 * Uses /cards/search?q=!"Name"&unique=prints&order=released&dir=desc.
 * Fetches all pages so no results are silently dropped.
 */
export async function fetchPrintings(cardName: string): Promise<ScryfallPrinting[]> {
  const results: ScryfallPrinting[] = [];
  const query = encodeURIComponent(`!"${cardName}"`);
  let url: string | null =
    `https://api.scryfall.com/cards/search?q=${query}&unique=prints&order=released&dir=desc`;

  while (url) {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'ECardsApp/1.0', Accept: 'application/json' },
    });
    if (!resp.ok) break;
    const data = await resp.json() as {
      data: Array<Record<string, unknown>>;
      has_more: boolean;
      next_page?: string;
    };
    for (const card of data.data) {
      const imagePath = extractImageUrl(card);
      if (!imagePath) continue;
      results.push({
        id: card.id as string,
        set: card.set as string,
        setName: card.set_name as string,
        collectorNumber: card.collector_number as string,
        releasedAt: card.released_at as string,
        imagePath,
        backImagePath: extractBackImageUrl(card),
      });
    }
    url = data.has_more && data.next_page ? data.next_page : null;
  }

  return results;
}
