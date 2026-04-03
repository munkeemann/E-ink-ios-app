import { CardInstance } from '../types';

export const PI_SERVER = 'http://192.168.4.1:5050';

const INTER_CARD_DELAY_MS = 500;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function sleeveId(card: CardInstance): number {
  if (card.place === 'commander') return 1;
  return parseInt(card.place, 10) + 1;
}

/**
 * Returns the list of registered sleeve IDs from the Pi, or an empty array
 * if the Pi is unreachable or returns no sleeves.
 */
export async function getRegisteredSleeves(serverUrl: string = PI_SERVER): Promise<number[]> {
  try {
    const resp = await fetch(`${serverUrl}/sleeves`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return [];
    const data = await resp.json() as unknown;
    if (Array.isArray(data)) return data as number[];
    return [];
  } catch {
    return [];
  }
}

/**
 * Notifies the Pi that a card has moved to the graveyard, clearing that sleeve's display.
 */
export async function sendToGraveyard(sleeveId: number, serverUrl: string = PI_SERVER): Promise<void> {
  try {
    await fetch(`${serverUrl}/clear?sleeve_id=${sleeveId}`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Pi may be offline — fail silently
  }
}

/**
 * For each card whose sleeve ID is in registeredSleeves: download image from Scryfall URL,
 * POST bytes to Pi /display?sleeve_id=N.
 * Commander → sleeve 1, place "1" → sleeve 2, etc.
 */
export async function beginGame(
  cards: CardInstance[],
  registeredSleeves: number[],
  onProgress?: (sent: number, total: number) => void,
  serverUrl: string = PI_SERVER,
): Promise<void> {
  const safeCards = Array.isArray(cards) ? cards : [];
  const safeRegistered = Array.isArray(registeredSleeves) ? registeredSleeves : [];

  const sorted = [...safeCards].sort((a, b) => {
    if (a.place === 'commander') return -1;
    if (b.place === 'commander') return 1;
    return parseInt(a.place, 10) - parseInt(b.place, 10);
  });

  const registeredSet = new Set(safeRegistered);
  const eligible = sorted.filter(c => c.imagePath && registeredSet.has(sleeveId(c)));
  console.log(`[Pi] Starting beginGame: ${eligible.length} cards → ${serverUrl}`);
  let sent = 0;

  for (const card of eligible) {
    const id = sleeveId(card);
    try {
      console.log(`[Pi] Fetching image for sleeve ${id}: ${card.imagePath}`);
      const imageResp = await fetch(card.imagePath);
      if (!imageResp.ok) throw new Error(`Scryfall fetch failed: HTTP ${imageResp.status}`);

      const arrayBuffer = await imageResp.arrayBuffer();
      console.log(`[Pi] Posting ${arrayBuffer.byteLength} bytes to sleeve ${id}`);

      const uploadResp = await fetch(`${serverUrl}/display?sleeve_id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: arrayBuffer,
      });

      if (uploadResp.ok) {
        console.log(`[Pi] Sleeve ${id} OK`);
      } else {
        console.warn(`[Pi] Sleeve ${id} rejected: HTTP ${uploadResp.status}`);
      }
    } catch (e) {
      console.error(`[Pi] Sleeve ${id} failed:`, e instanceof Error ? e.message : String(e));
    }

    sent++;
    onProgress?.(sent, eligible.length);
    if (sent < eligible.length) await sleep(INTER_CARD_DELAY_MS);
  }

  console.log(`[Pi] beginGame complete: ${sent}/${eligible.length} cards processed`);
}
