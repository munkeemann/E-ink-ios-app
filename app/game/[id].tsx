import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { assignSleeveIds, beginGame, clearSleeve, getRegisteredSleeves, nextFreeSleeveId, pushCardToSleeve, waitForSleeveSelection } from '../../src/api/piServer';
import { fetchTokenImage } from '../../src/api/scryfall';
import { getDeck, loadSettings, saveDeck } from '../../src/storage/deckStorage';
import { AppSettings, CardInstance, Deck, TokenTemplate } from '../../src/types';

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
  const [settings, setSettings] = useState<AppSettings>({ sleeveCount: 5, physicalZones: ['LIB', 'HND', 'BTFLD'], librarySleeveDepth: 1, devMode: false, piDebugAlerts: false });

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

  // Place in Library — step 1: position picker
  const [placeModalVisible, setPlaceModalVisible] = useState(false);
  const [placeFrom, setPlaceFrom] = useState<'top' | 'bottom'>('top');
  const [placePositionText, setPlacePositionText] = useState('1');

  // Flip Card picker
  const [flipModalVisible, setFlipModalVisible] = useState(false);

  // Sleeve selection (used by Place in Library)
  const [sleeveSelectVisible, setSleeveSelectVisible] = useState(false);
  const [sleeveSelectCountdown, setSleeveSelectCountdown] = useState(30);
  const [sleeveWaitMessage, setSleeveWaitMessage] = useState('');
  const sleeveSelectCancelledRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (id) {
        getDeck(id).then(d => {
          if (!d) return;
          const normalized = normalizeCommanderZone(Array.isArray(d.cards) ? d.cards : []);
          setDeck({ ...d, cards: normalized });
          // Show mulligan sheet exactly once — only on the initial freshStart navigation.
          // Done here (inside the deck-load callback) so it never fires from setDeck()
          // calls made by shuffle, tutor, or any other in-game action.
          if (freshStart === 'true' && !shownFreshMulliganRef.current) {
            shownFreshMulliganRef.current = true;
            setMulliganCount(0);
            setMulliganBottomed([]);
            setMulliganSheetVisible(true);
          }
        });
      }
      getRegisteredSleeves().then(setConnectedSleeves);
      loadSettings().then(setSettings);
    }, [id, freshStart]),
  );

  // Sleeve selection countdown
  useEffect(() => {
    if (!sleeveSelectVisible) return;
    setSleeveSelectCountdown(30);
    const interval = setInterval(() => {
      setSleeveSelectCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sleeveSelectVisible]);

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

  // Double-faced cards in hand or battlefield — single-faced cards are excluded
  const flipCards = useMemo(() =>
    cards.filter(c => (c.zone === 'HND' || c.zone === 'BTFLD' || c.zone === 'TKN') && !!c.backImagePath),
    [cards],
  );

  // BTFLD zone sheet also shows TKN cards
  const zoneCards = useMemo(() => {
    if (!activeZone) return [];
    if (activeZone === 'BTFLD') return cards.filter(c => c.zone === 'BTFLD' || c.zone === 'TKN');
    return cards.filter(c => c.zone === activeZone);
  }, [activeZone, cards]);

  // ─── Push sleeves after a reorder (shuffle, tutor, scry) ────────────────
  const doBeginGame = async (gameCards: CardInstance[]) => {
    setBusy(true);
    setBusyLabel('Checking sleeves…');
    try {
      const sleeves = await getRegisteredSleeves();
      setConnectedSleeves(sleeves);
      if (sleeves.length > 0) {
        setBusyLabel('Sending sleeves…');
        await beginGame(gameCards, sleeves, undefined, undefined, settings);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  // ─── Sync sleeves (fire-and-forget after zone changes) ───────────────────
  const syncSleeves = (updatedCards: CardInstance[]) => {
    const sleeves = connectedSleeves;
    if (!sleeves || sleeves.length === 0) return;
    beginGame(updatedCards, sleeves, undefined, undefined, settings).catch(() => {});
  };

  // ─── Shuffle ──────────────────────────────────────────────────────────────
  const handleShuffle = async () => {
    const deckCards = Array.isArray(deck?.cards) ? deck!.cards : [];
    const lib = deckCards.filter(c => c.zone === 'LIB');
    const shuffled = shuffle(lib).map((c, i) => ({ ...c, place: String(i + 1) }));
    const nonLib = deckCards.filter(c => c.zone !== 'LIB');

    // Reassign sleeve IDs based on new positions. Without this, sleeveId stays
    // tied to the pre-shuffle card (e.g. Lightning Bolt keeps sleeveId=2 even
    // though it's no longer at position 1), so beginGame pushes the wrong images.
    const newCards = assignSleeveIds([...nonLib, ...shuffled], settings);

    const top5 = newCards
      .filter(c => c.zone === 'LIB')
      .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10))
      .slice(0, 5);
    const debugMsg = top5.map(c => `${c.displayName}  place=${c.place}  sleeve=${c.sleeveId ?? 'null'}`).join('\n');
    console.log('[Shuffle] top 5 after sleeveId reassign:\n' + debugMsg);
    if (settings.devMode) Alert.alert('Shuffle — top 5 (new order)', debugMsg);

    const updated = { ...deck!, cards: newCards };
    await saveDeck(updated);
    setDeck(updated);
    const sleeves = connectedSleeves ?? await getRegisteredSleeves();
    if (sleeves.length > 0) {
      setBusy(true);
      setBusyLabel('Sending sleeves…');
      try {
        await beginGame(newCards, sleeves, undefined, undefined, settings);
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
        setBusyLabel('');
      }
    }
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

      const newHandCards: CardInstance[] = newHandSource.map((card) => ({
        ...card,
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
        await beginGame(finalCards, sleeves, undefined, undefined, settings);
      }
    } catch (e) {
      console.error('[Mulligan] Error:', e);
      Alert.alert('Mulligan error', e instanceof Error ? e.message : String(e));
    } finally {
      setMulliganBusy(false);
    }
  };

  const handleKeepHand = async () => {
    setMulliganSheetVisible(false);

    if (mulliganCount === 0) {
      // No mulligan taken — the opening hand is still in LIB. Move top 7 to HND.
      if (!deck) return;
      const deckCards = Array.isArray(deck.cards) ? deck.cards : [];
      const sortedLib = deckCards
        .filter(c => c.zone === 'LIB')
        .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));
      const handCards = sortedLib.slice(0, 7);
      if (handCards.length === 0) return;

      const handSet = new Set(handCards);
      const remainingLib = sortedLib.slice(7).map((c, i) => ({ ...c, place: String(i + 1) }));
      const commanderCards = deckCards.filter(c => c.place === 'commander');
      const otherCards = deckCards.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
      const newHandCards = handCards.map(c => ({ ...c, zone: 'HND' as Zone }));
      const finalCards = [...commanderCards, ...remainingLib, ...newHandCards, ...otherCards];

      const updated = { ...deck, cards: finalCards };
      await saveDeck(updated);
      setDeck(updated);
      syncSleeves(finalCards);
    } else {
      // After a mulligan the new hand is already in HND; remind about bottoming.
      Alert.alert(
        'London Mulligan',
        `Put ${mulliganCount} card${mulliganCount > 1 ? 's' : ''} from your hand to the bottom of your library.\n\nUse the zone move buttons in the Hand zone.`,
      );
    }
  };

  // ─── Move card (single) ───────────────────────────────────────────────────
  const handleMoveCard = async (card: CardInstance, destZone: Zone) => {
    if (!deck) return;
    const deckCards = Array.isArray(deck.cards) ? deck.cards : [];
    const isDestPhysical = destZone === 'TKN'
      ? settings.physicalZones.includes('BTFLD')
      : settings.physicalZones.includes(destZone);

    // Tokens leaving the battlefield are removed entirely
    if (card.isToken && destZone !== 'BTFLD' && destZone !== 'TKN') {
      if (card.sleeveId !== null) clearSleeve(card.sleeveId).catch(() => {});
      const withMove = deckCards.filter(c => c !== card);
      const commanderCards = withMove.filter(c => c.place === 'commander');
      const libCards = withMove.filter(c => c.zone === 'LIB' && c.place !== 'commander').map((c, i) => ({ ...c, place: String(i + 1) }));
      const otherCards = withMove.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
      const newDeck = { ...deck, cards: [...commanderCards, ...libCards, ...otherCards] };
      await saveDeck(newDeck);
      setDeck(newDeck);
      syncSleeves(newDeck.cards);
      return;
    }

    let movedCard: CardInstance = { ...card, zone: destZone };
    if (card.sleeveId !== null && !isDestPhysical) {
      // Moving to virtual zone: free the sleeve
      clearSleeve(card.sleeveId).catch(() => {});
      movedCard = { ...movedCard, sleeveId: null };
    } else if (card.sleeveId === null && isDestPhysical) {
      // Moving to physical zone: assign lowest free sleeve and push image
      const freeId = nextFreeSleeveId(deckCards, settings.sleeveCount);
      if (freeId !== null) {
        movedCard = { ...movedCard, sleeveId: freeId };
        pushCardToSleeve(movedCard).catch(() => {});
      }
    }

    const withMove = deckCards.map(c => c === card ? movedCard : c);
    const commanderCards = withMove.filter(c => c.place === 'commander');
    const libCards = withMove
      .filter(c => c.zone === 'LIB' && c.place !== 'commander')
      .map((c, i) => ({ ...c, place: String(i + 1) }));
    const otherCards = withMove.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
    const newDeck = { ...deck, cards: [...commanderCards, ...libCards, ...otherCards] };
    await saveDeck(newDeck);
    setDeck(newDeck);
    syncSleeves(newDeck.cards);
  };

  // ─── Move selected cards ──────────────────────────────────────────────────
  const handleMoveSelected = async (destZone: Zone) => {
    if (!deck || selectedCards.size === 0) return;
    const sourceZone = activeZone;
    setActiveZone(null);
    setSelectedCards(new Set());
    const keys = new Set(selectedCards);
    const deckCards = Array.isArray(deck.cards) ? deck.cards : [];

    const isDestPhysical = destZone === 'TKN'
      ? settings.physicalZones.includes('BTFLD')
      : settings.physicalZones.includes(destZone);

    // Pre-compute which sleeves will remain in use after the move
    // (non-selected cards keep their sleeveIds; we track newly assigned IDs too)
    const nonSelectedSleeves = new Set(
      deckCards
        .filter(c => {
          const isSel = keys.has(cardKey(c)) && (c.zone === sourceZone || (sourceZone === 'BTFLD' && c.zone === 'TKN'));
          return !isSel && c.sleeveId !== null;
        })
        .map(c => c.sleeveId as number),
    );
    const assignedNewSleeves = new Set<number>();
    const getFreeSleeveId = () => {
      for (let i = 1; i <= settings.sleeveCount; i++) {
        if (!nonSelectedSleeves.has(i) && !assignedNewSleeves.has(i)) return i;
      }
      return null;
    };

    const withMove = deckCards.reduce<CardInstance[]>((acc, c) => {
      const isSelected = keys.has(cardKey(c)) && (c.zone === sourceZone || (sourceZone === 'BTFLD' && c.zone === 'TKN'));
      if (!isSelected) { acc.push(c); return acc; }
      // Tokens leaving the battlefield are removed entirely
      if (c.isToken && destZone !== 'BTFLD' && destZone !== 'TKN') {
        if (c.sleeveId !== null) clearSleeve(c.sleeveId).catch(() => {});
        return acc;
      }
      let movedCard: CardInstance = { ...c, zone: destZone };
      if (c.sleeveId !== null && !isDestPhysical) {
        clearSleeve(c.sleeveId).catch(() => {});
        movedCard = { ...movedCard, sleeveId: null };
      } else if (c.sleeveId === null && isDestPhysical) {
        const freeId = getFreeSleeveId();
        if (freeId !== null) {
          assignedNewSleeves.add(freeId);
          movedCard = { ...movedCard, sleeveId: freeId };
          pushCardToSleeve(movedCard).catch(() => {});
        }
      }
      acc.push(movedCard);
      return acc;
    }, []);

    const commanderCards = withMove.filter(c => c.place === 'commander');
    const libCards = withMove
      .filter(c => c.zone === 'LIB' && c.place !== 'commander')
      .map((c, i) => ({ ...c, place: String(i + 1) }));
    const otherCards = withMove.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
    const newDeck = { ...deck, cards: [...commanderCards, ...libCards, ...otherCards] };
    await saveDeck(newDeck);
    setDeck(newDeck);
    syncSleeves(newDeck.cards);
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
    const deckCards = (Array.isArray(deck?.cards) ? deck!.cards : []).filter(c => c.zone !== 'LIB' && c.place !== 'commander');

    // Reassign sleeve IDs so the tutored card (now at place=1) gets sleeve 2,
    // not whichever sleeve it held before being tutored.
    const newCards = assignSleeveIds([...commanderCards, ...deckCards, ...reordered], settings);

    const top5 = newCards
      .filter(c => c.zone === 'LIB')
      .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10))
      .slice(0, 5);
    const debugMsg = top5.map(c => `${c.displayName}  place=${c.place}  sleeve=${c.sleeveId ?? 'null'}`).join('\n');
    console.log('[Tutor] top 5 after sleeveId reassign:\n' + debugMsg);
    if (settings.devMode) Alert.alert('Tutor — top 5 (new order)', debugMsg);

    const updated = { ...deck!, cards: newCards };
    await saveDeck(updated);
    setDeck(updated);
    const sleeves = connectedSleeves ?? await getRegisteredSleeves();
    if (sleeves.length > 0) {
      setBusy(true);
      setBusyLabel('Sending sleeves…');
      try {
        await beginGame(newCards, sleeves, undefined, undefined, settings);
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
        setBusyLabel('');
      }
    }
  };

  // ─── Place in Library ─────────────────────────────────────────────────────
  // Step 1: tap "Place in Library" → show position picker
  const handleStartPlaceInLibrary = () => {
    setPlaceFrom('top');
    setPlacePositionText('1');
    setPlaceModalVisible(true);
  };

  // Step 2: user taps "Next" in position picker → wait for sleeve press
  const handlePlacePositionNext = async () => {
    const pos = parseInt(placePositionText, 10);
    if (isNaN(pos) || pos < 1) { Alert.alert('Invalid', 'Enter a position ≥ 1'); return; }
    const chosenFrom = placeFrom;
    setPlaceModalVisible(false);

    sleeveSelectCancelledRef.current = false;
    setSleeveWaitMessage(`Press the button on the card to place it at position ${placePositionText} from the ${chosenFrom}.`);
    setSleeveSelectVisible(true);
    const sid = await waitForSleeveSelection(() => sleeveSelectCancelledRef.current);
    setSleeveSelectVisible(false);
    if (sleeveSelectCancelledRef.current || sid === null) return;

    // Map sleeve → card via permanent sleeveId
    const targetCard = cards.find(c => c.sleeveId === sid);
    if (!targetCard) { Alert.alert('Unknown sleeve', `Sleeve ${sid} is not mapped to a card.`); return; }
    if (targetCard.zone !== 'LIB') { Alert.alert('Not in library', 'That card is not in your library.'); return; }

    // Execute placement
    const sortedLib = cards
      .filter(c => c.zone === 'LIB')
      .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));
    const withoutCard = sortedLib.filter(c => c !== targetCard);
    const insertIdx = chosenFrom === 'top'
      ? Math.min(pos - 1, withoutCard.length)
      : Math.max(withoutCard.length - pos + 1, 0);
    const newLib = [
      ...withoutCard.slice(0, insertIdx),
      targetCard,
      ...withoutCard.slice(insertIdx),
    ].map((c, i) => ({ ...c, place: String(i + 1) }));
    const nonLib = cards.filter(c => c.zone !== 'LIB');
    const newCards = [...nonLib, ...newLib];
    const updated = { ...deck!, cards: newCards };
    await saveDeck(updated);
    setDeck(updated);
    syncSleeves(newCards);
  };

  // ─── Flip Card ────────────────────────────────────────────────────────────
  const handleFlipCard = () => {
    setFlipModalVisible(true);
  };

  const handleFlipToggle = async (targetCard: CardInstance) => {
    if (!targetCard.backImagePath) return; // single-faced — no-op
    const newIsFlipped = !targetCard.isFlipped;
    const updatedCard = { ...targetCard, isFlipped: newIsFlipped };
    const deckCards = Array.isArray(deck?.cards) ? deck!.cards : [];
    const newCards = deckCards.map(c => c === targetCard ? updatedCard : c);
    const updated = { ...deck!, cards: newCards };
    await saveDeck(updated);
    setDeck(updated);
    // Push the correct face to the assigned sleeve
    if (updatedCard.sleeveId !== null) {
      const faceImage = newIsFlipped ? targetCard.backImagePath : targetCard.imagePath;
      pushCardToSleeve({ ...updatedCard, imagePath: faceImage }).catch(() => {});
    }
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
    syncSleeves(newDeck.cards);
    Alert.alert(
      `Milled ${toMill.length} card${toMill.length !== 1 ? 's' : ''}`,
      toMill.map(c => c.displayName).join('\n'),
    );
  };

  const handleCancelSleeveSelect = () => {
    sleeveSelectCancelledRef.current = true;
    setSleeveSelectVisible(false);
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

      const currentDeck = deck!;
      const deckCards = Array.isArray(currentDeck.cards) ? currentDeck.cards : [];

      // Assign a free sleeveId if BTFLD is a physical zone
      const tokenSleeveId: number | null = settings.physicalZones.includes('BTFLD')
        ? (nextFreeSleeveId(deckCards, settings.sleeveCount) ?? null)
        : null;

      const tokenCard: CardInstance = {
        baseName: name.trim(),
        displayName: `${name.trim()} Token`,
        imagePath,
        backImagePath: '',
        isFlipped: false,
        place: String(Date.now()),
        zone: 'TKN',
        isToken: true,
        sleeveId: tokenSleeveId,
      };

      // Save token template to deck.tokens if not already present
      const existingTokens: TokenTemplate[] = Array.isArray(currentDeck.tokens) ? currentDeck.tokens : [];
      const alreadySaved = existingTokens.some(t => t.name.toLowerCase() === name.trim().toLowerCase());
      const newTokens: TokenTemplate[] = alreadySaved
        ? existingTokens
        : [...existingTokens, { name: name.trim(), power, toughness, colors }];

      const updated: Deck = { ...currentDeck, cards: [...deckCards, tokenCard], tokens: newTokens };
      await saveDeck(updated);
      setDeck(updated);

      // Push token image to its assigned sleeve
      if (tokenSleeveId !== null) {
        pushCardToSleeve(tokenCard).catch(() => {});
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
        <Text style={styles.commanderName}>⚔ {commander?.displayName ?? '—'}</Text>
        <View style={styles.headerMeta}>
          <Text style={[
            styles.sleeveStatus,
            connectedSleeves !== null && connectedSleeves.length === 0 && styles.sleeveStatusNone,
          ]}>
            {connectedSleeves === null ? 'Checking sleeves…'
              : connectedSleeves.length === 0 ? 'No sleeves connected'
              : `${connectedSleeves.length} sleeve${connectedSleeves.length === 1 ? '' : 's'} connected`}
          </Text>
          <View style={styles.headerMetaRight}>
            <Text style={styles.settingsIndicator}>
              {settings.sleeveCount} sleeves · {settings.physicalZones.join(' ')}
            </Text>
            <Pressable
              onPress={() =>
                Alert.alert(
                  'End Game',
                  'End this game session and return to the deck preview?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'End Game',
                      style: 'destructive',
                      onPress: async () => {
                        if (!deck) return;
                        const updated = { ...deck, gameInProgress: false };
                        await saveDeck(updated);
                        router.back();
                      },
                    },
                  ],
                )
              }
            >
              <Text style={styles.endGameBtn}>End Game</Text>
            </Pressable>
          </View>
        </View>
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
          <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={handleStartPlaceInLibrary} disabled={busy}>
            <Text style={styles.actionIcon}>📌</Text>
            <Text style={styles.actionLabel}>Place in Library</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={handleFlipCard} disabled={busy}>
            <Text style={styles.actionIcon}>🔄</Text>
            <Text style={styles.actionLabel}>Flip Card</Text>
          </Pressable>
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
        {/* Plain View backdrop — Pressable here would intercept FlatList scroll gestures */}
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetBackdropTouchable}
            onPress={() => { setActiveZone(null); setSelectedCards(new Set()); }}
          />
          <View style={[styles.sheet, styles.zoneSheet]}>
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
                style={{ flexShrink: 1 }}
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
          </View>
        </View>
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
                style={[styles.confirmBtn, mulliganBusy && styles.btnDisabled]}
                onPress={handleKeepHand}
                disabled={mulliganBusy}
              >
                <Text style={styles.confirmBtnText}>Keep Hand</Text>
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Tutor — bottom sheet */}
      <Modal visible={tutorModalVisible} transparent animationType="slide" onRequestClose={() => setTutorModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Mill — bottom sheet */}
      <Modal visible={millModalVisible} transparent animationType="slide" onRequestClose={() => setMillModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Create Token — bottom sheet */}
      <Modal visible={tokenModalVisible} transparent animationType="slide" onRequestClose={() => setTokenModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Place in Library — step 1: position picker */}
      <Modal visible={placeModalVisible} transparent animationType="slide" onRequestClose={() => setPlaceModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setPlaceModalVisible(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Place in Library</Text>
              <Text style={styles.sheetLabel}>Direction</Text>
              <View style={styles.segRow}>
                <Pressable
                  style={[styles.segBtn, placeFrom === 'top' && styles.segBtnActive]}
                  onPress={() => setPlaceFrom('top')}
                >
                  <Text style={[styles.segBtnText, placeFrom === 'top' && styles.segBtnTextActive]}>From Top</Text>
                </Pressable>
                <Pressable
                  style={[styles.segBtn, placeFrom === 'bottom' && styles.segBtnActive]}
                  onPress={() => setPlaceFrom('bottom')}
                >
                  <Text style={[styles.segBtnText, placeFrom === 'bottom' && styles.segBtnTextActive]}>From Bottom</Text>
                </Pressable>
              </View>
              <Text style={styles.sheetLabel}>Position</Text>
              <TextInput
                style={styles.sheetInput}
                value={placePositionText}
                onChangeText={setPlacePositionText}
                keyboardType="number-pad"
                selectTextOnFocus
                autoFocus
              />
              <View style={styles.sheetActions}>
                <Pressable style={styles.cancelBtn} onPress={() => { setPlaceModalVisible(false); setPlacePositionText('1'); }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.confirmBtn} onPress={handlePlacePositionNext}>
                  <Text style={styles.confirmBtnText}>Next</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Flip Card — bottom sheet */}
      <Modal visible={flipModalVisible} transparent animationType="slide" onRequestClose={() => setFlipModalVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setFlipModalVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Flip Card</Text>
            {flipCards.length === 0 ? (
              <Text style={styles.emptyText}>No double-faced cards in hand or battlefield</Text>
            ) : (
              <FlatList
                data={flipCards}
                keyExtractor={(c, i) => `flip-${c.baseName}-${c.place}-${i}`}
                renderItem={({ item }) => (
                  <Pressable style={styles.flipRow} onPress={() => handleFlipToggle(item)}>
                    <Text style={styles.cardName}>{item.displayName}</Text>
                    <Text style={styles.flipZoneBadge}>{item.zone === 'HND' ? 'Hand' : 'Battlefield'}</Text>
                    <Text style={[styles.flipFaceBadge, item.isFlipped && styles.flipFaceBadgeBack]}>
                      {item.isFlipped ? 'Back' : 'Front'}
                    </Text>
                  </Pressable>
                )}
              />
            )}
            <Pressable style={[styles.cancelBtn, { marginTop: 14 }]} onPress={() => setFlipModalVisible(false)}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sleeve waiting modal — used by Place in Library */}
      <Modal visible={sleeveSelectVisible} transparent animationType="fade" onRequestClose={handleCancelSleeveSelect}>
        <View style={styles.sleeveWaitBackdrop}>
          <View style={styles.sleeveWaitCard}>
            <ActivityIndicator color="#D0BCFF" size="large" style={{ marginBottom: 16 }} />
            <Text style={styles.sleeveWaitTitle}>{sleeveWaitMessage}</Text>
            <Text style={styles.sleeveWaitCountdown}>{sleeveSelectCountdown}s</Text>
            <Pressable style={styles.cancelBtn} onPress={handleCancelSleeveSelect}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
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
  headerMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  headerMetaRight: { alignItems: 'flex-end', gap: 4 },
  sleeveStatus: { color: '#6ee7b7', fontSize: 11 },
  sleeveStatusNone: { color: '#f87171' },
  settingsIndicator: { color: '#625b71', fontSize: 11 },
  endGameBtn: { color: '#f87171', fontSize: 11, fontWeight: '700' },

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
  sheetBackdropTouchable: { ...StyleSheet.absoluteFillObject },
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
  zoneSheet: { maxHeight: '92%' },
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

  segRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#625b71',
    alignItems: 'center',
  },
  segBtnActive: { borderColor: '#D0BCFF', backgroundColor: 'rgba(208,188,255,0.12)' },
  segBtnText: { color: '#625b71', fontSize: 14, fontWeight: '700' },
  segBtnTextActive: { color: '#D0BCFF' },

  placeCardName: {
    color: '#D0BCFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  flipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#4a4f55',
    gap: 8,
  },
  flipZoneBadge: { color: '#9ca3af', fontSize: 11, fontWeight: '700' },
  flipFaceBadge: { color: '#6ee7b7', fontSize: 12, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  flipFaceBadgeBack: { color: '#f59e0b' },

  sleeveWaitBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleeveWaitCard: {
    backgroundColor: '#353A40',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#625b71',
    padding: 28,
    width: 280,
    alignItems: 'center',
  },
  sleeveWaitTitle: { color: '#D0BCFF', fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  sleeveWaitCountdown: { color: '#9ca3af', fontSize: 36, fontWeight: '800', marginBottom: 20 },

});
