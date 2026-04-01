/**
 * Home screen — list of saved decks.
 * Matches Kotlin: DeckListScreen + DeckTile + DeckScreenWithNav "deckList" route.
 */
import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList, Deck} from '../types';
import {useDeck} from '../context/DeckContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SavedDecks'>;

const MANA_COLOR: Record<string, string> = {
  W: '#F9FAF4',
  U: '#0E68AB',
  B: '#150B00',
  R: '#D3202A',
  G: '#00733E',
};
const MANA_LABEL: Record<string, string> = {
  W: 'W',
  U: 'U',
  B: 'B',
  R: 'R',
  G: 'G',
};

function ManaSymbol({color}: {color: string}) {
  return (
    <View style={[styles.mana, {backgroundColor: MANA_COLOR[color] ?? '#888'}]}>
      <Text style={styles.manaText}>{MANA_LABEL[color] ?? color}</Text>
    </View>
  );
}

function DeckTile({deck, onPress, onLongPress}: {
  deck: Deck;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}>
      {deck.commanderImageUri ? (
        <Image
          source={{uri: deck.commanderImageUri}}
          style={styles.tileImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.tileImage, styles.tileImagePlaceholder]} />
      )}
      <View style={styles.tileOverlay} />
      <View style={styles.tileMeta}>
        <Text style={styles.tileName}>{deck.name}</Text>
        <View style={styles.manaRow}>
          {deck.colors.map(c => (
            <ManaSymbol key={c} color={c} />
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function SavedDecksScreen({navigation}: Props) {
  const {loadAllDecks, deleteDeck} = useDeck();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadAllDecks().then(d => {
        setDecks(d);
        setLoading(false);
      });
    }, [loadAllDecks]),
  );

  const handleLongPress = (deck: Deck) => {
    Alert.alert('Delete Deck', `Delete "${deck.name}"? This cannot be undone.`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDeck(deck.name);
          setDecks(prev => prev.filter(d => d.name !== deck.name));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#8083D3" size="large" />
        </View>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={d => d.name}
          contentContainerStyle={styles.list}
          renderItem={({item}) => (
            <DeckTile
              deck={item}
              onPress={() =>
                navigation.navigate('DeckPreview', {deckName: item.name})
              }
              onLongPress={() => handleLongPress(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No decks yet</Text>
              <Text style={styles.emptyHint}>
                Tap + to import your first deck
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('DeckImport')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.sleeveBtn}
        onPress={() => navigation.navigate('SleeveManager')}>
        <Text style={styles.sleeveBtnText}>Sleeves</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0C1F29'},
  list: {padding: 16, paddingBottom: 100, gap: 12},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40},
  emptyTitle: {color: '#8AA2AE', fontSize: 18, fontWeight: '600', marginBottom: 8},
  emptyHint: {color: '#556', fontSize: 13, textAlign: 'center'},
  tile: {
    height: 100,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#132030',
  },
  tileImage: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  tileImagePlaceholder: {backgroundColor: '#1a2e3e'},
  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  tileMeta: {flex: 1, justifyContent: 'flex-end', padding: 10},
  tileName: {color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4},
  manaRow: {flexDirection: 'row', gap: 4},
  mana: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  manaText: {color: '#fff', fontSize: 9, fontWeight: 'bold'},
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8083D3',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabText: {color: '#fff', fontSize: 28, lineHeight: 32},
  sleeveBtn: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a3e50',
  },
  sleeveBtnText: {color: '#8AA2AE', fontSize: 13},
});
