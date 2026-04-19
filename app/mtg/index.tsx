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
import { deleteDeck, loadDecks } from '../../src/storage/deckStorage';
import { Deck } from '../../src/types';

const MANA_IMAGES: Record<string, ReturnType<typeof require>> = {
  W: require('../../assets/images/white_mana.png'),
  U: require('../../assets/images/blue_mana.png'),
  B: require('../../assets/images/black_mana.png'),
  R: require('../../assets/images/red_mana.png'),
  G: require('../../assets/images/green_mana.png'),
  C: require('../../assets/images/colorless_mana.png'),
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

  const renderItem = ({ item }: { item: Deck }) => {
    console.log('[DeckList] commander imagePath:', item.commanderImagePath);
    return (
      <Pressable
        style={styles.tile}
        onPress={() => router.push(`/deck/${item.id}`)}
        onLongPress={() => handleDelete(item)}
      >
        {item.commanderImagePath ? (
          <Image
            source={{ uri: item.commanderImagePath }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.tilePlaceholder]} />
        )}
        <View style={styles.tileOverlay}>
          <Text style={styles.tileName} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.colorRow}>
            {item.colors.map(c => MANA_IMAGES[c] ? (
              <Image key={c} source={MANA_IMAGES[c]} style={styles.manaIcon} />
            ) : null)}
          </View>
          <Text style={styles.cardCount}>{item.cards.length} cards</Text>
        </View>
        <Pressable style={styles.deleteBtn} onPress={() => handleDelete(item)} hitSlop={8}>
          <Text style={styles.deleteBtnLabel}>✕</Text>
        </Pressable>
      </Pressable>
    );
  };

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
  container: { flex: 1, backgroundColor: '#292E32' },
  list: { padding: 14 },
  tile: {
    height: 120,
    backgroundColor: '#353A40',
    borderRadius: 10,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#625b71',
  },
  tilePlaceholder: { backgroundColor: '#353A40' },
  tileOverlay: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(41,46,50,0.55)',
  },
  tileName: { color: '#D4CDC1', fontSize: 17, fontWeight: '700' },
  colorRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  manaIcon: { width: 22, height: 22 },
  cardCount: { color: '#CCC2DC', fontSize: 12, marginTop: 4 },
  deleteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(125,82,96,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnLabel: { color: '#EFB8C8', fontSize: 11, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { color: '#D0BCFF', fontSize: 22, fontWeight: '700' },
  emptyHint: { color: '#625b71', fontSize: 14 },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#6650a4',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  fabLabel: { fontSize: 30, color: '#D0BCFF', lineHeight: 34 },
});
