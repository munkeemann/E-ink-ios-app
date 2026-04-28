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
  advanceCah,
  CAH_PHASE_BUTTON_LABEL,
  CahSleeveUpdate,
  totalCahSleeveCount,
  // CAH_RULES_DISABLED: allSleeveUpdates, submitCard, pickWinner — submission tracking / voting
} from '../../src/cah/CahGame';
import { loadCahGame, saveCahGame, clearCahGame } from '../../src/storage/cahStorage';
import { sendToSleeve, clearMemo } from '../../src/api/sleeveService';
import { getRegisteredSleeves } from '../../src/api/piServer';
import { CahGameState } from '../../src/types/cah';
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
  updates: CahSleeveUpdate[],
  rendererRef: React.RefObject<CardRendererRef | null>,
  t0: number,
): Promise<void> {
  console.log(`[DEAL] step: getRegisteredSleeves (+${Date.now()-t0}ms)`);
  const registered = new Set(await getRegisteredSleeves());
  console.log(`[DEAL] step done: getRegisteredSleeves — [${[...registered].sort((a,b)=>a-b).join(', ')}] (+${Date.now()-t0}ms)`);
  console.log(`[DEAL] pushUpdates count=${updates.length}, registered=${registered.size}`);

  for (const u of updates) {
    if (!registered.has(u.sleeveId)) {
      console.log(`[DEAL] sleeve ${u.sleeveId} not registered — skipping`);
      continue;
    }
    let imageData: ArrayBuffer | undefined;
    if (u.cardText && rendererRef.current) {
      console.log(`[DEAL] step: capture sleeve=${u.sleeveId} text="${u.cardText.slice(0, 30)}" (+${Date.now()-t0}ms)`);
      try {
        imageData = await captureWithTimeout(
          rendererRef.current.capture(u.cardText, u.cardScheme ?? 'white'),
        );
        console.log(`[DEAL] step done: capture sleeve=${u.sleeveId} — ${imageData.byteLength} bytes (+${Date.now()-t0}ms)`);
      } catch (e) {
        console.warn(`[DEAL] step done: capture sleeve=${u.sleeveId} FAILED — ${e instanceof Error ? e.message : e} (+${Date.now()-t0}ms)`);
      }
    }
    const faceBack = !!(u.descriptor as any)._useFaceBack;
    console.log(`[DEAL] step: sendToSleeve sleeve=${u.sleeveId} imageBytes=${imageData?.byteLength ?? 'none'} faceBack=${faceBack} (+${Date.now()-t0}ms)`);
    try {
      await sendToSleeve(u.sleeveId, u.descriptor, imageData);
      console.log(`[DEAL] step done: sendToSleeve sleeve=${u.sleeveId} OK (+${Date.now()-t0}ms)`);
    } catch (e) {
      console.warn(`[DEAL] step done: sendToSleeve sleeve=${u.sleeveId} ERROR — ${e instanceof Error ? e.message : e} (+${Date.now()-t0}ms)`);
    }
  }
}

export default function CahGameScreen() {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [state, setState] = useState<CahGameState | null>(null);
  const [busy, setBusy] = useState(false);
  const rendererRef = useRef<CardRendererRef>(null);

  useFocusEffect(
    useCallback(() => {
      loadCahGame().then(s => {
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

  const { phase, playerCount, handSize, currentBlackCard, playerHands } = state;
  // CAH_RULES_DISABLED: czarIndex, scores, submittedPlayers, submissionSlots,
  //                      revealOrder, revealedCount, roundWinner — players/turns/
  //                      submission tracking/voting/scoreboard/round winners

  const sleeveCount = totalCahSleeveCount(playerCount, handSize);
  const phaseLabel = phase.replace('_', ' ').toUpperCase();

  const handleAdvance = async () => {
    if (busy) return;
    setBusy(true);
    const t0 = Date.now();
    console.log(`[DEAL] start — phase=${state.phase} players=${state.playerCount} handSize=${state.handSize}`);
    try {
      console.log('[SLV] clearMemo called from cah handleAdvance');
      clearMemo();
      const { newState, sleeveUpdates } = advanceCah(state);
      setState(newState);

      console.log(`[DEAL] step: saveCahGame (+${Date.now()-t0}ms)`);
      await saveCahGame(newState);
      console.log(`[DEAL] step done: saveCahGame (+${Date.now()-t0}ms)`);

      console.log(`[DEAL] step: pushUpdates count=${sleeveUpdates.length} (+${Date.now()-t0}ms)`);
      await pushUpdates(sleeveUpdates, rendererRef, t0);
      console.log(`[DEAL] step done: pushUpdates (+${Date.now()-t0}ms)`);

      console.log(`[DEAL] complete (+${Date.now()-t0}ms)`);
    } catch (e) {
      console.error(`[DEAL] ERROR: ${e instanceof Error ? e.message : e} (+${Date.now()-t0}ms)`);
    } finally {
      console.log(`[DEAL] finally — setBusy(false) (+${Date.now()-t0}ms)`);
      setBusy(false);
    }
  };

  // CAH_RULES_DISABLED: submission tracking
  // const handleSubmit = async (playerIdx: number, handSlot: number) => {
  //   if (busy) return;
  //   if (phase !== 'submissions') return;
  //   setBusy(true);
  //   try {
  //     const { newState, sleeveUpdates } = submitCard(state, playerIdx, handSlot);
  //     setState(newState);
  //     await saveCahGame(newState);
  //     await pushUpdates(sleeveUpdates, rendererRef);
  //   } finally {
  //     setBusy(false);
  //   }
  // };

  // CAH_RULES_DISABLED: voting / winner selection
  // const handlePickWinner = async (winnerIdx: number) => {
  //   if (busy) return;
  //   if (phase !== 'winner' && phase !== 'reveal') return;
  //   setBusy(true);
  //   try {
  //     let workingState = state;
  //     if (phase === 'reveal') {
  //       const advanced = advanceCah({ ...state, phase: 'reveal', revealedCount: revealOrder.length });
  //       workingState = advanced.newState;
  //       await pushUpdates(advanced.sleeveUpdates, rendererRef);
  //     }
  //     const { newState } = pickWinner(
  //       { ...workingState, phase: 'winner' },
  //       winnerIdx,
  //     );
  //     setState(newState);
  //     await saveCahGame(newState);
  //   } finally {
  //     setBusy(false);
  //   }
  // };

  const handleEnd = () => {
    Alert.alert('End Game', 'End this session and return to game select?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Game',
        style: 'destructive',
        onPress: async () => {
          await clearCahGame();
          router.back();
        },
      },
    ]);
  };

  // CAH_RULES_DISABLED: submission phase button visibility
  // const showSubmit = phase === 'submissions';

  // CAH_RULES_DISABLED: winner-pick button visibility
  // const showWinnerPick = phase === 'winner' ||
  //   (phase === 'reveal' && revealedCount >= revealOrder.length);

  const buttonLabel = CAH_PHASE_BUTTON_LABEL[phase];

  // CAH_RULES_DISABLED: advance button was hidden during submissions/winner-pick phases
  const hideAdvance = false;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Off-screen card renderer */}
      <CardRenderer ref={rendererRef} />

      {/* Phase header */}
      <View style={styles.phaseRow}>
        <View style={styles.phaseBadge}>
          <Text style={styles.phaseText}>{phaseLabel}</Text>
        </View>
        <Text style={styles.sleeveInfo}>{sleeveCount} sleeves</Text>
      </View>

      {/* Black card prompt */}
      <View style={styles.blackCard}>
        <Text style={styles.blackCardText}>{currentBlackCard.text}</Text>
        {currentBlackCard.pick > 1 && (
          <Text style={styles.pickBadge}>PICK {currentBlackCard.pick}</Text>
        )}
      </View>

      {/* Advance button (hidden during submissions and winner-pick) */}
      {!hideAdvance && (
        <Pressable
          style={({ pressed }) => [styles.advanceBtn, (pressed || busy) && styles.advanceBtnPressed]}
          onPress={handleAdvance}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.bg.app} />
          ) : (
            <Text style={styles.advanceBtnLabel}>{buttonLabel}  →</Text>
          )}
        </Pressable>
      )}

      {/* Players */}
      <Text style={styles.sectionHeader}>Players</Text>
      <View style={styles.tableCard}>
        {Array.from({ length: playerCount }, (_, p) => {
          // CAH_RULES_DISABLED: isCzar, hasSubmitted, isWinner, submittedSlot, revealPos, isRevealed
          // — players/turns, submission tracking, voting, czar rotation, round winners

          return (
            <View
              key={p}
              style={[
                styles.playerRow,
                p < playerCount - 1 && styles.rowBorder,
              ]}
            >
              <View style={styles.playerMeta}>
                <Text style={styles.playerLabel}>
                  Player {p + 1}
                </Text>
                {/* CAH_RULES_DISABLED: score display (scoreboard) */}
                {/* <Text style={styles.playerScore}>Score: {scores[p]}</Text> */}
              </View>

              {/* Hand card count */}
              <View style={styles.handRow}>
                <Text style={styles.handCount}>{playerHands[p]?.length ?? 0} cards</Text>
              </View>

              {/* CAH_RULES_DISABLED: submit card button (submission tracking) */}
              {/* {showSubmit && !hasSubmitted && ( <Pressable ... Submit card… /> )} */}

              {/* CAH_RULES_DISABLED: winner pick button (voting / round winners) */}
              {/* {showWinnerPick && !isCzar && ( <Pressable ... Pick/Winner /> )} */}
            </View>
          );
        })}
      </View>

      {/* CAH_RULES_DISABLED: separate "Next round" button after winner picked (round winners) */}
      {/* {phase === 'winner' && roundWinner !== null && (
        <Pressable ... Next Round → </Pressable>
      )} */}

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

  // CAH-specific: the black-prompt-card visual matches the physical Cards
  // Against Humanity card. Pure-black + neutral-grey border are intentional
  // game-element colors, not theme tokens.
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

  sectionHeader: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 4,
  },

  tableCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent.dark,
    overflow: 'hidden',
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.bg.elevated },
  winnerRow: { backgroundColor: colors.bg.surface },

  playerRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  playerMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerLabel: { color: colors.text.secondary, fontSize: 13, fontWeight: '700', flex: 1 },
  winnerLabel: { color: colors.status.success },
  playerScore: { color: colors.text.muted, fontSize: 12 },
  submittedTag: {
    color: colors.accent.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.accent.dark,
  },

  handRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  handCount: { color: colors.text.muted, fontSize: 12, fontWeight: '600' },
  submitBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.accent.dark,
  },
  submitBtnPressed: { backgroundColor: colors.bg.elevated, borderColor: colors.accent.primary },
  submitBtnText: { color: colors.accent.primary, fontSize: 12, fontWeight: '700' },
  cardChip: {
    minWidth: 44,
    maxWidth: 90,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.accent.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardChipSubmitted: { borderColor: colors.accent.primary, backgroundColor: colors.bg.surface },
  cardChipRevealed: { borderColor: colors.status.success, backgroundColor: colors.bg.surface, maxWidth: 200 },
  cardChipPressed: { backgroundColor: colors.bg.elevated, borderColor: colors.accent.primary },
  cardChipText: { color: colors.text.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  cardChipTextRevealed: { color: colors.text.primary, fontSize: 11 },

  winPickBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.accent.dark,
  },
  winPickBtnPressed: { backgroundColor: colors.bg.elevated },
  winPickBtnWon: { backgroundColor: colors.bg.surface, borderColor: colors.status.success },
  winPickBtnText: { color: colors.text.secondary, fontSize: 13, fontWeight: '700' },
  winPickBtnTextWon: { color: colors.status.success },

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
