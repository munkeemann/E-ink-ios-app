import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList, DeckEntry} from '../types';
import {useDeck} from '../context/DeckContext';
import CardThumbnail from '../components/CardThumbnail';

type Props = NativeStackScreenProps<RootStackParamList, 'DeckList'>;

export default function DeckListScreen({navigation}: Props) {
  const {deck} = useDeck();

  const totalCards = deck.reduce((sum, e) => sum + e.quantity, 0);
  const uniqueCards = deck.length;

  const renderItem = ({item}: {item: DeckEntry}) => (
    <View style={styles.row}>
      <CardThumbnail
        card={item.card}
        badge={item.quantity}
        style={styles.thumb}
      />
      <View style={styles.info}>
        <Text style={styles.cardName}>{item.card.name}</Text>
        {item.card.manaCost ? (
          <Text style={styles.meta}>{item.card.manaCost}</Text>
        ) : null}
        {item.card.typeLine ? (
          <Text style={styles.meta}>{item.card.typeLine}</Text>
        ) : null}
        {item.card.oracleText ? (
          <Text style={styles.oracle} numberOfLines={3}>
            {item.card.oracleText}
          </Text>
        ) : null}
        {item.card.power && item.card.toughness ? (
          <Text style={styles.pt}>
            {item.card.power}/{item.card.toughness}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.deckStats}>
          {uniqueCards} unique · {totalCards} cards total
        </Text>
        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => navigation.navigate('Game')}>
          <Text style={styles.startBtnText}>▶  Start Game</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={deck}
        keyExtractor={item => item.card.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />

      <TouchableOpacity
        style={styles.reimportBtn}
        onPress={() => navigation.navigate('DeckImport')}>
        <Text style={styles.reimportText}>Re-import deck</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0f0f1a'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  deckStats: {color: '#888', fontSize: 13},
  startBtn: {
    backgroundColor: '#4a7c4e',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  startBtnText: {color: '#fff', fontWeight: '600', fontSize: 14},
  list: {padding: 12},
  row: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 10,
    alignItems: 'flex-start',
  },
  thumb: {width: 80, height: 112, marginRight: 12},
  info: {flex: 1},
  cardName: {color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 4},
  meta: {color: '#c9a84c', fontSize: 12, marginBottom: 2},
  oracle: {color: '#aaa', fontSize: 12, lineHeight: 17, marginTop: 4},
  pt: {color: '#888', fontSize: 12, marginTop: 4, fontWeight: '600'},
  sep: {height: 8},
  reimportBtn: {
    margin: 16,
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  reimportText: {color: '#888', fontSize: 13},
});
