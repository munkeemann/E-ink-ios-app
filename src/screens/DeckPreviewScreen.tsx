/**
 * Deck Preview — shows cards grouped by name, Begin Game, Sync WiFi.
 * Matches Kotlin: DeckPreview.kt
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
import {RootStackParamList, Deck, CardInstance} from '../types';
import {useDeck} from '../context/DeckContext';
import {beginGame} from '../api/piServer';

type Props = NativeStackScreenProps<RootStackParamList, 'DeckPreview'>;

export default function DeckPreviewScreen({navigation, route}: Props) {
  const {deckName} = route.params;
  const {loadDeck} = useDeck();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  useEffect(() => {
    loadDeck(deckName).then(setDeck);
  }, [deckName, loadDeck]);

  const handleBeginGame = async () => {
    if (!deck) {
      return;
    }
    setSyncing(true);
    setSyncProgress('Syncing sleeves…');
    try {
      await beginGame(deck.cards, (sent, total) =>
        setSyncProgress(`Syncing ${sent}/${total}…`),
      );
    } catch (e) {
      Alert.alert('Sync error', e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
    navigation.navigate('Game', {deckName});
  };

  if (!deck) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#8083D3" />
      </View>
    );
  }

  // Group cards by baseName for the preview list (matches Kotlin groupBy { it.baseName })
  const grouped = deck.cards.reduce<Record<string, CardInstance[]>>((acc, c) => {
    (acc[c.baseName] = acc[c.baseName] ?? []).push(c);
    return acc;
  }, {});
  const groupedEntries = Object.entries(grouped);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.btn, styles.primaryBtn, syncing && styles.btnDisabled]}
          onPress={handleBeginGame}
          disabled={syncing}>
          {syncing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Begin Game</Text>
          )}
        </TouchableOpacity>
      </View>

      {syncing && (
        <Text style={styles.syncStatus}>{syncProgress}</Text>
      )}

      <FlatList
        data={groupedEntries}
        keyExtractor={([name]) => name}
        contentContainerStyle={styles.list}
        renderItem={({item: [name, group]}) => (
          <Text style={styles.cardRow}>
            {group.length} × {name}
          </Text>
        )}
        ListHeaderComponent={
          <Text style={styles.cardCount}>
            {deck.cards.length} cards · {groupedEntries.length} unique
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0C1F29'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0C1F29'},
  toolbar: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#132030',
  },
  btn: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {backgroundColor: '#8083D3'},
  btnDisabled: {opacity: 0.5},
  primaryBtnText: {color: '#fff', fontWeight: 'bold', fontSize: 14},
  syncStatus: {
    color: '#88DBD9',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 4,
  },
  list: {padding: 16},
  cardCount: {color: '#556', fontSize: 12, marginBottom: 12},
  cardRow: {
    color: '#8AA2AE',
    fontSize: 15,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#132030',
  },
});
