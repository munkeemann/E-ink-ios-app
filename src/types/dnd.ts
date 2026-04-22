export type DndClass =
  | 'Bard' | 'Cleric' | 'Druid' | 'Paladin'
  | 'Ranger' | 'Sorcerer' | 'Warlock' | 'Wizard';

export const DND_CLASSES: DndClass[] = [
  'Bard', 'Cleric', 'Druid', 'Paladin',
  'Ranger', 'Sorcerer', 'Warlock', 'Wizard',
];

export interface DndDeck {
  id: string;           // Date.now().toString()
  name: string;
  className: DndClass;
  level: number;        // 1–20
  abilityMod?: number;  // 0–5; present only for prepared casters
  spells: string[];     // canonical SRD spell names (keys of spells.json)
  createdAt: number;
}
