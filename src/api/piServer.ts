import { Alert } from 'react-native';
import { AppSettings, CardInstance } from '../types';
import { PI_SERVER, mtgDescriptor, sendToSleeve } from './sleeveService';

export { PI_SERVER };

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

const ZONE_INDEX: Record<string, number> = {
  LIB: 4, HND: 3, BTFLD: 2, TKN: 2, GRV: 1, EXL: 0, CMD: 2,
};

/**
 * Returns a map of sleeveId → IP address from the Pi.
 * Returns an empty object if the Pi is unreachable or returns no sleeves.
 */
export async function getSleeveIpMap(serverUrl: string = PI_SERVER): Promise<Record<number, string>> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${serverUrl}/sleeves`, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!resp.ok) return {};
    const data = JSON.parse(await resp.text()) as unknown;
    if (data && typeof data === 'object' && 'sleeves' in data) {
      const sleevesMap = (data as { sleeves: Record<string, unknown> }).sleeves;
      if (sleevesMap && typeof sleevesMap === 'object') {
        const result: Record<number, string> = {};
        for (const [idStr, ip] of Object.entries(sleevesMap)) {
          const id = Number(idStr);
          if (!isNaN(id) && typeof ip === 'string') result[id] = ip;
        }
        return result;
      }
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * POSTs a zone-index update to the sleeve's own HTTP server.
 * Zone index mapping: LIB=4, HND=3, BTFLD/TKN/CMD=2, GRV=1, EXL=0.
 * No-ops silently if the sleeve IP is not in ipMap or the sleeve is offline.
 */
export async function pushZoneUpdate(
  sleeveId: number,
  zone: string,
  ipMap: Record<number, string>,
): Promise<void> {
  const ip = ipMap[sleeveId];
  if (!ip) return;
  const zoneIndex = ZONE_INDEX[zone] ?? 0;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(`http://${ip}/zone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: zoneIndex }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch {
    // Sleeve offline — fail silently
  }
}

/**
 * Routes a zone-index update through the Pi server (POST /set_zone).
 * Parameters are sent as URL query params: /set_zone?sleeve_id=N&zone=N
 * Zone index mapping: LIB=4, HND=3, BTFLD/TKN/CMD=2, GRV=1, EXL=0.
 */
export async function pushZoneUpdateViaPi(
  sleeveId: number,
  zone: string,
  serverUrl: string = PI_SERVER,
): Promise<void> {
  const zoneIndex = ZONE_INDEX[zone] ?? 0;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(`${serverUrl}/set_zone?sleeve_id=${sleeveId}&zone=${zoneIndex}`, {
      method: 'POST',
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch {
    // Pi offline — fail silently
  }
}

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

  // Sleeve 1 is permanently reserved for the commander and is never part of the
  // non-commander fill loop. Non-commander cards always start at sleeve 2.
  const nonCommanderSlots = settings.sleeveCount - 1;
  const nonCommanderSleeved: CardInstance[] = [];

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
      if (nonCommanderSleeved.length >= nonCommanderSlots) return;
      if (!nonCommanderSleeved.includes(card)) nonCommanderSleeved.push(card);
    }
  };

  for (const zone of ['LIB', 'HND', 'BTFLD', 'GRV', 'EXL']) {
    if (nonCommanderSleeved.length >= nonCommanderSlots) break;
    if (physZones.has(zone)) addZone(zone);
  }

  // Commander → sleeve 1 (always). Non-commander cards → sleeves 2..N.
  const sleevedSet = new Map<CardInstance, number>();
  const commander = cards.find(c => c.place === 'commander');
  if (commander) sleevedSet.set(commander, 1);
  nonCommanderSleeved.forEach((c, i) => sleevedSet.set(c, i + 2));

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
    await sendToSleeve(card.sleeveId, mtgDescriptor(card.sleeveId, card.zone), buf, serverUrl);
  } catch {
    // Pi offline — fail silently
  }
}

/**
 * Fetches /zones and returns a sleeveId→zoneName map.
 * Pi returns {"zones": {"2": "EXL", "3": "LIB", ...}}.
 * Returns an empty object if the Pi is unreachable or the response is malformed.
 */
export async function fetchZones(serverUrl: string = PI_SERVER): Promise<Record<number, string>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  const resp = await fetch(`${serverUrl}/zones`, { signal: controller.signal }).finally(() => clearTimeout(timer));
  if (!resp.ok) return {};
  const raw = await resp.json() as unknown;
  // Expected shape: {"zones": {"2": "EXL", ...}}
  if (raw && typeof raw === 'object' && 'zones' in raw) {
    const map = (raw as { zones: Record<string, string> }).zones;
    const result: Record<number, string> = {};
    for (const [idStr, zoneName] of Object.entries(map)) {
      const id = Number(idStr);
      if (!isNaN(id)) result[id] = zoneName;
    }
    return result;
  }
  return {};
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
  let snapshot: Record<number, string> = {};
  try {
    snapshot = await fetchZones(serverUrl);
  } catch {
    return null;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isCancelled()) return null;
    await sleep(500);
    if (isCancelled()) return null;
    try {
      const current = await fetchZones(serverUrl);
      for (const [idStr, zoneName] of Object.entries(current)) {
        const id = Number(idStr);
        if (snapshot[id] !== zoneName) return id;
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
        await sendToSleeve(sid, mtgDescriptor(sid, card.zone), arrayBuffer, serverUrl);
        await alertWait(`beginGame: sleeve ${sid} ✓`, 'Sent OK');
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
