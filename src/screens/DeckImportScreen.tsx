/**
 * Import a new deck: enter a name + paste the deck list.
 * Fetches card data from Scryfall, builds CardInstance[], saves to AsyncStorage.
 * Matches Kotlin: ImportDeckScreen + saveDeckToFile + parseDeckListWithCommander.
 */
import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList, CardInstance, Deck} from '../types';
import {parseDeckList, expandDeckList} from '../utils/deckParser';
import {fetchCardsByName, ScryfallCardData} from '../api/scryfall';
import {useDeck} from '../context/DeckContext';

type Props = NativeStackScreenProps<RootStackParamList, 'DeckImport'>;

export default function DeckImportScreen({navigation}: Props) {
  const {saveDeck} = useDeck();
  const [deckName, setDeckName] = useState('');
  const [deckText, setDeckText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({done: 0, total: 0});
  const [status, setStatus] = useState('');

  const handleImport = async () => {
    if (!deckName.trim()) {
      Alert.alert('Deck Name Required', 'Enter a name for this deck.');
      return;
    }

    const lines = parseDeckList(deckText);
    if (lines.length === 0) {
      Alert.alert('Empty Deck', 'Paste a deck list first.');
      return;
    }

    const expanded = expandDeckList(lines);
    // Deduplicate names for Scryfall fetching
    const uniqueNames = [...new Set(expanded.map(e => e.name))];

    setLoading(true);
    setProgress({done: 0, total: uniqueNames.length});
    setStatus('Fetching cards from Scryfall…');

    const {cards: fetchedCards, errors} = await fetchCardsByName(
      uniqueNames,
      (done, total) => {
        setProgress({done, total});
        setStatus(`Fetching ${done}/${total}…`);
      },
    );

    setLoading(false);

    if (errors.length > 0) {
      const msg = errors
        .slice(0, 5)
        .map(e => `• ${e.name}`)
        .join('\n');
      const more = errors.length > 5 ? `\n…and ${errors.length - 5} more` : '';
      Alert.alert(
        `${errors.length} card(s) not found`,
        msg + more,
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Save anyway', onPress: () => buildAndSave(expanded, fetchedCards)},
        ],
      );
      return;
    }

    buildAndSave(expanded, fetchedCards);
  };

  const buildAndSave = async (
    expanded: ReturnType<typeof expandDeckList>,
    fetchedCards: ScryfallCardData[],
  ) => {
    const cardMap = new Map(fetchedCards.map(c => [c.name.toLowerCase(), c]));

    const instances: CardInstance[] = [];
    for (const entry of expanded) {
      const fetched = cardMap.get(entry.name.toLowerCase());
      instances.push({
        baseName: entry.name,
        displayName: entry.displayName,
        imageUri: fetched?.imageUri ?? '',
        manaCost: fetched?.manaCost,
        typeLine: fetched?.typeLine,
        colorIdentity: fetched?.colorIdentity ?? [],
        set: fetched?.setName,
        rules: fetched?.oracleText,
        place: entry.isCommander ? 'commander' : String(entry.placeIndex),
        zone: 'LIB',
      });
    }

    const commander = instances.find(c => c.place === 'commander');
    const deck: Deck = {
      name: deckName.trim(),
      commanderImageUri: commander?.imageUri ?? '',
      colors: commander?.colorIdentity ?? [],
      cards: instances,
    };

    await saveDeck(deck);
    navigation.popToTop();
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.nameInput}
            placeholder="Deck name"
            placeholderTextColor="#3a5060"
            value={deckName}
            onChangeText={setDeckName}
            autoCorrect={false}
          />

          <Text style={styles.label}>Deck list</Text>
          <Text style={styles.hint}>
            First card = commander  •  Format: "4 Lightning Bolt" or "4x …"
          </Text>

          <TextInput
            style={styles.deckInput}
            value={deckText}
            onChangeText={setDeckText}
            placeholder={'1 Atraxa, Praetors Voice\n4 Counterspell\n…'}
            placeholderTextColor="#3a5060"
            multiline
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
          />

          {loading ? (
            <View style={styles.progressBox}>
              <ActivityIndicator color="#8083D3" size="large" />
              <Text style={styles.progressText}>{status}</Text>
              <Text style={styles.progressSub}>
                {progress.done}/{progress.total} unique cards
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!deckName.trim() || !deckText.trim()) && styles.submitDisabled,
              ]}
              onPress={handleImport}
              disabled={!deckName.trim() || !deckText.trim()}>
              <Text style={styles.submitText}>Import Deck</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0C1F29'},
  flex: {flex: 1},
  scroll: {padding: 16, paddingBottom: 40},
  nameInput: {
    backgroundColor: '#132030',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a3e50',
    marginBottom: 16,
  },
  label: {color: '#8083D3', fontSize: 13, fontWeight: '600', marginBottom: 4},
  hint: {color: '#556', fontSize: 12, marginBottom: 8},
  deckInput: {
    backgroundColor: '#132030',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 13,
    fontFamily: 'monospace',
    minHeight: 280,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#2a3e50',
    marginBottom: 16,
  },
  progressBox: {alignItems: 'center', padding: 32, gap: 10},
  progressText: {color: '#8AA2AE', fontSize: 14},
  progressSub: {color: '#556', fontSize: 12},
  submitBtn: {
    backgroundColor: '#8083D3',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  submitDisabled: {opacity: 0.35},
  submitText: {color: '#fff', fontSize: 16, fontWeight: 'bold'},
});
