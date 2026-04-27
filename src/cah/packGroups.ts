import cahContentRaw from '../assets/data/cah_content.json';

interface PackJson {
  name: string;
  prompts: { text: string; pick: number }[];
  responses: { text: string }[];
}

interface CahContentJson {
  version: string;
  packs: Record<string, PackJson>;
}

const cahContent = cahContentRaw as CahContentJson;

interface PackGroup {
  id: string;
  label: string;
  packIds: string[];
}

const GROUPS: PackGroup[] = [
  { id: 'main_deck', label: 'Main Deck', packIds: ['CAH Base Set', 'CAH Main Deck'] },
];

const DEFAULT_GROUP_IDS = ['main_deck'];

export interface PackChip {
  id: string;
  label: string;
  packIds: string[];
  promptCount: number;
  responseCount: number;
}

let _chips: PackChip[] | null = null;

export function listPackChips(): PackChip[] {
  if (_chips) return _chips;
  const grouped = new Set<string>(GROUPS.flatMap(g => g.packIds));
  const chips: PackChip[] = [];

  for (const g of GROUPS) {
    let p = 0, r = 0;
    for (const pid of g.packIds) {
      const pack = cahContent.packs[pid];
      if (pack) { p += pack.prompts.length; r += pack.responses.length; }
    }
    chips.push({ id: g.id, label: g.label, packIds: [...g.packIds], promptCount: p, responseCount: r });
  }

  const standalone = Object.entries(cahContent.packs)
    .filter(([id]) => !grouped.has(id))
    .sort(([, a], [, b]) => a.name.localeCompare(b.name));
  for (const [pid, pack] of standalone) {
    chips.push({
      id: pid,
      label: pack.name.replace(/^CAH\s+/i, ''),
      packIds: [pid],
      promptCount: pack.prompts.length,
      responseCount: pack.responses.length,
    });
  }

  _chips = chips;
  return chips;
}

export const DEFAULT_ACTIVE_PACK_IDS: string[] = (() => {
  const ids = new Set<string>();
  for (const gid of DEFAULT_GROUP_IDS) {
    const g = GROUPS.find(x => x.id === gid);
    if (g) for (const pid of g.packIds) ids.add(pid);
  }
  return [...ids];
})();
