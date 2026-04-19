import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { assignSleeveIds, beginGame, getRegisteredSleeves } from '../../src/api/piServer';
import { getDeck, loadSettings, saveDeck } from '../../src/storage/deckStorage';
import { AppSettings, CardInstance, Deck, TokenTemplate } from '../../src/types';

const MTG_COLORS = ['W', 'U', 'B', 'R', 'G'];
const COLOR_LABELS: Record<string, string> = { W: '☀️', U: '💧', B: '💀', R: '🔥', G: '🌲' };

export default function DeckPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0 });
  const [settings, setSettings] = useState<AppSettings>({
    sleeveCount: 5,
    physicalZones: ['LIB', 'HND', 'BTFLD'],
    librarySleeveDepth: 1,
    devMode: false,
    piDebugAlerts: false,
  });

  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('list');
  const [artPopupCard, setArtPopupCard] = useState<CardInstance | null>(null);

  const [addTokenVisible, setAddTokenVisible] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenPower, setNewTokenPower] = useState('1');
  const [newTokenToughness, setNewTokenToughness] = useState('1');
  const [newTokenColors, setNewTokenColors] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (id) getDeck(id).then(setDeck);
      loadSettings().then(setSettings);
    }, [id]),
  );

  if (!deck) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#D0BCFF" />
      </View>
    );
  }

  const commander = deck.cards.find(c => c.place === 'commander');
  const library = settings.devMode
    ? deck.cards
        .filter(c => c.zone === 'LIB')
        .sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10))
    : deck.cards
        .filter(c => c.zone === 'LIB')
        .sort((a, b) => a.baseName.localeCompare(b.baseName));

  const tokens: TokenTemplate[] = Array.isArray(deck.tokens) ? deck.tokens : [];

  const gameInProgress = !!deck.gameInProgress;

  const doStartNewGame = async () => {
    setSending(true);
    setSendProgress({ sent: 0, total: 0 });
    try {
      // Reset all cards: non-commanders back to LIB, commander back to BTFLD
      // Tokens (isToken: true) are discarded entirely on reset
      const resetCards = deck.cards
        .filter(c => !c.isToken)
        .map(c => c.place === 'commander'
          ? { ...c, zone: 'BTFLD' as const }
          : { ...c, zone: 'LIB' as const });

      // Shuffle LIB cards and reassign places
      const libCards = resetCards.filter(c => c.zone === 'LIB');
      const nonLibCards = resetCards.filter(c => c.zone !== 'LIB');
      const shuffled = [...libCards].sort(() => Math.random() - 0.5)
        .map((c, i) => ({ ...c, place: String(i + 1) }));
      const unsleevedCards = [...nonLibCards, ...shuffled];

      // Assign permanent sleeveIds based on settings
      const settings = await loadSettings();
      const newCards = assignSleeveIds(unsleevedCards, settings);

      const newDeck = { ...deck, cards: newCards, gameInProgress: true, lastPlayedAt: Date.now() };
      await saveDeck(newDeck);
      setDeck(newDeck);

      const sleeves = await getRegisteredSleeves();
      await beginGame(newCards, sleeves, (sent, total) => setSendProgress({ sent, total }), undefined, settings);
      router.push(`/game/${deck.id}?freshStart=true`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const handleBeginGame = () => {
    if (gameInProgress) {
      Alert.alert(
        'Start New Game?',
        'This will reset your current game state. Are you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', style: 'destructive', onPress: doStartNewGame },
        ],
      );
    } else {
      doStartNewGame();
    }
  };

  const toggleNewColor = (c: string) => {
    setNewTokenColors(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c],
    );
  };

  const handleAddToken = async () => {
    if (!newTokenName.trim()) { Alert.alert('Missing name', 'Enter a token name.'); return; }
    const template: TokenTemplate = {
      name: newTokenName.trim(),
      power: newTokenPower,
      toughness: newTokenToughness,
      colors: newTokenColors,
    };
    const updated: Deck = { ...deck, tokens: [...tokens, template] };
    await saveDeck(updated);
    setDeck(updated);
    setAddTokenVisible(false);
    setNewTokenName('');
    setNewTokenPower('1');
    setNewTokenToughness('1');
    setNewTokenColors([]);
  };

  const handleDeleteToken = async (index: number) => {
    const updated: Deck = { ...deck, tokens: tokens.filter((_, i) => i !== index) };
    await saveDeck(updated);
    setDeck(updated);
  };

  // Plain computation (deck is guaranteed non-null here, after the early return above)
  const uniqueGalleryCards: CardInstance[] = (() => {
    const allCards = [...(commander ? [commander] : []), ...library];
    const seen = new Set<string>();
    const result: CardInstance[] = [];
    for (const c of allCards) {
      if (!seen.has(c.baseName)) {
        seen.add(c.baseName);
        result.push(c);
      }
    }
    return result;
  })();

  const renderCard = ({ item }: { item: CardInstance }) => (
    <Pressable style={styles.cardRow} onLongPress={() => setArtPopupCard(item)}>
      <Text style={styles.cardIndex}>
        {item.place === 'commander' ? '⚔' : settings.devMode ? item.place : '·'}
      </Text>
      <Text style={styles.cardName}>{item.displayName}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {deck.commanderImagePath ? (
          <Image
            source={{ uri: deck.commanderImagePath }}
            style={styles.headerArt}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.headerArt, styles.headerArtPlaceholder]} />
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.deckTitle}>{deck.name}</Text>
          {commander && (
            <Text style={styles.commanderName}>{commander.displayName}</Text>
          )}
          <Text style={styles.deckMeta}>{deck.cards.length} cards total</Text>
          <Text style={[styles.devModeLabel, settings.devMode && styles.devModeLabelActive]}>
            {settings.devMode ? 'Showing actual deck order' : 'Deck order hidden'}
          </Text>
        </View>
      </View>

      {/* View toggle */}
      <View style={styles.viewToggleBar}>
        <Pressable
          style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
          onPress={() => setViewMode('list')}
        >
          <Text style={[styles.viewToggleBtnText, viewMode === 'list' && styles.viewToggleBtnTextActive]}>≡ List</Text>
        </Pressable>
        <Pressable
          style={[styles.viewToggleBtn, viewMode === 'gallery' && styles.viewToggleBtnActive]}
          onPress={() => setViewMode('gallery')}
        >
          <Text style={[styles.viewToggleBtnText, viewMode === 'gallery' && styles.viewToggleBtnTextActive]}>▦ Gallery</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {viewMode === 'list' ? (
          /* Card list */
          <FlatList
            key="list"
            data={[...(commander ? [commander] : []), ...library]}
            keyExtractor={(c, i) => `${c.baseName}-${i}`}
            renderItem={renderCard}
            scrollEnabled={false}
          />
        ) : (
          /* Gallery — unique cards in a 2-column grid */
          <FlatList
            key="gallery"
            data={uniqueGalleryCards}
            keyExtractor={(c, i) => `gallery-${c.baseName}-${i}`}
            numColumns={2}
            renderItem={({ item }) => (
              <Pressable style={styles.galleryTile} onLongPress={() => setArtPopupCard(item)}>
                {item.imagePath ? (
                  <Image source={{ uri: item.imagePath }} style={styles.galleryArt} resizeMode="cover" />
                ) : (
                  <View style={[styles.galleryArt, styles.galleryArtPlaceholder]} />
                )}
                <Text style={styles.galleryName} numberOfLines={2}>{item.displayName}</Text>
              </Pressable>
            )}
            scrollEnabled={false}
            contentContainerStyle={styles.galleryGrid}
          />
        )}

        {/* Manage Tokens section */}
        <View style={[styles.sectionHeader, viewMode === 'gallery' && { marginTop: 0 }]}>
          <Text style={styles.sectionTitle}>Token Library</Text>
          <Pressable style={styles.addTokenBtn} onPress={() => setAddTokenVisible(true)}>
            <Text style={styles.addTokenBtnText}>+ Add</Text>
          </Pressable>
        </View>

        {tokens.length === 0 ? (
          <Text style={styles.emptyText}>
            No tokens saved. Add tokens to quickly create them during a game.
          </Text>
        ) : (
          tokens.map((t, i) => (
            <View key={i} style={styles.tokenRow}>
              <View style={styles.tokenInfo}>
                <Text style={styles.tokenName}>{t.name}</Text>
                <Text style={styles.tokenMeta}>
                  {t.power}/{t.toughness}
                  {t.colors.length > 0
                    ? `  ${t.colors.map(c => COLOR_LABELS[c] ?? c).join('')}`
                    : '  Colorless'}
                </Text>
              </View>
              <Pressable onPress={() => handleDeleteToken(i)} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>✕</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      {sending ? (
        <View style={styles.sendingBar}>
          <ActivityIndicator color="#D0BCFF" size="small" />
          <Text style={styles.sendingText}>
            Sending sleeves… {sendProgress.sent}/{sendProgress.total}
          </Text>
        </View>
      ) : gameInProgress ? (
        <View style={styles.bottomActions}>
          <Pressable style={styles.resumeBtn} onPress={() => router.push(`/game/${deck.id}`)}>
            <Text style={styles.resumeBtnText}>▶ Resume Game</Text>
          </Pressable>
          <Pressable style={styles.beginBtn} onPress={handleBeginGame}>
            <Text style={styles.beginBtnText}>⚡ Begin New Game</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={[styles.beginBtn, styles.beginBtnFull]} onPress={handleBeginGame}>
          <Text style={styles.beginBtnText}>⚡ Begin Game</Text>
        </Pressable>
      )}

      {/* Add Token Template modal */}
      <Modal
        visible={addTokenVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddTokenVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setAddTokenVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New Token Favorite</Text>

            <Text style={styles.sheetLabel}>Name</Text>
            <TextInput
              style={styles.sheetInput}
              value={newTokenName}
              onChangeText={setNewTokenName}
              placeholder="e.g. Soldier, Dragon, Treasure"
              placeholderTextColor="#625b71"
              autoCapitalize="words"
              autoFocus
            />

            <View style={styles.ptRow}>
              <View style={styles.ptField}>
                <Text style={styles.sheetLabel}>Power</Text>
                <TextInput
                  style={styles.sheetInput}
                  value={newTokenPower}
                  onChangeText={setNewTokenPower}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
              </View>
              <Text style={styles.ptSlash}>/</Text>
              <View style={styles.ptField}>
                <Text style={styles.sheetLabel}>Toughness</Text>
                <TextInput
                  style={styles.sheetInput}
                  value={newTokenToughness}
                  onChangeText={setNewTokenToughness}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
              </View>
            </View>

            <Text style={styles.sheetLabel}>Color</Text>
            <View style={styles.colorRow}>
              {MTG_COLORS.map(c => (
                <Pressable
                  key={c}
                  style={[styles.colorBtn, newTokenColors.includes(c) && styles.colorBtnActive]}
                  onPress={() => toggleNewColor(c)}
                >
                  <Text style={styles.colorBtnText}>{COLOR_LABELS[c]}</Text>
                  <Text style={[styles.colorBtnLabel, newTokenColors.includes(c) && styles.colorBtnLabelActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.sheetActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setAddTokenVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleAddToken}>
                <Text style={styles.confirmBtnText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Card art popup (long press) */}
      <Modal visible={artPopupCard !== null} transparent animationType="fade" onRequestClose={() => setArtPopupCard(null)}>
        <Pressable style={styles.artBackdrop} onPress={() => setArtPopupCard(null)}>
          {artPopupCard?.imagePath ? (
            <Image source={{ uri: artPopupCard.imagePath }} style={styles.artFull} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#292E32' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    backgroundColor: '#353A40',
    borderBottomWidth: 1,
    borderColor: '#625b71',
  },
  headerArt: { width: 90, height: 124 },
  headerArtPlaceholder: { backgroundColor: '#353A40' },
  headerInfo: { flex: 1, padding: 14, justifyContent: 'center', gap: 4 },
  deckTitle: { color: '#D0BCFF', fontSize: 20, fontWeight: '800' },
  commanderName: { color: '#CCC2DC', fontSize: 13 },
  deckMeta: { color: '#625b71', fontSize: 12 },
  devModeLabel: { color: '#4a4f55', fontSize: 11, marginTop: 2 },
  devModeLabelActive: { color: '#f59e0b' },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },

  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#353A40',
  },
  cardIndex: {
    width: 30,
    color: '#625b71',
    fontSize: 12,
    textAlign: 'right',
    marginRight: 12,
  },
  cardName: { color: '#D4CDC1', fontSize: 15 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderColor: '#4a4f55',
    marginTop: 10,
  },
  sectionTitle: { color: '#D0BCFF', fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  addTokenBtn: {
    backgroundColor: '#6650a4',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  addTokenBtnText: { color: '#D0BCFF', fontSize: 13, fontWeight: '700' },
  emptyText: { color: '#625b71', fontSize: 13, paddingHorizontal: 16, paddingBottom: 12, lineHeight: 20 },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#353A40',
  },
  tokenInfo: { flex: 1 },
  tokenName: { color: '#D4CDC1', fontSize: 15 },
  tokenMeta: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 8 },
  deleteBtnText: { color: '#f87171', fontSize: 16 },

  sendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 18,
    backgroundColor: '#353A40',
    borderTopWidth: 1,
    borderColor: '#625b71',
  },
  sendingText: { color: '#CCC2DC', fontSize: 14 },
  bottomActions: {
    flexDirection: 'row',
    gap: 10,
    margin: 16,
  },
  resumeBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#6650a4',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  resumeBtnText: { color: '#9C6ADE', fontSize: 16, fontWeight: '700' },
  beginBtn: {
    flex: 1,
    backgroundColor: '#6650a4',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  beginBtnFull: {
    flex: 0,
    margin: 16,
  },
  beginBtnText: { color: '#D0BCFF', fontSize: 18, fontWeight: '800' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#353A40',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#625b71',
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#625b71',
    alignSelf: 'center',
    marginVertical: 10,
  },
  sheetTitle: { color: '#D0BCFF', fontSize: 18, fontWeight: '800', marginBottom: 14 },
  sheetLabel: { color: '#CCC2DC', fontSize: 13, marginBottom: 6, marginTop: 10 },
  sheetInput: {
    backgroundColor: '#292E32',
    color: '#D4CDC1',
    borderWidth: 1,
    borderColor: '#625b71',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 4,
  },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#625b71' },
  cancelBtnText: { color: '#625b71', fontSize: 15 },
  confirmBtn: { flex: 1, backgroundColor: '#6650a4', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  confirmBtnText: { color: '#D0BCFF', fontSize: 15, fontWeight: '800' },

  ptRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ptField: { flex: 1 },
  ptSlash: { color: '#625b71', fontSize: 24, fontWeight: '700', marginTop: 16 },

  colorRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  colorBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#625b71',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 4,
  },
  colorBtnActive: { borderColor: '#D0BCFF', backgroundColor: 'rgba(208,188,255,0.12)' },
  colorBtnText: { fontSize: 18 },
  colorBtnLabel: { color: '#625b71', fontSize: 11, fontWeight: '800' },
  colorBtnLabelActive: { color: '#D0BCFF' },

  viewToggleBar: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
    backgroundColor: '#353A40',
    borderBottomWidth: 1,
    borderColor: '#4a4f55',
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4a4f55',
  },
  viewToggleBtnActive: { backgroundColor: '#6650a4', borderColor: '#6650a4' },
  viewToggleBtnText: { color: '#625b71', fontSize: 14, fontWeight: '700' },
  viewToggleBtnTextActive: { color: '#D0BCFF' },

  galleryGrid: { padding: 4 },
  galleryTile: {
    flex: 1,
    margin: 4,
    alignItems: 'center',
  },
  galleryArt: { width: '100%', aspectRatio: 0.72, borderRadius: 8 },
  galleryArtPlaceholder: { backgroundColor: '#4a4f55' },
  galleryName: { color: '#D4CDC1', fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 4 },

  artBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  artFull: { width: '90%', height: '80%' },
});
