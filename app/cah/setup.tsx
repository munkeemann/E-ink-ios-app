import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { createCahGame } from '../../src/cah/CahGame';
import { totalCahSleeveCount } from '../../src/cah/CahSleeveLayout';
import { saveCahGame } from '../../src/storage/cahStorage';
import { createMaxsGame } from '../../src/cah/CahMaxsGame';
import { totalMaxsSleeveCount } from '../../src/cah/CahMaxsLayout';
import { saveMaxsGame } from '../../src/storage/cahMaxsStorage';
import { faceDownDescriptor, sendToSleeve, clearMemo, prefetchCardBacks } from '../../src/api/sleeveService';
import { getRegisteredSleeves } from '../../src/api/piServer';
import { CahBlackCard, CahCard } from '../../src/types/cah';
import { listPackChips, DEFAULT_ACTIVE_PACK_IDS, PackChip } from '../../src/cah/packGroups';
import { loadActivePacks, saveActivePacks } from '../../src/storage/cahPacksStorage';
import { getPromptsForPacks, getResponsesForPacks } from '../../src/cah/CahContent';

type Ruleset = 'official' | 'maxs';

const MIN_PLAYERS = 3;          // Official
const MAX_PLAYERS = 10;
const MIN_HAND = 5;
const MAX_HAND = 10;

const MAXS_MIN_PLAYERS = 2;
const MAXS_MAX_PLAYERS = 8;
const MAXS_MIN_K = 1;
const MAXS_MAX_K = 10;
const REGISTERED_POLL_MS = 3000;

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

function packBadgeText(chip: PackChip): string | null {
  if (chip.promptCount === 0 && chip.responseCount > 0) return 'responses only';
  if (chip.responseCount === 0 && chip.promptCount > 0) return 'prompts only';
  return null;
}

export default function CahSetupScreen() {
  const [ruleset, setRuleset] = useState<Ruleset>('maxs');
  const [playerCount, setPlayerCount] = useState(4);
  const [handSize, setHandSize] = useState(7);
  const [maxsPlayerCount, setMaxsPlayerCount] = useState(4);
  const [maxsK, setMaxsK] = useState(5);
  const [registeredCount, setRegisteredCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const [activePackIds, setActivePackIds] = useState<string[]>(DEFAULT_ACTIVE_PACK_IDS);
  const [packsLoaded, setPacksLoaded] = useState(false);

  useEffect(() => {
    prefetchCardBacks();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadActivePacks().then(ids => {
      if (cancelled) return;
      if (ids) setActivePackIds(ids);
      setPacksLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!packsLoaded) return;
    saveActivePacks(activePackIds);
  }, [activePackIds, packsLoaded]);

  // Poll registered-sleeve count for the Max's budget indicator.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const ids = await getRegisteredSleeves();
        if (!cancelled) setRegisteredCount(ids.length);
      } catch {
        if (!cancelled) setRegisteredCount(0);
      }
    };
    tick();
    const iv = setInterval(tick, REGISTERED_POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const chips = useMemo(() => listPackChips(), []);
  const activePackSet = useMemo(() => new Set(activePackIds), [activePackIds]);
  const filteredPrompts = useMemo(() => getPromptsForPacks(activePackIds), [activePackIds]);
  const filteredResponses = useMemo(() => getResponsesForPacks(activePackIds), [activePackIds]);

  const isChipActive = (chip: PackChip) =>
    chip.packIds.length > 0 && chip.packIds.every(id => activePackSet.has(id));

  const toggleChip = (chip: PackChip) => {
    const allOn = isChipActive(chip);
    setActivePackIds(prev => {
      const next = new Set(prev);
      if (allOn) {
        for (const id of chip.packIds) next.delete(id);
      } else {
        for (const id of chip.packIds) next.add(id);
      }
      return [...next];
    });
  };

  const officialSleeveCount = totalCahSleeveCount(playerCount, handSize);
  const maxsSleeveCount = totalMaxsSleeveCount(maxsPlayerCount, maxsK);
  const maxsBudgetOK = registeredCount !== null && maxsSleeveCount <= registeredCount;

  const emptySelection = activePackIds.length === 0;
  const officialPoolOK = filteredPrompts.length > 0 && filteredResponses.length > 0;
  const officialBlocked = emptySelection || !officialPoolOK;

  const maxsRequiredResponses = maxsPlayerCount * maxsK;
  const maxsPoolHasPrompt = filteredPrompts.length >= 1;
  const maxsPoolHasResponses = filteredResponses.length >= maxsRequiredResponses;
  const maxsPoolOK = maxsPoolHasPrompt && maxsPoolHasResponses;
  const maxsBlocked = emptySelection || !maxsPoolOK || !maxsBudgetOK;

  const packHint = (() => {
    if (emptySelection) return 'Select at least one pack';
    if (ruleset === 'official') {
      if (filteredPrompts.length === 0) return 'Selected packs have no prompts';
      if (filteredResponses.length === 0) return 'Selected packs have no responses';
    } else {
      if (!maxsPoolHasPrompt) return 'Selected packs have no prompts';
      if (!maxsPoolHasResponses) {
        return `Need ${maxsRequiredResponses} responses, selected packs have ${filteredResponses.length}`;
      }
    }
    return `${filteredPrompts.length} prompts · ${filteredResponses.length} responses`;
  })();

  const handleStartOfficial = async () => {
    const black: CahBlackCard[] = filteredPrompts.map((p, i) => ({
      id: i + 1,
      text: p.text,
      pick: p.pick,
    }));
    const white: CahCard[] = filteredResponses.map((r, i) => ({
      id: i + 1,
      text: r.text,
    }));

    const state = createCahGame(playerCount, handSize, black, white);
    await saveCahGame(state);

    clearMemo();
    const registered = new Set(await getRegisteredSleeves());
    for (let sid = 1; sid <= officialSleeveCount; sid++) {
      if (!registered.has(sid)) {
        console.log(`[CahSetup] sleeve ${sid} not registered — skipping`);
        continue;
      }
      const t0 = Date.now();
      console.log(`[CahSetup] sleeve ${sid}: sendToSleeve START`);
      await sendToSleeve(sid, faceDownDescriptor()).catch(() => {});
      console.log(`[CahSetup] sleeve ${sid}: sendToSleeve DONE +${Date.now() - t0}ms`);
    }

    router.replace('/cah/game');
  };

  const handleStartMaxs = async () => {
    const state = createMaxsGame(maxsPlayerCount, maxsK, filteredPrompts, filteredResponses);
    await saveMaxsGame(state);

    clearMemo();
    const registered = new Set(await getRegisteredSleeves());
    console.log(`[CAH-MAXS] setup handleStart — P=${maxsPlayerCount} K=${maxsK} sleeves=${maxsSleeveCount} registered=${registered.size} packs=${activePackIds.length}`);
    for (let sid = 1; sid <= maxsSleeveCount; sid++) {
      if (!registered.has(sid)) {
        console.log(`[CAH-MAXS] sleeve ${sid} not registered — skipping`);
        continue;
      }
      const t0 = Date.now();
      console.log(`[CAH-MAXS] sleeve ${sid}: sendToSleeve face-down START`);
      await sendToSleeve(sid, faceDownDescriptor()).catch(() => {});
      console.log(`[CAH-MAXS] sleeve ${sid}: sendToSleeve face-down DONE +${Date.now() - t0}ms`);
    }

    router.replace('/cah/game_maxs');
  };

  const startBlocked = ruleset === 'maxs' ? maxsBlocked : officialBlocked;

  const handleStart = async () => {
    if (busy) return;
    if (startBlocked) return;
    setBusy(true);
    try {
      if (ruleset === 'maxs') await handleStartMaxs();
      else await handleStartOfficial();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Cards Against Humanity</Text>
        <Text style={styles.packNote}>
          {ruleset === 'maxs' ? 'Ruleset: Max\'s Rules' : 'Ruleset: Official'}
        </Text>
      </View>

      {/* Ruleset picker */}
      <View style={styles.rulesetRow}>
        {(['maxs', 'official'] as const).map(r => (
          <Pressable
            key={r}
            style={[styles.rulesetChip, ruleset === r && styles.rulesetChipActive]}
            onPress={() => setRuleset(r)}
          >
            <Text style={[styles.rulesetChipText, ruleset === r && styles.rulesetChipTextActive]}>
              {r === 'maxs' ? "Max's Rules" : 'Official'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Pack selector */}
      <View style={styles.packsSection}>
        <Text style={styles.sectionLabel}>Packs</Text>
        <View style={styles.packChipRow}>
          {chips.map(chip => {
            const active = isChipActive(chip);
            const badge = packBadgeText(chip);
            return (
              <Pressable
                key={chip.id}
                style={[styles.packChip, active && styles.packChipActive]}
                onPress={() => toggleChip(chip)}
              >
                <Text style={[styles.packChipText, active && styles.packChipTextActive]}>
                  {chip.label}
                </Text>
                {badge ? (
                  <Text style={[styles.packChipBadge, active && styles.packChipBadgeActive]}>
                    {badge}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.packHint, (emptySelection || (ruleset === 'maxs' ? !maxsPoolOK : !officialPoolOK)) && styles.packHintWarn]}>
          {packHint}
        </Text>
      </View>

      {ruleset === 'official' ? (
        <>
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
              {officialSleeveCount} sleeves required  (1 prompt + {playerCount} × {handSize})
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.card}>
            <Stepper
              label="Players"
              value={maxsPlayerCount}
              onDecrement={() => setMaxsPlayerCount(v => Math.max(MAXS_MIN_PLAYERS, v - 1))}
              onIncrement={() => setMaxsPlayerCount(v => Math.min(MAXS_MAX_PLAYERS, v + 1))}
              hint={`Min ${MAXS_MIN_PLAYERS}, max ${MAXS_MAX_PLAYERS}`}
            />
            <View style={styles.divider} />
            <Stepper
              label="Cards per player (K)"
              value={maxsK}
              onDecrement={() => setMaxsK(v => Math.max(MAXS_MIN_K, v - 1))}
              onIncrement={() => setMaxsK(v => Math.min(MAXS_MAX_K, v + 1))}
              hint={`${MAXS_MIN_K}–${MAXS_MAX_K} cards per player`}
            />
          </View>

          <View style={styles.sleeveHint}>
            <Text style={[styles.sleeveHintText, !maxsBudgetOK && styles.sleeveHintTextAmber]}>
              {registeredCount === null
                ? `${maxsSleeveCount} sleeves needed  (1 prompt + ${maxsPlayerCount} × ${maxsK}) · checking registered…`
                : maxsBudgetOK
                  ? `${maxsSleeveCount} sleeves needed, ${registeredCount} connected`
                  : `Needs ${maxsSleeveCount} sleeves, ${registeredCount} connected`}
            </Text>
          </View>
        </>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.startBtn,
          (pressed || busy) && styles.startBtnPressed,
          startBlocked && styles.startBtnDisabled,
        ]}
        onPress={handleStart}
        disabled={busy || startBlocked}
      >
        {busy ? (
          <ActivityIndicator color="#060c14" />
        ) : (
          <Text style={styles.startBtnLabel}>
            {ruleset === 'maxs' ? "Start Max's Game  →" : 'Start Game  →'}
          </Text>
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
  sleeveHintTextAmber: { color: '#f59e0b' },

  rulesetRow: { flexDirection: 'row', gap: 8 },
  rulesetChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a3a50',
    backgroundColor: '#040d16',
    alignItems: 'center',
  },
  rulesetChipActive: { borderColor: '#22d3ee', backgroundColor: '#071e30' },
  rulesetChipText: { color: '#3a6070', fontSize: 14, fontWeight: '700' },
  rulesetChipTextActive: { color: '#22d3ee' },

  packsSection: { gap: 8 },
  sectionLabel: { color: '#e0f7ff', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  packChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  packChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1a3a50',
    backgroundColor: '#040d16',
    alignItems: 'center',
  },
  packChipActive: { borderColor: '#22d3ee', backgroundColor: '#071e30' },
  packChipText: { color: '#3a6070', fontSize: 13, fontWeight: '600' },
  packChipTextActive: { color: '#22d3ee' },
  packChipBadge: { color: '#3a6070', fontSize: 10, marginTop: 2, fontStyle: 'italic' },
  packChipBadgeActive: { color: '#0e7490' },

  packHint: { color: '#3a6070', fontSize: 12 },
  packHintWarn: { color: '#f59e0b' },

  startBtn: {
    height: 56,
    borderRadius: 10,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  startBtnPressed: { opacity: 0.7 },
  startBtnDisabled: { opacity: 0.4 },
  startBtnLabel: { color: '#060c14', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
});
