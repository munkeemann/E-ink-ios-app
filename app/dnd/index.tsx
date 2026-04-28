import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { listDecks } from '../../src/storage/dndStorage';
import { DndDeck } from '../../src/types/dnd';
import { colors } from '../../src/theme/colors';

export default function DndDeckPickerScreen() {
  const [decks, setDecks] = useState<DndDeck[]>([]);

  useFocusEffect(
    useCallback(() => {
      listDecks().then(setDecks);
    }, []),
  );

  const renderDeck = ({ item }: { item: DndDeck }) => {
    const modText = item.abilityMod !== undefined ? `  ·  +${item.abilityMod} mod` : '';
    const subtitle = `${item.className}  ·  Level ${item.level}${modText}`;
    return (
      <Pressable
        style={({ pressed }) => [styles.deckTile, pressed && styles.deckTilePressed]}
        onPress={() => router.push(`/dnd/${item.id}` as any)}
      >
        <View style={styles.deckTileBody}>
          <Text style={styles.deckName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.deckMeta}>{subtitle}</Text>
          <Text style={styles.deckSpells}>{item.spells.length} spell{item.spells.length === 1 ? '' : 's'}</Text>
        </View>
        <Text style={styles.deckArrow}>›</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {decks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No decks yet</Text>
          <Text style={styles.emptyHint}>Tap New Deck to build your first spell list</Text>
        </View>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={d => d.id}
          renderItem={renderDeck}
          contentContainerStyle={styles.list}
        />
      )}
      <Pressable style={styles.newBtn} onPress={() => router.push('/dnd/new' as any)}>
        <Text style={styles.newBtnLabel}>+  New Deck</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.app },
  list: { padding: 16, paddingBottom: 96 },

  deckTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent.dark,
    padding: 14,
    marginBottom: 10,
  },
  deckTilePressed: { backgroundColor: colors.bg.elevated, borderColor: colors.accent.primary },
  deckTileBody: { flex: 1, gap: 3 },
  deckName: { color: colors.text.primary, fontSize: 16, fontWeight: '700' },
  deckMeta: { color: colors.text.secondary, fontSize: 12 },
  deckSpells: { color: colors.text.muted, fontSize: 11, marginTop: 2 },
  deckArrow: { color: colors.accent.primary, fontSize: 24, marginLeft: 8 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { color: colors.accent.primary, fontSize: 22, fontWeight: '700' },
  emptyHint: { color: colors.text.secondary, fontSize: 14, textAlign: 'center' },

  newBtn: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  newBtnLabel: { color: colors.bg.app, fontSize: 16, fontWeight: '800', letterSpacing: 0.8 },
});
