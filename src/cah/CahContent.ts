import cahContentRaw from '../assets/data/cah_content.json';

export interface ContentPrompt {
  text: string;
  pick: number;
}

export interface ContentResponse {
  text: string;
}

interface PackJson {
  name: string;
  prompts: ContentPrompt[];
  responses: ContentResponse[];
}

interface CahContentJson {
  version: string;
  packs: Record<string, PackJson>;
}

const cahContent = cahContentRaw as CahContentJson;

export function getPromptsForPacks(activeIds: string[]): ContentPrompt[] {
  const set = new Set(activeIds);
  const out: ContentPrompt[] = [];
  for (const [id, pack] of Object.entries(cahContent.packs)) {
    if (set.has(id)) for (const p of pack.prompts) out.push(p);
  }
  return out;
}

export function getResponsesForPacks(activeIds: string[]): ContentResponse[] {
  const set = new Set(activeIds);
  const out: ContentResponse[] = [];
  for (const [id, pack] of Object.entries(cahContent.packs)) {
    if (set.has(id)) for (const r of pack.responses) out.push(r);
  }
  return out;
}

export function getContentVersion(): string {
  return cahContent.version;
}
