import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { beginGame, getRegisteredSleeves } from '../../src/api/piServer';
import { getDeck, saveDeck } from '../../src/storage/deckStorage';
import { CardInstance, Deck } from '../../src/types';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function reassignLibraryPlaces(cards: CardInstance[]): CardInstance[] {
  const commander = cards.filter(c => c.place === 'commander');
  const library = cards
    .filter(c => c.zone === 'LIB')
    .map((c, i) => ({ ...c, place: String(i + 1) }));
  return [...commander, ...library];
}

export default function InGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');

  const [connectedSleeves, setConnectedSleeves] = useState<number[] | null>(null);

  const [scryModalVisible, setScryModalVisible] = useState(false);
  const [scryCountText, setScryCountText] = useState('3');

  const [tutorModalVisible, setTutorModalVisible] = useState(false);
  const [tutorQuery, setTutorQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (id) getDeck(id).then(setDeck);
      getRegisteredSleeves().then(setConnectedSleeves);
    }, [id]),
  );

  if (!deck) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#D0BCFF" />
      </View>
    );
  }

  const cards = Array.isArray(deck.cards) ? deck.cards : [];
  const commander = cards.find(c => c.place === 'commander');
  const library = cards
    .filter(c => c.zone === 'LIB')
    .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));

  const doBeginGame = async (cards: CardInstance[]) => {
    setBusy(true);
    setBusyLabel('Checking sleeves…');
    try {
      const sleeves = await getRegisteredSleeves();
      setConnectedSleeves(sleeves);
      if (sleeves.length === 0) {
        return;
      }
      setBusyLabel('Sending sleeves…');
      await beginGame(cards, sleeves);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleShuffle = async () => {
    const deckCards = Array.isArray(deck.cards) ? deck.cards : [];
    const commander = deckCards.filter(c => c.place === 'commander');
    const lib = deckCards.filter(c => c.zone === 'LIB');
    const shuffled = shuffle(lib);
    const newCards = reassignLibraryPlaces([...commander, ...shuffled]);
    const updated = { ...deck, cards: newCards };
    await saveDeck(updated);
    setDeck(updated);
    await doBeginGame(newCards);
  };

  const handleScryConfirm = () => {
    const n = parseInt(scryCountText, 10);
    if (isNaN(n) || n < 1) {
      Alert.alert('Invalid', 'Enter a number ≥ 1');
      return;
    }
    setScryModalVisible(false);
    router.push({ pathname: '/scry', params: { deckId: id, count: String(n) } });
  };

  const handleTutor = async () => {
    const q = tutorQuery.trim().toLowerCase();
    if (!q) return;

    const match = library.find(c => c.baseName.toLowerCase().includes(q));
    if (!match) {
      Alert.alert('Not found', `No library card matches "${tutorQuery}"`);
      return;
    }

    setTutorModalVisible(false);
    setTutorQuery('');

    const others = library.filter(c => c !== match);
    const reordered = [match, ...others].map((c, i) => ({
      ...c,
      place: String(i + 1),
    }));
    const commanderCards = (Array.isArray(deck.cards) ? deck.cards : []).filter(c => c.place === 'commander');
    const newCards = [...commanderCards, ...reordered];
    const updated = { ...deck, cards: newCards };
    await saveDeck(updated);
    setDeck(updated);
    await doBeginGame(newCards);
  };

  const renderCard = ({ item, index }: { item: CardInstance; index: number }) => (
    <View style={styles.cardRow}>
      <Text style={styles.cardPos}>{index + 1}</Text>
      <Text style={styles.cardName}>{item.displayName}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.deckName}>{deck.name}</Text>
        {commander && (
          <Text style={styles.commanderName}>⚔ {commander.displayName}</Text>
        )}
        <Text style={[styles.sleeveStatus, connectedSleeves !== null && connectedSleeves.length === 0 && styles.sleeveStatusNone]}>
          {connectedSleeves === null
            ? 'Checking sleeves…'
            : connectedSleeves.length === 0
            ? 'No sleeves connected'
            : `${connectedSleeves.length} sleeve${connectedSleeves.length === 1 ? '' : 's'} connected`}
        </Text>
      </View>

      <FlatList
        data={library}
        keyExtractor={(c, i) => `${c.baseName}-${i}`}
        renderItem={renderCard}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <Text style={styles.listHeader}>Library ({library.length})</Text>
        }
      />

      <View style={styles.toolbar}>
        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={handleShuffle}
          disabled={busy}
        >
          <Text style={styles.btnText}>🔀 Shuffle</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={() => setScryModalVisible(true)}
          disabled={busy}
        >
          <Text style={styles.btnText}>👁 Scry</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={() => setTutorModalVisible(true)}
          disabled={busy}
        >
          <Text style={styles.btnText}>🔍 Tutor</Text>
        </Pressable>
      </View>

      {busy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color="#D0BCFF" />
          <Text style={styles.busyText}>{busyLabel}</Text>
        </View>
      )}

      {/* Scry modal */}
      <Modal
        visible={scryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setScryModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Scry</Text>
            <Text style={styles.modalLabel}>How many cards?</Text>
            <TextInput
              style={styles.modalInput}
              value={scryCountText}
              onChangeText={setScryCountText}
              keyboardType="number-pad"
              selectTextOnFocus
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setScryModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={handleScryConfirm}>
                <Text style={styles.modalConfirmText}>Scry</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tutor modal */}
      <Modal
        visible={tutorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTutorModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Tutor</Text>
            <Text style={styles.modalLabel}>Card name (partial match ok)</Text>
            <TextInput
              style={styles.modalInput}
              value={tutorQuery}
              onChangeText={setTutorQuery}
              placeholder="Lightning Bolt"
              placeholderTextColor="#625b71"
              autoFocus
              autoCapitalize="words"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => {
                  setTutorModalVisible(false);
                  setTutorQuery('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={handleTutor}>
                <Text style={styles.modalConfirmText}>Tutor</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#292E32' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#353A40',
    borderBottomWidth: 1,
    borderColor: '#625b71',
  },
  deckName: { color: '#D0BCFF', fontSize: 18, fontWeight: '800' },
  commanderName: { color: '#CCC2DC', fontSize: 13, marginTop: 2 },
  sleeveStatus: { color: '#6ee7b7', fontSize: 11, marginTop: 4 },
  sleeveStatusNone: { color: '#f87171' },
  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  listHeader: {
    color: '#625b71',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#353A40',
  },
  cardPos: {
    width: 32,
    color: '#625b71',
    fontSize: 12,
    textAlign: 'right',
    marginRight: 12,
  },
  cardName: { color: '#D4CDC1', fontSize: 15 },
  toolbar: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    backgroundColor: '#353A40',
    borderTopWidth: 1,
    borderColor: '#625b71',
  },
  btn: {
    flex: 1,
    backgroundColor: '#6650a4',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0BCFF',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#D0BCFF', fontSize: 14, fontWeight: '700' },
  busyOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: 'rgba(41,46,50,0.85)',
  },
  busyText: { color: '#CCC2DC', fontSize: 13 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#353A40',
    borderRadius: 14,
    padding: 22,
    borderWidth: 1,
    borderColor: '#625b71',
    gap: 12,
  },
  modalTitle: { color: '#D0BCFF', fontSize: 20, fontWeight: '800' },
  modalLabel: { color: '#CCC2DC', fontSize: 14 },
  modalInput: {
    backgroundColor: '#292E32',
    color: '#D4CDC1',
    borderWidth: 1,
    borderColor: '#625b71',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#625b71',
  },
  modalCancelText: { color: '#625b71', fontSize: 15 },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#6650a4',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalConfirmText: { color: '#D0BCFF', fontSize: 15, fontWeight: '800' },
});
