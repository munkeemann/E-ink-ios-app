import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../types';
import {useDeck} from '../context/DeckContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({navigation}: Props) {
  const {deck} = useDeck();
  const totalCards = deck.reduce((sum, e) => sum + e.quantity, 0);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.title}>E-Ink Sleeves</Text>
        <Text style={styles.subtitle}>Magic: The Gathering Card Display</Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('DeckImport')}>
          <Text style={styles.primaryText}>Import Deck</Text>
        </TouchableOpacity>

        {deck.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('DeckList')}>
              <Text style={styles.secondaryText}>
                View Deck ({totalCards} cards)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, styles.gameBtn]}
              onPress={() => navigation.navigate('Game')}>
              <Text style={styles.gameBtnText}>▶  Start Game</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => navigation.navigate('SleeveManager')}>
          <Text style={styles.outlineText}>Sleeve Manager</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    justifyContent: 'space-between',
    padding: 24,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#c9a84c',
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 1,
    textAlign: 'center',
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  buttons: {gap: 12},
  primaryBtn: {
    backgroundColor: '#c9a84c',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  primaryText: {color: '#000', fontSize: 16, fontWeight: 'bold'},
  secondaryBtn: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  secondaryText: {color: '#fff', fontSize: 15},
  gameBtn: {borderColor: '#4a7c4e'},
  gameBtnText: {color: '#6abf69', fontSize: 15, fontWeight: '600'},
  outlineBtn: {
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#555',
  },
  outlineText: {color: '#888', fontSize: 14},
});
