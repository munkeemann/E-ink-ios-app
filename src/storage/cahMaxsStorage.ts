import AsyncStorage from '@react-native-async-storage/async-storage';
import { CahMaxsGameState } from '../types/cah_maxs';

const KEY = 'cah_maxs_game_v1';

export async function saveMaxsGame(state: CahMaxsGameState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export async function loadMaxsGame(): Promise<CahMaxsGameState | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CahMaxsGameState;
  } catch {
    return null;
  }
}

export async function clearMaxsGame(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
