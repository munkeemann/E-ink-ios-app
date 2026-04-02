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
import { fetchCards } from '../src/api/scryfall';
import { saveDeck } from '../src/storage/deckStorage';
import { CardInstance, Deck } from '../src/types';

interface DeckEntry {
  name: string;
  count: number;
}

function parseDeckList(text: string): DeckEntry[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const m = line.match(/^(\d+)\s+(.+)$/);
      if (m) return { count: parseInt(m[1], 10), name: m[2].trim() };
      return { count: 1, name: line };
    });
}

export default function ImportDeckScreen() {
  const [deckName, setDeckName] = useState('');
  const [deckList, setDeckList] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

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

    // Expand library entries by count
    const libraryNames: string[] = [];
    for (const e of libraryEntries) {
      for (let i = 0; i < e.count; i++) libraryNames.push(e.name);
    }

    // Unique names to fetch (commander may count > 1 but fetched once)
    const uniqueNames = [
      ...new Set([commanderEntry.name, ...libraryNames]),
    ];

    setProgress({ current: 0, total: uniqueNames.length });
    setImporting(true);

    try {
      const { results, errors } = await fetchCards(
        uniqueNames,
        (done, total) => setProgress({ current: done, total }),
      );

      if (errors.length > 0) {
        console.warn('Some cards failed:', errors);
      }

      // Build cards array
      const cards: CardInstance[] = [];

      // Commander — always placed as "commander", zone BTFLD
      for (let i = 0; i < commanderEntry.count; i++) {
        cards.push({
          baseName: commanderEntry.name,
          displayName:
            commanderEntry.count > 1
              ? `${commanderEntry.name} ${i + 1}`
              : commanderEntry.name,
          imagePath: results[commanderEntry.name]?.imagePath ?? '',
          place: 'commander',
          zone: 'BTFLD',
        });
      }

      // Track duplicate counters for display names
      const nameCount: Record<string, number> = {};

      libraryNames.forEach((name, idx) => {
        nameCount[name] = (nameCount[name] ?? 0) + 1;
        const count = nameCount[name];
        // We'll resolve display names in a second pass; use raw count for now
        cards.push({
          baseName: name,
          displayName: name, // finalized below
          imagePath: results[name]?.imagePath ?? '',
          place: String(idx + 1),
          zone: 'LIB',
        });
      });

      // Fix display names: add " 2", " 3" suffix for duplicates
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

      // Collect all color identity
      const allColors = new Set<string>();
      for (const name of uniqueNames) {
        for (const c of results[name]?.colorIdentity ?? []) allColors.add(c);
      }

      const deck: Deck = {
        id: Date.now().toString(),
        name: trimmedName,
        commanderImagePath: results[commanderEntry.name]?.imagePath ?? '',
        colors: [...allColors].sort(),
        cards,
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
    }
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
          placeholderTextColor="#444"
          editable={!importing}
        />

        <Text style={styles.label}>Deck List</Text>
        <Text style={styles.hint}>
          One card per line: "1 Card Name". First line is the commander.
        </Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={deckList}
          onChangeText={setDeckList}
          placeholder={
            '1 The Ur-Dragon\n1 Scion of the Ur-Dragon\n4 Cultivate\n...'
          }
          placeholderTextColor="#444"
          multiline
          textAlignVertical="top"
          editable={!importing}
        />

        {importing ? (
          <View style={styles.progressBox}>
            <ActivityIndicator size="large" color="#e0c070" />
            <Text style={styles.progressText}>
              Fetching cards…{' '}
              <Text style={styles.progressNum}>
                {progress.current}/{progress.total}
              </Text>
            </Text>
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
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  scroll: { padding: 18 },
  label: {
    color: '#e0c070',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 14,
  },
  hint: { color: '#666', fontSize: 12, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1a2e',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2d2d50',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: { height: 300, lineHeight: 22 },
  progressBox: {
    marginTop: 24,
    alignItems: 'center',
    gap: 12,
  },
  progressText: { color: '#aaa', fontSize: 15 },
  progressNum: { color: '#e0c070', fontWeight: '700' },
  button: {
    marginTop: 28,
    backgroundColor: '#e0c070',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonText: { color: '#1a1a2e', fontSize: 17, fontWeight: '800' },
});
