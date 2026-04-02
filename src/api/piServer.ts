import { CardInstance } from '../types';

export const PI_SERVER = 'http://192.168.4.1:5050';

const INTER_CARD_DELAY_MS = 500;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function sleeveId(card: CardInstance): number {
  if (card.place === 'commander') return 1;
  return parseInt(card.place, 10) + 1;
}

/**
 * For each card: download image from Scryfall URL, POST bytes to Pi /display?sleeve_id=N.
 * Commander → sleeve 1, place "1" → sleeve 2, etc.
 */
export async function beginGame(
  cards: CardInstance[],
  onProgress?: (sent: number, total: number) => void,
  serverUrl: string = PI_SERVER,
): Promise<void> {
  const sorted = [...cards].sort((a, b) => {
    if (a.place === 'commander') return -1;
    if (b.place === 'commander') return 1;
    return parseInt(a.place, 10) - parseInt(b.place, 10);
  });

  const eligible = sorted.filter(c => c.imagePath);
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
