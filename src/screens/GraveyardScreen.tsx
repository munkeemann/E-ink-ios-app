/**
 * Graveyard screen — polls Pi /zones to find sleeves reporting "GRV",
 * maps sleeve_id → card by position, lets player return a card to top of library.
 *
 * Matches Kotlin: GraveyardScreen.kt
 */
import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList, Deck, CardInstance, ZONE_CODE} from '../types';
import {useDeck} from '../context/DeckContext';
import {fetchZones, setZone, beginGame} from '../api/piServer';

type Props = NativeStackScreenProps<RootStackParamList, 'Graveyard'>;

export default function GraveyardScreen({navigation, route}: Props) {
  const {deckName} = route.params;
  const {loadDeck, saveDeck} = useDeck();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [zoneMap, setZoneMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [d, zones] = await Promise.all([loadDeck(deckName), fetchZones()]);
      setDeck(d);
      setZoneMap(zones);
    } catch {
      // Pi unreachable — show empty graveyard
    } finally {
      setLoading(false);
    }
  };

  // sleeve_id = card index + 1 (commander at index 0 = sleeve 1)
  // Cards in GRV zone: find sleeve IDs with zone "GRV", map back to card
  const graveyardCards: CardInstance[] = deck
    ? deck.cards
        .map((card, index) => ({card, sleeveId: String(index + 1)}))
        .filter(({sleeveId}) => zoneMap[sleeveId] === 'GRV')
        .map(({card}) => card)
    : [];

  const handleReturnToTop = async (card: CardInstance) => {
    if (!deck) {
      return;
    }
    setReturning(card.displayName);
    try {
      // 1. Move card to position 1 in library (mirrors returnFromGraveyard)
      const commander = deck.cards.find(c => c.place === 'commander');
      const libCards = deck.cards
        .filter(
          c =>
            c.place !== 'commander' && !isNaN(Number(c.place)),
        )
        .sort((a, b) => Number(a.place) - Number(b.place));

      const targetIdx = libCards.findIndex(
        c => c.displayName === card.displayName,
      );
      if (targetIdx >= 0) {
        const [target] = libCards.splice(targetIdx, 1);
        libCards.forEach((c, i) => (c.place = String(i + 2)));
        target.place = '1';
        target.zone = 'LIB';

        const finalCards: CardInstance[] = [];
        if (commander) {
          finalCards.push(commander);
        }
        finalCards.push(target, ...libCards);

        const updatedDeck: Deck = {...deck, cards: finalCards};
        await saveDeck(updatedDeck);
        setDeck(updatedDeck);

        // 2. Tell the sleeve its zone is now LIB
        const sleeveId =
          deck.cards.findIndex(c => c.displayName === card.displayName) + 1;
        await setZone(sleeveId, ZONE_CODE.LIB);

        // 3. Resync all LIB sleeves
        await beginGame(finalCards);
      }

      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setReturning(null);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#8083D3" />
        </View>
      ) : graveyardCards.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Graveyard is empty</Text>
        </View>
      ) : (
        <FlatList
          data={graveyardCards}
          keyExtractor={c => c.displayName}
          contentContainerStyle={styles.list}
          renderItem={({item}) => (
            <View style={styles.row}>
              <Text style={styles.cardName}>{item.displayName}</Text>
              <TouchableOpacity
                style={[
                  styles.returnBtn,
                  returning === item.displayName && styles.returnBtnDisabled,
                ]}
                onPress={() => handleReturnToTop(item)}
                disabled={returning !== null}>
                {returning === item.displayName ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.returnBtnText}>Return to Top</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
        <Text style={styles.refreshText}>↻ Refresh</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0C1F29'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  emptyText: {color: '#8AA2AE', fontSize: 16},
  list: {padding: 16, paddingBottom: 80},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#132030',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  cardName: {flex: 1, color: '#8AA2AE', fontSize: 15},
  returnBtn: {
    backgroundColor: '#8083D3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 110,
    alignItems: 'center',
  },
  returnBtnDisabled: {opacity: 0.5},
  returnBtnText: {color: '#fff', fontSize: 13, fontWeight: '600'},
  refreshBtn: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a3e50',
  },
  refreshText: {color: '#8AA2AE', fontSize: 13},
});
