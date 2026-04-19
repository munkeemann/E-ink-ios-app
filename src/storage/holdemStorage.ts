import AsyncStorage from '@react-native-async-storage/async-storage';
import { HoldemGameState } from '../types/holdem';

const KEY = 'holdem_game_v1';

export async function saveHoldemGame(state: HoldemGameState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export async function loadHoldemGame(): Promise<HoldemGameState | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HoldemGameState;
  } catch {
    return null;
  }
}

export async function clearHoldemGame(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
