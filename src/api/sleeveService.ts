import { Image } from 'react-native';

export const PI_SERVER = 'http://192.168.86.193:5050';

// ── Card-back asset ──────────────────────────────────────────────────────────

// Metro requires all require() calls to be statically analysable — no dynamic paths.
export const CARD_BACK_ASSETS: Record<string, number> = {
  rot0:     require('../../assets/images/card_back_rot0.jpg')     as number,
  rot90cw:  require('../../assets/images/card_back_rot90cw.jpg')  as number,
  rot90ccw: require('../../assets/images/card_back_rot90ccw.jpg') as number,
  rot180:   require('../../assets/images/card_back_rot180.jpg')   as number,
};

export const CARD_BACK_VARIANTS = Object.keys(CARD_BACK_ASSETS) as (keyof typeof CARD_BACK_ASSETS)[];

let _cardBackVariant: string = 'rot90cw';
const _cardBackCache: Map<string, ArrayBuffer> = new Map();

export function getCardBackVariant(): string { return _cardBackVariant; }

export function setCardBackVariant(variant: string): void {
  if (CARD_BACK_ASSETS[variant] === undefined) return;
  _cardBackVariant = variant;
}

async function getCardBackBytes(): Promise<ArrayBuffer> {
  const v = _cardBackVariant;
  const cached = _cardBackCache.get(v);
  if (cached) {
    console.log('[CardBack] cache HIT:', v);
    return cached;
  }
  const t0 = Date.now();
  const src = Image.resolveAssetSource(CARD_BACK_ASSETS[v]);
  console.log('[CardBack] cache MISS — variant:', v, 'uri:', src?.uri ?? 'NULL');
  const resp = await fetch(src.uri);
  console.log('[CardBack] fetch done in', Date.now() - t0, 'ms — status:', resp.status);
  if (!resp.ok) throw new Error(`card_back fetch (${v}): HTTP ${resp.status}`);
  const bytes = await resp.arrayBuffer();
  _cardBackCache.set(v, bytes);
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

const MTG_ZONE_CELLS = ['LIB', 'HND', 'BTFLD', 'GRV', 'EXL'];

// index 0=LIB 1=HND 2=BTFLD 3=GRV 4=EXL  (confirmed from firmware source)
const MTG_ZONE_ACTIVE: Record<string, number> = {
  LIB: 0, HND: 1, BTFLD: 2, TKN: 2, CMD: 2, GRV: 3, EXL: 4,
};

export function mtgDescriptor(sleeveId: number, zone: string): Descriptor {
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
  return {
    v: 2,
    primary_label: `Player ${playerNumber}`,
    secondary_label: `Card ${cardIndex}`,
  };
}

export function holdemCommunityDescriptor(communityLabel: string): Descriptor {
  return {
    v: 2,
    primary_label: 'Community',
    secondary_label: communityLabel,
  };
}

export function faceDownDescriptor(primaryLabel?: string, secondaryLabel?: string): Descriptor {
  const d: Descriptor = { v: 2, _useFaceBack: true };
  if (primaryLabel !== undefined) d.primary_label = primaryLabel;
  if (secondaryLabel !== undefined) d.secondary_label = secondaryLabel;
  return d;
}

// ── CAH descriptors ──────────────────────────────────────────────────────────

export function cahBlackCardDescriptor(): Descriptor {
  return { v: 2, primary_label: 'CAH', secondary_label: 'Prompt' };
}

export function cahWhiteCardDescriptor(playerIdx: number, handSlot: number): Descriptor {
  return {
    v: 2,
    primary_label: `P${playerIdx + 1}`,
    secondary_label: `Card ${handSlot + 1}`,
  };
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
  if (sleeveId === undefined) lastSentHash.clear();
  else lastSentHash.delete(sleeveId);
}

export async function prefetchCardBacks(): Promise<void> {
  const t0 = Date.now();
  let cached = 0;
  for (const [variant, assetId] of Object.entries(CARD_BACK_ASSETS)) {
    if (_cardBackCache.has(variant)) { cached++; continue; }
    try {
      const src = Image.resolveAssetSource(assetId as number);
      if (!src?.uri) { console.warn(`[Prefetch] cardBack ${variant}: no URI`); continue; }
      const resp = await fetch(src.uri);
      if (!resp.ok) { console.warn(`[Prefetch] cardBack ${variant}: HTTP ${resp.status}`); continue; }
      _cardBackCache.set(variant, await resp.arrayBuffer());
      cached++;
    } catch (e) {
      console.warn(`[Prefetch] cardBack ${variant} failed:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`[Prefetch] cardBacks done in ${Date.now() - t0}ms, cached ${cached} variants`);
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
  const effectiveImage = (!imageData && descriptor._useFaceBack)
    ? await getCardBackBytes().catch(() => undefined)
    : imageData;

  const fp = await fingerprint(descriptor, effectiveImage);
  if (lastSentHash.get(sleeveId) === fp) {
    console.debug(`[SleeveService] sleeve ${sleeveId} skipped — identical to last send (${descriptor.primary_label ?? ''})`);
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

  console.log(`[SleeveService] sleeve ${sleeveId} → ${descriptor.primary_label ?? ''} ${descriptor.secondary_label ?? ''} face_back=${!!descriptor._useFaceBack} has_image=${!!effectiveImage}`.trimEnd());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let resp: Response;
  try {
    resp = await fetch(`${serverUrl}/display?sleeve_id=${sleeveId}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: body.buffer as ArrayBuffer,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  lastSentHash.set(sleeveId, fp);
}
