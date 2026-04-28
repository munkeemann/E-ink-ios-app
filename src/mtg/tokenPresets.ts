import { TokenTemplate } from '../types';

export interface BuiltInTokenPreset {
  label: string;
  template: TokenTemplate;
}

export const BUILT_IN_TOKEN_PRESETS: BuiltInTokenPreset[] = [
  { label: 'Treasure',          template: { name: 'Treasure',   type: 'artifact', power: '',  toughness: '',  colors: [] } },
  { label: 'Clue',              template: { name: 'Clue',       type: 'artifact', power: '',  toughness: '',  colors: [] } },
  { label: 'Food',              template: { name: 'Food',       type: 'artifact', power: '',  toughness: '',  colors: [] } },
  { label: 'Blood',             template: { name: 'Blood',      type: 'artifact', power: '',  toughness: '',  colors: ['R'] } },
  { label: 'Powerstone',        template: { name: 'Powerstone', type: 'artifact', power: '',  toughness: '',  colors: [] } },
  { label: 'Soldier 1/1',       template: { name: 'Soldier',    type: 'creature', power: '1', toughness: '1', colors: ['W'] } },
  { label: 'Spirit 1/1 flying', template: { name: 'Spirit',     type: 'creature', power: '1', toughness: '1', colors: ['W'] } },
  { label: 'Zombie 2/2',        template: { name: 'Zombie',     type: 'creature', power: '2', toughness: '2', colors: ['B'] } },
  { label: 'Goblin 1/1',        template: { name: 'Goblin',     type: 'creature', power: '1', toughness: '1', colors: ['R'] } },
];
