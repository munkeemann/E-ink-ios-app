import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { assignSleeveIds, beginGame, getRegisteredSleeves } from '../src/api/piServer';
import { getDeck, loadSettings, saveDeck } from '../src/storage/deckStorage';
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

  const moveUp = (index: number) => {
    if (index === 0) return;
    setTopCards(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDown = (index: number) => {
    setTopCards(prev => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
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

      const [sleeves, settings] = await Promise.all([getRegisteredSleeves(), loadSettings()]);

      // Reassign sleeve IDs based on new scry order before pushing to sleeves.
      const reordered = [...commander, ...newLibrary];
      const newCards = assignSleeveIds(reordered, settings);

      const top5 = newCards
        .filter(c => c.zone === 'LIB')
        .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10))
        .slice(0, 5);
      console.log('[Scry] top 5 after sleeveId reassign:', top5.map(c => `"${c.displayName}" place=${c.place} sleeve=${c.sleeveId ?? 'null'}`).join(' | '));

      const updated = { ...deck, cards: newCards };
      await saveDeck(updated);
      await beginGame(newCards, sleeves, undefined, undefined, settings);
      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Keep on Top ({topCards.length})
          </Text>
          <Text style={styles.sectionHint}>Use buttons to reorder · Tap name to send bottom</Text>
        </View>

        {topCards.length === 0 ? (
          <Text style={styles.emptyText}>All cards sent to bottom</Text>
        ) : (
          topCards.map((card, i) => (
            <View key={`top-${card.baseName}-${card.place}-${i}`} style={styles.cardRow}>
              <TouchableOpacity
                style={styles.moveBtn}
                onPress={() => moveUp(i)}
                disabled={i === 0}
              >
                <Text style={[styles.moveBtnText, i === 0 && styles.moveBtnDisabled]}>▲</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moveBtn}
                onPress={() => moveDown(i)}
                disabled={i === topCards.length - 1}
              >
                <Text style={[styles.moveBtnText, i === topCards.length - 1 && styles.moveBtnDisabled]}>▼</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cardNameContainer} onPress={() => sendToBottom(card)}>
                <Text style={styles.cardName}>{card.displayName}</Text>
                <Text style={styles.cardHint}>tap→bottom</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

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
      </ScrollView>

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
  moveBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  moveBtnText: { color: '#CCC2DC', fontSize: 16 },
  moveBtnDisabled: { color: '#444' },
  cardNameContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
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
