import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { DND_CLASSES, DndClass, DndDeck } from '../../src/types/dnd';
import {
  PREPARED_CASTERS,
  cantripsKnown,
  spellsKnownOrPrepared,
  maxSpellLevel,
} from '../../src/dnd/casterTables';
import { saveDeck } from '../../src/storage/dndStorage';
import spellMeta from '../../src/assets/dnd/spells.json';
import spellImages from '../../src/assets/dnd/spells/index';
import { colors } from '../../src/theme/colors';

interface SpellMeta {
  level: number;
  school: string;
  classes: string[];
  png_filename: string | null;
}
const SPELL_META = spellMeta as Record<string, SpellMeta>;

const MIN_LEVEL = 1;
const MAX_LEVEL = 20;
const MIN_MOD = 0;
const MAX_MOD = 5;

export default function DndNewWizardScreen() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [className, setClassName] = useState<DndClass | null>(null);
  const [level, setLevel] = useState<number>(1);
  const [abilityMod, setAbilityMod] = useState<number>(3);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState<boolean>(false);
  const [deckName, setDeckName] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const isPrepared = className !== null && PREPARED_CASTERS.has(className);
  // Step 3 is skipped for non-prepared casters — steps are numbered 1/2/3/4/5 but
  // Step 3 is skipped in sequence when the class doesn't use abilityMod.
  const totalSteps = isPrepared ? 5 : 4;
  const stepNumber = !isPrepared && step > 3 ? step - 1 : step;

  const advance = () => {
    if (step === 1) { setStep(2); return; }
    if (step === 2) { setStep(isPrepared ? 3 : 4); return; }
    if (step === 3) { setStep(4); return; }
    if (step === 4) { setStep(5); return; }
  };

  const back = () => {
    if (step === 2) { setStep(1); return; }
    if (step === 3) { setStep(2); return; }
    if (step === 4) { setStep(isPrepared ? 3 : 2); return; }
    if (step === 5) { setStep(4); return; }
  };

  const handleSave = async () => {
    if (saving) return;
    if (!className) return;
    const name = deckName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const id = Date.now().toString();
      const deck: DndDeck = {
        id,
        name,
        className,
        level,
        ...(isPrepared ? { abilityMod } : {}),
        spells: [...selected],
        createdAt: Date.now(),
      };
      await saveDeck(deck);
      router.replace('/dnd' as any);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.stepBadge}>Step {stepNumber} / {totalSteps}</Text>
      <Text style={styles.title}>New D&amp;D Deck</Text>

      {step === 1 && (
        <Step1Class
          value={className}
          onSelect={c => { setClassName(c); advance(); }}
        />
      )}

      {step === 2 && (
        <Step2Level
          value={level}
          onChange={setLevel}
          className={className!}
        />
      )}

      {step === 3 && isPrepared && (
        <Step3AbilityMod
          value={abilityMod}
          onChange={setAbilityMod}
          className={className!}
        />
      )}

      {step === 4 && className && (
        <Step4SpellBrowser
          className={className}
          level={level}
          abilityMod={abilityMod}
          isPrepared={isPrepared}
          selected={selected}
          onToggle={name => {
            const next = new Set(selected);
            if (next.has(name)) next.delete(name); else next.add(name);
            setSelected(next);
          }}
          showAll={showAll}
          onToggleShowAll={() => setShowAll(v => !v)}
        />
      )}

      {step === 5 && (
        <Step5NameAndSave
          value={deckName}
          onChange={setDeckName}
          selectedCount={selected.size}
        />
      )}

      <View style={styles.navRow}>
        {step > 1 && (
          <Pressable style={styles.backBtn} onPress={back} disabled={saving}>
            <Text style={styles.backBtnLabel}>← Back</Text>
          </Pressable>
        )}
        {step > 1 && step < 5 && (
          <Pressable
            style={[styles.nextBtn, !canAdvance(step, className, deckName) && styles.nextBtnDisabled]}
            onPress={advance}
            disabled={!canAdvance(step, className, deckName)}
          >
            <Text style={styles.nextBtnLabel}>Next →</Text>
          </Pressable>
        )}
        {step === 5 && (
          <Pressable
            style={[styles.saveBtn, (saving || !deckName.trim()) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || !deckName.trim()}
          >
            {saving ? (
              <ActivityIndicator color={colors.bg.app} />
            ) : (
              <Text style={styles.saveBtnLabel}>Save Deck</Text>
            )}
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

function canAdvance(step: number, className: DndClass | null, _deckName: string): boolean {
  if (step === 1) return className !== null;
  // Steps 2, 3, 4 always allow advance (any level/mod/selection is valid).
  return true;
}

// ── Step 1: class chip row ────────────────────────────────────────────────

function Step1Class({ value, onSelect }: { value: DndClass | null; onSelect: (c: DndClass) => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Class</Text>
      <View style={styles.chipRow}>
        {DND_CLASSES.map(c => (
          <Pressable
            key={c}
            style={[styles.chip, value === c && styles.chipActive]}
            onPress={() => onSelect(c)}
          >
            <Text style={[styles.chipText, value === c && styles.chipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ── Step 2: level stepper ─────────────────────────────────────────────────

function Step2Level({ value, onChange, className }: { value: number; onChange: (v: number) => void; className: DndClass }) {
  const maxSlot = maxSpellLevel(className, value);
  const cantrips = cantripsKnown(className, value);
  const spells = spellsKnownOrPrepared(className, value, 0);
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Character level</Text>
      <View style={styles.stepper}>
        <Pressable
          style={[styles.stepBtn, value <= MIN_LEVEL && styles.stepBtnDisabled]}
          onPress={() => onChange(Math.max(MIN_LEVEL, value - 1))}
          disabled={value <= MIN_LEVEL}
        >
          <Text style={styles.stepLabel}>−</Text>
        </Pressable>
        <Text style={styles.countBig}>{value}</Text>
        <Pressable
          style={[styles.stepBtn, value >= MAX_LEVEL && styles.stepBtnDisabled]}
          onPress={() => onChange(Math.min(MAX_LEVEL, value + 1))}
          disabled={value >= MAX_LEVEL}
        >
          <Text style={styles.stepLabel}>+</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        {className} · Max spell slot: {maxSlot === 0 ? 'none' : `level ${maxSlot}`}
        {cantrips > 0 && `  ·  ${cantrips} cantrip${cantrips === 1 ? '' : 's'}`}
        {spells.count > 0 && `  ·  ${spells.count} ${spells.label}`}
      </Text>
    </View>
  );
}

// ── Step 3: ability modifier stepper (prepared casters only) ─────────────

function Step3AbilityMod({ value, onChange, className }: { value: number; onChange: (v: number) => void; className: DndClass }) {
  const abilityName =
    className === 'Wizard' ? 'Intelligence' :
    className === 'Cleric' || className === 'Druid' ? 'Wisdom' :
    'Charisma';
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{abilityName} modifier</Text>
      <View style={styles.stepper}>
        <Pressable
          style={[styles.stepBtn, value <= MIN_MOD && styles.stepBtnDisabled]}
          onPress={() => onChange(Math.max(MIN_MOD, value - 1))}
          disabled={value <= MIN_MOD}
        >
          <Text style={styles.stepLabel}>−</Text>
        </Pressable>
        <Text style={styles.countBig}>+{value}</Text>
        <Pressable
          style={[styles.stepBtn, value >= MAX_MOD && styles.stepBtnDisabled]}
          onPress={() => onChange(Math.min(MAX_MOD, value + 1))}
          disabled={value >= MAX_MOD}
        >
          <Text style={styles.stepLabel}>+</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        Prepared casters' spell count = character level + {abilityName.slice(0, 3)} mod
      </Text>
    </View>
  );
}

// ── Step 4: spell browser ──────────────────────────────────────────────────

interface Step4Props {
  className: DndClass;
  level: number;
  abilityMod: number;
  isPrepared: boolean;
  selected: Set<string>;
  onToggle: (name: string) => void;
  showAll: boolean;
  onToggleShowAll: () => void;
}

function Step4SpellBrowser({
  className, level, abilityMod, isPrepared, selected, onToggle, showAll, onToggleShowAll,
}: Step4Props) {
  const cantripTarget = cantripsKnown(className, level);
  const spellsMeta = spellsKnownOrPrepared(className, level, isPrepared ? abilityMod : 0);
  const maxLvl = maxSpellLevel(className, level);

  const { cantripSelected, spellSelected } = useMemo(() => {
    let c = 0, s = 0;
    selected.forEach(name => {
      const m = SPELL_META[name];
      if (!m) return;
      if (m.level === 0) c++; else s++;
    });
    return { cantripSelected: c, spellSelected: s };
  }, [selected]);

  const grouped = useMemo(() => {
    const byLevel = new Map<number, string[]>();
    Object.entries(SPELL_META).forEach(([name, info]) => {
      if (!showAll) {
        if (!info.classes.includes(className)) return;
        if (info.level > maxLvl) return;
      }
      if (!byLevel.has(info.level)) byLevel.set(info.level, []);
      byLevel.get(info.level)!.push(name);
    });
    byLevel.forEach(arr => arr.sort((a, b) => a.localeCompare(b)));
    return byLevel;
  }, [className, maxLvl, showAll]);

  const levels = [...grouped.keys()].sort((a, b) => a - b);
  const empty = levels.length === 0 || levels.every(lv => (grouped.get(lv) ?? []).length === 0);

  const cantripOver = cantripSelected > cantripTarget;
  const spellOver = spellSelected > spellsMeta.count;
  const showCantripCounter = cantripTarget > 0 || cantripSelected > 0;
  const showSpellCounter = spellsMeta.count > 0 || spellSelected > 0;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Choose spells</Text>

      {/* Counters */}
      <View style={styles.counterRow}>
        {showCantripCounter && (
          <Text style={[styles.counterText, cantripOver && styles.counterTextOver]}>
            {cantripSelected} / {cantripTarget} cantrips
          </Text>
        )}
        {showSpellCounter && (
          <Text style={[styles.counterText, spellOver && styles.counterTextOver]}>
            {spellSelected} / {spellsMeta.count} {spellsMeta.label}
          </Text>
        )}
      </View>

      {/* Filter toggle */}
      <Pressable style={styles.toggleRow} onPress={onToggleShowAll}>
        <Text style={styles.toggleText}>
          {showAll ? '✓ Showing all spells' : `Filter: ${className} · up to level ${maxLvl}`}
        </Text>
        <Text style={styles.toggleSwitch}>{showAll ? 'ALL' : 'STRICT'}</Text>
      </Pressable>

      {empty && (
        <Text style={styles.emptyMsg}>
          {className} has no spells available at level {level}.
          Tap Next to continue with an empty deck.
        </Text>
      )}

      {levels.map(lv => {
        const list = grouped.get(lv) ?? [];
        if (list.length === 0) return null;
        return (
          <View key={lv} style={styles.levelSection}>
            <Text style={styles.levelHeader}>
              {lv === 0 ? 'Cantrips' : `Level ${lv}`}
            </Text>
            {list.map(name => {
              const info = SPELL_META[name];
              const hasArt = (spellImages as Record<string, unknown>)[name] !== undefined
                && info.png_filename !== null;
              const isSel = selected.has(name);
              return (
                <Pressable
                  key={name}
                  style={({ pressed }) => [
                    styles.spellRow,
                    isSel && styles.spellRowSelected,
                    pressed && styles.spellRowPressed,
                  ]}
                  onPress={() => onToggle(name)}
                >
                  <View style={styles.spellRowBody}>
                    <Text style={[styles.spellName, isSel && styles.spellNameSelected]} numberOfLines={1}>
                      {isSel ? '✓  ' : ''}{name}
                    </Text>
                    <Text style={styles.spellMeta} numberOfLines={1}>
                      {info.school}
                      {!hasArt && '  ·  '}
                      {!hasArt && <Text style={styles.noArtBadge}>no art</Text>}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// ── Step 5: name + save ───────────────────────────────────────────────────

function Step5NameAndSave({ value, onChange, selectedCount }: { value: string; onChange: (v: string) => void; selectedCount: number }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Deck name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Kelenna's Wizard 8"
        placeholderTextColor={colors.text.muted}
        value={value}
        onChangeText={onChange}
        autoFocus
      />
      <Text style={styles.hint}>
        {selectedCount} spell{selectedCount === 1 ? '' : 's'} selected
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg.app },
  container: { padding: 20, gap: 16, paddingBottom: 40 },

  stepBadge: {
    color: colors.accent.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    alignSelf: 'center',
  },
  title: {
    color: colors.accent.primary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },

  card: {
    backgroundColor: colors.bg.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent.dark,
    padding: 16,
    gap: 14,
  },
  label: { color: colors.text.secondary, fontSize: 13, letterSpacing: 0.6, fontWeight: '700' },
  hint: { color: colors.text.muted, fontSize: 12, lineHeight: 16 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.bg.app,
  },
  chipActive: { borderColor: colors.accent.primary, backgroundColor: colors.bg.surface },
  chipText: { color: colors.text.muted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.accent.primary },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
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
  countBig: { color: colors.accent.primary, fontSize: 40, fontWeight: '800', minWidth: 72, textAlign: 'center' },

  counterRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  counterText: { color: colors.accent.primary, fontSize: 13, fontWeight: '700' },
  counterTextOver: { color: colors.status.warning },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.bg.app,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  toggleText: { color: colors.text.secondary, fontSize: 12 },
  toggleSwitch: { color: colors.accent.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  emptyMsg: { color: colors.text.muted, fontSize: 13, textAlign: 'center', padding: 16 },

  levelSection: { gap: 6 },
  levelHeader: {
    color: colors.accent.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
  },
  spellRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.bg.app,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
  },
  spellRowSelected: { borderColor: colors.accent.primary, backgroundColor: colors.bg.surface },
  spellRowPressed: { backgroundColor: colors.bg.elevated },
  spellRowBody: { gap: 2 },
  spellName: { color: colors.text.primary, fontSize: 14, fontWeight: '600' },
  spellNameSelected: { color: colors.accent.primary },
  spellMeta: { color: colors.text.muted, fontSize: 11 },
  noArtBadge: { color: colors.text.muted, fontSize: 11, fontWeight: '700' },

  input: {
    borderWidth: 1,
    borderColor: colors.accent.dark,
    backgroundColor: colors.bg.app,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    fontSize: 15,
  },

  navRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.bg.app,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnLabel: { color: colors.text.secondary, fontSize: 15, fontWeight: '700' },
  nextBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnLabel: { color: colors.bg.app, fontSize: 15, fontWeight: '800' },
  saveBtn: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnLabel: { color: colors.bg.app, fontSize: 16, fontWeight: '800', letterSpacing: 0.8 },
});
