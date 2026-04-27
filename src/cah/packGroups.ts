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

// SAM1-73: category metadata for the accordion UI. Categories are derived per-pack-id
// via categoryForPackId(); ambiguous packs default to 'Other' per ticket guidance.
export type PackCategory =
  | 'Official'
  | 'FamilyEdition'
  | 'Holiday'
  | 'International'
  | 'Procedural'
  | 'Other';

export const CATEGORY_ORDER: PackCategory[] = [
  'Official',
  'FamilyEdition',
  'Holiday',
  'International',
  'Procedural',
  'Other',
];

export const CATEGORY_LABELS: Record<PackCategory, string> = {
  Official: 'Official Cards Against Humanity',
  FamilyEdition: 'Family Edition',
  Holiday: 'Holiday Specials',
  International: 'International Variants',
  Procedural: 'Procedurally-Generated / AI',
  Other: 'Other',
};

function categoryForPackId(packId: string): PackCategory {
  if (packId === 'CAH Base Set' || packId === 'CAH Main Deck') return 'Official';
  if (/^CAH (First|Second|Third|Fourth|Fifth|Sixth) Expansion$/.test(packId)) return 'Official';
  if (/Box Expansion$/.test(packId)) return 'Official';
  if (/Hidden Compartment|Hidden Gems Bundle|Nerd Bundle|Retail (Mini|Product) Pack|Picture Card Pack|Reject Pack/.test(packId)) return 'Official';
  if (/Family Edition/.test(packId)) return 'FamilyEdition';
  if (/Holiday Pack|Hanukkah|Seasons Greetings/.test(packId)) return 'Holiday';
  if (/Conversion Kit/.test(packId)) return 'International';
  if (/A\.I\. Pack|Procedurally-Generated/.test(packId)) return 'Procedural';
  return 'Other';
}

export interface PackChip {
  id: string;
  label: string;
  packIds: string[];
  promptCount: number;
  responseCount: number;
  category: PackCategory;
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
    chips.push({
      id: g.id,
      label: g.label,
      packIds: [...g.packIds],
      promptCount: p,
      responseCount: r,
      category: categoryForPackId(g.packIds[0]),
    });
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
      category: categoryForPackId(pid),
    });
  }

  _chips = chips;
  return chips;
}

export function chipsByCategory(): Record<PackCategory, PackChip[]> {
  const out: Record<PackCategory, PackChip[]> = {
    Official: [],
    FamilyEdition: [],
    Holiday: [],
    International: [],
    Procedural: [],
    Other: [],
  };
  for (const chip of listPackChips()) {
    out[chip.category].push(chip);
  }
  return out;
}

export const DEFAULT_ACTIVE_PACK_IDS: string[] = (() => {
  const ids = new Set<string>();
  for (const gid of DEFAULT_GROUP_IDS) {
    const g = GROUPS.find(x => x.id === gid);
    if (g) for (const pid of g.packIds) ids.add(pid);
  }
  return [...ids];
})();
