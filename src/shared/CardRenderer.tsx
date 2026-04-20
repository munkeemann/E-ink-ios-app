import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export interface CardRendererRef {
  capture(text: string, scheme: 'black' | 'white'): Promise<ArrayBuffer>;
  captureHoldem(rank: string, suit: string): Promise<ArrayBuffer>;
}

interface CardState {
  text: string;
  scheme: 'black' | 'white' | 'holdem';
  rank?: string;
  suit?: string;
}

function rafTick(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function toArrayBuffer(base64: string): Promise<ArrayBuffer> {
  const binary = atob(base64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer as ArrayBuffer;
}

const CardRenderer = forwardRef<CardRendererRef>((_, ref) => {
  const viewRef = useRef<View>(null);
  const [card, setCard] = useState<CardState>({ text: '', scheme: 'white' });

  useImperativeHandle(ref, () => ({
    async capture(text: string, scheme: 'black' | 'white'): Promise<ArrayBuffer> {
      setCard({ text, scheme });
      await rafTick();
      const uri = await captureRef(viewRef, { format: 'jpg', quality: 0.85, result: 'base64' });
      return toArrayBuffer(uri);
    },
    async captureHoldem(rank: string, suit: string): Promise<ArrayBuffer> {
      setCard({ text: '', scheme: 'holdem', rank, suit });
      await rafTick();
      const uri = await captureRef(viewRef, { format: 'jpg', quality: 0.85, result: 'base64' });
      return toArrayBuffer(uri);
    },
  }));

  const isBlack = card.scheme === 'black';
  const isHoldem = card.scheme === 'holdem';

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View
        ref={viewRef}
        style={[styles.card, isHoldem ? styles.cardHoldem : isBlack ? styles.cardBlack : styles.cardWhite]}
        collapsable={false}
      >
        {isHoldem ? (
          <>
            <Text style={styles.holdemRank}>{card.rank}</Text>
            <Text style={styles.holdemSuit}>{card.suit}</Text>
          </>
        ) : (
          <>
            <Text style={[styles.cardText, isBlack ? styles.cardTextBlack : styles.cardTextWhite]}>
              {card.text}
            </Text>
            <Text style={[styles.cardFooter, isBlack ? styles.footerBlack : styles.footerWhite]}>
              {isBlack ? '■ CAH' : '□ CAH'}
            </Text>
          </>
        )}
      </View>
    </View>
  );
});

CardRenderer.displayName = 'CardRenderer';

export default CardRenderer;

const CARD_W = 296;
const CARD_H = 416;

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    width: CARD_W,
    height: CARD_H,
    overflow: 'hidden',
  },

  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 12,
    padding: 24,
    justifyContent: 'space-between',
  },
  cardBlack: { backgroundColor: '#050505' },
  cardWhite: { backgroundColor: '#f5f0e8' },
  cardHoldem: { backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'space-between', padding: 16 },

  cardText: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    flex: 1,
  },
  cardTextBlack: { color: '#ffffff' },
  cardTextWhite: { color: '#111111' },

  cardFooter: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 12,
  },
  footerBlack: { color: '#888888' },
  footerWhite: { color: '#444444' },

  holdemRank: {
    fontSize: 120,
    fontWeight: '900',
    color: '#111111',
    lineHeight: 132,
    textAlign: 'center',
  },
  holdemSuit: {
    fontSize: 108,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
  },
});
