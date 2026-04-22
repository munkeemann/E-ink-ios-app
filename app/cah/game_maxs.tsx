import { useCallback, useRef, useState } from 'react';
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
  pickWinner,
} from '../../src/cah/CahMaxsGame';
import { loadMaxsGame, saveMaxsGame, clearMaxsGame } from '../../src/storage/cahMaxsStorage';
import { sendToSleeve, clearMemo } from '../../src/api/sleeveService';
import { getRegisteredSleeves } from '../../src/api/piServer';
import { CahMaxsGameState, CahMaxsSleeveUpdate } from '../../src/types/cah_maxs';
import CardRenderer, { CardRendererRef } from '../../src/shared/CardRenderer';

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
        <ActivityIndicator color="#22d3ee" size="large" />
      </View>
    );
  }

  const handleDeal = async () => {
    if (busy) return;
    if (state.phase === 'dealt') return;
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

  const handleWinnerPick = async (winnerIdx: number) => {
    if (busy) return;
    if (state.phase !== 'dealt') return;
    setBusy(true);
    console.log(`[CAH-MAXS] handleWinnerPick P${winnerIdx + 1}`);
    try {
      const newState = pickWinner(state, winnerIdx);
      setState(newState);
      await saveMaxsGame(newState);
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

  const { phase, playerCount, K, czarIndex, round, scores, currentPrompt, roundWinner } = state;
  const phaseLabel = phase.replace('_', ' ').toUpperCase();
  const sleeveCount = 1 + playerCount * K;

  const canDeal = phase === 'pre_deal' || phase === 'judging';
  const dealLabel = phase === 'pre_deal' ? 'Deal Round 1' : `Next Round (${round + 1})`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Off-screen card renderer for JPEG capture */}
      <CardRenderer ref={rendererRef} />

      {/* Scoreboard */}
      <Text style={styles.sectionHeader}>Scoreboard</Text>
      <View style={styles.scoreCard}>
        {Array.from({ length: playerCount }, (_, p) => {
          const isJudge = p === czarIndex && phase !== 'pre_deal';
          const isWinner = roundWinner === p && phase === 'judging';
          return (
            <View
              key={p}
              style={[
                styles.scoreRow,
                p < playerCount - 1 && styles.rowBorder,
                isJudge && styles.scoreRowJudge,
                isWinner && styles.scoreRowWinner,
              ]}
            >
              <View style={styles.scoreRowLeft}>
                <Text style={[styles.playerLabel, isJudge && styles.playerLabelJudge, isWinner && styles.playerLabelWinner]}>
                  Player {p + 1}
                </Text>
                {isJudge && <Text style={styles.judgeTag}>JUDGE</Text>}
                {isWinner && <Text style={styles.winnerTag}>+1</Text>}
              </View>
              <Text style={styles.scoreValue}>{scores[p]}</Text>
            </View>
          );
        })}
      </View>

      {/* Phase header */}
      <View style={styles.phaseRow}>
        <View style={styles.phaseBadge}>
          <Text style={styles.phaseText}>{phaseLabel}</Text>
        </View>
        <Text style={styles.sleeveInfo}>Round {round} · {sleeveCount} sleeves</Text>
      </View>

      {/* Black card prompt */}
      {currentPrompt && (
        <View style={styles.blackCard}>
          <Text style={styles.blackCardText}>{currentPrompt.text}</Text>
          {currentPrompt.pick > 1 && (
            <Text style={styles.pickBadge}>PICK {currentPrompt.pick}</Text>
          )}
        </View>
      )}

      {/* Deal / Next Round button */}
      {canDeal && (
        <Pressable
          style={({ pressed }) => [styles.advanceBtn, (pressed || busy) && styles.advanceBtnPressed]}
          onPress={handleDeal}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#060c14" />
          ) : (
            <Text style={styles.advanceBtnLabel}>{dealLabel}  →</Text>
          )}
        </Pressable>
      )}

      {/* Judging: winner-pick buttons */}
      {phase === 'dealt' && (
        <>
          <Text style={styles.sectionHeader}>Award point to</Text>
          <View style={styles.pickGrid}>
            {Array.from({ length: playerCount }, (_, p) => (
              <Pressable
                key={p}
                style={({ pressed }) => [
                  styles.pickBtn,
                  p === czarIndex && styles.pickBtnJudge,
                  pressed && styles.pickBtnPressed,
                ]}
                onPress={() => handleWinnerPick(p)}
                disabled={busy}
              >
                <Text style={[styles.pickBtnText, p === czarIndex && styles.pickBtnTextJudge]}>
                  Player {p + 1}
                  {p === czarIndex && ' (judge)'}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* End game */}
      <Pressable style={styles.endBtn} onPress={handleEnd}>
        <Text style={styles.endBtnLabel}>End Game</Text>
      </Pressable>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060c14' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  loading: { flex: 1, backgroundColor: '#060c14', alignItems: 'center', justifyContent: 'center' },

  sectionHeader: {
    color: '#64b5c8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 4,
  },

  scoreCard: {
    backgroundColor: '#071a2a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0e7490',
    overflow: 'hidden',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  scoreRowJudge: { backgroundColor: '#0a2332' },
  scoreRowWinner: { backgroundColor: '#072010' },
  scoreRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#0a2c3d' },

  playerLabel: { color: '#e0f7ff', fontSize: 14, fontWeight: '600' },
  playerLabelJudge: { color: '#22d3ee' },
  playerLabelWinner: { color: '#4ade80' },
  judgeTag: {
    color: '#22d3ee',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#071e30',
    borderWidth: 1,
    borderColor: '#22d3ee',
  },
  winnerTag: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '800',
  },
  scoreValue: { color: '#e0f7ff', fontSize: 20, fontWeight: '700', minWidth: 32, textAlign: 'right' },

  phaseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phaseBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#071a2a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0e7490',
  },
  phaseText: { color: '#22d3ee', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  sleeveInfo: { color: '#3a6070', fontSize: 12 },

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
  pickBadge: { color: '#888', fontSize: 11, marginTop: 8, fontWeight: '700', letterSpacing: 1 },

  advanceBtn: {
    height: 56,
    borderRadius: 10,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  advanceBtnPressed: { opacity: 0.7 },
  advanceBtnLabel: { color: '#060c14', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },

  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0e7490',
    backgroundColor: '#071a2a',
    alignItems: 'center',
  },
  pickBtnJudge: { borderColor: '#22d3ee', backgroundColor: '#071e30' },
  pickBtnPressed: { backgroundColor: '#0c2340', borderColor: '#22d3ee' },
  pickBtnText: { color: '#e0f7ff', fontSize: 14, fontWeight: '600' },
  pickBtnTextJudge: { color: '#22d3ee' },

  endBtn: {
    marginTop: 8,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a1520',
    backgroundColor: '#0f0a0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endBtnLabel: { color: '#7d5260', fontSize: 14, fontWeight: '600' },
});
