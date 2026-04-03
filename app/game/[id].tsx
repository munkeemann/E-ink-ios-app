import { useCallback, useMemo, useState } from 'react';
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
import { beginGame, getRegisteredSleeves, sendToGraveyard } from '../../src/api/piServer';
import { getDeck, saveDeck } from '../../src/storage/deckStorage';
import { CardInstance, Deck } from '../../src/types';

type Zone = 'LIB' | 'HND' | 'BTFLD' | 'GRV' | 'EXL';

const ZONE_CONFIG: { id: Zone; label: string; color: string }[] = [
  { id: 'LIB',   label: 'Library',     color: '#3b82f6' },
  { id: 'HND',   label: 'Hand',        color: '#22c55e' },
  { id: 'BTFLD', label: 'Battlefield', color: '#e2e8f0' },
  { id: 'GRV',   label: 'Graveyard',   color: '#9ca3af' },
  { id: 'EXL',   label: 'Exile',       color: '#f97316' },
];

function sleeveIdForCard(card: CardInstance): number {
  if (card.place === 'commander') return 1;
  return parseInt(card.place, 10) + 1;
}

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

  const [activeZone, setActiveZone] = useState<Zone | null>(null);
  const [moveTarget, setMoveTarget] = useState<CardInstance | null>(null);

  const [scryModalVisible, setScryModalVisible] = useState(false);
  const [scryCountText, setScryCountText] = useState('3');

  const [tutorModalVisible, setTutorModalVisible] = useState(false);
  const [tutorQuery, setTutorQuery] = useState('');

  const [mulliganCount, setMulliganCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (id) getDeck(id).then(setDeck);
      getRegisteredSleeves().then(setConnectedSleeves);
    }, [id]),
  );

  const cards = Array.isArray(deck?.cards) ? deck!.cards : [];

  const zoneCounts = useMemo(() => {
    const counts: Record<Zone, number> = { LIB: 0, HND: 0, BTFLD: 0, GRV: 0, EXL: 0 };
    for (const card of cards) {
      if (card.zone in counts) counts[card.zone as Zone]++;
    }
    return counts;
  }, [cards]);

  const commander = cards.find(c => c.place === 'commander');

  const library = useMemo(() =>
    cards
      .filter(c => c.zone === 'LIB')
      .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10)),
    [cards],
  );

  const zoneCards = activeZone ? cards.filter(c => c.zone === activeZone) : [];

  const doBeginGame = async (gameCards: CardInstance[]) => {
    setMulliganCount(0);
    setBusy(true);
    setBusyLabel('Checking sleeves…');
    try {
      const sleeves = await getRegisteredSleeves();
      setConnectedSleeves(sleeves);
      if (sleeves.length === 0) return;
      setBusyLabel('Sending sleeves…');
      await beginGame(gameCards, sleeves);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleShuffle = async () => {
    const deckCards = Array.isArray(deck?.cards) ? deck!.cards : [];
    const commanderCards = deckCards.filter(c => c.place === 'commander');
    const lib = deckCards.filter(c => c.zone === 'LIB');
    const shuffled = shuffle(lib);
    const newCards = reassignLibraryPlaces([...commanderCards, ...shuffled]);
    const updated = { ...deck!, cards: newCards };
    await saveDeck(updated);
    setDeck(updated);
    await doBeginGame(newCards);
  };

  const handleMulligan = async () => {
    if (!deck) return;

    const deckCards = Array.isArray(deck.cards) ? deck.cards : [];
    const handCards = deckCards.filter(c => c.zone === 'HND');
    if (handCards.length === 0) return;

    const sortedLib = deckCards
      .filter(c => c.zone === 'LIB')
      .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));

    const handSize = handCards.length;
    if (sortedLib.length < handSize) return;

    const newHandSource = sortedLib.slice(0, handSize);
    const remainingLib = sortedLib.slice(handSize);

    // Sleeve IDs the player is physically holding, sorted ascending
    const oldSleeveIds = handCards
      .map(c => sleeveIdForCard(c))
      .sort((a, b) => a - b);

    // Remap those sleeve IDs onto the new hand cards (place = sleeveId - 1)
    const newHandCards: CardInstance[] = newHandSource.map((card, i) => ({
      ...card,
      place: String(oldSleeveIds[i] - 1),
      zone: 'HND' as Zone,
    }));

    // Reshuffle remaining library (excludes new hand and bottomed cards)
    const shuffledRemaining: CardInstance[] = shuffle(remainingLib).map((c, i) => ({
      ...c,
      place: String(i + 1),
      zone: 'LIB' as Zone,
    }));

    // Old hand cards go to bottom of library with highest place values
    const bottomedCards: CardInstance[] = handCards.map((c, i) => ({
      ...c,
      place: String(shuffledRemaining.length + i + 1),
      zone: 'LIB' as Zone,
    }));

    const commanderCards = deckCards.filter(c => c.place === 'commander');
    const otherCards = deckCards.filter(
      c => c.zone !== 'LIB' && c.zone !== 'HND' && c.place !== 'commander',
    );

    const finalCards = [...commanderCards, ...shuffledRemaining, ...bottomedCards, ...newHandCards, ...otherCards];
    const updated = { ...deck, cards: finalCards };
    await saveDeck(updated);
    setDeck(updated);
    setMulliganCount(prev => prev + 1);

    // Push new card images to the physical sleeves still in the player's hand
    setBusy(true);
    setBusyLabel('Sending new hand…');
    try {
      const sleeves = connectedSleeves ?? await getRegisteredSleeves();
      if (sleeves.length > 0) {
        await beginGame(newHandCards, sleeves);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleMoveCard = async (card: CardInstance, destZone: Zone) => {
    if (!deck) return;
    setMoveTarget(null);

    if (destZone === 'GRV') {
      try { await sendToGraveyard(sleeveIdForCard(card)); } catch { /* Pi offline */ }
    }

    const deckCards = Array.isArray(deck.cards) ? deck.cards : [];
    const updated = deckCards.map(c => c === card ? { ...c, zone: destZone } : c);

    const commanderCards = updated.filter(c => c.place === 'commander');
    const libCards = updated
      .filter(c => c.zone === 'LIB' && c.place !== 'commander')
      .map((c, i) => ({ ...c, place: String(i + 1) }));
    const otherCards = updated.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
    const reordered = [...commanderCards, ...libCards, ...otherCards];

    const newDeck = { ...deck, cards: reordered };
    await saveDeck(newDeck);
    setDeck(newDeck);
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
    const reordered = [match, ...others].map((c, i) => ({ ...c, place: String(i + 1) }));
    const commanderCards = (Array.isArray(deck?.cards) ? deck!.cards : []).filter(c => c.place === 'commander');
    const newCards = [...commanderCards, ...reordered];
    const updated = { ...deck!, cards: newCards };
    await saveDeck(updated);
    setDeck(updated);
    await doBeginGame(newCards);
  };

  if (!deck) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#D0BCFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Deck info bar */}
      <View style={styles.header}>
        <Text style={styles.deckName}>{deck.name}</Text>
        {commander && (
          <Text style={styles.commanderName}>⚔ {commander.displayName}</Text>
        )}
        <Text style={[
          styles.sleeveStatus,
          connectedSleeves !== null && connectedSleeves.length === 0 && styles.sleeveStatusNone,
        ]}>
          {connectedSleeves === null
            ? 'Checking sleeves…'
            : connectedSleeves.length === 0
            ? 'No sleeves connected'
            : `${connectedSleeves.length} sleeve${connectedSleeves.length === 1 ? '' : 's'} connected`}
        </Text>
      </View>

      {/* Zone buttons */}
      <View style={styles.zoneRow}>
        {ZONE_CONFIG.map(zone => (
          <Pressable
            key={zone.id}
            style={[styles.zoneBtn, { borderColor: zone.color }]}
            onPress={() => setActiveZone(zone.id)}
          >
            <Text style={[styles.zoneBtnLabel, { color: zone.color }]}>{zone.label}</Text>
            <Text style={[styles.zoneBtnCount, { color: zone.color }]}>({zoneCounts[zone.id]})</Text>
          </Pressable>
        ))}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={handleShuffle} disabled={busy}>
          <Text style={styles.actionBtnText}>🔀 Shuffle</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={() => setScryModalVisible(true)} disabled={busy}>
          <Text style={styles.actionBtnText}>👁 Scry</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={() => setTutorModalVisible(true)} disabled={busy}>
          <Text style={styles.actionBtnText}>🔍 Tutor</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={handleMulligan} disabled={busy}>
          <Text style={styles.actionBtnText}>
            {mulliganCount === 0 ? '✋ Mulligan' : `✋ Mulligan (${mulliganCount})`}
          </Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.beginGameBtn, busy && styles.btnDisabled]} onPress={() => doBeginGame(cards)} disabled={busy}>
          <Text style={styles.actionBtnText}>▶ Begin Game</Text>
        </Pressable>
      </View>

      {busy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color="#D0BCFF" />
          <Text style={styles.busyText}>{busyLabel}</Text>
        </View>
      )}

      {/* Zone card list — bottom sheet */}
      <Modal
        visible={activeZone !== null}
        transparent
        animationType="slide"
        onRequestClose={() => { setActiveZone(null); setMoveTarget(null); }}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => { setActiveZone(null); setMoveTarget(null); }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {ZONE_CONFIG.find(z => z.id === activeZone)?.label} ({zoneCards.length})
            </Text>
            {zoneCards.length === 0 ? (
              <Text style={styles.emptyText}>No cards in this zone</Text>
            ) : (
              <FlatList
                data={zoneCards}
                keyExtractor={(c, i) => `${c.baseName}-${i}`}
                renderItem={({ item }) => (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardName}>{item.displayName}</Text>
                    <Pressable style={styles.moveBtn} onPress={() => setMoveTarget(item)}>
                      <Text style={styles.moveBtnText}>Move to…</Text>
                    </Pressable>
                  </View>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Move destination picker — bottom sheet */}
      <Modal
        visible={moveTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setMoveTarget(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setMoveTarget(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Move "{moveTarget?.displayName}" to…</Text>
            {ZONE_CONFIG.filter(z => z.id !== activeZone).map(zone => (
              <Pressable
                key={zone.id}
                style={[styles.zonePickerRow, { borderLeftColor: zone.color }]}
                onPress={() => handleMoveCard(moveTarget!, zone.id)}
              >
                <Text style={[styles.zonePickerText, { color: zone.color }]}>{zone.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Scry — bottom sheet */}
      <Modal
        visible={scryModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setScryModalVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setScryModalVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Scry</Text>
            <Text style={styles.sheetLabel}>How many cards?</Text>
            <TextInput
              style={styles.sheetInput}
              value={scryCountText}
              onChangeText={setScryCountText}
              keyboardType="number-pad"
              selectTextOnFocus
              autoFocus
            />
            <View style={styles.sheetActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setScryModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleScryConfirm}>
                <Text style={styles.confirmBtnText}>Scry</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Tutor — bottom sheet */}
      <Modal
        visible={tutorModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTutorModalVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setTutorModalVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Tutor</Text>
            <Text style={styles.sheetLabel}>Card name (partial match ok)</Text>
            <TextInput
              style={styles.sheetInput}
              value={tutorQuery}
              onChangeText={setTutorQuery}
              placeholder="Lightning Bolt"
              placeholderTextColor="#625b71"
              autoFocus
              autoCapitalize="words"
            />
            <View style={styles.sheetActions}>
              <Pressable style={styles.cancelBtn} onPress={() => { setTutorModalVisible(false); setTutorQuery(''); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleTutor}>
                <Text style={styles.confirmBtnText}>Tutor</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
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

  zoneRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 14,
    gap: 6,
  },
  zoneBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  zoneBtnLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  zoneBtnCount: { fontSize: 16, fontWeight: '800', marginTop: 2 },

  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  actionBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#6650a4',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0BCFF',
  },
  beginGameBtn: { backgroundColor: '#4a3080' },
  btnDisabled: { opacity: 0.4 },
  actionBtnText: { color: '#D0BCFF', fontSize: 14, fontWeight: '700' },

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
    backgroundColor: 'rgba(41,46,50,0.9)',
  },
  busyText: { color: '#CCC2DC', fontSize: 13 },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#353A40',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#625b71',
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#625b71',
    alignSelf: 'center',
    marginVertical: 10,
  },
  sheetTitle: { color: '#D0BCFF', fontSize: 18, fontWeight: '800', marginBottom: 14 },
  sheetLabel: { color: '#CCC2DC', fontSize: 14, marginBottom: 8 },
  sheetInput: {
    backgroundColor: '#292E32',
    color: '#D4CDC1',
    borderWidth: 1,
    borderColor: '#625b71',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 14,
  },
  sheetActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#625b71',
  },
  cancelBtnText: { color: '#625b71', fontSize: 15 },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#6650a4',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#D0BCFF', fontSize: 15, fontWeight: '800' },

  emptyText: { color: '#625b71', fontSize: 14, textAlign: 'center', marginTop: 24, marginBottom: 12 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#4a4f55',
  },
  cardName: { flex: 1, color: '#D4CDC1', fontSize: 15 },
  moveBtn: {
    backgroundColor: 'rgba(102,80,164,0.3)',
    borderWidth: 1,
    borderColor: '#6650a4',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  moveBtnText: { color: '#D0BCFF', fontSize: 12, fontWeight: '700' },

  zonePickerRow: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 6,
  },
  zonePickerText: { fontSize: 16, fontWeight: '700' },
});
