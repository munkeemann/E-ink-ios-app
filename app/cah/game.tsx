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
  advanceCah,
  allSleeveUpdates,
  CAH_PHASE_BUTTON_LABEL,
  CahSleeveUpdate,
  pickWinner,
  submitCard,
  totalCahSleeveCount,
} from '../../src/cah/CahGame';
import { loadCahGame, saveCahGame, clearCahGame } from '../../src/storage/cahStorage';
import { sendToSleeve, clearMemo } from '../../src/api/sleeveService';
import { CahGameState } from '../../src/types/cah';
import CardRenderer, { CardRendererRef } from '../../src/shared/CardRenderer';

async function pushUpdates(
  updates: CahSleeveUpdate[],
  rendererRef: React.RefObject<CardRendererRef | null>,
): Promise<void> {
  for (const u of updates) {
    let imageData: ArrayBuffer | undefined;
    if (u.cardText && rendererRef.current) {
      try {
        imageData = await rendererRef.current.capture(u.cardText, u.cardScheme ?? 'white');
      } catch {
        // send descriptor-only if render fails
      }
    }
    await sendToSleeve(u.sleeveId, u.descriptor, imageData).catch(() => {});
  }
}

export default function CahGameScreen() {
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
        <ActivityIndicator color="#22d3ee" size="large" />
      </View>
    );
  }

  const { phase, playerCount, handSize, czarIndex, scores,
          currentBlackCard, playerHands, submittedPlayers,
          submissionSlots, revealOrder, revealedCount, roundWinner } = state;

  const sleeveCount = totalCahSleeveCount(playerCount, handSize);
  const phaseLabel = phase.replace('_', ' ').toUpperCase();

  const handleAdvance = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (state.phase === 'winner') clearMemo();
      const { newState, sleeveUpdates } = advanceCah(state);
      setState(newState);
      await saveCahGame(newState);
      await pushUpdates(sleeveUpdates, rendererRef);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (playerIdx: number, handSlot: number) => {
    if (busy) return;
    if (phase !== 'submissions') return;
    setBusy(true);
    try {
      const { newState, sleeveUpdates } = submitCard(state, playerIdx, handSlot);
      setState(newState);
      await saveCahGame(newState);
      await pushUpdates(sleeveUpdates, rendererRef);
    } finally {
      setBusy(false);
    }
  };

  const handlePickWinner = async (winnerIdx: number) => {
    if (busy) return;
    if (phase !== 'winner' && phase !== 'reveal') return;
    setBusy(true);
    try {
      // If still in reveal, first transition to winner phase
      let workingState = state;
      if (phase === 'reveal') {
        const advanced = advanceCah({ ...state, phase: 'reveal', revealedCount: revealOrder.length });
        workingState = advanced.newState;
        await pushUpdates(advanced.sleeveUpdates, rendererRef);
      }
      const { newState } = pickWinner(
        { ...workingState, phase: 'winner' },
        winnerIdx,
      );
      setState(newState);
      await saveCahGame(newState);
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
          await clearCahGame();
          router.back();
        },
      },
    ]);
  };

  // Show submit buttons during submissions phase for non-czar players
  const showSubmit = phase === 'submissions';

  // Show winner-pick buttons once all revealed or in winner phase
  const showWinnerPick = phase === 'winner' ||
    (phase === 'reveal' && revealedCount >= revealOrder.length);

  const buttonLabel = (() => {
    if (phase === 'reveal') {
      return revealedCount < revealOrder.length
        ? `Reveal Next (${revealedCount}/${revealOrder.length})`
        : 'Pick Winner';
    }
    return CAH_PHASE_BUTTON_LABEL[phase];
  })();

  // Hide the advance button when in submission phase (use per-card submit instead)
  // and in winner/reveal-complete state (use per-player winner pick instead)
  const hideAdvance = showSubmit || showWinnerPick;

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
            <ActivityIndicator color="#060c14" />
          ) : (
            <Text style={styles.advanceBtnLabel}>{buttonLabel}  →</Text>
          )}
        </Pressable>
      )}

      {/* Players */}
      <Text style={styles.sectionHeader}>Players</Text>
      <View style={styles.tableCard}>
        {Array.from({ length: playerCount }, (_, p) => {
          const isCzar = p === czarIndex;
          const hasSubmitted = submittedPlayers.includes(p);
          const isWinner = roundWinner === p;
          const submittedSlot = submissionSlots[p];
          const revealPos = revealOrder.indexOf(p);
          const isRevealed = revealPos !== -1 && revealPos < revealedCount;

          return (
            <View
              key={p}
              style={[
                styles.playerRow,
                p < playerCount - 1 && styles.rowBorder,
                isWinner && styles.winnerRow,
              ]}
            >
              <View style={styles.playerMeta}>
                <Text style={[styles.playerLabel, isWinner && styles.winnerLabel]}>
                  Player {p + 1}
                  {isCzar ? '  👑' : ''}
                  {isWinner ? '  ★' : ''}
                </Text>
                <Text style={styles.playerScore}>Score: {scores[p]}</Text>
                {hasSubmitted && !isRevealed && (
                  <Text style={styles.submittedTag}>Submitted</Text>
                )}
              </View>

              {/* Hand — card values hidden on shared phone */}
              {!isCzar && (
                <View style={styles.handRow}>
                  {isRevealed ? (
                    <View style={styles.cardChipRevealed}>
                      <Text style={styles.cardChipTextRevealed} numberOfLines={3}>
                        {playerHands[p][submittedSlot]?.text ?? ''}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.handCount}>{playerHands[p].length} cards</Text>
                      {showSubmit && !hasSubmitted && (
                        <Pressable
                          style={({ pressed }) => [
                            styles.submitBtn,
                            pressed && styles.submitBtnPressed,
                          ]}
                          onPress={() => {
                            Alert.alert(
                              `Player ${p + 1} — Submit a card`,
                              undefined,
                              [
                                ...playerHands[p].map((_, k) => ({
                                  text: `Card ${k + 1}`,
                                  onPress: () => handleSubmit(p, k),
                                })),
                                { text: 'Cancel', style: 'cancel' as const },
                              ],
                            );
                          }}
                          disabled={busy}
                        >
                          <Text style={styles.submitBtnText}>Submit card…</Text>
                        </Pressable>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* Winner pick button */}
              {showWinnerPick && !isCzar && (
                <Pressable
                  style={({ pressed }) => [
                    styles.winPickBtn,
                    pressed && styles.winPickBtnPressed,
                    isWinner && styles.winPickBtnWon,
                  ]}
                  onPress={() => handlePickWinner(p)}
                  disabled={busy}
                >
                  <Text style={[styles.winPickBtnText, isWinner && styles.winPickBtnTextWon]}>
                    {isWinner ? '★ Winner' : 'Pick'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {/* Next round button when winner is picked */}
      {phase === 'winner' && roundWinner !== null && (
        <Pressable
          style={({ pressed }) => [styles.advanceBtn, (pressed || busy) && styles.advanceBtnPressed]}
          onPress={handleAdvance}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#060c14" />
          ) : (
            <Text style={styles.advanceBtnLabel}>Next Round  →</Text>
          )}
        </Pressable>
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

  sectionHeader: {
    color: '#64b5c8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 4,
  },

  tableCard: {
    backgroundColor: '#071a2a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0e7490',
    overflow: 'hidden',
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#0a2c3d' },
  winnerRow: { backgroundColor: '#071a20' },

  playerRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  playerMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerLabel: { color: '#64b5c8', fontSize: 13, fontWeight: '700', flex: 1 },
  winnerLabel: { color: '#4ade80' },
  playerScore: { color: '#3a6070', fontSize: 12 },
  submittedTag: {
    color: '#22d3ee',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#071a2a',
    borderWidth: 1,
    borderColor: '#0e7490',
  },

  handRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  handCount: { color: '#3a6070', fontSize: 12, fontWeight: '600' },
  submitBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#0a2c3d',
    borderWidth: 1,
    borderColor: '#0e7490',
  },
  submitBtnPressed: { backgroundColor: '#0c2340', borderColor: '#22d3ee' },
  submitBtnText: { color: '#22d3ee', fontSize: 12, fontWeight: '700' },
  cardChip: {
    minWidth: 44,
    maxWidth: 90,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0a2c3d',
    borderWidth: 1,
    borderColor: '#0e7490',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardChipSubmitted: { borderColor: '#22d3ee', backgroundColor: '#061624' },
  cardChipRevealed: { borderColor: '#4ade80', backgroundColor: '#071a0f', maxWidth: 200 },
  cardChipPressed: { backgroundColor: '#0c2340', borderColor: '#22d3ee' },
  cardChipText: { color: '#3a6070', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  cardChipTextRevealed: { color: '#e0f7ff', fontSize: 11 },

  winPickBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0a2c3d',
    borderWidth: 1,
    borderColor: '#0e7490',
  },
  winPickBtnPressed: { backgroundColor: '#0c2340' },
  winPickBtnWon: { backgroundColor: '#071a0f', borderColor: '#4ade80' },
  winPickBtnText: { color: '#64b5c8', fontSize: 13, fontWeight: '700' },
  winPickBtnTextWon: { color: '#4ade80' },

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
