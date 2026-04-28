import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { loadDecks } from '../src/storage/deckStorage';
import { loadHoldemGame } from '../src/storage/holdemStorage';
import { loadCahGame } from '../src/storage/cahStorage';
import { loadMaxsGame } from '../src/storage/cahMaxsStorage';
import { Deck } from '../src/types';
import { HoldemGameState } from '../src/types/holdem';
import { CahGameState } from '../src/types/cah';
import { CahMaxsGameState } from '../src/types/cah_maxs';
import { clearMemo } from '../src/api/sleeveService';
import AmbientLayer from '../src/components/AmbientLayer';
import { Theme, useTheme } from '../src/theme/colors';

type GameDef = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  available: boolean;
  route: string;
};

const GAMES: GameDef[] = [
  {
    id: 'mtg',
    title: 'Magic: The Gathering',
    subtitle: 'Deck manager & sleeve tracker',
    icon: '⚔️',
    available: true,
    route: '/mtg',
  },
  {
    id: 'poker',
    title: "Texas Hold'em",
    subtitle: 'Pick players, deal, advance phases',
    icon: '♠️',
    available: true,
    route: '/holdem/setup',
  },
  {
    id: 'cah',
    title: 'Cards Against Humanity',
    subtitle: 'Black card prompt, white card fills',
    icon: '🃏',
    available: true,
    route: '/cah/setup',
  },
  {
    id: 'dnd',
    title: 'D&D Spell Cards',
    subtitle: 'Deck builder & spell browser',
    icon: '🔮',
    available: true,
    route: '/dnd',
  },
];

type ResumeTarget =
  | { kind: 'mtg'; deck: Deck; ts: number }
  | { kind: 'holdem'; game: HoldemGameState; ts: number }
  | { kind: 'cah'; game: CahGameState; ts: number }
  | { kind: 'cah_maxs'; game: CahMaxsGameState; ts: number };

export default function GameSelectScreen() {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [resume, setResume] = useState<ResumeTarget | null>(null);
  const [isFocused, setIsFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        loadDecks().then(decks => {
          const deck = decks
            .filter(d => d.gameInProgress)
            .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))[0] ?? null;
          return deck
            ? ({ kind: 'mtg', deck, ts: deck.lastPlayedAt ?? 0 } as ResumeTarget)
            : null;
        }),
        loadHoldemGame().then(game =>
          game
            ? ({ kind: 'holdem', game, ts: game.startedAt } as ResumeTarget)
            : null,
        ),
        loadCahGame().then(game =>
          game
            ? ({ kind: 'cah', game, ts: game.startedAt } as ResumeTarget)
            : null,
        ),
        loadMaxsGame().then(game =>
          game
            ? ({ kind: 'cah_maxs', game, ts: game.startedAt } as ResumeTarget)
            : null,
        ),
      ]).then(([mtg, holdem, cah, cahMaxs]) => {
        const candidates = [mtg, holdem, cah, cahMaxs].filter((c): c is ResumeTarget => c !== null);
        if (candidates.length === 0) { setResume(null); return; }
        setResume(candidates.reduce((best, c) => (c.ts > best.ts ? c : best)));
      });
    }, []),
  );

  const handleResume = () => {
    if (!resume) return;
    if (resume.kind === 'mtg') router.push(`/game/${resume.deck.id}` as any);
    else if (resume.kind === 'holdem') router.push('/holdem/game');
    else if (resume.kind === 'cah_maxs') router.push('/cah/game_maxs');
    else router.push('/cah/game');
  };

  const resumeName =
    resume?.kind === 'mtg'
      ? resume.deck.name
      : resume?.kind === 'holdem'
        ? `Hold'em — ${resume.game.playerCount} players`
        : resume?.kind === 'cah'
          ? `CAH — ${resume.game.playerCount} players`
          : resume?.kind === 'cah_maxs'
            ? `CAH Max's — ${resume.game.playerCount} players`
            : null;

  const renderGame = ({ item }: { item: GameDef }) => (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        item.available ? styles.tileAvailable : styles.tileUnavailable,
        pressed && item.available && styles.tilePressed,
      ]}
      onPress={() => {
        console.log('[SLV] clearMemo called from game-select onPress');
        clearMemo();
        router.push(item.route as any);
      }}
    >
      <Text style={styles.tileIcon}>{item.icon}</Text>
      <Text style={[styles.tileTitle, !item.available && styles.tileTitleDim]}>
        {item.title}
      </Text>
      <Text style={[styles.tileSubtitle, !item.available && styles.tileSubtitleDim]}>
        {item.subtitle}
      </Text>
      {item.available && (
        <View style={styles.tileArrow}>
          <Text style={styles.tileArrowText}>›</Text>
        </View>
      )}
      {!item.available && (
        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>SOON</Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <AmbientLayer active={isFocused} />
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>The Arcanum</Text>
        <Text style={styles.headerSubtitle}>Choose your game</Text>
      </View>

      {resume && resumeName && (
        <Pressable style={styles.resumeBanner} onPress={handleResume}>
          <View style={styles.resumeLeft}>
            <Text style={styles.resumeLabel}>▶  RESUME</Text>
            <Text style={styles.resumeName} numberOfLines={1}>{resumeName}</Text>
          </View>
          <Text style={styles.resumeArrow}>›</Text>
        </Pressable>
      )}

      <FlatList
        data={GAMES}
        keyExtractor={g => g.id}
        renderItem={renderGame}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
      />
    </View>
  );
}

function makeStyles(colors: Theme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.app },

  header: {
    paddingTop: 64,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.accent.primary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1.5,
    textShadowColor: colors.overlay.accent50,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  headerSubtitle: {
    color: colors.text.secondary,
    fontSize: 14,
    marginTop: 4,
    letterSpacing: 0.8,
  },

  resumeBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.bg.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  resumeLeft: { flex: 1, gap: 3 },
  resumeLabel: { color: colors.accent.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  resumeName: { color: colors.text.primary, fontSize: 15, fontWeight: '700' },
  resumeArrow: { color: colors.accent.primary, fontSize: 28, marginLeft: 8 },

  grid: { paddingHorizontal: 12, paddingBottom: 32 },
  row: { gap: 12, marginBottom: 12 },

  tile: {
    flex: 1,
    minHeight: 155,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  tileAvailable: {
    backgroundColor: colors.bg.surface,
    borderColor: colors.accent.dark,
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  tileUnavailable: {
    backgroundColor: colors.bg.app,
    borderColor: colors.divider,
  },
  tilePressed: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.bg.elevated,
  },

  tileIcon: { fontSize: 28 },
  tileTitle: { color: colors.text.primary, fontSize: 14, fontWeight: '700', lineHeight: 18, marginTop: 10 },
  tileTitleDim: { color: colors.text.muted },
  tileSubtitle: { color: colors.text.secondary, fontSize: 11, marginTop: 4 },
  tileSubtitleDim: { color: colors.text.muted },

  tileArrow: { alignSelf: 'flex-end', marginTop: 8 },
  tileArrowText: { color: colors.accent.primary, fontSize: 24 },

  comingSoonBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: colors.bg.surface,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  comingSoonText: { color: colors.text.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
}); }
