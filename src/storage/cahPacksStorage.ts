import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cah_active_packs_v1';

export async function loadActivePacks(): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return null;
  }
}

export async function saveActivePacks(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ids));
  } catch {}
}
