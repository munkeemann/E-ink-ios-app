/**
 * In-game screen.
 * Matches Kotlin: InGameScreen.kt
 *
 * - Shows deck grouped by name (not individual instances).
 * - Shuffle → reorders library, calls beginGame.
 * - Scry → asks count, navigates to ScryScreen.
 * - Tutor → text input for exact card name → moves to position 1, calls beginGame.
 * - Graveyard → navigates to GraveyardScreen, showing live GRV count badge.
 * - Reloads deck on focus (so ScryScreen / GraveyardScreen changes are reflected).
 */
import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {RootStackParamList, Deck, CardInstance} from '../types';
import {useDeck} from '../context/DeckContext';
import {beginGame, fetchZones} from '../api/piServer';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

// ── Deck manipulation helpers (mirror InGameActions.kt) ───────────────────────

function shuffleDeck(cards: CardInstance[]): CardInstance[] {
  const commander = cards.find(c => c.place === 'commander');
  const rest = cards.filter(c => c.place !== 'commander');

  // Fisher-Yates
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  rest.forEach((c, i) => (c.place = String(i + 1)));

  return commander ? [commander, ...rest] : rest;
}

function tutorCard(cards: CardInstance[], cardName: string): CardInstance[] {
  // Match Android: shuffle first, then move target to position 1
  const shuffled = shuffleDeck([...cards]);
  const commander = shuffled.find(c => c.place === 'commander');
  const rest = shuffled.filter(c => c.place !== 'commander');

  const targetIdx = rest.findIndex(c => c.baseName === cardName);
  if (targetIdx < 0) {
    return shuffled;
  }
  const [target] = rest.splice(targetIdx, 1);
  rest.forEach((c, i) => (c.place = String(i + 2)));
  target.place = '1';

  return commander ? [commander, target, ...rest] : [target, ...rest];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GameScreen({navigation, route}: Props) {
  const {deckName} = route.params;
  const {loadDeck, saveDeck} = useDeck();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [tutorName, setTutorName] = useState('');
  const [scryInput, setScryInput] = useState('');
  const [showScryDialog, setShowScryDialog] = useState(false);
  const [graveyardCount, setGraveyardCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Reload deck and poll zones whenever this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadDeck(deckName).then(d => {
        setDeck(d);
        if (d) {
          pollGraveyardCount();
        }
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deckName]),
  );

  const pollGraveyardCount = async () => {
    try {
      const zones = await fetchZones();
      const count = Object.values(zones).filter(z => z === 'GRV').length;
      setGraveyardCount(count);
    } catch {
      // ignore — Pi might not be reachable during dev
    }
  };

  const saveAndSync = async (updatedDeck: Deck) => {
    setDeck(updatedDeck);
    await saveDeck(updatedDeck);
    setSyncing(true);
    try {
      await beginGame(updatedDeck.cards);
    } catch (e) {
      Alert.alert('Sync error', e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const handleShuffle = async () => {
    if (!deck) {
      return;
    }
    const shuffled = shuffleDeck([...deck.cards]);
    await saveAndSync({...deck, cards: shuffled});
  };

  const handleTutor = async () => {
    if (!deck || !tutorName.trim()) {
      return;
    }
    const name = tutorName.trim();
    const exists = deck.cards.some(c => c.baseName === name);
    if (!exists) {
      Alert.alert('Not found', `"${name}" is not in the library.`);
      return;
    }
    const reordered = tutorCard([...deck.cards], name);
    setTutorName('');
    await saveAndSync({...deck, cards: reordered});
  };

  const handleScry = () => {
    const count = parseInt(scryInput, 10);
    if (isNaN(count) || count <= 0) {
      return;
    }
    setShowScryDialog(false);
    setScryInput('');
    navigation.navigate('Scry', {deckName, scryCount: count});
  };

  if (!deck) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#8083D3" />
      </View>
    );
  }

  const grouped = deck.cards.reduce<Record<string, CardInstance[]>>((acc, c) => {
    (acc[c.baseName] = acc[c.baseName] ?? []).push(c);
    return acc;
  }, {});
  const groupedEntries = Object.entries(grouped);

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleShuffle}
            disabled={syncing}>
            <Text style={styles.actionBtnText}>Shuffle</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowScryDialog(true)}>
            <Text style={styles.actionBtnText}>Scry</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.graveyardBtn]}
            onPress={() => navigation.navigate('Graveyard', {deckName})}>
            <Text style={styles.actionBtnText}>
              Graveyard{graveyardCount > 0 ? ` (${graveyardCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {syncing && (
          <Text style={styles.syncStatus}>Syncing sleeves…</Text>
        )}

        {/* Tutor input */}
        <View style={styles.tutorRow}>
          <TextInput
            style={styles.tutorInput}
            value={tutorName}
            onChangeText={setTutorName}
            placeholder="Tutor: exact card name"
            placeholderTextColor="#3a5060"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleTutor}
          />
          <TouchableOpacity
            style={[styles.tutorBtn, !tutorName.trim() && styles.tutorBtnDisabled]}
            onPress={handleTutor}
            disabled={!tutorName.trim()}>
            <Text style={styles.tutorBtnText}>Tutor to Top</Text>
          </TouchableOpacity>
        </View>

        {/* Deck list grouped by name */}
        <FlatList
          data={groupedEntries}
          keyExtractor={([name]) => name}
          contentContainerStyle={styles.list}
          renderItem={({item: [name, group]}) => (
            <Text style={styles.cardRow}>
              {group.length} × {name}
            </Text>
          )}
        />

        {/* Scry count dialog (inline overlay) */}
        {showScryDialog && (
          <View style={styles.dialogOverlay}>
            <View style={styles.dialog}>
              <Text style={styles.dialogTitle}>Scry</Text>
              <TextInput
                style={styles.dialogInput}
                value={scryInput}
                onChangeText={setScryInput}
                placeholder="How many cards?"
                placeholderTextColor="#3a5060"
                keyboardType="number-pad"
                autoFocus
              />
              <View style={styles.dialogBtns}>
                <TouchableOpacity
                  style={styles.dialogCancel}
                  onPress={() => {
                    setShowScryDialog(false);
                    setScryInput('');
                  }}>
                  <Text style={styles.dialogCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.dialogConfirm,
                    !scryInput && styles.tutorBtnDisabled,
                  ]}
                  onPress={handleScry}
                  disabled={!scryInput}>
                  <Text style={styles.dialogConfirmText}>Begin Scry</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0C1F29'},
  flex: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0C1F29'},
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#132030',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#132030',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a3e50',
  },
  graveyardBtn: {borderColor: '#4a6050'},
  actionBtnText: {color: '#8AA2AE', fontWeight: '600', fontSize: 13},
  syncStatus: {color: '#88DBD9', fontSize: 12, textAlign: 'center', paddingVertical: 4},
  tutorRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#132030',
    alignItems: 'center',
  },
  tutorInput: {
    flex: 1,
    backgroundColor: '#132030',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a3e50',
  },
  tutorBtn: {
    backgroundColor: '#8083D3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tutorBtnDisabled: {opacity: 0.4},
  tutorBtnText: {color: '#fff', fontSize: 13, fontWeight: '600'},
  list: {padding: 16, paddingBottom: 40},
  cardRow: {
    color: '#8AA2AE',
    fontSize: 15,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#132030',
  },
  // Scry dialog
  dialogOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#132030',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#2a3e50',
  },
  dialogTitle: {color: '#8083D3', fontSize: 18, fontWeight: 'bold', marginBottom: 12},
  dialogInput: {
    backgroundColor: '#0C1F29',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a3e50',
    marginBottom: 14,
    textAlign: 'center',
  },
  dialogBtns: {flexDirection: 'row', gap: 10},
  dialogCancel: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a3e50',
    alignItems: 'center',
  },
  dialogCancelText: {color: '#8AA2AE'},
  dialogConfirm: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#8083D3',
    alignItems: 'center',
  },
  dialogConfirmText: {color: '#fff', fontWeight: 'bold'},
});
