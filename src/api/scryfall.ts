import AsyncStorage from '@react-native-async-storage/async-storage';

const BULK_DATA_KEY = 'scryfall_bulk_data';
const BULK_TIMESTAMP_KEY = 'scryfall_bulk_last_fetched';
const BULK_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_CACHE_PREFIX = 'token_cache_';

export interface FetchedCard {
  imagePath: string;
  backImagePath: string;
  colorIdentity: string[];
}

interface SlimCard {
  name: string;
  imagePath: string;
  backImagePath: string;
  colorIdentity: string[];
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
    imagePath: extractImageUrl(card) ?? '',
    backImagePath: extractBackImageUrl(card),
    colorIdentity: Array.isArray(card.color_identity)
      ? (card.color_identity as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
  }));
}

async function ensureBulkData(
  onDownloadProgress?: (percent: number) => void,
): Promise<SlimCard[]> {
  const lastFetched = await AsyncStorage.getItem(BULK_TIMESTAMP_KEY);
  if (lastFetched && Date.now() - parseInt(lastFetched, 10) < BULK_TTL_MS) {
    const cached = await AsyncStorage.getItem(BULK_DATA_KEY);
    if (cached) return JSON.parse(cached) as SlimCard[];
  }
  const cards = await downloadBulkData(onDownloadProgress);
  await AsyncStorage.setItem(BULK_DATA_KEY, JSON.stringify(cards));
  await AsyncStorage.setItem(BULK_TIMESTAMP_KEY, String(Date.now()));
  return cards;
}

/**
 * Fetches a token card image URL from Scryfall using exact name match.
 * Result is cached in AsyncStorage under token_cache_${name}.
 * If colors is non-empty, prefers a result whose colors match; falls back to first result.
 */
export async function fetchTokenImage(name: string, colors: string[]): Promise<string> {
  const cacheKey = `${TOKEN_CACHE_PREFIX}${name.toLowerCase()}`;
  const cached = await AsyncStorage.getItem(cacheKey);
  if (cached) return cached;

  try {
    const query = encodeURIComponent(`t:token !"${name}"`);
    const resp = await fetch(`https://api.scryfall.com/cards/search?q=${query}`, {
      headers: { 'User-Agent': 'ECardsApp/1.0', Accept: 'application/json' },
    });
    if (!resp.ok) return '';
    const data = await resp.json() as { data?: Array<Record<string, unknown>> };
    const results = data.data ?? [];

    let match: Record<string, unknown> | undefined;
    if (colors.length > 0) {
      match = results.find(card => {
        const cardColors = Array.isArray(card.colors) ? (card.colors as string[]) : [];
        return colors.every(c => cardColors.includes(c));
      }) ?? results[0];
    } else {
      match = results[0];
    }

    if (!match) return '';
    const imageUrl = extractImageUrl(match);
    if (!imageUrl) return '';

    await AsyncStorage.setItem(cacheKey, imageUrl);
    return imageUrl;
  } catch {
    return '';
  }
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
        results[name] = { imagePath, backImagePath, colorIdentity };
      } catch {
        errors.push(`${name}: Card not found in local database`);
        results[name] = { imagePath: '', backImagePath: '', colorIdentity: [] };
      }
    }
    onProgress?.(i + 1, names.length);
  }

  return { results, errors };
}
