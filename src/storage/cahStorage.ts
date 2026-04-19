import AsyncStorage from '@react-native-async-storage/async-storage';
import { CahGameState } from '../types/cah';

const KEY = 'cah_game_v1';

export async function saveCahGame(state: CahGameState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export async function loadCahGame(): Promise<CahGameState | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CahGameState;
  } catch {
    return null;
  }
}

export async function clearCahGame(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
