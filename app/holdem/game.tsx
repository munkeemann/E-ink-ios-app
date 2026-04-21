import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  advance,
  cardLabel,
  PHASE_BUTTON_LABEL,
  SUIT_SYMBOL,
} from '../../src/holdem/HoldemGame';
import {
  buildSleeveLayout,
  isFaceUp,
  totalSleeveCount,
} from '../../src/holdem/HoldemSleeveLayout';
import { loadHoldemGame, saveHoldemGame, clearHoldemGame } from '../../src/storage/holdemStorage';
import { sendToSleeve, clearMemo } from '../../src/api/sleeveService';
import { getRegisteredSleeves } from '../../src/api/piServer';
import { HoldemGameState, PlayingCard, Suit } from '../../src/types/holdem';
import { SKIN_ASSETS, skinCardKey } from '../../src/assets/skins/registry';

// Pre-built card JPEG assets (Metro requires static require() calls)
const CARD_ASSETS: Record<string, number> = {
  card_AS: require('../../assets/images/playing_cards/card_AS.jpg'),
  card_2S: require('../../assets/images/playing_cards/card_2S.jpg'),
  card_3S: require('../../assets/images/playing_cards/card_3S.jpg'),
  card_4S: require('../../assets/images/playing_cards/card_4S.jpg'),
  card_5S: require('../../assets/images/playing_cards/card_5S.jpg'),
  card_6S: require('../../assets/images/playing_cards/card_6S.jpg'),
  card_7S: require('../../assets/images/playing_cards/card_7S.jpg'),
  card_8S: require('../../assets/images/playing_cards/card_8S.jpg'),
  card_9S: require('../../assets/images/playing_cards/card_9S.jpg'),
  card_TS: require('../../assets/images/playing_cards/card_TS.jpg'),
  card_JS: require('../../assets/images/playing_cards/card_JS.jpg'),
  card_QS: require('../../assets/images/playing_cards/card_QS.jpg'),
  card_KS: require('../../assets/images/playing_cards/card_KS.jpg'),
  card_AH: require('../../assets/images/playing_cards/card_AH.jpg'),
  card_2H: require('../../assets/images/playing_cards/card_2H.jpg'),
  card_3H: require('../../assets/images/playing_cards/card_3H.jpg'),
  card_4H: require('../../assets/images/playing_cards/card_4H.jpg'),
  card_5H: require('../../assets/images/playing_cards/card_5H.jpg'),
  card_6H: require('../../assets/images/playing_cards/card_6H.jpg'),
  card_7H: require('../../assets/images/playing_cards/card_7H.jpg'),
  card_8H: require('../../assets/images/playing_cards/card_8H.jpg'),
  card_9H: require('../../assets/images/playing_cards/card_9H.jpg'),
  card_TH: require('../../assets/images/playing_cards/card_TH.jpg'),
  card_JH: require('../../assets/images/playing_cards/card_JH.jpg'),
  card_QH: require('../../assets/images/playing_cards/card_QH.jpg'),
  card_KH: require('../../assets/images/playing_cards/card_KH.jpg'),
  card_AD: require('../../assets/images/playing_cards/card_AD.jpg'),
  card_2D: require('../../assets/images/playing_cards/card_2D.jpg'),
  card_3D: require('../../assets/images/playing_cards/card_3D.jpg'),
  card_4D: require('../../assets/images/playing_cards/card_4D.jpg'),
  card_5D: require('../../assets/images/playing_cards/card_5D.jpg'),
  card_6D: require('../../assets/images/playing_cards/card_6D.jpg'),
  card_7D: require('../../assets/images/playing_cards/card_7D.jpg'),
  card_8D: require('../../assets/images/playing_cards/card_8D.jpg'),
  card_9D: require('../../assets/images/playing_cards/card_9D.jpg'),
  card_TD: require('../../assets/images/playing_cards/card_TD.jpg'),
  card_JD: require('../../assets/images/playing_cards/card_JD.jpg'),
  card_QD: require('../../assets/images/playing_cards/card_QD.jpg'),
  card_KD: require('../../assets/images/playing_cards/card_KD.jpg'),
  card_AC: require('../../assets/images/playing_cards/card_AC.jpg'),
  card_2C: require('../../assets/images/playing_cards/card_2C.jpg'),
  card_3C: require('../../assets/images/playing_cards/card_3C.jpg'),
  card_4C: require('../../assets/images/playing_cards/card_4C.jpg'),
  card_5C: require('../../assets/images/playing_cards/card_5C.jpg'),
  card_6C: require('../../assets/images/playing_cards/card_6C.jpg'),
  card_7C: require('../../assets/images/playing_cards/card_7C.jpg'),
  card_8C: require('../../assets/images/playing_cards/card_8C.jpg'),
  card_9C: require('../../assets/images/playing_cards/card_9C.jpg'),
  card_TC: require('../../assets/images/playing_cards/card_TC.jpg'),
  card_JC: require('../../assets/images/playing_cards/card_JC.jpg'),
  card_QC: require('../../assets/images/playing_cards/card_QC.jpg'),
  card_KC: require('../../assets/images/playing_cards/card_KC.jpg'),
};

async function timedFetch(uri: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(uri, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getCardBytes(
  rank: string,
  suit: string,
  skin = 'default',
): Promise<{ data: ArrayBuffer; source: 'skin' | 'default' }> {
  console.log(`[Holdem] getCardBytes called: rank=${rank} suit=${suit} skin=${skin}`);

  // Try skin asset first (skip for 'default' — it has no images by design)
  if (skin !== 'default') {
    const skinAssets = SKIN_ASSETS[skin];
    if (skinAssets) {
      const fileKey = skinCardKey(rank, suit);
      const skinAsset = skinAssets[fileKey];
      if (skinAsset) {
        const skinSrc = Image.resolveAssetSource(skinAsset);
        if (skinSrc?.uri) {
          try {
            const skinResp = await timedFetch(skinSrc.uri);
            if (skinResp.ok) {
              const data = await skinResp.arrayBuffer();
              console.log(`[Holdem] skin asset HIT: ${fileKey} (${skin}) — ${data.byteLength} bytes`);
              return { data, source: 'skin' };
            }
          } catch {
            // timeout or fetch error — fall through to CARD_ASSETS
            console.log(`[Holdem] skin asset fetch failed for ${fileKey} — falling back`);
          }
        }
      }
    }
  }

  // Fallback: programmatic card assets
  console.log(`[Holdem] skin asset MISS, using CARD_ASSETS fallback: rank=${rank} suit=${suit} skin=${skin}`);
  const key = `card_${rank}${suit}`;
  if (!CARD_ASSETS[key]) throw new Error(`card asset key not found: ${key}`);
  const src = Image.resolveAssetSource(CARD_ASSETS[key]);
  if (!src?.uri) throw new Error(`card asset ${key}: resolveAssetSource returned no URI`);
  const resp = await timedFetch(src.uri);
  if (!resp.ok) throw new Error(`card asset ${key}: HTTP ${resp.status}`);
  const data = await resp.arrayBuffer();
  return { data, source: 'default' };
}


const SUIT_COLOR: Record<Suit, string> = {
  S: '#e0f7ff', H: '#f87171', D: '#f87171', C: '#e0f7ff',
};

const COMMUNITY_SLEEVE_LABELS = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];

function CardChip({ card, revealed }: { card: PlayingCard; revealed: boolean }) {
  return (
    <View style={[styles.chip, !revealed && styles.chipHidden]}>
      <Text style={[styles.chipText, revealed && { color: SUIT_COLOR[card.suit] }]}>
        {revealed ? cardLabel(card) : '?'}
      </Text>
    </View>
  );
}

export default function HoldemGameScreen() {
  const [state, setState] = useState<HoldemGameState | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadHoldemGame().then(s => {
        if (!s) { router.replace('/holdem/setup'); return; }
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

  const layout = buildSleeveLayout(state.playerCount);

  const handleAdvance = async () => {
    if (busy) return;
    setBusy(true);
    const t0 = Date.now();
    console.log(`[HoldemDeal] button pressed — phase=${state.phase} playerCount=${state.playerCount} skin=${state.cardSkin ?? 'default'}`);
    try {
      const { newState, sleeveUpdates } = advance(state);
      setState(newState);
      await saveHoldemGame(newState);
      if (newState.phase === 'pre_deal') clearMemo();
      console.log(`[HoldemDeal] fetching sleeve registry... (+${Date.now()-t0}ms)`);
      const registered = new Set(await getRegisteredSleeves());
      console.log(`[HoldemDeal] registry returned: [${[...registered].sort((a,b)=>a-b).join(', ')}] (+${Date.now()-t0}ms)`);
      console.log(`[HoldemDeal] sleeveUpdates count=${sleeveUpdates.length}`);
      for (const u of sleeveUpdates) {
        if (!registered.has(u.sleeveId)) {
          console.log(`[HoldemDeal] sleeve ${u.sleeveId} not registered — skipping`);
          continue;
        }
        let imageData: ArrayBuffer | undefined;
        let imageSource: 'skin' | 'default' | 'none' = 'none';
        if (u.card) {
          const assetKey = `card_${u.card.rank}${u.card.suit}`;
          console.log(`[HoldemDeal] sleeve ${u.sleeveId}: getCardBytes start — key=${assetKey} skin=${state.cardSkin ?? 'default'} (+${Date.now()-t0}ms)`);
          try {
            const result = await getCardBytes(u.card.rank, u.card.suit, state.cardSkin ?? 'default');
            imageData = result.data;
            imageSource = result.source;
            console.log(`[HoldemDeal] sleeve ${u.sleeveId}: getCardBytes done — ${imageData.byteLength} bytes source=${imageSource} (+${Date.now()-t0}ms)`);
          } catch (e) {
            console.warn(`[HoldemDeal] sleeve ${u.sleeveId}: getCardBytes THREW — ${e instanceof Error ? e.message : e} (+${Date.now()-t0}ms)`);
          }
        }
        console.log(`[HoldemDeal] sleeve ${u.sleeveId}: sendToSleeve start — bytes=${imageData?.byteLength ?? 0} source=${imageSource} (+${Date.now()-t0}ms)`);
        try {
          await sendToSleeve(u.sleeveId, u.descriptor, imageData);
          console.log(`[HoldemDeal] sleeve ${u.sleeveId}: sendToSleeve OK (+${Date.now()-t0}ms)`);
        } catch (e) {
          console.warn(`[HoldemDeal] sleeve ${u.sleeveId}: sendToSleeve ERROR — ${e instanceof Error ? e.message : e} (+${Date.now()-t0}ms)`);
        }
      }
      console.log(`[HoldemDeal] all sleeves done (+${Date.now()-t0}ms)`);
    } finally {
      console.log(`[HoldemDeal] finally — setBusy(false) (+${Date.now()-t0}ms)`);
      setBusy(false);
    }
  };

  const handleEnd = () => {
    Alert.alert('End Game', 'End this session and return to the game select screen?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Game',
        style: 'destructive',
        onPress: async () => {
          await clearHoldemGame();
          router.back();
        },
      },
    ]);
  };

  // Build player rows: each player has two sleeve IDs
  const players = Array.from({ length: state.playerCount }, (_, i) => {
    const p = i + 1;
    const s1 = (p - 1) * 2 + 1;
    const s2 = (p - 1) * 2 + 2;
    const slot1 = layout.get(s1)!;
    const slot2 = layout.get(s2)!;
    return {
      playerNumber: p,
      card1: state.sleeveCards[s1],
      card2: state.sleeveCards[s2],
      revealed1: isFaceUp(slot1, state.phase),
      revealed2: isFaceUp(slot2, state.phase),
    };
  });

  // Community cards
  const communityBase = state.playerCount * 2;
  const community = COMMUNITY_SLEEVE_LABELS.map((label, i) => {
    const sid = communityBase + i + 1;
    const slot = layout.get(sid)!;
    return {
      label,
      card: state.sleeveCards[sid],
      revealed: isFaceUp(slot, state.phase),
    };
  });

  const phaseLabel = state.phase.replace('_', ' ').toUpperCase();
  const sleeveTotal = totalSleeveCount(state.playerCount);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Phase header */}
      <View style={styles.phaseRow}>
        <View style={styles.phaseBadge}>
          <Text style={styles.phaseText}>{phaseLabel}</Text>
        </View>
        <Text style={styles.sleeveInfo}>{sleeveTotal} sleeves</Text>
      </View>

      {/* Advance button */}
      <Pressable
        style={({ pressed }) => [styles.advanceBtn, (pressed || busy) && styles.advanceBtnPressed]}
        onPress={handleAdvance}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#060c14" />
        ) : (
          <Text style={styles.advanceBtnLabel}>
            {PHASE_BUTTON_LABEL[state.phase]}  →
          </Text>
        )}
      </Pressable>

      {/* Players */}
      <Text style={styles.sectionHeader}>Players</Text>
      <View style={styles.tableCard}>
        {players.map((p, i) => (
          <View
            key={p.playerNumber}
            style={[styles.playerRow, i < players.length - 1 && styles.rowBorder]}
          >
            <Text style={styles.playerLabel}>Player {p.playerNumber}</Text>
            <View style={styles.cardPair}>
              <CardChip card={p.card1} revealed={false} />
              <CardChip card={p.card2} revealed={false} />
            </View>
          </View>
        ))}
      </View>

      {/* Community */}
      <Text style={styles.sectionHeader}>Community</Text>
      <View style={styles.tableCard}>
        <View style={styles.communityRow}>
          {community.slice(0, 3).map(c => (
            <View key={c.label} style={styles.communityCell}>
              <Text style={styles.communityLabel}>{c.label}</Text>
              <CardChip card={c.card} revealed={c.revealed} />
            </View>
          ))}
        </View>
        <View style={[styles.communityRow, styles.rowBorder, styles.communityRowTop]}>
          {community.slice(3).map(c => (
            <View key={c.label} style={styles.communityCell}>
              <Text style={styles.communityLabel}>{c.label}</Text>
              <CardChip card={c.card} revealed={c.revealed} />
            </View>
          ))}
        </View>
      </View>

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

  advanceBtn: {
    height: 56,
    borderRadius: 10,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  advanceBtnPressed: { opacity: 0.7 },
  advanceBtnLabel: { color: '#060c14', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },

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

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  playerLabel: { color: '#64b5c8', fontSize: 14, fontWeight: '600' },
  cardPair: { flexDirection: 'row', gap: 8 },

  chip: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#0a2c3d',
    borderWidth: 1,
    borderColor: '#0e7490',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipHidden: { borderColor: '#1a2535', backgroundColor: '#060f18' },
  chipText: { color: '#3a6070', fontSize: 14, fontWeight: '700' },

  communityRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  communityRowTop: { paddingTop: 12 },
  communityCell: { alignItems: 'center', gap: 4 },
  communityLabel: { color: '#3a6070', fontSize: 10, letterSpacing: 0.4 },

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
