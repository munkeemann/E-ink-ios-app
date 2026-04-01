/**
 * Scry screen — drag top N cards to reorder, with a draggable "── BOTTOM OF DECK ──"
 * divider. Cards above divider go to top; cards below go to bottom.
 *
 * Matches Kotlin: ScryScreen.kt (uses sh.calvin.reorderable).
 * RN equivalent: react-native-draggable-flatlist.
 *
 * Setup notes (one-time):
 *   iOS:   cd ios && pod install
 *   Both:  wrap root with <GestureHandlerRootView> (done in App.tsx)
 *          add 'react-native-reanimated/plugin' to babel.config.js (done)
 */
import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import {RootStackParamList, CardInstance, Deck, ZONE_CODE} from '../types';
import {useDeck} from '../context/DeckContext';
import {beginGame} from '../api/piServer';

type Props = NativeStackScreenProps<RootStackParamList, 'Scry'>;

// ── Item types ────────────────────────────────────────────────────────────────

type CardItem = {type: 'card'; key: string; card: CardInstance};
type DividerItem = {type: 'divider'; key: 'divider'};
type ScryItem = CardItem | DividerItem;

// ── Component ────────────────────────────────────────────────────────────────

export default function ScryScreen({navigation, route}: Props) {
  const {deckName, scryCount} = route.params;
  const {loadDeck, saveDeck} = useDeck();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [items, setItems] = useState<ScryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Load deck once
  React.useEffect(() => {
    loadDeck(deckName).then(d => {
      if (!d) {
        return;
      }
      setDeck(d);

      const libCards = d.cards
        .filter(c => c.place !== 'commander' && !isNaN(Number(c.place)))
        .sort((a, b) => Number(a.place) - Number(b.place));

      const top = libCards.slice(0, scryCount);
      const initial: ScryItem[] = [
        ...top.map(c => ({type: 'card' as const, key: c.displayName, card: c})),
        {type: 'divider', key: 'divider' as const},
      ];
      setItems(initial);
      setLoaded(true);
    });
  }, [deckName, scryCount, loadDeck]);

  const dividerIndex = useMemo(
    () => items.findIndex(i => i.type === 'divider'),
    [items],
  );

  const handleConfirm = async () => {
    if (!deck) {
      return;
    }
    setConfirming(true);

    try {
      const divIdx = items.findIndex(i => i.type === 'divider');
      const topCards = items
        .slice(0, divIdx)
        .filter((i): i is CardItem => i.type === 'card')
        .map(i => i.card);
      const bottomCards = items
        .slice(divIdx + 1)
        .filter((i): i is CardItem => i.type === 'card')
        .map(i => i.card);

      // Names of scryed cards (to find "rest of deck")
      const scryedNames = new Set(
        [...topCards, ...bottomCards].map(c => c.displayName),
      );

      const commander = deck.cards.find(c => c.place === 'commander');
      const restOfDeck = deck.cards
        .filter(
          c => c.place !== 'commander' && !scryedNames.has(c.displayName),
        )
        .sort((a, b) => Number(a.place) - Number(b.place));

      // New library order: top scried + rest + bottom scried
      const newOrder = [...topCards, ...restOfDeck, ...bottomCards];
      newOrder.forEach((c, i) => (c.place = String(i + 1)));

      const finalCards: CardInstance[] = [];
      if (commander) {
        finalCards.push(commander);
      }
      finalCards.push(...newOrder);

      const updatedDeck: Deck = {...deck, cards: finalCards};
      await saveDeck(updatedDeck);
      await beginGame(finalCards);
    } catch (e) {
      Alert.alert('Sync error', e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
      navigation.goBack();
    }
  };

  const renderItem = ({item, drag, isActive}: RenderItemParams<ScryItem>) => {
    if (item.type === 'divider') {
      return (
        <ScaleDecorator activeScale={1.03}>
          <TouchableOpacity onLongPress={drag} activeOpacity={0.9}>
            <View style={[styles.dividerRow, isActive && styles.rowDragging]}>
              <Text style={styles.dividerText}>── BOTTOM OF DECK ──</Text>
              <Text style={styles.dragHandle}>⠿</Text>
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      );
    }

    const idx = items.findIndex(i => i.key === item.key);
    const isBottom = idx > dividerIndex;

    return (
      <ScaleDecorator activeScale={1.02}>
        <TouchableOpacity onLongPress={drag} activeOpacity={0.9}>
          <View
            style={[
              styles.cardRow,
              isBottom ? styles.cardRowBottom : styles.cardRowTop,
              isActive && styles.rowDragging,
            ]}>
            <Text style={styles.cardName}>{item.card.displayName}</Text>
            <Text
              style={[
                styles.posLabel,
                isBottom ? styles.posLabelBottom : styles.posLabelTop,
              ]}>
              {isBottom ? 'BOTTOM' : 'TOP'}
            </Text>
            <Text style={styles.dragHandle}>⠿</Text>
          </View>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#8083D3" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.subtitle}>
        Long-press a card or the divider bar to drag  •  Cards above divider go
        to top, cards below go to bottom
      </Text>

      <DraggableFlatList
        data={items}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        onDragEnd={({data}) => setItems(data)}
        containerStyle={styles.listContainer}
        // Don't allow divider to go above index 0
        onDragBegin={index => {
          if (items[index].type === 'divider' && index === 0) {
            return false;
          }
        }}
      />

      <TouchableOpacity
        style={[styles.confirmBtn, confirming && styles.confirmBtnDisabled]}
        onPress={handleConfirm}
        disabled={confirming}>
        {confirming ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.confirmBtnText}>Confirm Scry</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#fff'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff'},
  subtitle: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  listContainer: {flex: 1},
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 8,
    marginVertical: 3,
    borderRadius: 8,
  },
  cardRowTop: {backgroundColor: '#F0F4FF'},
  cardRowBottom: {backgroundColor: '#FFF0F0'},
  rowDragging: {opacity: 0.9, elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4},
  cardName: {flex: 1, color: '#111', fontSize: 15},
  posLabel: {fontSize: 11, fontWeight: '700', marginRight: 12},
  posLabelTop: {color: '#3355AA'},
  posLabelBottom: {color: '#AA3333'},
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#444',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 8,
    marginVertical: 3,
    borderRadius: 8,
  },
  dividerText: {flex: 1, color: '#fff', fontWeight: 'bold', fontSize: 13},
  dragHandle: {color: '#aaa', fontSize: 20},
  confirmBtn: {
    backgroundColor: '#8083D3',
    margin: 16,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
  },
  confirmBtnDisabled: {opacity: 0.5},
  confirmBtnText: {color: '#fff', fontWeight: 'bold', fontSize: 15},
});
