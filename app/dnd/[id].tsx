import { useCallback, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
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

interface SpellMeta {
  level: number;
  school: string;
  classes: string[];
  png_filename: string | null;
}
const SPELLS = rawSpells as Record<string, SpellMeta>;

export default function DndDeckViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [deck, setDeck] = useState<DndDeck | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      getDeck(id).then(d => {
        setDeck(d);
        setLoaded(true);
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
        <Pressable style={styles.playBtn} disabled>
          <Text style={styles.playBtnLabel}>Play</Text>
          <Text style={styles.playBtnNote}>Coming in next update</Text>
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
    backgroundColor: '#071a2a',
    borderWidth: 1,
    borderColor: '#0e7490',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
  playBtnLabel: { color: '#64b5c8', fontSize: 17, fontWeight: '800' },
  playBtnNote: { color: '#f59e0b', fontSize: 11, marginTop: 2 },

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
