/**
 * bakeForSleeve: fetch a Scryfall card image, send the raw bytes to the Pi's
 * /bake endpoint to be resized/recompressed for the e-ink sleeves, and write
 * the baked output to local disk.
 *
 * Pi contract:
 *   POST {PI_SERVER}/bake
 *   Content-Type: image/jpeg
 *   Body: raw Scryfall JPEG bytes
 *   Returns: 200 + image/jpeg body (baked bytes) on success
 *            4xx + JSON on failure
 *
 * All failures (no network, Pi offline, non-200 from Scryfall or Pi, write
 * error) log a warning and return null. Never throws — deck import keeps
 * going; the affected card simply has no `sleeveImagePath` and beginGame
 * falls back to fetching imagePath at game start.
 *
 * Front face only. TODO: revisit for flip-card mechanics — cache key would
 * need to include face index, and bake would need to fetch backImagePath too.
 */
import { PI_SERVER } from './sleeveService';
import { bakedExists, bakedPathFor, writeBakedBytes } from '../storage/sleeveCache';

async function timedFetch(uri: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(uri, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function bakeForSleeve(
  scryfallUrl: string,
  scryfallId: string,
  force: boolean = false,
  serverUrl: string = PI_SERVER,
): Promise<string | null> {
  console.log('[bake] called for', scryfallId);
  if (!scryfallUrl || !scryfallId) return null;

  // Cache hit short-circuit: idempotent re-bake calls (settings migration
  // re-run, deck re-import of a shared printing) skip the Scryfall fetch
  // and Pi POST entirely. `force=true` bypasses for cache invalidation.
  if (!force && await bakedExists(scryfallId)) {
    console.log('[bake] cache hit', scryfallId);
    return bakedPathFor(scryfallId);
  }

  console.log('[bake] cache miss, baking', scryfallId);
  let rawBytes: ArrayBuffer;
  try {
    const rawResp = await timedFetch(scryfallUrl, {}, 5000);
    if (!rawResp.ok) {
      console.warn(`[bake] scryfall fetch HTTP ${rawResp.status} for ${scryfallId}`);
      return null;
    }
    rawBytes = await rawResp.arrayBuffer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[bake] scryfall fetch error for ${scryfallId}: ${msg}`);
    return null;
  }

  let bakedBytes: ArrayBuffer;
  try {
    const bakeResp = await timedFetch(
      `${serverUrl}/bake`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: rawBytes,
      },
      10000,
    );
    if (!bakeResp.ok) {
      console.warn(`[bake] Pi /bake HTTP ${bakeResp.status} for ${scryfallId}`);
      return null;
    }
    bakedBytes = await bakeResp.arrayBuffer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[bake] Pi /bake error for ${scryfallId}: ${msg}`);
    return null;
  }

  try {
    const path = await writeBakedBytes(scryfallId, bakedBytes);
    console.log(`[bake] OK ${scryfallId} → ${bakedBytes.byteLength} bytes`);
    return path;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[bake] write error for ${scryfallId}: ${msg}`);
    return null;
  }
}
