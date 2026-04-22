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

let _allPrompts: ContentPrompt[] | null = null;
let _allResponses: ContentResponse[] | null = null;

export function getAllPrompts(): ContentPrompt[] {
  if (_allPrompts) return _allPrompts;
  const out: ContentPrompt[] = [];
  for (const pack of Object.values(cahContent.packs)) {
    for (const p of pack.prompts) out.push(p);
  }
  console.log(`[CAH-MAXS] content load — ${out.length} prompts across ${Object.keys(cahContent.packs).length} packs`);
  _allPrompts = out;
  return out;
}

export function getAllResponses(): ContentResponse[] {
  if (_allResponses) return _allResponses;
  const out: ContentResponse[] = [];
  for (const pack of Object.values(cahContent.packs)) {
    for (const r of pack.responses) out.push(r);
  }
  console.log(`[CAH-MAXS] content load — ${out.length} responses across ${Object.keys(cahContent.packs).length} packs`);
  _allResponses = out;
  return out;
}

export function getContentVersion(): string {
  return cahContent.version;
}
