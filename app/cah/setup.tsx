import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import cahPack from '../../assets/data/cah_pack.json';
import { createCahGame, allSleeveUpdates } from '../../src/cah/CahGame';
import { totalCahSleeveCount } from '../../src/cah/CahSleeveLayout';
import { saveCahGame } from '../../src/storage/cahStorage';
import { faceDownDescriptor } from '../../src/api/sleeveService';
import { sendToSleeve } from '../../src/api/sleeveService';
import { CahBlackCard, CahCard } from '../../src/types/cah';

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const MIN_HAND = 5;
const MAX_HAND = 10;

function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
  hint,
}: {
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  hint?: string;
}) {
  return (
    <View style={styles.stepperRow}>
      <View style={styles.stepperLeft}>
        <Text style={styles.stepperLabel}>{label}</Text>
        {hint ? <Text style={styles.stepperHint}>{hint}</Text> : null}
      </View>
      <View style={styles.stepperControls}>
        <Pressable style={styles.stepperBtn} onPress={onDecrement} hitSlop={8}>
          <Text style={styles.stepperBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable style={styles.stepperBtn} onPress={onIncrement} hitSlop={8}>
          <Text style={styles.stepperBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function CahSetupScreen() {
  const [playerCount, setPlayerCount] = useState(4);
  const [handSize, setHandSize] = useState(7);
  const [busy, setBusy] = useState(false);

  const sleeveCount = totalCahSleeveCount(playerCount, handSize);

  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const state = createCahGame(
        playerCount,
        handSize,
        cahPack.black as CahBlackCard[],
        cahPack.white as CahCard[],
      );
      await saveCahGame(state);

      // Send all sleeves face-down initially
      for (let sid = 1; sid <= sleeveCount; sid++) {
        await sendToSleeve(sid, faceDownDescriptor()).catch(() => {});
      }

      router.replace('/cah/game');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Cards Against Humanity</Text>
        <Text style={styles.packNote}>Pack: Original Starter Pack v1</Text>
      </View>

      <View style={styles.card}>
        <Stepper
          label="Players"
          value={playerCount}
          onDecrement={() => setPlayerCount(v => Math.max(MIN_PLAYERS, v - 1))}
          onIncrement={() => setPlayerCount(v => Math.min(MAX_PLAYERS, v + 1))}
          hint={`Min ${MIN_PLAYERS}, max ${MAX_PLAYERS}`}
        />
        <View style={styles.divider} />
        <Stepper
          label="Hand size"
          value={handSize}
          onDecrement={() => setHandSize(v => Math.max(MIN_HAND, v - 1))}
          onIncrement={() => setHandSize(v => Math.min(MAX_HAND, v + 1))}
          hint={`${MIN_HAND}–${MAX_HAND} cards per player`}
        />
      </View>

      <View style={styles.sleeveHint}>
        <Text style={styles.sleeveHintText}>
          {sleeveCount} sleeves required  (1 prompt + {playerCount} × {handSize})
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.startBtn, (pressed || busy) && styles.startBtnPressed]}
        onPress={handleStart}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#060c14" />
        ) : (
          <Text style={styles.startBtnLabel}>Start Game  →</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060c14' },
  content: { padding: 20, gap: 16, paddingBottom: 40 },

  header: { alignItems: 'center', paddingVertical: 16 },
  title: { color: '#22d3ee', fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  packNote: { color: '#3a6070', fontSize: 12, marginTop: 6 },

  card: {
    backgroundColor: '#071a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0e7490',
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: '#0a2c3d' },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  stepperLeft: { gap: 3 },
  stepperLabel: { color: '#e0f7ff', fontSize: 15, fontWeight: '600' },
  stepperHint: { color: '#3a6070', fontSize: 11 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0a2c3d',
    borderWidth: 1,
    borderColor: '#0e7490',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { color: '#22d3ee', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  stepperValue: { color: '#e0f7ff', fontSize: 20, fontWeight: '700', minWidth: 32, textAlign: 'center' },

  sleeveHint: { alignItems: 'center' },
  sleeveHintText: { color: '#3a6070', fontSize: 12 },

  startBtn: {
    height: 56,
    borderRadius: 10,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  startBtnPressed: { opacity: 0.7 },
  startBtnLabel: { color: '#060c14', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
});
