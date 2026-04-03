import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PI_SERVER, beginGame, getRegisteredSleeves, sendToGraveyard } from '../../src/api/piServer';
import { fetchTokenImage } from '../../src/api/scryfall';
import { getDeck, saveDeck } from '../../src/storage/deckStorage';
import { CardInstance, Deck, TokenTemplate } from '../../src/types';

type Zone = 'LIB' | 'HND' | 'BTFLD' | 'GRV' | 'EXL' | 'CMD' | 'TKN';

const ZONE_CONFIG: { id: Zone; label: string; color: string }[] = [
  { id: 'CMD',   label: 'Command',     color: '#f59e0b' },
  { id: 'LIB',   label: 'Library',     color: '#3b82f6' },
  { id: 'HND',   label: 'Hand',        color: '#22c55e' },
  { id: 'BTFLD', label: 'Battlefield', color: '#e2e8f0' },
  { id: 'GRV',   label: 'Graveyard',   color: '#9ca3af' },
  { id: 'EXL',   label: 'Exile',       color: '#f97316' },
];

const MOVABLE_ZONES = ZONE_CONFIG.filter(z => z.id !== 'CMD');

const MTG_COLORS = ['W', 'U', 'B', 'R', 'G'];
const COLOR_LABELS: Record<string, string> = { W: '☀️', U: '💧', B: '💀', R: '🔥', G: '🌲' };

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
  const { id, freshStart } = useLocalSearchParams<{ id: string; freshStart?: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [connectedSleeves, setConnectedSleeves] = useState<number[] | null>(null);

  const [activeZone, setActiveZone] = useState<Zone | null>(null);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());

  const [scryModalVisible, setScryModalVisible] = useState(false);
  const [scryCountText, setScryCountText] = useState('3');

  const [tutorModalVisible, setTutorModalVisible] = useState(false);
  const [tutorQuery, setTutorQuery] = useState('');

  const [millModalVisible, setMillModalVisible] = useState(false);
  const [millCountText, setMillCountText] = useState('1');

  // Mulligan bottom sheet
  const [mulliganSheetVisible, setMulliganSheetVisible] = useState(false);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [mulliganBottomed, setMulliganBottomed] = useState<string[]>([]);
  const [mulliganBusy, setMulliganBusy] = useState(false);
  const shownFreshMulliganRef = useRef(false);

  // Create Token modal
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [tokenTab, setTokenTab] = useState<'custom' | 'favorites'>('custom');
  const [tokenName, setTokenName] = useState('');
  const [tokenPower, setTokenPower] = useState('1');
  const [tokenToughness, setTokenToughness] = useState('1');
  const [tokenColors, setTokenColors] = useState<string[]>([]);
  const [tokenCreating, setTokenCreating] = useState(false);

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

  // Auto-show mulligan sheet when navigated here with freshStart=true
  useEffect(() => {
    if (freshStart === 'true' && deck && !shownFreshMulliganRef.current) {
      shownFreshMulliganRef.current = true;
      setMulliganCount(0);
      setMulliganBottomed([]);
      setMulliganSheetVisible(true);
    }
  }, [freshStart, deck]);

  const cards = Array.isArray(deck?.cards) ? deck!.cards : [];

  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = { LIB: 0, HND: 0, BTFLD: 0, GRV: 0, EXL: 0, CMD: 0 };
    for (const card of cards) {
      if (card.zone === 'TKN') {
        counts['BTFLD']++;       // tokens count toward battlefield
      } else if (card.zone in counts) {
        counts[card.zone]++;
      }
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

  // BTFLD zone sheet also shows TKN cards
  const zoneCards = useMemo(() => {
    if (!activeZone) return [];
    if (activeZone === 'BTFLD') return cards.filter(c => c.zone === 'BTFLD' || c.zone === 'TKN');
    return cards.filter(c => c.zone === activeZone);
  }, [activeZone, cards]);

  // ─── Begin Game (called by Shuffle / Tutor, not by a button) ─────────────
  const doBeginGame = async (gameCards: CardInstance[]) => {
    setMulliganCount(0);
    setMulliganBottomed([]);
    setBusy(true);
    setBusyLabel('Checking sleeves…');
    try {
      const sleeves = await getRegisteredSleeves();
      setConnectedSleeves(sleeves);
      if (sleeves.length > 0) {
        setBusyLabel('Sending sleeves…');
        await beginGame(gameCards, sleeves);
      }
      setMulliganSheetVisible(true);
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

  // ─── Mulligan (from bottom sheet) ─────────────────────────────────────────
  const handleMulliganFromSheet = async () => {
    if (!deck) return;
    setMulliganBusy(true);
    try {
      const deckCards = Array.isArray(deck.cards) ? deck.cards : [];
      let handCards = deckCards.filter(c => c.zone === 'HND');

      if (handCards.length === 0) {
        const sortedLib = deckCards
          .filter(c => c.zone === 'LIB')
          .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));
        handCards = sortedLib.slice(0, 7);
      }

      if (handCards.length === 0) {
        Alert.alert('No cards to mulligan');
        return;
      }

      const handCardSet = new Set(handCards);
      const sortedLib = deckCards
        .filter(c => c.zone === 'LIB' && !handCardSet.has(c))
        .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));

      if (sortedLib.length < handCards.length) {
        Alert.alert('Not enough cards', 'Library does not have enough cards for a new hand.');
        return;
      }

      const newHandSource = sortedLib.slice(0, handCards.length);
      const remainingLib = sortedLib.slice(handCards.length);

      const oldSleeveIds = handCards
        .map(c => sleeveIdForCard(c))
        .sort((a, b) => a - b);

      const newHandCards: CardInstance[] = newHandSource.map((card, i) => ({
        ...card,
        place: String(oldSleeveIds[i] - 1),
        zone: 'HND' as Zone,
      }));

      const shuffledRemaining: CardInstance[] = shuffle(remainingLib).map((c, i) => ({
        ...c,
        place: String(i + 1),
        zone: 'LIB' as Zone,
      }));

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

      const newCount = mulliganCount + 1;
      setMulliganCount(newCount);
      setMulliganBottomed(bottomedCards.map(c => c.displayName));

      const sleeves = connectedSleeves ?? await getRegisteredSleeves();
      if (sleeves.length > 0) {
        await beginGame(newHandCards, sleeves);
      }
    } catch (e) {
      console.error('[Mulligan] Error:', e);
      Alert.alert('Mulligan error', e instanceof Error ? e.message : String(e));
    } finally {
      setMulliganBusy(false);
    }
  };

  const handleKeepHand = () => {
    setMulliganSheetVisible(false);
    if (mulliganCount > 0) {
      Alert.alert(
        'London Mulligan',
        `Put ${mulliganCount} card${mulliganCount > 1 ? 's' : ''} from your hand to the bottom of your library.\n\nUse the zone move buttons in the Hand zone.`,
      );
    }
  };

  // ─── Move card (single) ───────────────────────────────────────────────────
  const handleMoveCard = async (card: CardInstance, destZone: Zone) => {
    if (!deck) return;
    if (destZone === 'GRV') sendToGraveyard(sleeveIdForCard(card)).catch(() => {});
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

  // ─── Move selected cards ──────────────────────────────────────────────────
  const handleMoveSelected = async (destZone: Zone) => {
    if (!deck || selectedCards.size === 0) return;
    const sourceZone = activeZone;
    setActiveZone(null);
    setSelectedCards(new Set());
    const keys = new Set(selectedCards);
    const deckCards = Array.isArray(deck.cards) ? deck.cards : [];
    const updated = deckCards.map(c => {
      if (keys.has(cardKey(c)) && (c.zone === sourceZone || (sourceZone === 'BTFLD' && c.zone === 'TKN'))) {
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
  };

  const openMoveSelectedPicker = () => {
    if (selectedCards.size === 0) return;
    const options = MOVABLE_ZONES
      .filter(z => z.id !== activeZone)
      .map(zone => ({ text: zone.label, onPress: () => handleMoveSelected(zone.id) }));
    Alert.alert(
      `Move ${selectedCards.size} card${selectedCards.size !== 1 ? 's' : ''} to…`,
      undefined,
      [...options, { text: 'Cancel', style: 'cancel' as const }],
    );
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
    Alert.alert(
      `Milled ${toMill.length} card${toMill.length !== 1 ? 's' : ''}`,
      toMill.map(c => c.displayName).join('\n'),
    );
  };

  // ─── Create Token ─────────────────────────────────────────────────────────
  const createTokenFromValues = async (
    name: string,
    power: string,
    toughness: string,
    colors: string[],
  ) => {
    if (!name.trim()) { Alert.alert('Missing name', 'Enter a token name.'); return; }
    setTokenCreating(true);
    try {
      const imagePath = await fetchTokenImage(name.trim(), colors);

      const tokenCard: CardInstance = {
        baseName: name.trim(),
        displayName: `${name.trim()} Token`,
        imagePath,
        place: String(Date.now()),
        zone: 'TKN',
      };

      // Save token template to deck.tokens if not already present
      const currentDeck = deck!;
      const existingTokens: TokenTemplate[] = Array.isArray(currentDeck.tokens) ? currentDeck.tokens : [];
      const alreadySaved = existingTokens.some(t => t.name.toLowerCase() === name.trim().toLowerCase());
      const newTokens: TokenTemplate[] = alreadySaved
        ? existingTokens
        : [...existingTokens, { name: name.trim(), power, toughness, colors }];

      const deckCards = Array.isArray(currentDeck.cards) ? currentDeck.cards : [];
      const updated: Deck = { ...currentDeck, cards: [...deckCards, tokenCard], tokens: newTokens };
      await saveDeck(updated);
      setDeck(updated);

      // Push token image to top library sleeve (sleeve 2)
      if (imagePath) {
        const sleeves = connectedSleeves ?? await getRegisteredSleeves();
        const topLibSleeve = sleeves.find(s => s === 2) ?? sleeves.find(s => s > 1);
        if (topLibSleeve !== undefined) {
          try {
            const imageResp = await fetch(imagePath);
            if (imageResp.ok) {
              const buf = await imageResp.arrayBuffer();
              await fetch(`${PI_SERVER}/display?sleeve_id=${topLibSleeve}`, {
                method: 'POST',
                headers: { 'Content-Type': 'image/jpeg' },
                body: buf,
              });
            }
          } catch {
            // Pi offline — token still added to state
          }
        }
      }

      setTokenModalVisible(false);
      setTokenName('');
      setTokenPower('1');
      setTokenToughness('1');
      setTokenColors([]);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setTokenCreating(false);
    }
  };

  const handleCreateToken = () =>
    createTokenFromValues(tokenName, tokenPower, tokenToughness, tokenColors);

  const handleCreateFromTemplate = (t: TokenTemplate) =>
    createTokenFromValues(t.name, t.power, t.toughness, t.colors);

  const toggleTokenColor = (c: string) => {
    setTokenColors(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c],
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!deck) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#D0BCFF" />
      </View>
    );
  }

  const favorites = Array.isArray(deck.tokens) ? deck.tokens : [];

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

      {/* Zone grid — 2 rows × 3 cols */}
      <View style={styles.zoneGrid}>
        <View style={styles.zoneGridRow}>
          {ZONE_CONFIG.slice(0, 3).map(zone => (
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
                : <Text style={[styles.zoneBtnCount, { color: zone.color }]}>{zoneCounts[zone.id]}</Text>
              }
            </Pressable>
          ))}
        </View>
        <View style={styles.zoneGridRow}>
          {ZONE_CONFIG.slice(3, 6).map(zone => (
            <Pressable
              key={zone.id}
              style={[styles.zoneBtn, { borderColor: zone.color }]}
              onPress={() => { setSelectedCards(new Set()); setActiveZone(zone.id); }}
            >
              <Text style={[styles.zoneBtnLabel, { color: zone.color }]}>{zone.label}</Text>
              <Text style={[styles.zoneBtnCount, { color: zone.color }]}>{zoneCounts[zone.id]}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Action grid — 3 cols × 2 rows */}
      <View style={styles.actionGrid}>
        <View style={styles.actionRow}>
          <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={handleShuffle} disabled={busy}>
            <Text style={styles.actionIcon}>🔀</Text>
            <Text style={styles.actionLabel}>Shuffle</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={() => setScryModalVisible(true)} disabled={busy}>
            <Text style={styles.actionIcon}>👁</Text>
            <Text style={styles.actionLabel}>Scry</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={() => setTutorModalVisible(true)} disabled={busy}>
            <Text style={styles.actionIcon}>🔍</Text>
            <Text style={styles.actionLabel}>Tutor</Text>
          </Pressable>
        </View>
        <View style={styles.actionRow}>
          <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={() => setMillModalVisible(true)} disabled={busy}>
            <Text style={styles.actionIcon}>💀</Text>
            <Text style={styles.actionLabel}>Mill</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={() => setTokenModalVisible(true)} disabled={busy}>
            <Text style={styles.actionIcon}>✨</Text>
            <Text style={styles.actionLabel}>Create Token</Text>
          </Pressable>
          <View style={styles.actionBtnSpacer} />
        </View>
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
            <View style={styles.zoneSheetHeader}>
              <Text style={styles.sheetTitle}>
                {ZONE_CONFIG.find(z => z.id === activeZone)?.label} ({zoneCards.length})
              </Text>
              {activeZone !== 'CMD' && (
                <Pressable
                  style={[styles.moveSelectedBtn, selectedCards.size === 0 && styles.moveSelectedBtnDisabled]}
                  disabled={selectedCards.size === 0}
                  onPress={openMoveSelectedPicker}
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
                  const isToken = item.zone === 'TKN';
                  return (
                    <View style={styles.cardRow}>
                      {activeZone !== 'CMD' && (
                        <Pressable style={[styles.checkbox, isSelected && styles.checkboxChecked]} onPress={() => toggleCardSelected(item)}>
                          {isSelected && <Text style={styles.checkmark}>✓</Text>}
                        </Pressable>
                      )}
                      <Text style={styles.cardName}>{item.displayName}</Text>
                      {isToken && <Text style={styles.tokenBadge}>Token</Text>}
                    </View>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Mulligan bottom sheet */}
      <Modal
        visible={mulliganSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={handleKeepHand}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => {}}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Opening Hand</Text>

            {mulliganCount === 0 ? (
              <Text style={styles.mulliganInfo}>
                Take your opening 7 from the top of your library.{'\n'}Would you like to mulligan?
              </Text>
            ) : (
              <>
                <Text style={styles.mulliganInfo}>
                  Mulligan #{mulliganCount} — new hand sent to sleeves.
                  {'\n'}Remember: keep {7 - mulliganCount} card{7 - mulliganCount !== 1 ? 's' : ''} when you're done.
                </Text>
                {mulliganBottomed.length > 0 && (
                  <View style={styles.mulliganBottomedBox}>
                    <Text style={styles.mulliganBottomedLabel}>Returned to library:</Text>
                    {mulliganBottomed.map((name, i) => (
                      <Text key={i} style={styles.mulliganBottomedCard}>• {name}</Text>
                    ))}
                  </View>
                )}
              </>
            )}

            {mulliganBusy && (
              <View style={styles.mulliganBusyRow}>
                <ActivityIndicator color="#D0BCFF" size="small" />
                <Text style={styles.busyText}>Sending new hand…</Text>
              </View>
            )}

            <View style={styles.sheetActions}>
              <Pressable
                style={[styles.cancelBtn, mulliganBusy && styles.btnDisabled]}
                onPress={handleKeepHand}
                disabled={mulliganBusy}
              >
                <Text style={styles.cancelBtnText}>Keep Hand</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, mulliganBusy && styles.btnDisabled]}
                onPress={handleMulliganFromSheet}
                disabled={mulliganBusy}
              >
                <Text style={styles.confirmBtnText}>Mulligan</Text>
              </Pressable>
            </View>
          </View>
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

      {/* Create Token — bottom sheet */}
      <Modal visible={tokenModalVisible} transparent animationType="slide" onRequestClose={() => setTokenModalVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setTokenModalVisible(false)}>
          <Pressable style={[styles.sheet, styles.tokenSheet]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Create Token</Text>

            <View style={styles.tabRow}>
              <Pressable
                style={[styles.tab, tokenTab === 'custom' && styles.tabActive]}
                onPress={() => setTokenTab('custom')}
              >
                <Text style={[styles.tabText, tokenTab === 'custom' && styles.tabTextActive]}>Custom</Text>
              </Pressable>
              <Pressable
                style={[styles.tab, tokenTab === 'favorites' && styles.tabActive]}
                onPress={() => setTokenTab('favorites')}
              >
                <Text style={[styles.tabText, tokenTab === 'favorites' && styles.tabTextActive]}>
                  Favorites {favorites.length > 0 ? `(${favorites.length})` : ''}
                </Text>
              </Pressable>
            </View>

            {tokenTab === 'custom' ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.sheetLabel}>Token Name</Text>
                <TextInput
                  style={styles.sheetInput}
                  value={tokenName}
                  onChangeText={setTokenName}
                  placeholder="e.g. Soldier, Dragon, Treasure"
                  placeholderTextColor="#625b71"
                  autoCapitalize="words"
                />

                <View style={styles.ptRow}>
                  <View style={styles.ptField}>
                    <Text style={styles.sheetLabel}>Power</Text>
                    <TextInput style={styles.sheetInput} value={tokenPower} onChangeText={setTokenPower} keyboardType="number-pad" selectTextOnFocus />
                  </View>
                  <Text style={styles.ptSlash}>/</Text>
                  <View style={styles.ptField}>
                    <Text style={styles.sheetLabel}>Toughness</Text>
                    <TextInput style={styles.sheetInput} value={tokenToughness} onChangeText={setTokenToughness} keyboardType="number-pad" selectTextOnFocus />
                  </View>
                </View>

                <Text style={styles.sheetLabel}>Color</Text>
                <View style={styles.colorRow}>
                  {MTG_COLORS.map(c => (
                    <Pressable
                      key={c}
                      style={[styles.colorBtn, tokenColors.includes(c) && styles.colorBtnActive]}
                      onPress={() => toggleTokenColor(c)}
                    >
                      <Text style={styles.colorBtnText}>{COLOR_LABELS[c]}</Text>
                      <Text style={[styles.colorBtnLabel, tokenColors.includes(c) && styles.colorBtnLabelActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={[styles.sheetActions, { marginTop: 16 }]}>
                  <Pressable style={styles.cancelBtn} onPress={() => setTokenModalVisible(false)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.confirmBtn, tokenCreating && styles.btnDisabled]}
                    onPress={handleCreateToken}
                    disabled={tokenCreating}
                  >
                    {tokenCreating
                      ? <ActivityIndicator color="#D0BCFF" size="small" />
                      : <Text style={styles.confirmBtnText}>Create</Text>
                    }
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
              favorites.length === 0 ? (
                <Text style={styles.emptyText}>
                  No favorites yet. Add tokens during import or in the deck view.
                </Text>
              ) : (
                <FlatList
                  data={favorites}
                  keyExtractor={(t, i) => `${t.name}-${i}`}
                  renderItem={({ item }) => {
                    const hasStats = item.power !== '' || item.toughness !== '' || item.colors.length > 0;
                    return (
                      <Pressable
                        style={[styles.favoriteRow, tokenCreating && styles.btnDisabled]}
                        onPress={() => {
                          if (hasStats) {
                            // Full template — create immediately
                            handleCreateFromTemplate(item);
                          } else {
                            // Pre-imported name-only — pre-fill Custom tab
                            setTokenName(item.name);
                            setTokenPower('1');
                            setTokenToughness('1');
                            setTokenColors(item.colors);
                            setTokenTab('custom');
                          }
                        }}
                        disabled={tokenCreating}
                      >
                        <View style={styles.favoriteInfo}>
                          <Text style={styles.favoriteName}>{item.name}</Text>
                          {hasStats ? (
                            <Text style={styles.favoriteMeta}>
                              {item.power}/{item.toughness}
                              {item.colors.length > 0 ? `  ${item.colors.map(c => COLOR_LABELS[c] ?? c).join('')}` : '  Colorless'}
                            </Text>
                          ) : (
                            <Text style={styles.favoriteMetaHint}>Tap to fill in stats →</Text>
                          )}
                        </View>
                        {tokenCreating
                          ? <ActivityIndicator color="#D0BCFF" size="small" />
                          : <Text style={styles.favoriteCreate}>{hasStats ? 'Create →' : 'Fill →'}</Text>
                        }
                      </Pressable>
                    );
                  }}
                />
              )
            )}
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

  zoneGrid: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 4, gap: 8 },
  zoneGridRow: { flexDirection: 'row', gap: 8 },
  zoneBtn: {
    flex: 1,
    height: 75,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  zoneBtnLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  zoneBtnCount: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  zoneBtnCommander: { fontSize: 8, fontWeight: '700', marginTop: 4, textAlign: 'center', paddingHorizontal: 2 },

  actionGrid: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 14, gap: 8 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    backgroundColor: '#353A40',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#625b71',
    gap: 4,
  },
  actionBtnSpacer: { flex: 1 },
  actionIcon: { fontSize: 20 },
  actionLabel: { color: '#D0BCFF', fontSize: 11, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },

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
  tokenSheet: { maxHeight: '90%' },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#625b71',
    alignSelf: 'center',
    marginVertical: 10,
  },
  sheetTitle: { color: '#D0BCFF', fontSize: 18, fontWeight: '800', marginBottom: 14 },
  sheetLabel: { color: '#CCC2DC', fontSize: 13, marginBottom: 6, marginTop: 10 },
  sheetInput: {
    backgroundColor: '#292E32',
    color: '#D4CDC1',
    borderWidth: 1,
    borderColor: '#625b71',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 4,
  },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#625b71' },
  cancelBtnText: { color: '#625b71', fontSize: 15 },
  confirmBtn: { flex: 1, backgroundColor: '#6650a4', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  confirmBtnText: { color: '#D0BCFF', fontSize: 15, fontWeight: '800' },

  mulliganInfo: { color: '#CCC2DC', fontSize: 15, lineHeight: 22, marginBottom: 12 },
  mulliganBottomedBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  mulliganBottomedLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  mulliganBottomedCard: { color: '#D4CDC1', fontSize: 14, paddingVertical: 2 },
  mulliganBusyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },

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
  tokenBadge: { color: '#f59e0b', fontSize: 11, fontWeight: '700', marginLeft: 6 },

  tabRow: { flexDirection: 'row', marginBottom: 16, borderRadius: 8, backgroundColor: '#292E32', padding: 3 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#6650a4' },
  tabText: { color: '#625b71', fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#D0BCFF' },

  ptRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ptField: { flex: 1 },
  ptSlash: { color: '#625b71', fontSize: 24, fontWeight: '700', marginTop: 18 },

  colorRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  colorBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#625b71',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 4,
  },
  colorBtnActive: { borderColor: '#D0BCFF', backgroundColor: 'rgba(208,188,255,0.12)' },
  colorBtnText: { fontSize: 18 },
  colorBtnLabel: { color: '#625b71', fontSize: 11, fontWeight: '800' },
  colorBtnLabelActive: { color: '#D0BCFF' },

  favoriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#4a4f55',
  },
  favoriteInfo: { flex: 1 },
  favoriteName: { color: '#D0BCFF', fontSize: 16, fontWeight: '700' },
  favoriteMeta: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  favoriteMetaHint: { color: '#6650a4', fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  favoriteCreate: { color: '#6650a4', fontSize: 14, fontWeight: '700', paddingLeft: 12 },
});
