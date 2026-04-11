import { Alert } from 'react-native';
import { AppSettings, CardInstance } from '../types';

export const PI_SERVER = 'http://192.168.86.193:5050';

/** Set to true via configurePiDebug() to show blocking step-by-step alerts. */
let _piDebugAlerts = false;

/** Called from app startup (and settings save) to sync the debug-alert flag. */
export function configurePiDebug(enabled: boolean): void {
  _piDebugAlerts = enabled;
}

/**
 * Blocking alert — must be dismissed before the caller continues.
 * No-ops (console.log only) when piDebugAlerts is disabled.
 */
const alertWait = (title: string, message: string): Promise<void> => {
  if (!_piDebugAlerts) {
    console.log(`[Pi][debug] ${title}: ${message}`);
    return Promise.resolve();
  }
  return new Promise<void>(resolve =>
    Alert.alert(title, message, [{ text: 'OK', onPress: resolve }]),
  );
};

const INTER_CARD_DELAY_MS = 500;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Returns the list of registered sleeve IDs from the Pi, or an empty array
 * if the Pi is unreachable or returns no sleeves.
 */
export async function getRegisteredSleeves(serverUrl: string = PI_SERVER): Promise<number[]> {
  const url = `${serverUrl}/sleeves`;
  await alertWait('getRegisteredSleeves', `Fetching: ${url}`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    await alertWait('getRegisteredSleeves: HTTP', `Status: ${resp.status} ${resp.statusText}`);
    if (!resp.ok) return [];
    const raw = await resp.text();
    await alertWait('getRegisteredSleeves: raw body', raw);
    const data = JSON.parse(raw) as unknown;
    if (Array.isArray(data)) return data as number[];
    // Pi returns {"sleeves": {"4": "192.168.4.19", ...}}
    if (data && typeof data === 'object' && 'sleeves' in data) {
      const sleevesMap = (data as { sleeves: Record<string, unknown> }).sleeves;
      if (sleevesMap && typeof sleevesMap === 'object') {
        const ids = Object.keys(sleevesMap).map(Number).filter(n => !isNaN(n));
        await alertWait('getRegisteredSleeves: parsed', `Sleeve IDs: [${ids.join(', ')}]`);
        return ids;
      }
    }
    await alertWait('getRegisteredSleeves: WARN', `Unrecognised format: ${JSON.stringify(data)}`);
    return [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await alertWait('getRegisteredSleeves: ERROR', msg);
    return [];
  }
}

/**
 * Clears a sleeve display on the Pi.
 */
export async function clearSleeve(sid: number, serverUrl: string = PI_SERVER): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(`${serverUrl}/clear?sleeve_id=${sid}`, {
      method: 'POST',
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch {
    // Pi may be offline — fail silently
  }
}

/** @deprecated Use clearSleeve instead */
export const sendToGraveyard = clearSleeve;

/**
 * Assigns permanent sleeveIds to cards at game-start based on settings.
 * Commander always gets sleeveId 1.
 * Remaining slots (up to sleeveCount) filled from physicalZones in order:
 *   LIB (top librarySleeveDepth cards), HND, BTFLD/TKN, GRV, EXL.
 * All other cards get sleeveId null.
 * Returns a new cards array with sleeveId assigned.
 */
export function assignSleeveIds(
  cards: CardInstance[],
  settings: AppSettings,
): CardInstance[] {
  const physZones = new Set(settings.physicalZones);
  const depth = settings.librarySleeveDepth ?? 1;

  // Build ordered list of cards that get a sleeve
  const sleeved: CardInstance[] = [];

  // Commander always gets sleeve 1
  const commander = cards.find(c => c.place === 'commander');
  if (commander) sleeved.push(commander);

  const addZone = (zone: string) => {
    let zoneCards: CardInstance[];
    if (zone === 'LIB') {
      zoneCards = cards
        .filter(c => c.zone === 'LIB' && c.place !== 'commander')
        .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10))
        .slice(0, depth);
    } else if (zone === 'BTFLD') {
      zoneCards = cards.filter(c => (c.zone === 'BTFLD' || c.zone === 'TKN') && c.place !== 'commander');
    } else {
      zoneCards = cards.filter(c => c.zone === zone && c.place !== 'commander');
    }
    for (const card of zoneCards) {
      if (sleeved.length >= settings.sleeveCount) return;
      if (!sleeved.includes(card)) sleeved.push(card);
    }
  };

  for (const zone of ['LIB', 'HND', 'BTFLD', 'GRV', 'EXL']) {
    if (sleeved.length >= settings.sleeveCount) break;
    if (physZones.has(zone)) addZone(zone);
  }

  // Build a set of cards that got a sleeve, in order → their sleeveId is index+1
  const sleevedSet = new Map<CardInstance, number>();
  sleeved.forEach((c, i) => sleevedSet.set(c, i + 1));

  return cards.map(c => ({ ...c, sleeveId: sleevedSet.get(c) ?? null }));
}

/**
 * Returns the lowest sleeve number (1..sleeveCount) not currently assigned
 * to any card in the deck. Returns null if all slots are full.
 */
export function nextFreeSleeveId(cards: CardInstance[], sleeveCount: number): number | null {
  const used = new Set(cards.map(c => c.sleeveId).filter((s): s is number => s !== null));
  for (let i = 1; i <= sleeveCount; i++) {
    if (!used.has(i)) return i;
  }
  return null;
}

/**
 * Pushes a single card image to its assigned sleeve on the Pi.
 * No-ops if card.sleeveId is null or imagePath is empty.
 */
export async function pushCardToSleeve(
  card: CardInstance,
  serverUrl: string = PI_SERVER,
): Promise<void> {
  if (card.sleeveId === null || !card.imagePath) return;
  try {
    const imageResp = await fetch(card.imagePath);
    if (!imageResp.ok) return;
    const buf = await imageResp.arrayBuffer();
    await fetch(`${serverUrl}/display?sleeve_id=${card.sleeveId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: buf,
    });
  } catch {
    // Pi offline — fail silently
  }
}

/**
 * Snapshots /zones then polls every 500ms for any sleeve whose zone_name changed.
 * Returns the sleeve_id of the first changed sleeve, or null on timeout or cancellation.
 * Pass isCancelled to allow the caller to abort early (e.g. user taps Cancel).
 */
export async function waitForSleeveSelection(
  isCancelled: () => boolean,
  timeoutMs: number = 30000,
  serverUrl: string = PI_SERVER,
): Promise<number | null> {
  // Snapshot current zone state
  const snapshot: Record<number, string> = {};
  try {
    const c1 = new AbortController();
    const t1 = setTimeout(() => c1.abort(), 3000);
    const resp = await fetch(`${serverUrl}/zones`, { signal: c1.signal }).finally(() => clearTimeout(t1));
    if (resp.ok) {
      const data = await resp.json() as Array<{ sleeve_id: number; zone_name: string }>;
      for (const item of data) snapshot[item.sleeve_id] = item.zone_name;
    }
  } catch {
    return null;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isCancelled()) return null;
    await sleep(500);
    if (isCancelled()) return null;
    try {
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 3000);
      const resp = await fetch(`${serverUrl}/zones`, { signal: c2.signal }).finally(() => clearTimeout(t2));
      if (!resp.ok) continue;
      const data = await resp.json() as Array<{ sleeve_id: number; zone_name: string }>;
      for (const item of data) {
        if (snapshot[item.sleeve_id] !== item.zone_name) return item.sleeve_id;
      }
    } catch {
      // Pi offline or slow — keep polling
    }
  }
  return null;
}

/**
 * Pushes card images to Pi sleeves at game-start.
 * Uses card.sleeveId (permanent assignment) and only pushes cards whose
 * zone is in settings.physicalZones (or commander which is always pushed).
 * Cards with sleeveId null are skipped.
 */
export async function beginGame(
  cards: CardInstance[],
  registeredSleeves: number[],
  onProgress?: (sent: number, total: number) => void,
  serverUrl: string = PI_SERVER,
  settings?: AppSettings,
): Promise<void> {
  try {
    await alertWait('beginGame: START', `cards=${cards?.length ?? 'null'}, registeredSleeves=[${registeredSleeves?.join(', ')}], url=${serverUrl}`);

    const safeCards = Array.isArray(cards) ? cards : [];
    const safeRegistered = Array.isArray(registeredSleeves) ? registeredSleeves : [];
    const registeredSet = new Set(safeRegistered);
    const physZones = settings ? new Set(settings.physicalZones) : null;

    // Dump first card to confirm field names
    if (safeCards.length > 0) {
      await alertWait('beginGame: first card', JSON.stringify(safeCards[0], null, 2));
    } else {
      await alertWait('beginGame: WARN', 'safeCards is empty — no cards passed in');
    }

    // Cards that have a sleeveId and imagePath, regardless of whether registered.
    // Unregistered sleeves are skipped gracefully inside the loop.
    const candidates = safeCards.filter(c => {
      if (c.sleeveId === null || c.sleeveId === undefined || !c.imagePath) return false;
      if (c.place === 'commander') return true;
      if (physZones && !physZones.has(c.zone)) return false;
      return true;
    }).sort((a, b) => (a.sleeveId ?? 0) - (b.sleeveId ?? 0));

    // Show why each of the first 5 cards was included/excluded
    const reasons = safeCards.slice(0, 5).map(c => {
      const r: string[] = [];
      if (c.sleeveId === null || c.sleeveId === undefined) r.push('sleeveId null');
      if (!c.imagePath) r.push('no imagePath');
      if (c.place !== 'commander' && physZones && !physZones.has(c.zone))
        r.push(`zone ${c.zone} not in physZones [${[...physZones].join(',')}]`);
      const registered = c.sleeveId != null && registeredSet.has(c.sleeveId);
      return `${c.displayName ?? c.baseName}: ${r.length ? r.join(', ') : registered ? 'SEND ✓' : 'skip (not registered)'}`;
    }).join('\n');
    await alertWait(`beginGame: plan (first 5 of ${safeCards.length})`, reasons || '(no cards)');
    await alertWait('beginGame: candidates', `${candidates.length} cards have sleeveId; registered=[${[...registeredSet].join(',')}]`);

    let sent = 0;
    let total = 0;
    for (const card of candidates) {
      const sid = card.sleeveId!;
      if (!registeredSet.has(sid)) {
        console.log(`[Pi] Sleeve ${sid} not registered — skipping`);
        continue;
      }
      total++;
      try {
        await alertWait(`beginGame: sleeve ${sid}`, `Fetching image:\n${card.imagePath}`);
        const imageResp = await fetch(card.imagePath);
        if (!imageResp.ok) throw new Error(`Scryfall fetch failed: HTTP ${imageResp.status}`);
        const arrayBuffer = await imageResp.arrayBuffer();

        await alertWait(`beginGame: sleeve ${sid}`, `Image fetched (${arrayBuffer.byteLength} bytes). POSTing to Pi…`);
        const uploadResp = await fetch(`${serverUrl}/display?sleeve_id=${sid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: arrayBuffer,
        });

        if (uploadResp.ok) {
          await alertWait(`beginGame: sleeve ${sid} ✓`, `HTTP ${uploadResp.status}`);
        } else {
          await alertWait(`beginGame: sleeve ${sid} REJECTED`, `HTTP ${uploadResp.status}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[Pi] Sleeve ${sid} failed:`, msg);
        await alertWait(`beginGame: sleeve ${sid} ERROR`, msg);
      }

      sent++;
      onProgress?.(sent, candidates.length);
      await sleep(INTER_CARD_DELAY_MS);
    }

    await alertWait('beginGame: DONE', `${sent}/${total} registered sleeves pushed`);
    console.log(`[Pi] beginGame complete: ${sent}/${total} registered sleeves pushed`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Pi] beginGame outer catch:', msg);
    await alertWait('beginGame: OUTER ERROR', msg);
  }
}
