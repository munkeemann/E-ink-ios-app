import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { createGame, allSleeveUpdates } from '../../src/holdem/HoldemGame';
import { saveHoldemGame } from '../../src/storage/holdemStorage';
import { sendToSleeve, clearMemo } from '../../src/api/sleeveService';
import { totalSleeveCount } from '../../src/holdem/HoldemSleeveLayout';

const MIN_PLAYERS = 2;

export default function HoldemSetupScreen() {
  const [playerCount, setPlayerCount] = useState(2);
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      const state = createGame(playerCount);
      await saveHoldemGame(state);

      // Push face-down descriptors to all sleeves to initialise displays
      clearMemo();
      const updates = allSleeveUpdates(state);
      for (const u of updates) {
        await sendToSleeve(u.sleeveId, u.descriptor).catch(() => {});
      }

      router.replace('/holdem/game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Texas Hold'em</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Number of players</Text>
        <View style={styles.stepper}>
          <Pressable
            style={[styles.stepBtn, playerCount <= MIN_PLAYERS && styles.stepBtnDisabled]}
            onPress={() => setPlayerCount(p => Math.max(MIN_PLAYERS, p - 1))}
            disabled={playerCount <= MIN_PLAYERS}
          >
            <Text style={styles.stepLabel}>−</Text>
          </Pressable>
          <Text style={styles.count}>{playerCount}</Text>
          <Pressable style={styles.stepBtn} onPress={() => setPlayerCount(p => p + 1)}>
            <Text style={styles.stepLabel}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          {totalSleeveCount(playerCount)} sleeves required
          ({playerCount * 2} hole · 5 community)
        </Text>
      </View>

      <Pressable
        style={[styles.startBtn, loading && styles.startBtnDisabled]}
        onPress={handleStart}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#060c14" />
        ) : (
          <Text style={styles.startLabel}>Start Game</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060c14',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },
  title: {
    color: '#22d3ee',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(34,211,238,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },

  card: {
    width: '100%',
    backgroundColor: '#071a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0e7490',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 16,
  },
  label: { color: '#64b5c8', fontSize: 14, letterSpacing: 0.6 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0e7490',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.3 },
  stepLabel: { color: '#e0f7ff', fontSize: 22, fontWeight: '700', lineHeight: 26 },
  count: { color: '#22d3ee', fontSize: 40, fontWeight: '800', minWidth: 48, textAlign: 'center' },
  hint: { color: '#3a6070', fontSize: 12, letterSpacing: 0.4 },

  startBtn: {
    width: '100%',
    height: 52,
    borderRadius: 10,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnDisabled: { opacity: 0.5 },
  startLabel: { color: '#060c14', fontSize: 16, fontWeight: '800', letterSpacing: 0.8 },
});
