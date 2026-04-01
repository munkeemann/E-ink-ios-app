import {CardInstance, Sleeve, ZONE_CODE} from '../types';

export const PI_IP = '192.168.4.1';
export const PI_PORT = 5050;
const PI_BASE = `http://${PI_IP}:${PI_PORT}`;
const TIMEOUT_MS = 10_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function piRequest(path: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${PI_BASE}${path}`, {...options, signal: controller.signal});
    clearTimeout(timer);
    return resp;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ── Sleeve registry ───────────────────────────────────────────────────────────

/**
 * GET /sleeves → { "sleeves": { "1": { "ip": "..." }, "2": { ... } } }
 * Returns the set of registered sleeve_id strings.
 */
export async function fetchRegisteredSleeveIds(): Promise<Set<string>> {
  const resp = await piRequest('/sleeves');
  if (!resp.ok) {
    throw new Error(`/sleeves failed: ${resp.status}`);
  }
  const body = (await resp.json()) as {sleeves: Record<string, unknown>};
  return new Set(Object.keys(body.sleeves ?? {}));
}

/**
 * GET /sleeves → parsed Sleeve array for the manager UI.
 */
export async function listSleeves(): Promise<Sleeve[]> {
  const resp = await piRequest('/sleeves');
  if (!resp.ok) {
    throw new Error(`/sleeves failed: ${resp.status}`);
  }
  const body = (await resp.json()) as {sleeves: Record<string, {ip: string}>};
  return Object.entries(body.sleeves ?? {}).map(([id, info]) => ({
    sleeve_id: parseInt(id, 10),
    ip: info.ip,
  }));
}

export async function registerSleeve(sleeveId: number, ip: string): Promise<void> {
  const resp = await piRequest('/register', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({sleeve_id: sleeveId, ip}),
  });
  if (!resp.ok) {
    throw new Error(`/register failed: ${resp.status}`);
  }
}

// ── Zone state ────────────────────────────────────────────────────────────────

/**
 * GET /zones → { "zones": { "1": "LIB", "2": "GRV", ... } }
 */
export async function fetchZones(): Promise<Record<string, string>> {
  const resp = await piRequest('/zones');
  if (!resp.ok) {
    throw new Error(`/zones failed: ${resp.status}`);
  }
  const body = (await resp.json()) as {zones: Record<string, string>};
  return body.zones ?? {};
}

/**
 * POST /set_zone?sleeve_id=X&zone=4 — tell a sleeve its zone changed.
 * zone param is a numeric code: see ZONE_CODE.
 */
export async function setZone(
  sleeveId: string | number,
  zoneCode: number,
): Promise<void> {
  const resp = await piRequest(
    `/set_zone?sleeve_id=${sleeveId}&zone=${zoneCode}`,
    {method: 'POST', body: ''},
  );
  if (!resp.ok) {
    throw new Error(`/set_zone failed: ${resp.status}`);
  }
}

// ── Image display ─────────────────────────────────────────────────────────────

/**
 * Download a JPEG from Scryfall CDN and POST raw bytes to POST /display?sleeve_id=X.
 */
export async function sendImageToSleeve(
  imageUri: string,
  sleeveId: number | string,
): Promise<void> {
  const imgResp = await fetch(imageUri);
  if (!imgResp.ok) {
    throw new Error(`Image download failed: ${imgResp.status}`);
  }
  const blob = await imgResp.blob();

  const resp = await piRequest(`/display?sleeve_id=${sleeveId}`, {
    method: 'POST',
    headers: {'Content-Type': 'image/jpeg'},
    body: blob,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`/display failed ${resp.status}: ${text}`);
  }
}

// ── beginGame ─────────────────────────────────────────────────────────────────

/**
 * Sync all sleeves with their card images.
 *
 * Logic matches InGameActions.beginGame (Kotlin):
 *  1. Fetch registered sleeve IDs.
 *  2. Fetch current zone states.
 *  3. For each card (index i → sleeve_id i+1):
 *     - Skip if sleeve not registered.
 *     - Skip if zone is known and is NOT "LIB".
 *     - Else send card image.
 *
 * @param cards  Ordered card list (index 0 = commander = sleeve 1).
 * @param onProgress  Optional progress callback (sent, total).
 */
export async function beginGame(
  cards: CardInstance[],
  onProgress?: (sent: number, total: number) => void,
): Promise<void> {
  const [registeredIds, zoneStates] = await Promise.all([
    fetchRegisteredSleeveIds().catch(() => new Set<string>()),
    fetchZones().catch(() => ({} as Record<string, string>)),
  ]);

  let sent = 0;
  const eligible = cards.filter((_, i) => {
    const sleeveId = String(i + 1);
    if (!registeredIds.has(sleeveId)) {
      return false;
    }
    const zone = zoneStates[sleeveId];
    return zone === undefined || zone === 'LIB';
  });

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const sleeveId = i + 1;

    if (!registeredIds.has(String(sleeveId))) {
      continue;
    }
    const zone = zoneStates[String(sleeveId)];
    if (zone !== undefined && zone !== 'LIB') {
      continue;
    }
    if (!card.imageUri) {
      continue;
    }

    try {
      await sendImageToSleeve(card.imageUri, sleeveId);
      sent++;
      onProgress?.(sent, eligible.length);
    } catch {
      // log but continue with remaining sleeves
    }
  }
}
