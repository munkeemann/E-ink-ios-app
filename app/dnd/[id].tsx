import { useCallback, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getDeck, deleteDeck } from '../../src/storage/dndStorage';
import { DndDeck } from '../../src/types/dnd';
import rawSpells from '../../src/assets/dnd/spells.json';
import spellImages from '../../src/assets/dnd/spells';
import { sendToSleeve, clearMemo, dndSpellDescriptor, PI_SERVER } from '../../src/api/sleeveService';
import { getRegisteredSleeves } from '../../src/api/piServer';

interface SpellMeta {
  level: number;
  school: string;
  classes: string[];
  png_filename: string | null;
}
const SPELLS = rawSpells as Record<string, SpellMeta>;

async function timedFetch(uri: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(uri, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const _spellCache: Map<string, ArrayBuffer> = new Map();

type DiagFn = (line: string, level?: 'log' | 'warn') => void;

async function getSpellBytes(name: string, diag?: DiagFn): Promise<ArrayBuffer | null> {
  const emit = (line: string, level: 'log' | 'warn' = 'log') => {
    if (diag) { diag(line, level); return; }
    if (level === 'warn') console.warn(line); else console.log(line);
  };
  const tag = JSON.stringify(name);

  const cached = _spellCache.get(name);
  if (cached) {
    emit(`[DND][spellbytes] ${tag} cache HIT (${cached.byteLength} bytes)`);
    return cached;
  }
  emit(`[DND][spellbytes] ${tag} cache MISS — resolving chain`);

  const asset = (spellImages as Record<string, number | undefined>)[name];
  emit(`[DND][spellbytes] ${tag} step1 spellImages[name]: type=${typeof asset} value=${JSON.stringify(asset)}`);
  if (asset === undefined) {
    emit(`[DND][spellbytes] ${tag} ABORT: asset undefined`, 'warn');
    return null;
  }

  const src = Image.resolveAssetSource(asset);
  emit(`[DND][spellbytes] ${tag} step2 resolveAssetSource: ${JSON.stringify(src)}`);
  if (!src?.uri) {
    emit(`[DND][spellbytes] ${tag} ABORT: no uri from resolveAssetSource`, 'warn');
    return null;
  }
  emit(`[DND][spellbytes] ${tag} step3 src.uri=${src.uri}`);

  const tPre = Date.now();
  try {
    await Image.prefetch(src.uri);
    emit(`[DND][spellbytes] ${tag} step4 Image.prefetch resolved in ${Date.now() - tPre}ms`);
  } catch (e) {
    emit(`[DND][spellbytes] ${tag} step4 Image.prefetch threw (non-fatal) in ${Date.now() - tPre}ms: ${e instanceof Error ? e.message : e}`);
  }

  const tFetch = Date.now();
  let resp: Response;
  try {
    resp = await timedFetch(src.uri);
    emit(`[DND][spellbytes] ${tag} step5 fetch resolved in ${Date.now() - tFetch}ms — status=${resp.status} ok=${resp.ok}`);
  } catch (e) {
    emit(`[DND][spellbytes] ${tag} ABORT: fetch threw in ${Date.now() - tFetch}ms: ${e instanceof Error ? e.message : e}`, 'warn');
    return null;
  }
  if (!resp.ok) {
    emit(`[DND][spellbytes] ${tag} ABORT: HTTP ${resp.status}`, 'warn');
    return null;
  }

  const tBuf = Date.now();
  let data: ArrayBuffer;
  try {
    data = await resp.arrayBuffer();
    emit(`[DND][spellbytes] ${tag} step6 arrayBuffer: ${data.byteLength} bytes in ${Date.now() - tBuf}ms`);
  } catch (e) {
    emit(`[DND][spellbytes] ${tag} ABORT: arrayBuffer threw in ${Date.now() - tBuf}ms: ${e instanceof Error ? e.message : e}`, 'warn');
    return null;
  }
  _spellCache.set(name, data);
  emit(`[DND][spellbytes] ${tag} OK — cached ${data.byteLength} bytes`);
  return data;
}

async function prefetchDeckSpells(names: string[]): Promise<void> {
  const t0 = Date.now();
  let warmed = 0;
  for (const name of names) {
    if (_spellCache.has(name)) { warmed++; continue; }
    const bytes = await getSpellBytes(name);
    if (bytes) warmed++;
  }
  console.log(`[DND] prefetchDeckSpells done in ${Date.now() - t0}ms — warmed ${warmed}/${names.length}`);
}

export default function DndDeckViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [deck, setDeck] = useState<DndDeck | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      getDeck(id).then(d => {
        setDeck(d);
        setLoaded(true);
        if (d) prefetchDeckSpells(d.spells);
      });
    }, [id]),
  );

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#22d3ee" size="large" />
      </View>
    );
  }

  if (!deck) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingTitle}>Deck not found</Text>
        <Pressable style={styles.missingBtn} onPress={() => router.back()}>
          <Text style={styles.missingBtnLabel}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const handlePlay = async () => {
    if (busy || !deck) return;
    setBusy(true);
    const t0 = Date.now();

    // Buffer all [DND][diag] lines; also emit to console. POST the buffer to
    // Pi /diag after handlePlay completes so lines land in journalctl next to
    // the /sleeves + /display calls.
    const diagLines: string[] = [];
    const diag = (line: string, level: 'log' | 'warn' = 'log') => {
      if (level === 'warn') console.warn(line); else console.log(line);
      diagLines.push(line);
    };

    diag(`[DND][diag] handlePlay entry — deck="${deck.name}" spells.length=${deck.spells.length}`);
    diag(`[DND][diag] first 5 deck.spells: ${JSON.stringify(deck.spells.slice(0, 5))}`);

    let pushed = 0;
    const skipReasons: Record<string, number> = {};
    const bumpSkip = (reason: string) => { skipReasons[reason] = (skipReasons[reason] ?? 0) + 1; };

    try {
      clearMemo();

      // Build push list in level-asc-then-alpha order (matches on-screen grouping).
      const byLevel = new Map<number, string[]>();
      for (const name of deck.spells) {
        const lv = SPELLS[name]?.level ?? -1;
        if (!byLevel.has(lv)) byLevel.set(lv, []);
        byLevel.get(lv)!.push(name);
      }
      byLevel.forEach(arr => arr.sort((a, b) => a.localeCompare(b)));
      const sorted: string[] = [];
      for (const lv of [...byLevel.keys()].sort((a, b) => a - b)) {
        sorted.push(...byLevel.get(lv)!);
      }
      diag(`[DND][diag] sorted push list (len=${sorted.length}): ${JSON.stringify(sorted)}`);

      const rawRegistered = await getRegisteredSleeves();
      const firstType = Array.isArray(rawRegistered) && rawRegistered.length > 0 ? typeof rawRegistered[0] : 'n/a';
      diag(`[DND][diag] getRegisteredSleeves returned: ${JSON.stringify(rawRegistered)} (isArray=${Array.isArray(rawRegistered)}, len=${rawRegistered?.length ?? 'n/a'}, firstElemType=${firstType})`);
      const registered = rawRegistered.sort((a, b) => a - b);
      const registeredSet = new Set(registered);
      diag(`[DND][diag] registered sleeves sorted: [${registered.join(', ')}] (setSize=${registeredSet.size})`);
      if (sorted.length > registered.length) {
        diag(`[DND][diag] ${sorted.length - registered.length} spell(s) exceed registered sleeves — truncating`, 'warn');
      }

      // Compact pairing: sorted[i] → registered[i].
      const pairCount = Math.min(sorted.length, registered.length);
      diag(`[DND][diag] entering push loop — pairCount=${pairCount} (sorted=${sorted.length} registered=${registered.length})`);
      if (pairCount === 0) {
        if (sorted.length === 0) bumpSkip('empty_sorted');
        if (registered.length === 0) bumpSkip('no_registered');
      }
      for (let i = 0; i < pairCount; i++) {
        const name = sorted[i];
        const sleeveId = registered[i];
        const assetPresent = (spellImages as Record<string, unknown>)[name] !== undefined;
        const regMatch = registeredSet.has(sleeveId);
        diag(`[DND][diag] iter ${i}: name=${JSON.stringify(name)} sleeve=${sleeveId} assetPresent=${assetPresent} regMatch=${regMatch ? 'y' : 'n'}`);
        const level = SPELLS[name]?.level ?? 0;
        const bytes = await getSpellBytes(name, diag);
        if (!bytes) {
          diag(`[DND][diag] iter ${i}: no bytes — skipping (sleeve=${sleeveId} name=${JSON.stringify(name)})`, 'warn');
          bumpSkip('no_bytes');
          continue;
        }
        diag(`[DND][diag] iter ${i}: calling sendToSleeve sleeve=${sleeveId} bytes=${bytes.byteLength} level=${level}`);
        try {
          await sendToSleeve(sleeveId, dndSpellDescriptor(name, level), bytes);
          pushed++;
          diag(`[DND][diag] iter ${i}: sendToSleeve returned OK (sleeve=${sleeveId})`);
        } catch (e) {
          diag(`[DND][diag] iter ${i}: sendToSleeve ERROR sleeve=${sleeveId} ${name}: ${e instanceof Error ? e.message : e}`, 'warn');
          bumpSkip('send_error');
        }
      }

      const skipTotal = Object.values(skipReasons).reduce((a, b) => a + b, 0);
      const skipBreakdown = Object.entries(skipReasons).map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
      diag(`[DND][diag] handlePlay summary — pushed=${pushed} skipped=${skipTotal} (${skipBreakdown}) sorted=${sorted.length} registered=${registered.length}`);
      diag(`[DND][diag] handlePlay complete in ${Date.now() - t0}ms`);
    } catch (e) {
      diag(`[DND][diag] handlePlay ERROR: ${e instanceof Error ? e.message : e}`, 'warn');
    } finally {
      setBusy(false);
      try {
        await fetch(`${PI_SERVER}/diag`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: diagLines.join('\n'),
        });
      } catch (e) {
        console.warn(`[DND] diag POST to Pi failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Deck', `Delete "${deck.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDeck(deck.id);
          router.back();
        },
      },
    ]);
  };

  // Group spells by level.
  const byLevel = new Map<number, string[]>();
  for (const name of deck.spells) {
    const info = SPELLS[name];
    const lv = info?.level ?? -1;
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(name);
  }
  byLevel.forEach(arr => arr.sort((a, b) => a.localeCompare(b)));
  const levels = [...byLevel.keys()].sort((a, b) => a - b);

  const modText = deck.abilityMod !== undefined ? `  ·  +${deck.abilityMod} mod` : '';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      <View style={styles.header}>
        <Text style={styles.deckName}>{deck.name}</Text>
        <Text style={styles.deckMeta}>
          {deck.className}  ·  Level {deck.level}{modText}
        </Text>
        <Text style={styles.deckCount}>
          {deck.spells.length} spell{deck.spells.length === 1 ? '' : 's'}
        </Text>
      </View>

      {levels.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No spells in this deck.</Text>
        </View>
      ) : (
        levels.map(lv => {
          const list = byLevel.get(lv) ?? [];
          return (
            <View key={lv} style={styles.levelSection}>
              <Text style={styles.levelHeader}>
                {lv === -1 ? 'Unknown' : lv === 0 ? 'Cantrips' : `Level ${lv}`}
              </Text>
              {list.map(name => {
                const info = SPELLS[name];
                const hasArt = (spellImages as Record<string, unknown>)[name] !== undefined
                  && info?.png_filename !== null;
                return (
                  <View key={name} style={styles.spellRow}>
                    <Text style={styles.spellName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.spellMeta}>
                      {info?.school ?? 'unknown school'}
                      {!hasArt && '  ·  '}
                      {!hasArt && <Text style={styles.noArtBadge}>no art</Text>}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })
      )}

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.playBtn,
            (pressed || busy) && styles.playBtnPressed,
            deck.spells.length === 0 && styles.playBtnDisabled,
          ]}
          onPress={handlePlay}
          disabled={busy || deck.spells.length === 0}
        >
          {busy ? (
            <ActivityIndicator color="#060c14" />
          ) : (
            <Text style={styles.playBtnLabel}>Play</Text>
          )}
        </Pressable>
        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnLabel}>Delete Deck</Text>
        </Pressable>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#060c14' },
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: '#060c14', alignItems: 'center', justifyContent: 'center' },

  header: {
    backgroundColor: '#071a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0e7490',
    padding: 16,
    gap: 4,
  },
  deckName: { color: '#22d3ee', fontSize: 22, fontWeight: '800' },
  deckMeta: { color: '#64b5c8', fontSize: 13, marginTop: 2 },
  deckCount: { color: '#3a6070', fontSize: 12, marginTop: 2 },

  empty: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#3a6070', fontSize: 14 },

  levelSection: {
    backgroundColor: '#071a2a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0e7490',
    padding: 12,
    gap: 6,
  },
  levelHeader: {
    color: '#22d3ee',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  spellRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0a2c3d' },
  spellName: { color: '#e0f7ff', fontSize: 14, fontWeight: '600' },
  spellMeta: { color: '#64b5c8', fontSize: 11, marginTop: 2 },
  noArtBadge: { color: '#7d5260', fontSize: 11, fontWeight: '700' },

  footer: { gap: 10, marginTop: 8 },
  playBtn: {
    height: 56,
    borderRadius: 10,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnPressed: { opacity: 0.7 },
  playBtnDisabled: { backgroundColor: '#0a2c3d' },
  playBtnLabel: { color: '#060c14', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },

  deleteBtn: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a1520',
    backgroundColor: '#0f0a0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnLabel: { color: '#7d5260', fontSize: 14, fontWeight: '700' },

  missing: { flex: 1, backgroundColor: '#060c14', alignItems: 'center', justifyContent: 'center', gap: 14 },
  missingTitle: { color: '#64b5c8', fontSize: 16 },
  missingBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: '#0e7490' },
  missingBtnLabel: { color: '#e0f7ff', fontSize: 14, fontWeight: '700' },
});
