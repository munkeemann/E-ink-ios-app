import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { createGame, allSleeveUpdates } from '../../src/holdem/HoldemGame';
import { saveHoldemGame } from '../../src/storage/holdemStorage';
import { sendToSleeve, clearMemo, prefetchCardBacks } from '../../src/api/sleeveService';
import { prefetchSkin } from './game';
import { getRegisteredSleeves } from '../../src/api/piServer';
import { totalSleeveCount } from '../../src/holdem/HoldemSleeveLayout';
import { SKIN_NAMES } from '../../src/assets/skins/registry';
import { colors } from '../../src/theme/colors';

const MIN_PLAYERS = 2;

export default function HoldemSetupScreen() {
  const [playerCount, setPlayerCount] = useState(2);
  const [cardSkin, setCardSkin] = useState('default');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('[Setup] HoldemSetup mount — cardSkin:', cardSkin);
    const tCB = Date.now();
    console.log('[Setup] prefetchCardBacks start');
    prefetchCardBacks()
      .then(() => console.log('[Setup] prefetchCardBacks done in', Date.now() - tCB, 'ms'))
      .catch(e => console.warn('[Setup] prefetchCardBacks ERROR:', e instanceof Error ? e.message : e));
    const tSkin = Date.now();
    console.log('[Setup] prefetchSkin start —', cardSkin);
    prefetchSkin(cardSkin)
      .then(() => console.log('[Setup] prefetchSkin done in', Date.now() - tSkin, 'ms —', cardSkin))
      .catch(e => console.warn('[Setup] prefetchSkin ERROR:', e instanceof Error ? e.message : e));
  }, [cardSkin]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const state = createGame(playerCount, cardSkin);
      await saveHoldemGame(state);

      // Push face-down descriptors to all sleeves to initialise displays
      clearMemo();
      const updates = allSleeveUpdates(state);
      const registered = new Set(await getRegisteredSleeves());
      for (const u of updates) {
        if (!registered.has(u.sleeveId)) {
          console.log(`[HoldemSetup] sleeve ${u.sleeveId} not registered — skipping`);
          continue;
        }
        const t0 = Date.now();
        console.log(`[HoldemSetup] sleeve ${u.sleeveId}: sendToSleeve START`);
        await sendToSleeve(u.sleeveId, u.descriptor).catch(() => {});
        console.log(`[HoldemSetup] sleeve ${u.sleeveId}: sendToSleeve DONE +${Date.now() - t0}ms`);
      }

      router.replace('/holdem/game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
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

      <View style={styles.card}>
        <Text style={styles.label}>Card Skin</Text>
        <View style={styles.skinRow}>
          {SKIN_NAMES.map(skin => (
            <Pressable
              key={skin}
              style={[styles.skinChip, cardSkin === skin && styles.skinChipActive]}
              onPress={() => setCardSkin(skin)}
            >
              <Text style={[
                styles.skinChipText,
                skin === skin.toUpperCase() && styles.skinChipTextUppercase,
                cardSkin === skin && styles.skinChipTextActive,
              ]}>
                {skin}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        style={[styles.startBtn, loading && styles.startBtnDisabled]}
        onPress={handleStart}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.bg.app} />
        ) : (
          <Text style={styles.startLabel}>Start Game</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg.app },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 24,
  },
  title: {
    color: colors.accent.primary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1.5,
    textShadowColor: colors.overlay.accent40,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },

  card: {
    width: '100%',
    backgroundColor: colors.bg.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent.dark,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 16,
  },
  label: { color: colors.text.secondary, fontSize: 14, letterSpacing: 0.6 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.3 },
  stepLabel: { color: colors.text.primary, fontSize: 22, fontWeight: '700', lineHeight: 26 },
  count: { color: colors.accent.primary, fontSize: 40, fontWeight: '800', minWidth: 48, textAlign: 'center' },
  hint: { color: colors.text.muted, fontSize: 12, letterSpacing: 0.4 },

  startBtn: {
    width: '100%',
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnDisabled: { opacity: 0.5 },
  startLabel: { color: colors.bg.app, fontSize: 16, fontWeight: '800', letterSpacing: 0.8 },

  skinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skinChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.bg.app,
  },
  skinChipActive: { borderColor: colors.accent.primary, backgroundColor: colors.bg.surface },
  skinChipText: { color: colors.text.muted, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  skinChipTextUppercase: { textTransform: 'none' },
  skinChipTextActive: { color: colors.accent.primary },
});
