/**
 * ScryModal — shows the top N cards of the library and lets the player
 * reorder them before putting them back.
 *
 * Drag-to-reorder requires native dependencies not included here, so we use
 * simple ▲▼ buttons. Swap them out for react-native-draggable-flatlist if
 * you want proper drag support.
 */
import React, {useState} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import {GameCard} from '../types';
import CardThumbnail from './CardThumbnail';

interface Props {
  visible: boolean;
  topCards: GameCard[];   // already sliced to scry-N
  onConfirm: (reordered: GameCard[]) => void;
  onCancel: () => void;
}

export default function ScryModal({
  visible,
  topCards,
  onConfirm,
  onCancel,
}: Props) {
  const [order, setOrder] = useState<GameCard[]>(topCards);

  // Reset whenever the modal opens with fresh cards
  React.useEffect(() => {
    setOrder(topCards);
  }, [topCards]);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...order];
    const target = index + direction;
    if (target < 0 || target >= next.length) {
      return;
    }
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onCancel}>
      <SafeAreaView style={styles.root}>
        <Text style={styles.title}>Scry {topCards.length}</Text>
        <Text style={styles.subtitle}>
          Reorder the top cards, then confirm to put them back.
        </Text>

        <FlatList
          data={order}
          keyExtractor={item => item.instanceId}
          contentContainerStyle={styles.list}
          renderItem={({item, index}) => (
            <View style={styles.row}>
              <View style={styles.arrows}>
                <TouchableOpacity
                  style={styles.arrowBtn}
                  onPress={() => move(index, -1)}
                  disabled={index === 0}>
                  <Text style={[styles.arrow, index === 0 && styles.disabled]}>
                    ▲
                  </Text>
                </TouchableOpacity>
                <Text style={styles.position}>{index + 1}</Text>
                <TouchableOpacity
                  style={styles.arrowBtn}
                  onPress={() => move(index, 1)}
                  disabled={index === order.length - 1}>
                  <Text
                    style={[
                      styles.arrow,
                      index === order.length - 1 && styles.disabled,
                    ]}>
                    ▼
                  </Text>
                </TouchableOpacity>
              </View>
              <CardThumbnail card={item.card} style={styles.thumb} />
              <Text style={styles.cardName} numberOfLines={2}>
                {item.card.name}
              </Text>
            </View>
          )}
        />

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => onConfirm(order)}>
            <Text style={styles.confirmText}>Put Back</Text>
          </TouchableOpacity>
        </View>
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
  list: {paddingHorizontal: 16, paddingBottom: 16},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    marginBottom: 8,
    padding: 8,
  },
  arrows: {
    width: 36,
    alignItems: 'center',
    marginRight: 8,
  },
  arrowBtn: {padding: 4},
  arrow: {color: '#c9a84c', fontSize: 18},
  disabled: {color: '#444'},
  position: {color: '#888', fontSize: 12, marginVertical: 2},
  thumb: {width: 60, height: 84, marginRight: 12},
  cardName: {color: '#fff', flex: 1, fontSize: 14},
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#555',
    alignItems: 'center',
  },
  cancelText: {color: '#aaa', fontWeight: '600'},
  confirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#c9a84c',
    alignItems: 'center',
  },
  confirmText: {color: '#000', fontWeight: 'bold'},
});
