export const PI_SERVER = 'http://192.168.86.193:5050';

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
  const boundary = `----ECBoundary${Date.now()}`;
  const CRLF = '\r\n';
  const enc = new TextEncoder();

  const descPart =
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="descriptor"${CRLF}${CRLF}` +
    JSON.stringify(descriptor) +
    CRLF;

  let body: Uint8Array;

  if (imageData) {
    const imgHeader =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="image"; filename="card.jpg"${CRLF}` +
      `Content-Type: image/jpeg${CRLF}${CRLF}`;
    const closing = `${CRLF}--${boundary}--${CRLF}`;

    const chunks = [
      enc.encode(descPart),
      enc.encode(imgHeader),
      new Uint8Array(imageData),
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

  console.log(`[SleeveService] sleeve=${sleeveId} ${JSON.stringify(descriptor)}`);

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
}
