import React, {useState, useMemo} from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import {GameCard} from '../types';
import CardThumbnail from './CardThumbnail';

interface Props {
  visible: boolean;
  library: GameCard[];
  onSelect: (instanceId: string) => void;
  onCancel: () => void;
}

export default function TutorModal({
  visible,
  library,
  onSelect,
  onCancel,
}: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) {
      return library;
    }
    return library.filter(gc =>
      gc.card.name.toLowerCase().includes(q),
    );
  }, [query, library]);

  const handleSelect = (instanceId: string) => {
    setQuery('');
    onSelect(instanceId);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onCancel}>
      <SafeAreaView style={styles.root}>
        <Text style={styles.title}>Tutor</Text>
        <Text style={styles.subtitle}>
          Select a card to move it to the top of your library.
        </Text>

        <TextInput
          style={styles.search}
          placeholder="Search card name…"
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCorrect={false}
        />

        <FlatList
          data={filtered}
          keyExtractor={item => item.instanceId}
          contentContainerStyle={styles.list}
          renderItem={({item, index}) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => handleSelect(item.instanceId)}>
              <CardThumbnail card={item.card} style={styles.thumb} />
              <View style={styles.info}>
                <Text style={styles.cardName}>{item.card.name}</Text>
                {item.card.typeLine && (
                  <Text style={styles.typeLine}>{item.card.typeLine}</Text>
                )}
                {item.card.manaCost && (
                  <Text style={styles.manaCost}>{item.card.manaCost}</Text>
                )}
                <Text style={styles.position}>#{index + 1} in library</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No cards match "{query}"</Text>
          }
        />

        <TouchableOpacity style={styles.cancelBtn} onPress={() => { setQuery(''); onCancel(); }}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0f0f1a'},
  title: {
    color: '#c9a84c',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 16,
  },
  subtitle: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  search: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  list: {paddingHorizontal: 16, paddingBottom: 100},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    marginBottom: 8,
    padding: 8,
  },
  thumb: {width: 60, height: 84, marginRight: 12},
  info: {flex: 1},
  cardName: {color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 2},
  typeLine: {color: '#aaa', fontSize: 12, marginBottom: 2},
  manaCost: {color: '#c9a84c', fontSize: 12, marginBottom: 2},
  position: {color: '#666', fontSize: 11},
  empty: {color: '#666', textAlign: 'center', marginTop: 40, fontSize: 14},
  cancelBtn: {
    margin: 16,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#555',
    alignItems: 'center',
  },
  cancelText: {color: '#aaa', fontWeight: '600'},
});
