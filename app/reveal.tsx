import { useCallback, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getDeck, saveDeck } from '../src/storage/deckStorage';
import { CardInstance, Deck } from '../src/types';

export default function RevealScreen() {
  const { deckId, count } = useLocalSearchParams<{ deckId: string; count: string }>();
  const N = Math.max(1, parseInt(count ?? '3', 10));

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<CardInstance[]>([]);
  const [artCard, setArtCard] = useState<CardInstance | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!deckId) return;
      getDeck(deckId).then(d => {
        if (!d) return;
        setDeck(d);
        const library = d.cards
          .filter(c => c.zone === 'LIB')
          .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));
        setCards(library.slice(0, N));
      });
    }, [deckId, N]),
  );

  if (!deck) return null;

  const moveUp = (index: number) => {
    if (index === 0) return;
    setCards(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDown = (index: number) => {
    setCards(prev => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleConfirm = async () => {
    // Rebuild library: revealed cards in new order, then the rest unchanged
    const revealedSet = new Set(cards);
    const restLibrary = deck.cards
      .filter(c => c.zone === 'LIB' && !revealedSet.has(c))
      .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));
    const newLibrary = [...cards, ...restLibrary].map((c, i) => ({ ...c, place: String(i + 1) }));
    const nonLib = deck.cards.filter(c => c.zone !== 'LIB');
    const updated = { ...deck, cards: [...nonLib, ...newLibrary] };
    await saveDeck(updated);
    // No sleeve push — reveal is app-only
    router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Reveal — Top {N}</Text>
          <Text style={styles.sectionHint}>Reorder with ▲▼ · Long press art for full view</Text>
        </View>

        {cards.map((card, i) => (
          <View key={`${card.baseName}-${card.place}-${i}`} style={styles.cardRow}>
            <TouchableOpacity style={styles.moveBtn} onPress={() => moveUp(i)} disabled={i === 0}>
              <Text style={[styles.moveBtnText, i === 0 && styles.moveBtnDisabled]}>▲</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moveBtn} onPress={() => moveDown(i)} disabled={i === cards.length - 1}>
              <Text style={[styles.moveBtnText, i === cards.length - 1 && styles.moveBtnDisabled]}>▼</Text>
            </TouchableOpacity>
            <Pressable onLongPress={() => setArtCard(card)}>
              {card.imagePath ? (
                <Image source={{ uri: card.imagePath }} style={styles.cardThumb} resizeMode="cover" />
              ) : (
                <View style={[styles.cardThumb, styles.cardThumbPlaceholder]} />
              )}
            </Pressable>
            <Pressable style={styles.cardNameContainer} onLongPress={() => setArtCard(card)}>
              <Text style={styles.cardName}>{card.displayName}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
          <Text style={styles.confirmText}>✓ Confirm Order</Text>
        </Pressable>
      </View>

      {/* Full-art overlay (long press) */}
      <Modal visible={artCard !== null} transparent animationType="fade" onRequestClose={() => setArtCard(null)}>
        <Pressable style={styles.artBackdrop} onPress={() => setArtCard(null)}>
          {artCard?.imagePath ? (
            <Image source={{ uri: artCard.imagePath }} style={styles.artFull} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#292E32' },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#353A40',
    borderBottomWidth: 1,
    borderColor: '#625b71',
  },
  sectionTitle: { color: '#D0BCFF', fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionHint: { color: '#625b71', fontSize: 11, marginTop: 2 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#353A40',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#625b71',
    gap: 10,
  },
  moveBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  moveBtnText: { color: '#CCC2DC', fontSize: 16 },
  moveBtnDisabled: { color: '#444' },
  cardThumb: { width: 44, height: 60, borderRadius: 4 },
  cardThumbPlaceholder: { backgroundColor: '#4a4f55' },
  cardNameContainer: { flex: 1 },
  cardName: { color: '#D4CDC1', fontSize: 15 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    backgroundColor: '#353A40',
    borderTopWidth: 1,
    borderColor: '#625b71',
  },
  cancelBtn: { flex: 1, paddingVertical: 15, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#625b71' },
  cancelText: { color: '#625b71', fontSize: 16 },
  confirmBtn: { flex: 1, backgroundColor: '#6650a4', borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  confirmText: { color: '#D0BCFF', fontSize: 16, fontWeight: '800' },
  artBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  artFull: { width: '90%', height: '80%' },
});
