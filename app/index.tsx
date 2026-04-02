import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { deleteDeck, loadDecks } from '../src/storage/deckStorage';
import { Deck } from '../src/types';

const MANA_BG: Record<string, string> = {
  W: '#f9f6da',
  U: '#0e68ab',
  B: '#21201e',
  R: '#d3202a',
  G: '#00733e',
};

export default function DeckListScreen() {
  const [decks, setDecks] = useState<Deck[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadDecks().then(setDecks);
    }, []),
  );

  const handleDelete = (deck: Deck) => {
    Alert.alert('Delete Deck', `Delete "${deck.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDeck(deck.id);
          setDecks(prev => prev.filter(d => d.id !== deck.id));
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Deck }) => (
    <Pressable
      style={styles.tile}
      onPress={() => router.push(`/deck/${item.id}`)}
      onLongPress={() => handleDelete(item)}
    >
      {item.commanderImagePath ? (
        <Image
          source={{ uri: `file://${item.commanderImagePath}` }}
          style={styles.tileArt}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.tileArt, styles.tilePlaceholder]} />
      )}
      <View style={styles.tileBody}>
        <Text style={styles.tileName} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.colorRow}>
          {item.colors.map(c => (
            <View
              key={c}
              style={[styles.pip, { backgroundColor: MANA_BG[c] ?? '#666' }]}
            >
              <Text style={styles.pipLabel}>{c}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.cardCount}>{item.cards.length} cards</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {decks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No Decks</Text>
          <Text style={styles.emptyHint}>Tap + to import your first deck</Text>
        </View>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={d => d.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
      <Pressable style={styles.fab} onPress={() => router.push('/import')}>
        <Text style={styles.fabLabel}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  list: { padding: 14 },
  tile: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2d2d50',
  },
  tileArt: { width: 80, height: 110 },
  tilePlaceholder: { backgroundColor: '#2a2a4e' },
  tileBody: { flex: 1, padding: 12, justifyContent: 'space-between' },
  tileName: { color: '#e0c070', fontSize: 17, fontWeight: '700' },
  colorRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  pip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pipLabel: { fontSize: 9, fontWeight: '800', color: '#fff' },
  cardCount: { color: '#888', fontSize: 12, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { color: '#e0c070', fontSize: 22, fontWeight: '700' },
  emptyHint: { color: '#666', fontSize: 14 },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#e0c070',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  fabLabel: { fontSize: 30, color: '#1a1a2e', lineHeight: 34 },
});
