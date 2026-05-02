/**
 * On-disk cache of sleeve-baked JPEGs (540x760, baseline, 4:2:0, sRGB, q=85).
 * Files are keyed by Scryfall printing UUID and live under
 * `${FileSystem.cacheDirectory}sleeves/${scryfallId}.sleeve.jpg`.
 *
 * Lifecycle:
 *  - Written by bakeForSleeve (src/api/sleeveCache.ts) at deck import time.
 *  - Read by beginGame (src/api/piServer.ts) at game start.
 *  - Cleared in bulk via clearAll() — exposed for a future "reset cache" tool.
 *
 * Cache durability: cacheDirectory may be evicted by the OS under disk
 * pressure. Callers must treat absence as "miss, re-bake" rather than fatal.
 */
import * as FileSystem from 'expo-file-system';

const SLEEVE_CACHE_DIR = `${FileSystem.cacheDirectory}sleeves/`;

let _dirEnsured = false;

async function ensureDir(): Promise<void> {
  if (_dirEnsured) return;
  const info = await FileSystem.getInfoAsync(SLEEVE_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SLEEVE_CACHE_DIR, { intermediates: true });
  }
  _dirEnsured = true;
}

export function bakedPathFor(scryfallId: string): string {
  return `${SLEEVE_CACHE_DIR}${scryfallId}.sleeve.jpg`;
}

export async function bakedExists(scryfallId: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(bakedPathFor(scryfallId));
  return info.exists;
}

/**
 * Reads bytes from a previously-written sleeve cache file. `localPath` should
 * be the value returned by writeBakedBytes (typically stored on the
 * CardInstance as `sleeveImagePath`).
 * Throws on missing/unreadable file — callers in the begin-game path should
 * fall back to fetching imagePath when this throws.
 */
export async function readBakedBytes(localPath: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(base64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

export async function writeBakedBytes(scryfallId: string, bytes: ArrayBuffer): Promise<string> {
  await ensureDir();
  const path = bakedPathFor(scryfallId);

  // Chunked encode: a single String.fromCharCode(...arr) on a 60kB image
  // can blow the JS call stack on some engines.
  const view = new Uint8Array(bytes);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(view.subarray(i, i + CHUNK)));
  }
  const base64 = btoa(binary);

  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

export async function clearAll(): Promise<void> {
  const info = await FileSystem.getInfoAsync(SLEEVE_CACHE_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(SLEEVE_CACHE_DIR, { idempotent: true });
  }
  _dirEnsured = false;
}
