import AsyncStorage from '@react-native-async-storage/async-storage';

const DELAY_MS = 110;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export interface FetchedCard {
  imagePath: string;
  colorIdentity: string[];
}

function extractImageUrl(data: Record<string, unknown>): string | null {
  const uris = data.image_uris as Record<string, string> | undefined;
  if (uris?.large) return uris.large;

  const faces = data.card_faces as Array<Record<string, unknown>> | undefined;
  if (faces && faces.length > 0) {
    const faceUris = faces[0].image_uris as Record<string, string> | undefined;
    if (faceUris?.large) return faceUris.large;
  }

  return null;
}

export async function fetchCard(cardName: string): Promise<FetchedCard> {
  const cacheKey = `card_cache_${cardName}`;
  const cached = await AsyncStorage.getItem(cacheKey);
  if (cached) {
    return JSON.parse(cached) as FetchedCard;
  }

  const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`;
  console.log('[Scryfall] GET', url);
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'ECardsApp/1.0', Accept: 'application/json' },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error('[Scryfall] Error', resp.status, body);
    let details: string | undefined;
    try { details = (JSON.parse(body) as { details?: string }).details; } catch { /* non-JSON */ }
    throw new Error(details ?? `Card not found: "${cardName}" (HTTP ${resp.status})`);
  }
  const data = (await resp.json()) as Record<string, unknown>;

  const imageUrl = extractImageUrl(data);
  if (!imageUrl) throw new Error(`No image for: "${cardName}"`);

  const colorArr = data.color_identity;
  const colorIdentity: string[] = Array.isArray(colorArr)
    ? colorArr.filter((x): x is string => typeof x === 'string')
    : [];

  const result: FetchedCard = { imagePath: imageUrl, colorIdentity };
  await AsyncStorage.setItem(cacheKey, JSON.stringify(result));
  return result;
}

export async function fetchCards(
  names: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ results: Record<string, FetchedCard>; errors: string[] }> {
  const results: Record<string, FetchedCard> = {};
  const errors: string[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (i > 0) await sleep(DELAY_MS);
    try {
      results[name] = await fetchCard(name);
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      results[name] = { imagePath: '', colorIdentity: [] };
    }
    onProgress?.(i + 1, names.length);
  }

  return { results, errors };
}
