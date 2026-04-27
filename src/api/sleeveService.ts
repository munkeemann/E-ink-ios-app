import { Image } from 'react-native';

export const PI_SERVER = 'http://192.168.86.193:5050';

async function timedFetch(uri: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(uri, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Card-back asset ──────────────────────────────────────────────────────────

// Metro requires all require() calls to be statically analysable — no dynamic paths.
const CARD_BACK_ASSET: number = require('../../assets/images/card_back.jpg') as number;

let _cardBackCache: ArrayBuffer | null = null;

async function getCardBackBytes(): Promise<ArrayBuffer> {
  console.log('[SLV] getCardBackBytes enter', { cached: _cardBackCache !== null });
  if (_cardBackCache) {
    console.log('[SLV] getCardBackBytes exit — cache HIT', _cardBackCache.byteLength, 'bytes');
    return _cardBackCache;
  }
  const t0 = Date.now();
  const src = Image.resolveAssetSource(CARD_BACK_ASSET);
  console.log('[SLV] getCardBackBytes resolveAssetSource →', src?.uri ?? 'NULL');
  if (!src?.uri) throw new Error('getCardBackBytes: no URI for card_back.jpg');
  console.log('[SLV] prefetch warmup', src.uri);
  try { await Image.prefetch(src.uri); } catch { /* best-effort */ }
  console.log('[SLV] getCardBackBytes fetch start');
  const resp = await timedFetch(src.uri, 5000);
  console.log('[SLV] getCardBackBytes fetch done in', Date.now() - t0, 'ms — status:', resp.status);
  if (!resp.ok) {
    console.log('[SLV] getCardBackBytes exit — HTTP error', resp.status);
    throw new Error(`card_back fetch: HTTP ${resp.status}`);
  }
  const bytes = await resp.arrayBuffer();
  console.log('[SLV] getCardBackBytes arrayBuffer done —', bytes.byteLength, 'bytes');
  _cardBackCache = bytes;
  console.log('[SLV] getCardBackBytes exit — fetched OK in', Date.now() - t0, 'ms');
  return bytes;
}

// ── Descriptor type ──────────────────────────────────────────────────────────

export type Descriptor = {
  v: 2;
  _useFaceBack?: true;   // app-internal flag — stripped before wire serialisation, triggers card_back.jpg
  primary_label?: string;
  secondary_label?: string;
  zone_strip?: { cells: string[]; active_index: number };
};

// ── MTG descriptor ───────────────────────────────────────────────────────────

const MTG_ZONE_CELLS = ['LIB', 'HND', 'BTFLD', 'GRV', 'EXL', 'CMD'];

// index 0=LIB 1=HND 2=BTFLD 3=GRV 4=EXL 5=CMD  (confirmed from firmware source — CMD pending firmware update SAM1-68)
const MTG_ZONE_ACTIVE: Record<string, number> = {
  LIB: 0, HND: 1, BTFLD: 2, TKN: 2, GRV: 3, EXL: 4, CMD: 5,
};

export function mtgDescriptor(sleeveId: number, zone: string): Descriptor {
  console.log('[SLV] mtgDescriptor enter', { sleeveId, zone });
  return {
    v: 2,
    primary_label: sleeveId === 1 ? 'Commander' : `Card ${sleeveId - 1}`,
    zone_strip: {
      cells: MTG_ZONE_CELLS,
      active_index: MTG_ZONE_ACTIVE[zone] ?? 0,
    },
  };
}

// ── Hold'em descriptors ──────────────────────────────────────────────────────

export function holdemHoleDescriptor(playerNumber: number, cardIndex: 1 | 2): Descriptor {
  console.log('[SLV] holdemHoleDescriptor enter', { playerNumber, cardIndex });
  return {
    v: 2,
    primary_label: `Player ${playerNumber}`,
    secondary_label: `Card ${cardIndex}`,
  };
}

export function holdemCommunityDescriptor(communityLabel: string): Descriptor {
  console.log('[SLV] holdemCommunityDescriptor enter', { communityLabel });
  return {
    v: 2,
    primary_label: 'Community',
    secondary_label: communityLabel,
  };
}

export function faceDownDescriptor(primaryLabel?: string, secondaryLabel?: string): Descriptor {
  console.log('[SLV] faceDownDescriptor enter', { primaryLabel, secondaryLabel });
  const d: Descriptor = { v: 2, _useFaceBack: true };
  if (primaryLabel !== undefined) d.primary_label = primaryLabel;
  if (secondaryLabel !== undefined) d.secondary_label = secondaryLabel;
  return d;
}

// ── D&D descriptor ───────────────────────────────────────────────────────────

export function dndSpellDescriptor(spellName: string, level: number): Descriptor {
  console.log('[SLV] dndSpellDescriptor enter', { spellName, level });
  return {
    v: 2,
    primary_label: spellName,
    secondary_label: level === 0 ? 'Cantrip' : `Level ${level}`,
  };
}

// ── CAH descriptors ──────────────────────────────────────────────────────────

export function cahBlackCardDescriptor(): Descriptor {
  console.log('[SLV] cahBlackCardDescriptor enter');
  return { v: 2, primary_label: 'CAH', secondary_label: 'Prompt' };
}

/**
 * Max's Rules response sleeve descriptor.
 * Labels are omitted — player/card identity is a bluff-mechanic secret
 * and MUST NOT leave the app to the wire. The firmware renders a blank
 * merged region when both labels are absent.
 */
export function cahMaxsResponseDescriptor(): Descriptor {
  console.log('[SLV] cahMaxsResponseDescriptor enter');
  return { v: 2 };
}

// ── Dedup memo ───────────────────────────────────────────────────────────────

const lastSentHash = new Map<number, string>();

async function fingerprint(descriptor: Descriptor, imageData?: ArrayBuffer): Promise<string> {
  const descStr = JSON.stringify(descriptor);
  const imgLen = imageData?.byteLength ?? 0;
  const imgSample = imageData
    ? Array.from(new Uint8Array(imageData, 0, Math.min(32, imageData.byteLength)))
        .map(b => b.toString(16).padStart(2, '0')).join('')
    : '';
  const raw = `${descStr}\x00${imgLen}\x00${imgSample}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(hash)).slice(0, 8)
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = (((h << 5) + h) ^ raw.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function clearMemo(sleeveId?: number): void {
  console.log('[SLV] clearMemo enter', { sleeveId, memoSize: lastSentHash.size });
  if (sleeveId === undefined) lastSentHash.clear();
  else lastSentHash.delete(sleeveId);
  console.log('[SLV] clearMemo exit');
}

export async function prefetchCardBacks(): Promise<void> {
  console.log('[SLV] prefetchCardBacks enter', { cached: _cardBackCache !== null });
  if (_cardBackCache) {
    console.log('[SLV] prefetchCardBacks — already cached, skip');
    return;
  }
  const t0 = Date.now();
  try {
    const src = Image.resolveAssetSource(CARD_BACK_ASSET);
    if (!src?.uri) { console.warn('[SLV] prefetchCardBacks: no URI'); return; }
    console.log('[SLV] prefetch warmup', src.uri);
    try { await Image.prefetch(src.uri); } catch { /* best-effort */ }
    console.log('[SLV] prefetchCardBacks fetch start —', src.uri);
    const resp = await timedFetch(src.uri, 5000);
    console.log('[SLV] prefetchCardBacks fetch done in', Date.now() - t0, 'ms — status:', resp.status);
    if (!resp.ok) { console.warn(`[SLV] prefetchCardBacks: HTTP ${resp.status}`); return; }
    const bytes = await resp.arrayBuffer();
    console.log('[SLV] prefetchCardBacks arrayBuffer done —', bytes.byteLength, 'bytes');
    _cardBackCache = bytes;
  } catch (e) {
    console.warn('[SLV] prefetchCardBacks ERROR:', e instanceof Error ? e.message : e);
  }
  console.log(`[SLV] prefetchCardBacks exit — ${Date.now() - t0}ms`);
}

// ── Core send ────────────────────────────────────────────────────────────────

/**
 * POSTs descriptor + optional JPEG to Pi /display?sleeve_id=N as multipart/form-data.
 *   Part "descriptor" — JSON string
 *   Part "image"      — JPEG bytes (omitted when imageData is undefined)
 *
 * Throws on HTTP error or network failure; callers decide whether to swallow.
 */
export async function sendToSleeve(
  sleeveId: number,
  descriptor: Descriptor,
  imageData?: ArrayBuffer,
  serverUrl: string = PI_SERVER,
): Promise<void> {
  console.log('[SLV] sendToSleeve enter', {
    sleeveId,
    label: descriptor.primary_label,
    useFaceBack: !!descriptor._useFaceBack,
    hasImage: !!imageData,
    imageBytes: imageData?.byteLength ?? 0,
  });

  let effectiveImage: ArrayBuffer | undefined;
  if (!imageData && descriptor._useFaceBack) {
    console.log('[SLV] sendToSleeve step: getCardBackBytes start');
    effectiveImage = await getCardBackBytes().catch(e => {
      console.warn('[SLV] sendToSleeve getCardBackBytes ERROR:', e instanceof Error ? e.message : e);
      return undefined;
    });
    console.log('[SLV] sendToSleeve step: getCardBackBytes done —', effectiveImage ? effectiveImage.byteLength + ' bytes' : 'undefined (will send descriptor only)');
  } else {
    effectiveImage = imageData;
  }

  console.log('[SLV] sendToSleeve step: fingerprint start');
  const fp = await fingerprint(descriptor, effectiveImage);
  console.log('[SLV] sendToSleeve step: fingerprint done —', fp);

  if (lastSentHash.get(sleeveId) === fp) {
    console.log('[SLV] sendToSleeve exit — dedup skip, sleeve', sleeveId, descriptor.primary_label ?? '');
    return;
  }

  const boundary = `----ECBoundary${Date.now()}`;
  const CRLF = '\r\n';
  const enc = new TextEncoder();

  // Strip the app-internal _useFaceBack flag before serialising for the wire
  const { _useFaceBack: _fd, ...wireDescriptor } = descriptor;

  const descPart =
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="descriptor"${CRLF}${CRLF}` +
    JSON.stringify(wireDescriptor) +
    CRLF;

  let body: Uint8Array;

  if (effectiveImage) {
    const imgHeader =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="image"; filename="card.jpg"${CRLF}` +
      `Content-Type: image/jpeg${CRLF}${CRLF}`;
    const closing = `${CRLF}--${boundary}--${CRLF}`;

    const chunks = [
      enc.encode(descPart),
      enc.encode(imgHeader),
      new Uint8Array(effectiveImage),
      enc.encode(closing),
    ];
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  } else {
    const closing = `--${boundary}--${CRLF}`;
    const a = enc.encode(descPart);
    const b = enc.encode(closing);
    body = new Uint8Array(a.byteLength + b.byteLength);
    body.set(a, 0);
    body.set(b, a.byteLength);
  }

  console.log('[SLV] sendToSleeve step: body built —', body.byteLength, 'bytes, hasImage:', !!effectiveImage);
  console.log('[SLV] sendToSleeve step: POST start → sleeve', sleeveId, serverUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.warn('[SLV] sendToSleeve TIMEOUT — aborting POST for sleeve', sleeveId);
    controller.abort();
  }, 10000);
  let resp: Response;
  try {
    resp = await fetch(`${serverUrl}/display?sleeve_id=${sleeveId}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: body.buffer as ArrayBuffer,
      signal: controller.signal,
    });
    console.log('[SLV] sendToSleeve step: POST done — status', resp.status, 'sleeve', sleeveId);
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    console.log('[SLV] sendToSleeve exit — HTTP error', resp.status, 'sleeve', sleeveId);
    throw new Error(`HTTP ${resp.status}`);
  }
  lastSentHash.set(sleeveId, fp);
  console.log('[SLV] sendToSleeve exit — OK sleeve', sleeveId);
}
