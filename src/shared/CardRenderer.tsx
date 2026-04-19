import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export interface CardRendererRef {
  capture(text: string, scheme: 'black' | 'white'): Promise<ArrayBuffer>;
}

interface CardState {
  text: string;
  scheme: 'black' | 'white';
}

const CardRenderer = forwardRef<CardRendererRef>((_, ref) => {
  const viewRef = useRef<View>(null);
  const [card, setCard] = useState<CardState>({ text: '', scheme: 'white' });
  const resolveRef = useRef<((buf: ArrayBuffer) => void) | null>(null);
  const rejectRef = useRef<((err: unknown) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    async capture(text: string, scheme: 'black' | 'white'): Promise<ArrayBuffer> {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        resolveRef.current = resolve;
        rejectRef.current = reject;
        setCard({ text, scheme });
      });
    },
  }));

  const handleLayout = async () => {
    if (!resolveRef.current) return;
    const resolve = resolveRef.current;
    const reject = rejectRef.current!;
    resolveRef.current = null;
    rejectRef.current = null;

    try {
      const uri = await captureRef(viewRef, {
        format: 'jpg',
        quality: 0.85,
        result: 'base64',
      });
      // Convert base64 to ArrayBuffer
      const binary = atob(uri);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      resolve(buf.buffer as ArrayBuffer);
    } catch (err) {
      reject(err);
    }
  };

  const isBlack = card.scheme === 'black';

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View
        ref={viewRef}
        style={[styles.card, isBlack ? styles.cardBlack : styles.cardWhite]}
        onLayout={handleLayout}
        collapsable={false}
      >
        <Text style={[styles.cardText, isBlack ? styles.cardTextBlack : styles.cardTextWhite]}>
          {card.text}
        </Text>
        <Text style={[styles.cardFooter, isBlack ? styles.footerBlack : styles.footerWhite]}>
          {isBlack ? '■ CAH' : '□ CAH'}
        </Text>
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
});
