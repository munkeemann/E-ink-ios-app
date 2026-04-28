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
import { colors } from '../../src/theme/colors';

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
    // SAM1-69: render both commander names if this is a partner deck.
    const commanderNames = item.cards
      .filter(c => c.place === 'commander')
      .map(c => c.displayName);
    const subtitle = commanderNames.length > 0 ? commanderNames.join(' & ') : null;
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
          {subtitle && (
            <Text style={styles.tileCommander} numberOfLines={1}>{subtitle}</Text>
          )}
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
  container: { flex: 1, backgroundColor: colors.bg.app },
  list: { padding: 14 },
  tile: {
    height: 120,
    backgroundColor: colors.bg.surface,
    borderRadius: 10,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.text.muted,
  },
  tilePlaceholder: { backgroundColor: colors.bg.surface },
  tileOverlay: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
    backgroundColor: colors.overlay.dark,
  },
  tileName: { color: colors.text.primary, fontSize: 17, fontWeight: '700' },
  tileCommander: { color: colors.accent.primary, fontSize: 12, marginTop: 2 },
  colorRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  manaIcon: { width: 22, height: 22 },
  cardCount: { color: colors.text.secondary, fontSize: 12, marginTop: 4 },
  deleteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.overlay.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnLabel: { color: colors.text.secondary, fontSize: 11, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { color: colors.accent.primary, fontSize: 22, fontWeight: '700' },
  emptyHint: { color: colors.text.muted, fontSize: 14 },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent.dark,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: colors.bg.app,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  fabLabel: { fontSize: 30, color: colors.accent.primary, lineHeight: 34 },
});
