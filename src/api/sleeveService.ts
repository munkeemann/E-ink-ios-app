import { Image } from 'react-native';

export const PI_SERVER = 'http://192.168.86.193:5050';

// ── Card-back asset ──────────────────────────────────────────────────────────

let _cardBackBytes: ArrayBuffer | null = null;

async function getCardBackBytes(): Promise<ArrayBuffer> {
  if (_cardBackBytes) return _cardBackBytes;
  const src = Image.resolveAssetSource(
    require('../../assets/images/card_back.jpg') as number,
  );
  const resp = await fetch(src.uri);
  if (!resp.ok) throw new Error(`card_back fetch: HTTP ${resp.status}`);
  _cardBackBytes = await resp.arrayBuffer();
  return _cardBackBytes;
}

// ── Descriptor type ──────────────────────────────────────────────────────────

export type Descriptor = {
  v: 2;
  face_down?: boolean;
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
  const d: Descriptor = { v: 2, face_down: true };
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
  const effectiveImage = (!imageData && descriptor.face_down)
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

  const descPart =
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="descriptor"${CRLF}${CRLF}` +
    JSON.stringify(descriptor) +
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

  console.log(`[SleeveService] sleeve ${sleeveId} → ${descriptor.primary_label ?? ''} ${descriptor.secondary_label ?? ''} face_down=${!!descriptor.face_down} has_image=${!!effectiveImage}`.trimEnd());

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
