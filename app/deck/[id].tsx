import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { beginGame } from '../../src/api/piServer';
import { getDeck } from '../../src/storage/deckStorage';
import { CardInstance, Deck } from '../../src/types';

export default function DeckPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0 });

  useFocusEffect(
    useCallback(() => {
      if (id) getDeck(id).then(setDeck);
    }, [id]),
  );

  if (!deck) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#D0BCFF" />
      </View>
    );
  }

  const commander = deck.cards.find(c => c.place === 'commander');
  const library = deck.cards
    .filter(c => c.zone === 'LIB')
    .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10));

  const handleBeginGame = async () => {
    setSending(true);
    setSendProgress({ sent: 0, total: 0 });
    try {
      await beginGame(deck.cards, (sent, total) =>
        setSendProgress({ sent, total }),
      );
      router.push(`/game/${deck.id}`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const renderCard = ({ item, index }: { item: CardInstance; index: number }) => (
    <View style={styles.cardRow}>
      <Text style={styles.cardIndex}>
        {item.place === 'commander' ? '⚔' : index}
      </Text>
      <Text style={styles.cardName}>{item.displayName}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {deck.commanderImagePath ? (
          <Image
            source={{ uri: deck.commanderImagePath }}
            style={styles.headerArt}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.headerArt, styles.headerArtPlaceholder]} />
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.deckTitle}>{deck.name}</Text>
          {commander && (
            <Text style={styles.commanderName}>{commander.displayName}</Text>
          )}
          <Text style={styles.deckMeta}>{deck.cards.length} cards total</Text>
        </View>
      </View>

      <FlatList
        data={[...(commander ? [commander] : []), ...library]}
        keyExtractor={(c, i) => `${c.baseName}-${i}`}
        renderItem={renderCard}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />

      {sending ? (
        <View style={styles.sendingBar}>
          <ActivityIndicator color="#D0BCFF" size="small" />
          <Text style={styles.sendingText}>
            Sending sleeves… {sendProgress.sent}/{sendProgress.total}
          </Text>
        </View>
      ) : (
        <Pressable style={styles.beginBtn} onPress={handleBeginGame}>
          <Text style={styles.beginBtnText}>⚡ Begin Game</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#292E32' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    backgroundColor: '#353A40',
    borderBottomWidth: 1,
    borderColor: '#625b71',
  },
  headerArt: { width: 90, height: 124 },
  headerArtPlaceholder: { backgroundColor: '#353A40' },
  headerInfo: { flex: 1, padding: 14, justifyContent: 'center', gap: 4 },
  deckTitle: { color: '#D0BCFF', fontSize: 20, fontWeight: '800' },
  commanderName: { color: '#CCC2DC', fontSize: 13 },
  deckMeta: { color: '#625b71', fontSize: 12 },
  list: { flex: 1 },
  listContent: { paddingVertical: 8 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#353A40',
  },
  cardIndex: {
    width: 30,
    color: '#625b71',
    fontSize: 12,
    textAlign: 'right',
    marginRight: 12,
  },
  cardName: { color: '#D4CDC1', fontSize: 15 },
  sendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 18,
    backgroundColor: '#353A40',
    borderTopWidth: 1,
    borderColor: '#625b71',
  },
  sendingText: { color: '#CCC2DC', fontSize: 14 },
  beginBtn: {
    margin: 16,
    backgroundColor: '#6650a4',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  beginBtnText: { color: '#D0BCFF', fontSize: 18, fontWeight: '800' },
});
