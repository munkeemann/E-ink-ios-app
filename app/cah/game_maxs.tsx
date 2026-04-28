import { useCallback, useRef, useState, useMemo} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  advanceMaxs,
  maxsSleeveUpdates,
} from '../../src/cah/CahMaxsGame';
import { loadMaxsGame, saveMaxsGame, clearMaxsGame } from '../../src/storage/cahMaxsStorage';
import { sendToSleeve, clearMemo } from '../../src/api/sleeveService';
import { getRegisteredSleeves } from '../../src/api/piServer';
import { CahMaxsGameState, CahMaxsSleeveUpdate } from '../../src/types/cah_maxs';
import CardRenderer, { CardRendererRef } from '../../src/shared/CardRenderer';
import { Theme, useTheme } from '../../src/theme/colors';

const CAPTURE_TIMEOUT_MS = 3000;

function captureWithTimeout(p: Promise<ArrayBuffer>): Promise<ArrayBuffer> {
  return Promise.race([
    p,
    new Promise<ArrayBuffer>((_, reject) =>
      setTimeout(() => reject(new Error('capture timed out')), CAPTURE_TIMEOUT_MS),
    ),
  ]);
}

async function pushUpdates(
  updates: CahMaxsSleeveUpdate[],
  rendererRef: React.RefObject<CardRendererRef | null>,
  t0: number,
): Promise<void> {
  console.log(`[CAH-MAXS] pushUpdates start — count=${updates.length} (+${Date.now() - t0}ms)`);
  const registered = new Set(await getRegisteredSleeves());
  console.log(`[CAH-MAXS] registered sleeves: [${[...registered].sort((a, b) => a - b).join(', ')}] (+${Date.now() - t0}ms)`);

  for (const u of updates) {
    if (!registered.has(u.sleeveId)) {
      console.log(`[CAH-MAXS] sleeve ${u.sleeveId} not registered — skipping`);
      continue;
    }
    let imageData: ArrayBuffer | undefined;
    if (u.cardText && rendererRef.current) {
      try {
        imageData = await captureWithTimeout(
          rendererRef.current.capture(u.cardText, u.cardScheme ?? 'white'),
        );
      } catch (e) {
        console.warn(`[CAH-MAXS] capture FAILED sleeve=${u.sleeveId} — ${e instanceof Error ? e.message : e}`);
      }
    }
    try {
      await sendToSleeve(u.sleeveId, u.descriptor, imageData);
    } catch (e) {
      console.warn(`[CAH-MAXS] sendToSleeve ERROR sleeve=${u.sleeveId} — ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`[CAH-MAXS] pushUpdates done (+${Date.now() - t0}ms)`);
}

export default function CahMaxsGameScreen() {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [state, setState] = useState<CahMaxsGameState | null>(null);
  const [busy, setBusy] = useState(false);
  const rendererRef = useRef<CardRendererRef>(null);

  useFocusEffect(
    useCallback(() => {
      loadMaxsGame().then(s => {
        if (!s) { router.replace('/cah/setup'); return; }
        setState(s);
      });
    }, []),
  );

  if (!state) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent.primary} size="large" />
      </View>
    );
  }

  const handleDeal = async () => {
    if (busy) return;
    setBusy(true);
    const t0 = Date.now();
    console.log(`[CAH-MAXS] handleDeal start — fromPhase=${state.phase}  round=${state.round}`);
    try {
      clearMemo();
      const newState = advanceMaxs(state);
      setState(newState);
      await saveMaxsGame(newState);
      const updates = maxsSleeveUpdates(newState);
      await pushUpdates(updates, rendererRef, t0);
      console.log(`[CAH-MAXS] handleDeal complete (+${Date.now() - t0}ms)`);
    } catch (e) {
      console.error(`[CAH-MAXS] handleDeal ERROR — ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = () => {
    Alert.alert('End Game', 'End this session and return to game select?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Game',
        style: 'destructive',
        onPress: async () => {
          await clearMaxsGame();
          router.back();
        },
      },
    ]);
  };

  const { phase, playerCount, K, round, currentPrompt } = state;
  const phaseLabel = phase.replace('_', ' ').toUpperCase();
  const sleeveCount = 1 + playerCount * K;
  const dealLabel = phase === 'pre_deal' ? 'Deal Round 1' : `Next Round (${round + 1})`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Off-screen card renderer for JPEG capture */}
      <CardRenderer ref={rendererRef} />

      {/* Phase header */}
      <View style={styles.phaseRow}>
        <View style={styles.phaseBadge}>
          <Text style={styles.phaseText}>{phaseLabel}</Text>
        </View>
        <Text style={styles.sleeveInfo}>
          Round {round} · {playerCount}p × {K}  ·  {sleeveCount} sleeves
        </Text>
      </View>

      {/* Black card prompt — echo of what's on sleeve 1 */}
      {currentPrompt && (
        <View style={styles.blackCard}>
          <Text style={styles.blackCardText}>{currentPrompt.text}</Text>
          {currentPrompt.pick > 1 && (
            <Text style={styles.pickBadge}>PICK {currentPrompt.pick}</Text>
          )}
        </View>
      )}

      {/* Deal / Next Round button */}
      <Pressable
        style={({ pressed }) => [styles.advanceBtn, (pressed || busy) && styles.advanceBtnPressed]}
        onPress={handleDeal}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.bg.app} />
        ) : (
          <Text style={styles.advanceBtnLabel}>{dealLabel}  →</Text>
        )}
      </Pressable>

      {/* End game */}
      <Pressable style={styles.endBtn} onPress={handleEnd}>
        <Text style={styles.endBtnLabel}>End Game</Text>
      </Pressable>

    </ScrollView>
  );
}

function makeStyles(colors: Theme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.app },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  loading: { flex: 1, backgroundColor: colors.bg.app, alignItems: 'center', justifyContent: 'center' },

  phaseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phaseBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: colors.bg.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent.dark,
  },
  phaseText: { color: colors.accent.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  sleeveInfo: { color: colors.text.muted, fontSize: 12 },

  // CAH-specific: see app/cah/game.tsx for rationale on the black-card colors.
  blackCard: {
    backgroundColor: '#050505',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 16,
    minHeight: 80,
    justifyContent: 'center',
  },
  blackCardText: { color: '#ffffff', fontSize: 16, fontWeight: '600', lineHeight: 22 },
  pickBadge: { color: colors.text.muted, fontSize: 11, marginTop: 8, fontWeight: '700', letterSpacing: 1 },

  advanceBtn: {
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  advanceBtnPressed: { opacity: 0.7 },
  advanceBtnLabel: { color: colors.bg.app, fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },

  endBtn: {
    marginTop: 8,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.bg.app,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endBtnLabel: { color: colors.text.muted, fontSize: 14, fontWeight: '600' },
}); }
