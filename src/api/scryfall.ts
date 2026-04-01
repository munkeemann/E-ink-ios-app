const BASE = 'https://api.scryfall.com';

// Scryfall rate-limit guideline: ~100 ms between requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface ScryfallCardData {
  id: string;
  name: string;
  imageUri: string;
  manaCost?: string;
  typeLine?: string;
  oracleText?: string;
  colorIdentity: string[];
  setName?: string;
}

function extractImageUri(data: Record<string, unknown>): string {
  if (data.image_uris && typeof data.image_uris === 'object') {
    const uris = data.image_uris as Record<string, string>;
    return uris.large ?? uris.normal ?? uris.small ?? '';
  }
  if (Array.isArray(data.card_faces) && data.card_faces.length > 0) {
    const face = data.card_faces[0] as Record<string, unknown>;
    if (face.image_uris && typeof face.image_uris === 'object') {
      const uris = face.image_uris as Record<string, string>;
      return uris.large ?? uris.normal ?? uris.small ?? '';
    }
  }
  return '';
}

export async function fetchCardByName(name: string): Promise<ScryfallCardData> {
  const url = `${BASE}/cards/named?exact=${encodeURIComponent(name)}`;
  const resp = await fetch(url, {
    headers: {'User-Agent': 'MTGSleeveApp/1.0', Accept: 'application/json'},
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as {details?: string};
    throw new Error(err.details ?? `Card not found: "${name}"`);
  }
  const data = (await resp.json()) as Record<string, unknown>;

  const colorArr = data.color_identity;
  const colorIdentity: string[] = Array.isArray(colorArr)
    ? colorArr.filter((x): x is string => typeof x === 'string')
    : [];

  return {
    id: data.id as string,
    name: data.name as string,
    imageUri: extractImageUri(data),
    manaCost: (data.mana_cost as string | undefined) ?? undefined,
    typeLine: (data.type_line as string | undefined) ?? undefined,
    oracleText: (data.oracle_text as string | undefined) ?? undefined,
    colorIdentity,
    setName: (data.set_name as string | undefined) ?? undefined,
  };
}

export async function fetchCardsByName(
  names: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{
  cards: ScryfallCardData[];
  errors: Array<{name: string; message: string}>;
}> {
  const cards: ScryfallCardData[] = [];
  const errors: Array<{name: string; message: string}> = [];

  for (let i = 0; i < names.length; i++) {
    try {
      const card = await fetchCardByName(names[i]);
      cards.push(card);
    } catch (e) {
      errors.push({
        name: names[i],
        message: e instanceof Error ? e.message : String(e),
      });
    }
    onProgress?.(i + 1, names.length);
    if (i < names.length - 1) {
      await delay(110); // match Kotlin: delay(110)
    }
  }

  return {cards, errors};
}
