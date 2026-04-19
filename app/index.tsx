import { useCallback, useState } from 'react';
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
import { Deck } from '../src/types';
import { HoldemGameState } from '../src/types/holdem';

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
    subtitle: 'Coming soon',
    icon: '🃏',
    available: false,
    route: '/coming-soon?game=Cards+Against+Humanity',
  },
  {
    id: 'dnd',
    title: 'D&D Spell Cards',
    subtitle: 'Coming soon',
    icon: '🔮',
    available: false,
    route: '/coming-soon?game=D%26D+Spell+Cards',
  },
];

type ResumeTarget =
  | { kind: 'mtg'; deck: Deck; ts: number }
  | { kind: 'holdem'; game: HoldemGameState; ts: number };

export default function GameSelectScreen() {
  const [resume, setResume] = useState<ResumeTarget | null>(null);

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
      ]).then(([mtg, holdem]) => {
        const candidates = [mtg, holdem].filter((c): c is ResumeTarget => c !== null);
        if (candidates.length === 0) { setResume(null); return; }
        setResume(candidates.reduce((best, c) => (c.ts > best.ts ? c : best)));
      });
    }, []),
  );

  const handleResume = () => {
    if (!resume) return;
    if (resume.kind === 'mtg') router.push(`/game/${resume.deck.id}` as any);
    else router.push('/holdem/game');
  };

  const resumeName =
    resume?.kind === 'mtg'
      ? resume.deck.name
      : resume?.kind === 'holdem'
        ? `Hold'em — ${resume.game.playerCount} players`
        : null;

  const renderGame = ({ item }: { item: GameDef }) => (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        item.available ? styles.tileAvailable : styles.tileUnavailable,
        pressed && item.available && styles.tilePressed,
      ]}
      onPress={() => router.push(item.route as any)}
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
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Arcane Sleeve Manager</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060c14' },

  header: {
    paddingTop: 64,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#22d3ee',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(34,211,238,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  headerSubtitle: {
    color: '#64b5c8',
    fontSize: 14,
    marginTop: 4,
    letterSpacing: 0.8,
  },

  resumeBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#071e30',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#22d3ee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#22d3ee',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  resumeLeft: { flex: 1, gap: 3 },
  resumeLabel: { color: '#22d3ee', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  resumeName: { color: '#e0f7ff', fontSize: 15, fontWeight: '700' },
  resumeArrow: { color: '#22d3ee', fontSize: 28, marginLeft: 8 },

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
    backgroundColor: '#071a2a',
    borderColor: '#0e7490',
    shadowColor: '#22d3ee',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  tileUnavailable: {
    backgroundColor: '#0a0f16',
    borderColor: '#1a2535',
  },
  tilePressed: {
    borderColor: '#22d3ee',
    backgroundColor: '#0c2340',
  },

  tileIcon: { fontSize: 28 },
  tileTitle: { color: '#e0f7ff', fontSize: 14, fontWeight: '700', lineHeight: 18, marginTop: 10 },
  tileTitleDim: { color: '#3a5060' },
  tileSubtitle: { color: '#64b5c8', fontSize: 11, marginTop: 4 },
  tileSubtitleDim: { color: '#2a3a45' },

  tileArrow: { alignSelf: 'flex-end', marginTop: 8 },
  tileArrowText: { color: '#22d3ee', fontSize: 24 },

  comingSoonBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: '#111820',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1a2535',
  },
  comingSoonText: { color: '#2e4050', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
});
