import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { beginGame, getRegisteredSleeves, sendToGraveyard } from '../../src/api/piServer';
import { getDeck, saveDeck } from '../../src/storage/deckStorage';
import { CardInstance, Deck } from '../../src/types';

type Zone = 'LIB' | 'HND' | 'BTFLD' | 'GRV' | 'EXL' | 'CMD';

const ZONE_CONFIG: { id: Zone; label: string; color: string }[] = [
  { id: 'CMD',   label: 'Command',     color: '#f59e0b' },
  { id: 'LIB',   label: 'Library',     color: '#3b82f6' },
  { id: 'HND',   label: 'Hand',        color: '#22c55e' },
  { id: 'BTFLD', label: 'Battlefield', color: '#e2e8f0' },
  { id: 'GRV',   label: 'Graveyard',   color: '#9ca3af' },
  { id: 'EXL',   label: 'Exile',       color: '#f97316' },
];

const MOVABLE_ZONES = ZONE_CONFIG.filter(z => z.id !== 'CMD');

function cardKey(card: CardInstance): string {
  return `${card.baseName}__${card.place}`;
}

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

function normalizeCommanderZone(cards: CardInstance[]): CardInstance[] {
  return cards.map(c => c.place === 'commander' ? { ...c, zone: 'CMD' } : c);
}

export default function InGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [connectedSleeves, setConnectedSleeves] = useState<number[] | null>(null);

  const [activeZone, setActiveZone] = useState<Zone | null>(null);

  // Multi-select
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [multiMovePickerVisible, setMultiMovePickerVisible] = useState(false);

  const [scryModalVisible, setScryModalVisible] = useState(false);
  const [scryCountText, setScryCountText] = useState('3');

  const [tutorModalVisible, setTutorModalVisible] = useState(false);
  const [tutorQuery, setTutorQuery] = useState('');

  const [mulliganCount, setMulliganCount] = useState(0);

  const [millModalVisible, setMillModalVisible] = useState(false);
  const [millCountText, setMillCountText] = useState('1');
  const [milledCards, setMilledCards] = useState<CardInstance[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (id) {
        getDeck(id).then(d => {
          if (!d) return;
          const normalized = normalizeCommanderZone(Array.isArray(d.cards) ? d.cards : []);
          setDeck({ ...d, cards: normalized });
        });
      }
      getRegisteredSleeves().then(setConnectedSleeves);
    }, [id]),
  );

  const cards = Array.isArray(deck?.cards) ? deck!.cards : [];

  const zoneCounts = useMemo(() => {
    const counts: Record<Zone, number> = { LIB: 0, HND: 0, BTFLD: 0, GRV: 0, EXL: 0, CMD: 0 };
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

  // ─── Begin Game ───────────────────────────────────────────────────────────
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

  // ─── Shuffle ──────────────────────────────────────────────────────────────
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

  // ─── Mulligan ─────────────────────────────────────────────────────────────
  const handleMulligan = async () => {
    console.log('[Mulligan] Button tapped');
    if (!deck) { console.log('[Mulligan] Aborted — no deck'); return; }

    const deckCards = Array.isArray(deck.cards) ? deck.cards : [];
    let handCards = deckCards.filter(c => c.zone === 'HND');
    console.log(`[Mulligan] Cards in HND zone: ${handCards.length}`);

    // If no cards are explicitly in Hand, treat top 7 library cards as the starting hand
    if (handCards.length === 0) {
      const sortedLibForHand = deckCards
        .filter(c => c.zone === 'LIB')
        .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));
      handCards = sortedLibForHand.slice(0, 7);
      console.log(`[Mulligan] No HND cards — treating top ${handCards.length} library cards as hand`);
    }

    if (handCards.length === 0) {
      console.log('[Mulligan] Aborted — library is empty');
      return;
    }

    const sortedLib = deckCards
      .filter(c => c.zone === 'LIB' && !handCards.includes(c))
      .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));

    const handSize = handCards.length;
    console.log(`[Mulligan] Hand size: ${handSize}, remaining library: ${sortedLib.length}`);

    if (sortedLib.length < handSize) {
      console.log('[Mulligan] Aborted — not enough library cards to draw a new hand');
      return;
    }

    const newHandSource = sortedLib.slice(0, handSize);
    const remainingLib = sortedLib.slice(handSize);
    console.log(`[Mulligan] New hand source: ${newHandSource.map(c => c.baseName).join(', ')}`);

    // Sleeve IDs the player is physically holding, sorted ascending
    const oldSleeveIds = handCards
      .map(c => sleeveIdForCard(c))
      .sort((a, b) => a - b);
    console.log(`[Mulligan] Old sleeve IDs: ${oldSleeveIds.join(', ')}`);

    // Remap those sleeve IDs onto the new hand cards (place = sleeveId - 1)
    const newHandCards: CardInstance[] = newHandSource.map((card, i) => ({
      ...card,
      place: String(oldSleeveIds[i] - 1),
      zone: 'HND' as Zone,
    }));
    console.log(`[Mulligan] New hand cards with sleeve IDs: ${newHandCards.map(c => `${c.baseName}→sleeve${sleeveIdForCard(c)}`).join(', ')}`);

    // Reshuffle remaining library, assign contiguous places from 1
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
    console.log(`[Mulligan] Bottomed cards: ${bottomedCards.map(c => c.baseName).join(', ')}`);

    const commanderCards = deckCards.filter(c => c.place === 'commander');
    const otherCards = deckCards.filter(
      c => c.zone !== 'LIB' && c.zone !== 'HND' && c.place !== 'commander',
    );

    const finalCards = [...commanderCards, ...shuffledRemaining, ...bottomedCards, ...newHandCards, ...otherCards];
    console.log(`[Mulligan] Final card count: ${finalCards.length}`);

    const updated = { ...deck, cards: finalCards };
    await saveDeck(updated);
    setDeck(updated);
    setMulliganCount(prev => prev + 1);
    console.log('[Mulligan] Deck saved, pushing images to Pi');

    setBusy(true);
    setBusyLabel('Sending new hand…');
    try {
      const sleeves = connectedSleeves ?? await getRegisteredSleeves();
      console.log(`[Mulligan] Registered sleeves: ${sleeves.join(', ')}`);
      if (sleeves.length > 0) {
        await beginGame(newHandCards, sleeves);
        console.log('[Mulligan] Pi push complete');
      } else {
        console.log('[Mulligan] No sleeves connected — skipping Pi push');
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  // ─── Move card (single, legacy — used by CMD zone fallthrough) ────────────
  const handleMoveCard = async (card: CardInstance, destZone: Zone) => {
    if (!deck) return;

    if (destZone === 'GRV') {
      sendToGraveyard(sleeveIdForCard(card)).catch(() => {});
    }

    const deckCards = Array.isArray(deck.cards) ? deck.cards : [];
    const updated = deckCards.map(c => c === card ? { ...c, zone: destZone } : c);
    const commanderCards = updated.filter(c => c.place === 'commander');
    const libCards = updated
      .filter(c => c.zone === 'LIB' && c.place !== 'commander')
      .map((c, i) => ({ ...c, place: String(i + 1) }));
    const otherCards = updated.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
    const newDeck = { ...deck, cards: [...commanderCards, ...libCards, ...otherCards] };
    await saveDeck(newDeck);
    setDeck(newDeck);
  };

  // ─── Move selected cards (multi-select) ───────────────────────────────────
  const handleMoveSelected = async (destZone: Zone) => {
    if (!deck || selectedCards.size === 0) return;
    setMultiMovePickerVisible(false);
    setActiveZone(null);

    const keys = selectedCards;
    const deckCards = Array.isArray(deck.cards) ? deck.cards : [];

    const updated = deckCards.map(c => {
      if (keys.has(cardKey(c)) && c.zone === activeZone) {
        if (destZone === 'GRV') sendToGraveyard(sleeveIdForCard(c)).catch(() => {});
        return { ...c, zone: destZone };
      }
      return c;
    });

    const commanderCards = updated.filter(c => c.place === 'commander');
    const libCards = updated
      .filter(c => c.zone === 'LIB' && c.place !== 'commander')
      .map((c, i) => ({ ...c, place: String(i + 1) }));
    const otherCards = updated.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
    const newDeck = { ...deck, cards: [...commanderCards, ...libCards, ...otherCards] };
    await saveDeck(newDeck);
    setDeck(newDeck);
    setSelectedCards(new Set());
  };

  const toggleCardSelected = (card: CardInstance) => {
    const key = cardKey(card);
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ─── Scry ─────────────────────────────────────────────────────────────────
  const handleScryConfirm = () => {
    const n = parseInt(scryCountText, 10);
    if (isNaN(n) || n < 1) { Alert.alert('Invalid', 'Enter a number ≥ 1'); return; }
    setScryModalVisible(false);
    router.push({ pathname: '/scry', params: { deckId: id, count: String(n) } });
  };

  // ─── Tutor ────────────────────────────────────────────────────────────────
  const handleTutor = async () => {
    const q = tutorQuery.trim().toLowerCase();
    if (!q) return;

    const match = library.find(c => c.baseName.toLowerCase().includes(q));
    if (!match) { Alert.alert('Not found', `No library card matches "${tutorQuery}"`); return; }

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

  // ─── Mill ─────────────────────────────────────────────────────────────────
  const handleMillConfirm = async () => {
    const n = parseInt(millCountText, 10);
    if (isNaN(n) || n < 1) { Alert.alert('Invalid', 'Enter a number ≥ 1'); return; }
    if (!deck) return;
    setMillModalVisible(false);

    const deckCards = Array.isArray(deck.cards) ? deck.cards : [];
    const sortedLib = deckCards
      .filter(c => c.zone === 'LIB')
      .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));

    const toMill = sortedLib.slice(0, n);
    if (toMill.length === 0) { Alert.alert('Library empty', 'No cards to mill.'); return; }

    const milledSet = new Set(toMill);
    const updated = deckCards.map(c => milledSet.has(c) ? { ...c, zone: 'GRV' as Zone } : c);
    const commanderCards = updated.filter(c => c.place === 'commander');
    const libCards = updated
      .filter(c => c.zone === 'LIB' && c.place !== 'commander')
      .map((c, i) => ({ ...c, place: String(i + 1) }));
    const otherCards = updated.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
    const newDeck = { ...deck, cards: [...commanderCards, ...libCards, ...otherCards] };
    await saveDeck(newDeck);
    setDeck(newDeck);
    setMilledCards(toMill);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
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
        {commander && <Text style={styles.commanderName}>⚔ {commander.displayName}</Text>}
        <Text style={[
          styles.sleeveStatus,
          connectedSleeves !== null && connectedSleeves.length === 0 && styles.sleeveStatusNone,
        ]}>
          {connectedSleeves === null ? 'Checking sleeves…'
            : connectedSleeves.length === 0 ? 'No sleeves connected'
            : `${connectedSleeves.length} sleeve${connectedSleeves.length === 1 ? '' : 's'} connected`}
        </Text>
      </View>

      {/* Zone buttons */}
      <View style={styles.zoneRow}>
        {ZONE_CONFIG.map(zone => (
          <Pressable
            key={zone.id}
            style={[styles.zoneBtn, { borderColor: zone.color }]}
            onPress={() => { setSelectedCards(new Set()); setActiveZone(zone.id); }}
          >
            <Text style={[styles.zoneBtnLabel, { color: zone.color }]}>{zone.label}</Text>
            {zone.id === 'CMD'
              ? <Text style={[styles.zoneBtnCommander, { color: zone.color }]} numberOfLines={1}>
                  {commander?.displayName ?? '—'}
                </Text>
              : <Text style={[styles.zoneBtnCount, { color: zone.color }]}>({zoneCounts[zone.id]})</Text>
            }
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
        <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={() => setMillModalVisible(true)} disabled={busy}>
          <Text style={styles.actionBtnText}>💀 Mill</Text>
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
        onRequestClose={() => { setActiveZone(null); setSelectedCards(new Set()); }}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => { setActiveZone(null); setSelectedCards(new Set()); }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />

            {/* Header row with title + Move Selected button */}
            <View style={styles.zoneSheetHeader}>
              <Text style={styles.sheetTitle}>
                {ZONE_CONFIG.find(z => z.id === activeZone)?.label} ({zoneCards.length})
              </Text>
              {activeZone !== 'CMD' && (
                <Pressable
                  style={[styles.moveSelectedBtn, selectedCards.size === 0 && styles.moveSelectedBtnDisabled]}
                  disabled={selectedCards.size === 0}
                  onPress={() => setMultiMovePickerVisible(true)}
                >
                  <Text style={styles.moveSelectedBtnText}>
                    Move {selectedCards.size > 0 ? `(${selectedCards.size})` : 'selected'} to…
                  </Text>
                </Pressable>
              )}
            </View>

            {zoneCards.length === 0 ? (
              <Text style={styles.emptyText}>No cards in this zone</Text>
            ) : (
              <FlatList
                data={zoneCards}
                keyExtractor={(c, i) => `${c.baseName}-${i}`}
                renderItem={({ item }) => {
                  const key = cardKey(item);
                  const isSelected = selectedCards.has(key);
                  return (
                    <View style={styles.cardRow}>
                      {activeZone !== 'CMD' && (
                        <Pressable style={[styles.checkbox, isSelected && styles.checkboxChecked]} onPress={() => toggleCardSelected(item)}>
                          {isSelected && <Text style={styles.checkmark}>✓</Text>}
                        </Pressable>
                      )}
                      <Text style={styles.cardName}>{item.displayName}</Text>
                    </View>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Multi-select move destination picker */}
      <Modal
        visible={multiMovePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMultiMovePickerVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setMultiMovePickerVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Move {selectedCards.size} card{selectedCards.size !== 1 ? 's' : ''} to…</Text>
            {MOVABLE_ZONES.filter(z => z.id !== activeZone).map(zone => (
              <Pressable
                key={zone.id}
                style={[styles.zonePickerRow, { borderLeftColor: zone.color }]}
                onPress={() => handleMoveSelected(zone.id)}
              >
                <Text style={[styles.zonePickerText, { color: zone.color }]}>{zone.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Scry — bottom sheet */}
      <Modal visible={scryModalVisible} transparent animationType="slide" onRequestClose={() => setScryModalVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setScryModalVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Scry</Text>
            <Text style={styles.sheetLabel}>How many cards?</Text>
            <TextInput style={styles.sheetInput} value={scryCountText} onChangeText={setScryCountText} keyboardType="number-pad" selectTextOnFocus autoFocus />
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
      <Modal visible={tutorModalVisible} transparent animationType="slide" onRequestClose={() => setTutorModalVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setTutorModalVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Tutor</Text>
            <Text style={styles.sheetLabel}>Card name (partial match ok)</Text>
            <TextInput style={styles.sheetInput} value={tutorQuery} onChangeText={setTutorQuery} placeholder="Lightning Bolt" placeholderTextColor="#625b71" autoFocus autoCapitalize="words" />
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

      {/* Mill — bottom sheet */}
      <Modal visible={millModalVisible} transparent animationType="slide" onRequestClose={() => setMillModalVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMillModalVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Mill</Text>
            <Text style={styles.sheetLabel}>How many cards to mill?</Text>
            <TextInput style={styles.sheetInput} value={millCountText} onChangeText={setMillCountText} keyboardType="number-pad" selectTextOnFocus autoFocus />
            <View style={styles.sheetActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setMillModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleMillConfirm}>
                <Text style={styles.confirmBtnText}>Confirm Mill</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Mill results */}
      <Modal visible={milledCards !== null} transparent animationType="fade" onRequestClose={() => setMilledCards(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, styles.millResultsSheet]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Milled {milledCards?.length ?? 0} card{milledCards?.length !== 1 ? 's' : ''}</Text>
            <ScrollView style={styles.millResultsList}>
              {(milledCards ?? []).map((c, i) => (
                <Text key={i} style={styles.millResultCard}>{c.displayName}</Text>
              ))}
            </ScrollView>
            <Pressable style={[styles.confirmBtn, { marginTop: 14 }]} onPress={() => setMilledCards(null)}>
              <Text style={styles.confirmBtnText}>Done</Text>
            </Pressable>
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
  zoneBtnCommander: { fontSize: 8, fontWeight: '700', marginTop: 2, textAlign: 'center', paddingHorizontal: 2 },

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

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
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
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#625b71' },
  cancelBtnText: { color: '#625b71', fontSize: 15 },
  confirmBtn: { flex: 1, backgroundColor: '#6650a4', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  confirmBtnText: { color: '#D0BCFF', fontSize: 15, fontWeight: '800' },

  zoneSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  moveSelectedBtn: {
    backgroundColor: '#6650a4',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  moveSelectedBtnDisabled: { opacity: 0.35 },
  moveSelectedBtnText: { color: '#D0BCFF', fontSize: 12, fontWeight: '700' },

  emptyText: { color: '#625b71', fontSize: 14, textAlign: 'center', marginTop: 24, marginBottom: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#4a4f55' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#625b71',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#6650a4', borderColor: '#D0BCFF' },
  checkmark: { color: '#D0BCFF', fontSize: 13, fontWeight: '800' },
  cardName: { flex: 1, color: '#D4CDC1', fontSize: 15 },

  zonePickerRow: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 6,
  },
  zonePickerText: { fontSize: 16, fontWeight: '700' },

  millResultsSheet: { maxHeight: '70%' },
  millResultsList: { marginBottom: 8 },
  millResultCard: { color: '#D4CDC1', fontSize: 15, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#4a4f55' },
});
