import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { beginGame } from '../src/api/piServer';
import { getDeck, saveDeck } from '../src/storage/deckStorage';
import { CardInstance, Deck } from '../src/types';

export default function ScryScreen() {
  const { deckId, count } = useLocalSearchParams<{
    deckId: string;
    count: string;
  }>();
  const N = Math.max(1, parseInt(count ?? '3', 10));

  const [deck, setDeck] = useState<Deck | null>(null);
  const [topCards, setTopCards] = useState<CardInstance[]>([]);
  const [bottomCards, setBottomCards] = useState<CardInstance[]>([]);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!deckId) return;
      getDeck(deckId).then(d => {
        if (!d) return;
        setDeck(d);
        const library = d.cards
          .filter(c => c.zone === 'LIB')
          .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));
        setTopCards(library.slice(0, N));
        setBottomCards([]);
      });
    }, [deckId, N]),
  );

  if (!deck) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#D0BCFF" />
      </View>
    );
  }

  const sendToBottom = (card: CardInstance) => {
    setTopCards(prev => prev.filter(c => c !== card));
    setBottomCards(prev => [...prev, card]);
  };

  const bringToTop = (card: CardInstance) => {
    setBottomCards(prev => prev.filter(c => c !== card));
    setTopCards(prev => [...prev, card]);
  };

  const handleConfirm = async () => {
    if (!deck) return;
    setBusy(true);
    try {
      const commander = deck.cards.filter(c => c.place === 'commander');
      const scrySet = new Set([...topCards, ...bottomCards]);
      const restLibrary = deck.cards
        .filter(c => c.zone === 'LIB' && !scrySet.has(c))
        .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));

      const newLibrary = [...topCards, ...restLibrary, ...bottomCards].map(
        (c, i) => ({ ...c, place: String(i + 1) }),
      );

      const newCards = [...commander, ...newLibrary];
      const updated = { ...deck, cards: newCards };
      await saveDeck(updated);
      await beginGame(newCards);
      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const renderTopItem = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<CardInstance>) => (
    <ScaleDecorator>
      <TouchableOpacity
        style={[styles.cardRow, isActive && styles.cardRowActive]}
        onLongPress={drag}
        onPress={() => sendToBottom(item)}
        activeOpacity={0.7}
      >
        <Text style={styles.dragHandle}>☰</Text>
        <Text style={styles.cardName}>{item.displayName}</Text>
        <Text style={styles.cardHint}>tap→bottom  long press→drag</Text>
      </TouchableOpacity>
    </ScaleDecorator>
  );

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Keep on Top ({topCards.length})
        </Text>
        <Text style={styles.sectionHint}>Long press to drag · Tap to send bottom</Text>
      </View>

      <DraggableFlatList
        data={topCards}
        onDragEnd={({ data }) => setTopCards(data)}
        keyExtractor={(c, i) => `top-${c.baseName}-${c.place}-${i}`}
        renderItem={renderTopItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>All cards sent to bottom</Text>
        }
      />

      {bottomCards.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Send to Bottom ({bottomCards.length})
            </Text>
            <Text style={styles.sectionHint}>Tap to move back to top</Text>
          </View>
          {bottomCards.map((c, i) => (
            <TouchableOpacity
              key={`bot-${c.baseName}-${i}`}
              style={styles.bottomRow}
              onPress={() => bringToTop(c)}
            >
              <Text style={styles.bottomName}>{c.displayName}</Text>
              <Text style={styles.bottomHint}>↑ tap to restore</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      <View style={styles.footer}>
        <Pressable
          style={[styles.confirmBtn, busy && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#D0BCFF" />
          ) : (
            <Text style={styles.confirmText}>✓ Confirm & Send Sleeves</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#292E32' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#353A40',
    borderBottomWidth: 1,
    borderColor: '#625b71',
  },
  sectionTitle: {
    color: '#D0BCFF',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionHint: { color: '#625b71', fontSize: 11, marginTop: 2 },
  list: { flexGrow: 0, maxHeight: 340 },
  listContent: { paddingVertical: 4 },
  emptyText: {
    color: '#625b71',
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#353A40',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#625b71',
    gap: 10,
  },
  cardRowActive: { backgroundColor: '#6650a4', elevation: 8 },
  dragHandle: { color: '#CCC2DC', fontSize: 18 },
  cardName: { color: '#D4CDC1', fontSize: 15, flex: 1 },
  cardHint: { color: '#625b71', fontSize: 10 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#292E32',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#353A40',
  },
  bottomName: { color: '#CCC2DC', fontSize: 14, flex: 1 },
  bottomHint: { color: '#625b71', fontSize: 11 },
  footer: {
    padding: 14,
    backgroundColor: '#353A40',
    borderTopWidth: 1,
    borderColor: '#625b71',
    marginTop: 'auto',
  },
  confirmBtn: {
    backgroundColor: '#6650a4',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmText: { color: '#D0BCFF', fontSize: 16, fontWeight: '800' },
});
