import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import { fetchZones, assignSleeveIds, beginGame, getRegisteredSleeves, pushCardToSleeve, pushZoneUpdateViaPi } from '../../src/api/piServer';
import { fetchTokenImage } from '../../src/api/scryfall';
import { clearMemo } from '../../src/api/sleeveService';
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

  const [revealModalVisible, setRevealModalVisible] = useState(false);
  const [revealCountText, setRevealCountText] = useState('3');

  const [artPopupCard, setArtPopupCard] = useState<CardInstance | null>(null);

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

  // Place in Library
  const [waitingForSleeve, setWaitingForSleeve] = useState(false);   // step 1: waiting for physical button press
  const waitingForSleeveRef = useRef(false);                          // stable ref for poll closure
  const [placeCard, setPlaceCard] = useState<CardInstance | null>(null); // card chosen via sleeve press
  const [placePositionVisible, setPlacePositionVisible] = useState(false); // step 2: position picker
  const [placeFrom, setPlaceFrom] = useState<'top' | 'bottom' | 'position'>('top');
  const [placePositionText, setPlacePositionText] = useState('1');

  // Flip Card picker
  const [flipModalVisible, setFlipModalVisible] = useState(false);

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

  // Keep waitingForSleeveRef in sync so the poll closure can read it without stale captures
  useEffect(() => { waitingForSleeveRef.current = waitingForSleeve; }, [waitingForSleeve]);

  // Keep a stable ref to deck so the polling interval always sees current state
  const deckRef = useRef(deck);
  useEffect(() => { deckRef.current = deck; }, [deck]);

  // Track the last-seen zone_name per sleeve so we can detect Pi-initiated changes
  const zonesSnapshotRef = useRef<Record<number, string>>({});

  // Poll /zones every 5 s.
  // While waitingForSleeve is true the first incoming zone change is treated as a
  // card selection (Place in Library). In normal mode, zone changes move cards in state.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const zoneMap = await fetchZones(); // {"2": "EXL", "3": "LIB", ...}
        const currentDeck = deckRef.current;
        if (!currentDeck) return;

        // ── Sleeve-selection intercept (Place in Library step 1) ──────────────
        if (waitingForSleeveRef.current) {
          for (const [idStr, zoneName] of Object.entries(zoneMap)) {
            const sleeveId = Number(idStr);
            const prevZone = zonesSnapshotRef.current[sleeveId];
            if (prevZone === undefined || prevZone === zoneName) continue;
            // A sleeve button was pressed — identify the card
            const card = currentDeck.cards.find(c => c.sleeveId === sleeveId) ?? null;
            console.log(`[PlaceInLib] sleeve ${sleeveId} pressed; card: ${card?.displayName ?? 'none'}`);
            // Immediately restore the sleeve's zone strip to what it was before the press
            pushZoneUpdateViaPi(sleeveId, prevZone).catch(() => {});
            zonesSnapshotRef.current[sleeveId] = prevZone; // keep snapshot stable
            if (card) {
              if (card.place === 'commander') {
                // Commander is ineligible for Place in Library — silently ignore,
                // keep the waiting state so the user can press a different sleeve.
                console.log(`[PlaceInLib] sleeve ${sleeveId} is commander — ignoring`);
                continue;
              }
              waitingForSleeveRef.current = false;
              setWaitingForSleeve(false);
              setPlaceCard(card);
              setPlaceFrom('top');
              setPlacePositionText('1');
              setPlacePositionVisible(true);
            }
            return; // stop — don't process further changes this tick
          }
          return; // still waiting — suppress normal zone-move processing
        }

        // ── Normal zone-change processing ─────────────────────────────────────
        let changed = false;
        const updatedCards = [...(Array.isArray(currentDeck.cards) ? currentDeck.cards : [])];

        for (const [idStr, zoneName] of Object.entries(zoneMap)) {
          const sleeveId = Number(idStr);
          const prevZone = zonesSnapshotRef.current[sleeveId];
          zonesSnapshotRef.current[sleeveId] = zoneName;
          if (prevZone === undefined || prevZone === zoneName) continue;
          const destZone = zoneName as Zone;
          if (!['LIB', 'HND', 'BTFLD', 'GRV', 'EXL', 'CMD'].includes(destZone)) {
            console.log(`[ZonePoll] sleeve ${sleeveId}: unrecognised zone name "${zoneName}" — skipping`);
            continue;
          }
          const idx = updatedCards.findIndex(c => c.sleeveId === sleeveId);
          if (idx === -1) {
            console.log(`[ZonePoll] sleeve ${sleeveId}: no card found with this sleeveId — skipping`);
            continue;
          }
          const card = updatedCards[idx];
          if (card.zone === destZone) {
            console.log(`[ZonePoll] sleeve ${sleeveId} (${card.displayName}): already in zone ${destZone} — no-op`);
            continue;
          }
          console.log(`[ZonePoll] sleeve ${sleeveId} (${card.displayName}): ${card.zone} → ${destZone}`);
          updatedCards[idx] = { ...card, zone: destZone };
          changed = true;
        }

        if (changed) {
          const newDeck = { ...currentDeck, cards: updatedCards };
          deckRef.current = newDeck;
          setDeck(newDeck);
          saveDeck(newDeck).catch(() => {});
        }
      } catch {
        // Pi offline — ignore
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []); // intentionally empty — uses refs to avoid recreating interval on state changes

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

  // ─── Push images only for sleeves whose card assignment changed ───────────
  // Use this instead of syncSleeves for single-card zone moves to avoid the
  // clear+display race condition. Only sleeves that now carry a *different*
  // card (or a card that is newly sleeved) get a fresh image push.
  // After pushing the image, /set_zone resets the zone strip to LIB (index 4)
  // since the incoming card is always the new top of library.
  const pushNewlySleevedImages = (oldCards: CardInstance[], newCards: CardInstance[]) => {
    if (!connectedSleeves || connectedSleeves.length === 0) return;
    const oldSleeveToName = new Map<number, string>();
    for (const c of oldCards) {
      if (c.sleeveId !== null) oldSleeveToName.set(c.sleeveId, c.displayName);
    }
    const registered = new Set(connectedSleeves);
    for (const c of newCards) {
      if (c.sleeveId === null || !registered.has(c.sleeveId)) continue;
      if (oldSleeveToName.get(c.sleeveId) !== c.displayName) {
        pushCardToSleeve(c).catch(() => {});
        pushZoneUpdateViaPi(c.sleeveId, c.zone).catch(() => {});
      }
    }
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
        clearMemo();
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
        clearMemo();
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
      // Update zone strips: HND cards → zone 3, LIB cards → zone 4
      for (const c of finalCards) {
        if (c.sleeveId !== null) pushZoneUpdateViaPi(c.sleeveId, c.zone).catch(() => {});
      }
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
      const without = deckCards.filter(c => c !== card);
      const commanderCards = without.filter(c => c.place === 'commander');
      const libCards = without
        .filter(c => c.zone === 'LIB' && c.place !== 'commander')
        .map((c, i) => ({ ...c, place: String(i + 1) }));
      const otherCards = without.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
      // Reassign so the freed sleeve cascades back to the new top-of-library card
      const newCards = assignSleeveIds([...commanderCards, ...libCards, ...otherCards], settings);
      for (const c of newCards) {
        if (c.sleeveId !== null) pushZoneUpdateViaPi(c.sleeveId, c.zone).catch(() => {});
      }
      pushNewlySleevedImages(deckCards, newCards);
      const newDeck = { ...deck, cards: newCards };
      await saveDeck(newDeck);
      setDeck(newDeck);
      return;
    }

    // Only GRV/EXL free a physical sleeve — cascade the library to fill the gap.
    // For HND, BTFLD, CMD and all other destinations the card keeps its current sleeve;
    // only the zone strip needs updating.
    if (destZone === 'GRV' || destZone === 'EXL') {
      const withMove = deckCards.map(c => c === card ? { ...c, zone: destZone } : c);
      const commanderCards = withMove.filter(c => c.place === 'commander');
      const libCards = withMove
        .filter(c => c.zone === 'LIB' && c.place !== 'commander')
        .map((c, i) => ({ ...c, place: String(i + 1) }));
      const otherCards = withMove.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
      const newCards = assignSleeveIds([...commanderCards, ...libCards, ...otherCards], settings);
      for (const c of newCards) {
        if (c.sleeveId !== null) pushZoneUpdateViaPi(c.sleeveId, c.zone).catch(() => {});
      }
      pushNewlySleevedImages(deckCards, newCards);
      const newDeck = { ...deck, cards: newCards };
      await saveDeck(newDeck);
      setDeck(newDeck);
    } else {
      // Card keeps its sleeve — just move the zone flag and update the strip.
      const newCards = deckCards.map(c => c === card ? { ...c, zone: destZone } : c);
      if (card.sleeveId !== null) pushZoneUpdateViaPi(card.sleeveId, destZone).catch(() => {});
      const newDeck = { ...deck, cards: newCards };
      await saveDeck(newDeck);
      setDeck(newDeck);
    }
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

    // Build updated card array: move selected cards, remove tokens leaving battlefield
    const withMove = deckCards.reduce<CardInstance[]>((acc, c) => {
      const isSelected = keys.has(cardKey(c)) && (c.zone === sourceZone || (sourceZone === 'BTFLD' && c.zone === 'TKN'));
      if (!isSelected) { acc.push(c); return acc; }
      // Tokens leaving the battlefield are deleted, not moved
      if (c.isToken && destZone !== 'BTFLD' && destZone !== 'TKN') return acc;
      acc.push({ ...c, zone: destZone });
      return acc;
    }, []);

    // Only GRV/EXL free physical sleeves — cascade the library to fill the gap.
    // For all other destinations cards keep their sleeves; just update zone strips.
    if (destZone === 'GRV' || destZone === 'EXL') {
      const commanderCards = withMove.filter(c => c.place === 'commander');
      const libCards = withMove
        .filter(c => c.zone === 'LIB' && c.place !== 'commander')
        .map((c, i) => ({ ...c, place: String(i + 1) }));
      const otherCards = withMove.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
      const newCards = assignSleeveIds([...commanderCards, ...libCards, ...otherCards], settings);
      for (const c of newCards) {
        if (c.sleeveId !== null) pushZoneUpdateViaPi(c.sleeveId, c.zone).catch(() => {});
      }
      pushNewlySleevedImages(deckCards, newCards);
      const newDeck = { ...deck, cards: newCards };
      await saveDeck(newDeck);
      setDeck(newDeck);
    } else {
      // Cards keep their sleeves — push zone strips only for selected cards that have one.
      for (const c of deckCards) {
        const isSelected = keys.has(cardKey(c)) && (c.zone === sourceZone || (sourceZone === 'BTFLD' && c.zone === 'TKN'));
        if (isSelected && !c.isToken && c.sleeveId !== null) {
          pushZoneUpdateViaPi(c.sleeveId, destZone).catch(() => {});
        }
      }
      const newDeck = { ...deck, cards: withMove };
      await saveDeck(newDeck);
      setDeck(newDeck);
    }
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

  // ─── Reveal ───────────────────────────────────────────────────────────────
  const handleRevealConfirm = () => {
    const n = parseInt(revealCountText, 10);
    if (isNaN(n) || n < 1) { Alert.alert('Invalid', 'Enter a number ≥ 1'); return; }
    setRevealModalVisible(false);
    router.push({ pathname: '/reveal', params: { deckId: id, count: String(n) } });
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
        clearMemo();
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
  // Step 1: tap "Place in Library" → enter waiting-for-sleeve state
  const handleStartPlaceInLibrary = () => {
    waitingForSleeveRef.current = true;
    setWaitingForSleeve(true);
  };

  const handleCancelWaiting = () => {
    waitingForSleeveRef.current = false;
    setWaitingForSleeve(false);
  };

  // Step 2: position chosen → execute placement
  const handlePlaceConfirm = async () => {
    if (!placeCard || !deck) return;
    if (placeCard.place === 'commander') {
      console.warn('[PlaceInLibrary] refusing to place commander in library');
      setPlaceCard(null);
      setPlacePositionVisible(false);
      return;
    }
    const deckCards = Array.isArray(deck.cards) ? deck.cards : [];

    let insertIdx: number;
    const sortedLib = deckCards
      .filter(c => c.zone === 'LIB' && c !== placeCard)
      .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));

    if (placeFrom === 'top') {
      insertIdx = 0;
    } else if (placeFrom === 'bottom') {
      insertIdx = sortedLib.length;
    } else {
      const pos = parseInt(placePositionText, 10);
      if (isNaN(pos) || pos < 1) { Alert.alert('Invalid', 'Enter a position ≥ 1'); return; }
      insertIdx = Math.min(pos - 1, sortedLib.length);
    }

    const cardInLib = { ...placeCard, zone: 'LIB' as Zone };
    const newLib = [
      ...sortedLib.slice(0, insertIdx),
      cardInLib,
      ...sortedLib.slice(insertIdx),
    ].map((c, i) => ({ ...c, place: String(i + 1) }));

    const commanderCards = deckCards.filter(c => c.place === 'commander');
    const otherCards = deckCards.filter(c => c !== placeCard && c.zone !== 'LIB' && c.place !== 'commander');
    const newCards = assignSleeveIds([...commanderCards, ...newLib, ...otherCards], settings);

    // Cascade: push new images to sleeves whose card changed
    pushNewlySleevedImages(deckCards, newCards);
    // Reset zone strips for all sleeved cards (library cards → LIB = 4)
    for (const c of newCards) {
      if (c.sleeveId !== null) pushZoneUpdateViaPi(c.sleeveId, c.zone).catch(() => {});
    }
    // Explicitly update sleeve 1 (commander) — the generic loop relies on object-identity
    // matching inside assignSleeveIds which can miss the commander in spread-copy scenarios.
    const commanderAfter = newCards.find(c => c.place === 'commander');
    if (commanderAfter) pushZoneUpdateViaPi(1, commanderAfter.zone).catch(() => {});

    setPlacePositionVisible(false);
    setPlaceCard(null);
    const updated = { ...deck, cards: newCards };
    await saveDeck(updated);
    setDeck(updated);
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
    clearMemo();
    syncSleeves(newDeck.cards);
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

      const currentDeck = deck!;
      const deckCards = Array.isArray(currentDeck.cards) ? currentDeck.cards : [];

      // The token steals the sleeve of the current top-of-library card.
      // All library places shift by +1 so the displaced card lands at position 2.
      const sortedLib = deckCards
        .filter(c => c.zone === 'LIB')
        .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));
      const topLibCard = sortedLib[0] ?? null;
      const tokenSleeveId: number | null = topLibCard?.sleeveId ?? null;

      // Cascade sleeve IDs: each lib card's new sleeveId = the one the next card had.
      // This correctly handles librarySleeveDepth > 1 (e.g. top 2 cards sleeved).
      const updatedLibCards = sortedLib.map((c, i) => ({
        ...c,
        place: String(i + 2),                           // 1→2, 2→3, …
        sleeveId: sortedLib[i + 1]?.sleeveId ?? null,   // cascade: inherit next card's sleeve
      }));

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
      const commanderCards = deckCards.filter(c => c.place === 'commander');
      const nonLibNonCommander = deckCards.filter(c => c.zone !== 'LIB' && c.place !== 'commander');
      const existingTokens: TokenTemplate[] = Array.isArray(currentDeck.tokens) ? currentDeck.tokens : [];
      const alreadySaved = existingTokens.some(t => t.name.toLowerCase() === name.trim().toLowerCase());
      const newTokens: TokenTemplate[] = alreadySaved
        ? existingTokens
        : [...existingTokens, { name: name.trim(), power, toughness, colors }];

      const finalCards = [...commanderCards, ...updatedLibCards, ...nonLibNonCommander, tokenCard];
      const updated: Deck = { ...currentDeck, cards: finalCards, tokens: newTokens };
      await saveDeck(updated);
      setDeck(updated);

      // Push token image + zone update to the stolen sleeve
      if (tokenSleeveId !== null) {
        console.log(`[Token] Pushing token "${tokenCard.displayName}" → sleeve ${tokenSleeveId}`);
        pushCardToSleeve(tokenCard)
          .then(() => console.log(`[Token] sleeve ${tokenSleeveId} image OK`))
          .catch(e => console.error(`[Token] sleeve ${tokenSleeveId} image ERR:`, e));
        pushZoneUpdateViaPi(tokenSleeveId, 'TKN').catch(() => {});
      }
      // Push any library cards that inherited a sleeve from the cascade (depth > 1)
      for (const libCard of updatedLibCards) {
        if (libCard.sleeveId !== null) {
          console.log(`[Token] Pushing lib "${libCard.displayName}" (place ${libCard.place}) → sleeve ${libCard.sleeveId}`);
          pushCardToSleeve(libCard)
            .then(() => console.log(`[Token] sleeve ${libCard.sleeveId} image OK`))
            .catch(e => console.error(`[Token] sleeve ${libCard.sleeveId} image ERR:`, e));
          pushZoneUpdateViaPi(libCard.sleeveId, 'LIB').catch(() => {});
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
          <Pressable style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={() => setRevealModalVisible(true)} disabled={busy}>
            <Text style={styles.actionIcon}>🃏</Text>
            <Text style={styles.actionLabel}>Reveal</Text>
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
              <View style={styles.zoneSheetHeaderBtns}>
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
                <Pressable
                  style={styles.zoneClosBtn}
                  onPress={() => { setActiveZone(null); setSelectedCards(new Set()); }}
                >
                  <Text style={styles.zoneClsBtnText}>Done</Text>
                </Pressable>
              </View>
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
                      <Pressable style={styles.cardNameWrapper} onLongPress={() => setArtPopupCard(item)}>
                        <Text style={styles.cardName}>{item.displayName}</Text>
                      </Pressable>
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

      {/* Reveal — bottom sheet */}
      <Modal visible={revealModalVisible} transparent animationType="slide" onRequestClose={() => setRevealModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setRevealModalVisible(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Reveal</Text>
              <Text style={styles.sheetLabel}>How many cards?</Text>
              <TextInput style={styles.sheetInput} value={revealCountText} onChangeText={setRevealCountText} keyboardType="number-pad" selectTextOnFocus autoFocus />
              <View style={styles.sheetActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setRevealModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.confirmBtn} onPress={handleRevealConfirm}>
                  <Text style={styles.confirmBtnText}>Reveal</Text>
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

      {/* Place in Library — step 1: waiting for sleeve button press */}
      <Modal visible={waitingForSleeve} transparent animationType="fade" onRequestClose={handleCancelWaiting}>
        <View style={styles.sleeveWaitBackdrop}>
          <View style={styles.sleeveWaitCard}>
            <ActivityIndicator color="#D0BCFF" size="large" style={{ marginBottom: 16 }} />
            <Text style={styles.sleeveWaitTitle}>Press the button on the card you want to place in the library.</Text>
            <Pressable style={[styles.cancelBtn, { marginTop: 16 }]} onPress={handleCancelWaiting}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Place in Library — step 2: position picker */}
      <Modal visible={placePositionVisible} transparent animationType="slide" onRequestClose={() => { setPlacePositionVisible(false); setPlaceCard(null); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.sheetBackdrop} onPress={() => { setPlacePositionVisible(false); setPlaceCard(null); }}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Place in Library</Text>
              {placeCard && <Text style={[styles.sheetLabel, { marginBottom: 12 }]}>{placeCard.displayName}</Text>}
              <View style={styles.segRow}>
                <Pressable
                  style={[styles.segBtn, placeFrom === 'top' && styles.segBtnActive]}
                  onPress={() => setPlaceFrom('top')}
                >
                  <Text style={[styles.segBtnText, placeFrom === 'top' && styles.segBtnTextActive]}>Top</Text>
                </Pressable>
                <Pressable
                  style={[styles.segBtn, placeFrom === 'bottom' && styles.segBtnActive]}
                  onPress={() => setPlaceFrom('bottom')}
                >
                  <Text style={[styles.segBtnText, placeFrom === 'bottom' && styles.segBtnTextActive]}>Bottom</Text>
                </Pressable>
                <Pressable
                  style={[styles.segBtn, placeFrom === 'position' && styles.segBtnActive]}
                  onPress={() => setPlaceFrom('position')}
                >
                  <Text style={[styles.segBtnText, placeFrom === 'position' && styles.segBtnTextActive]}>Position</Text>
                </Pressable>
              </View>
              {placeFrom === 'position' && (
                <>
                  <Text style={styles.sheetLabel}>Position from top</Text>
                  <TextInput
                    style={styles.sheetInput}
                    value={placePositionText}
                    onChangeText={setPlacePositionText}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    autoFocus
                  />
                </>
              )}
              <View style={styles.sheetActions}>
                <Pressable style={styles.cancelBtn} onPress={() => { setPlacePositionVisible(false); setPlaceCard(null); }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.confirmBtn} onPress={handlePlaceConfirm}>
                  <Text style={styles.confirmBtnText}>Confirm</Text>
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


      {/* Card art popup (long press) */}
      <Modal visible={artPopupCard !== null} transparent animationType="fade" onRequestClose={() => setArtPopupCard(null)}>
        <Pressable style={styles.artBackdrop} onPress={() => setArtPopupCard(null)}>
          {artPopupCard?.imagePath ? (
            <Image source={{ uri: artPopupCard.imagePath }} style={styles.artFull} resizeMode="contain" />
          ) : null}
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
  zoneSheetHeaderBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneClosBtn: {
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#625b71',
  },
  zoneClsBtnText: { color: '#CCC2DC', fontSize: 12, fontWeight: '700' },
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
  cardNameWrapper: { flex: 1 },
  cardName: { color: '#D4CDC1', fontSize: 15 },
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

  artBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  artFull: { width: '90%', height: '80%' },

});
