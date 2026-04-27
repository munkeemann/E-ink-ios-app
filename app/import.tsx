import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { fetchCardByPrinting, fetchCards, fetchTokenImage } from '../src/api/scryfall';
import { saveDeck } from '../src/storage/deckStorage';
import { CardInstance, Deck, TokenTemplate } from '../src/types';

interface DeckEntry {
  name: string;
  count: number;
  setCode?: string;
  collectorNumber?: string;
}

function parseDeckList(text: string): DeckEntry[] {
  return text
    .split(/\r\n|\r|\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .flatMap(line => {
      // Matches "4 Card Name" or "4 Card Name (SET) 123"
      const m = line.match(/^(\d+)\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?)?$/);
      if (!m) return [];
      const [, countStr, name, setCode, collectorNumber] = m;
      const entry: DeckEntry = { count: parseInt(countStr, 10), name: name.trim() };
      if (setCode) entry.setCode = setCode.toUpperCase();
      if (collectorNumber) entry.collectorNumber = collectorNumber;
      return [entry];
    });
}

function parseTokenList(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map(l => l.trim())
    .filter(Boolean);
}

export default function ImportDeckScreen() {
  const [deckName, setDeckName] = useState('');
  const [deckList, setDeckList] = useState('');
  const [tokenList, setTokenList] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [tokenProgress, setTokenProgress] = useState<{ current: number; total: number } | null>(null);

  const handleImport = async () => {
    const trimmedName = deckName.trim();
    if (!trimmedName) {
      Alert.alert('Missing name', 'Enter a deck name.');
      return;
    }
    const entries = parseDeckList(deckList);
    if (entries.length === 0) {
      Alert.alert('Empty list', 'Paste a deck list first.');
      return;
    }

    const [commanderEntry, ...libraryEntries] = entries;

    // Expand each DeckEntry into per-slot entries so we can track printing per card
    const librarySlots: DeckEntry[] = [];
    for (const e of libraryEntries) {
      for (let i = 0; i < e.count; i++) librarySlots.push(e);
    }

    const uniqueNames = [
      ...new Set([commanderEntry.name, ...librarySlots.map(e => e.name)]),
    ];

    // Unique printing-specified entries (deduped by set+collector key)
    const allEntries = [commanderEntry, ...libraryEntries];
    const uniquePrintings = [...new Map(
      allEntries
        .filter(e => e.setCode && e.collectorNumber)
        .map(e => [`${e.setCode}/${e.collectorNumber}`, e]),
    ).values()];

    const totalSteps = uniqueNames.length + uniquePrintings.length;
    setProgress({ current: 0, total: totalSteps });
    setDownloadPercent(null);
    setTokenProgress(null);
    setImporting(true);

    try {
      let stepsDone = 0;
      const { results, errors } = await fetchCards(
        uniqueNames,
        (done) => {
          stepsDone = done;
          setProgress({ current: stepsDone, total: totalSteps });
        },
        (pct) => setDownloadPercent(pct),
      );

      if (errors.length > 0) {
        console.warn('Some cards failed:', errors);
      }

      // Fetch printing-specific cards; fall back silently if 404
      type FetchedCard = (typeof results)[string];
      const printingMap = new Map<string, FetchedCard>();
      for (const e of uniquePrintings) {
        const key = `${e.setCode}/${e.collectorNumber}`;
        const fetched = await fetchCardByPrinting(e.setCode!, e.collectorNumber!);
        stepsDone++;
        setProgress({ current: stepsDone, total: totalSteps });
        if (fetched) {
          printingMap.set(key, fetched);
        } else {
          console.warn(`SAM1-40: ${key} not found, falling back to name lookup for "${e.name}"`);
        }
      }

      const getResult = (e: DeckEntry): FetchedCard => {
        if (e.setCode && e.collectorNumber) {
          const specific = printingMap.get(`${e.setCode}/${e.collectorNumber}`);
          if (specific) return specific;
        }
        return results[e.name] ?? { imagePath: '', backImagePath: '', colorIdentity: [] };
      };

      const cards: CardInstance[] = [];

      for (let i = 0; i < commanderEntry.count; i++) {
        const fetched = getResult(commanderEntry);
        cards.push({
          baseName: commanderEntry.name,
          displayName:
            commanderEntry.count > 1
              ? `${commanderEntry.name} ${i + 1}`
              : commanderEntry.name,
          imagePath: fetched.imagePath,
          backImagePath: fetched.backImagePath,
          isFlipped: false,
          place: 'commander',
          zone: 'CMD',
          sleeveId: null,
          setCode: commanderEntry.setCode ?? fetched.setCode,
          collectorNumber: commanderEntry.collectorNumber ?? fetched.collectorNumber,
          scryfallId: fetched.scryfallId,
          manaValue: fetched.manaValue,
          castCount: 0,
        });
      }

      librarySlots.forEach((entry, idx) => {
        const fetched = getResult(entry);
        cards.push({
          baseName: entry.name,
          displayName: entry.name,
          imagePath: fetched.imagePath,
          backImagePath: fetched.backImagePath,
          isFlipped: false,
          place: String(idx + 1),
          zone: 'LIB',
          sleeveId: null,
          setCode: entry.setCode ?? fetched.setCode,
          collectorNumber: entry.collectorNumber ?? fetched.collectorNumber,
          scryfallId: fetched.scryfallId,
          manaValue: fetched.manaValue,
        });
      });

      const seen: Record<string, number> = {};
      const totalCount: Record<string, number> = {};
      for (const c of cards.filter(c => c.place !== 'commander')) {
        totalCount[c.baseName] = (totalCount[c.baseName] ?? 0) + 1;
      }
      for (const c of cards) {
        if (c.place === 'commander') continue;
        seen[c.baseName] = (seen[c.baseName] ?? 0) + 1;
        if (totalCount[c.baseName] > 1) {
          c.displayName = `${c.baseName} ${seen[c.baseName]}`;
        }
      }

      const allColors = new Set<string>();
      for (const name of uniqueNames) {
        for (const c of results[name]?.colorIdentity ?? []) allColors.add(c);
      }

      // Pre-fetch and cache token art
      const tokenNames = parseTokenList(tokenList);
      const tokens: TokenTemplate[] = [];

      if (tokenNames.length > 0) {
        setTokenProgress({ current: 0, total: tokenNames.length });
        for (let i = 0; i < tokenNames.length; i++) {
          const name = tokenNames[i];
          // fetchTokenImage caches the URL — we just call it to warm the cache
          await fetchTokenImage(name, []);
          tokens.push({ name, power: '', toughness: '', colors: [] });
          setTokenProgress({ current: i + 1, total: tokenNames.length });
        }
      }

      const commanderResult = getResult(commanderEntry);
      const deck: Deck = {
        id: Date.now().toString(),
        name: trimmedName,
        commanderImagePath: commanderResult.imagePath,
        colors: [...allColors].sort(),
        cards,
        tokens: tokens.length > 0 ? tokens : undefined,
        schemaVersion: 2,
      };

      await saveDeck(deck);

      const warnText =
        errors.length > 0
          ? `\n\n${errors.length} card(s) failed to fetch.`
          : '';
      Alert.alert('Imported!', `"${deck.name}" saved.${warnText}`, [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      setDownloadPercent(null);
      setTokenProgress(null);
    }
  };

  const progressLabel = () => {
    if (downloadPercent !== null && downloadPercent < 100) {
      return (
        <Text style={styles.progressText}>
          Downloading card database…{' '}
          <Text style={styles.progressNum}>{downloadPercent}%</Text>
        </Text>
      );
    }
    if (tokenProgress !== null) {
      return (
        <Text style={styles.progressText}>
          Fetching token art…{' '}
          <Text style={styles.progressNum}>{tokenProgress.current} of {tokenProgress.total}</Text>
        </Text>
      );
    }
    return (
      <Text style={styles.progressText}>
        Looking up cards…{' '}
        <Text style={styles.progressNum}>
          {progress.current}/{progress.total}
        </Text>
      </Text>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Deck Name</Text>
        <TextInput
          style={styles.input}
          value={deckName}
          onChangeText={setDeckName}
          placeholder="e.g. Ur-Dragon"
          placeholderTextColor="#625b71"
          editable={!importing}
        />

        <Text style={styles.label}>Deck List</Text>
        <Text style={styles.hint}>
          One card per line: "1 Card Name" or "1 Card Name (SET) 123". First line is the commander.
        </Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={deckList}
          onChangeText={setDeckList}
          placeholder={'1 The Ur-Dragon\n1 Scion of the Ur-Dragon\n4 Cultivate\n...'}
          placeholderTextColor="#625b71"
          multiline
          textAlignVertical="top"
          editable={!importing}
        />

        <Text style={styles.label}>Tokens (optional)</Text>
        <Text style={styles.hint}>
          One per line — art will be pre-fetched and cached.
        </Text>
        <TextInput
          style={[styles.input, styles.tokenArea]}
          value={tokenList}
          onChangeText={setTokenList}
          placeholder={'Goblin\nTreasure\nSoldier\n...'}
          placeholderTextColor="#625b71"
          multiline
          textAlignVertical="top"
          editable={!importing}
          autoCapitalize="words"
        />

        {importing ? (
          <View style={styles.progressBox}>
            <ActivityIndicator size="large" color="#D0BCFF" />
            {progressLabel()}
          </View>
        ) : (
          <Pressable style={styles.button} onPress={handleImport}>
            <Text style={styles.buttonText}>Import Deck</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#292E32' },
  scroll: { padding: 18 },
  label: {
    color: '#D0BCFF',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 14,
  },
  hint: { color: '#625b71', fontSize: 12, marginBottom: 8 },
  input: {
    backgroundColor: '#353A40',
    color: '#D4CDC1',
    borderWidth: 1,
    borderColor: '#625b71',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: { height: 300, lineHeight: 22 },
  tokenArea: { height: 120, lineHeight: 22 },
  progressBox: { marginTop: 24, alignItems: 'center', gap: 12 },
  progressText: { color: '#CCC2DC', fontSize: 15 },
  progressNum: { color: '#D0BCFF', fontWeight: '700' },
  button: {
    marginTop: 28,
    backgroundColor: '#6650a4',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonText: { color: '#D0BCFF', fontSize: 17, fontWeight: '800' },
});
