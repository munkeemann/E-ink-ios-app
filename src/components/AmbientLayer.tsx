import { useCallback, useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const { width: W, height: H } = Dimensions.get('window');

const TEAL = '#88DBD9';
const PURPLE_R = 128;
const PURPLE_G = 131;
const PURPLE_B = 211;

const SYMBOLS = ['✦', '☽', '◈', '✧', '⬡', '◉', '✶', '❖', '⟐', '✺'];
const GLYPH_R = 20;

// ── Seeded pseudo-random for stable layout between renders ────────────────────
function mkRand(seed: number) {
  let s = seed | 0;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
const rand = mkRand(137);

// ── Config types ──────────────────────────────────────────────────────────────
interface GlyphCfg {
  id: number;
  symbol: string;
  x: number;       // px from left (centre of glyph)
  dur: number;     // traversal ms
  delay: number;   // initial delay ms
}
interface ParticleCfg {
  id: number;
  x: number;
  r: number;
  dur: number;
  delay: number;
  maxOp: number;
}

// Generated once at module load — deterministic from seed
const GLYPH_CFGS: GlyphCfg[] = Array.from({ length: 7 }, (_, i) => ({
  id: i,
  symbol: SYMBOLS[i % SYMBOLS.length],
  x: Math.round(rand() * (W - GLYPH_R * 6) + GLYPH_R * 3),
  dur: Math.round((20 + rand() * 10) * 1000),
  delay: Math.round(rand() * 26000),
}));

const PARTICLE_CFGS: ParticleCfg[] = Array.from({ length: 35 }, (_, i) => ({
  id: i,
  x: Math.round(rand() * (W - 12) + 6),
  r: parseFloat((1.5 + rand() * 0.5).toFixed(2)),
  dur: Math.round((8 + rand() * 4) * 1000),
  delay: Math.round(rand() * 11000),
  maxOp: parseFloat((0.22 + rand() * 0.18).toFixed(2)),
}));

// ── Radial vignette glow ──────────────────────────────────────────────────────
// Single SVG RadialGradient: transparent at centre, purple at edges.
// No per-edge strips means no corner intersections / plaid artefact.
// Breathing drives the Rect's fillOpacity between 0.3 and 0.6.

const PURPLE_HEX = `#${PURPLE_R.toString(16).padStart(2,'0')}${PURPLE_G.toString(16).padStart(2,'0')}${PURPLE_B.toString(16).padStart(2,'0')}`;

function EdgeGlows({ active }: { active: boolean }) {
  const breathe = useSharedValue(0.3);

  useEffect(() => {
    if (!active) { cancelAnimation(breathe); return; }
    breathe.value = 0.3;
    breathe.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.3, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(breathe);
  }, [active]);

  const animProps = useAnimatedProps(() => ({ fillOpacity: breathe.value }));

  return (
    <Svg
      width={W}
      height={H}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient
          id="vignette"
          cx="50%"
          cy="50%"
          rx="70%"
          ry="70%"
          fx="50%"
          fy="50%"
        >
          <Stop offset="0%"   stopColor={PURPLE_HEX} stopOpacity="0" />
          <Stop offset="100%" stopColor={PURPLE_HEX} stopOpacity="1" />
        </RadialGradient>
      </Defs>
      <AnimatedRect
        x="0"
        y="0"
        width={W}
        height={H}
        fill="url(#vignette)"
        animatedProps={animProps}
      />
    </Svg>
  );
}

// ── Single glyph ──────────────────────────────────────────────────────────────
// Rises from below the screen to above it. translateY drives opacity via
// interpolate (0 at bottom/top, 1 at 50% screen height) and a full 360°
// rotation over each traversal cycle.

const GLYPH_OFF = GLYPH_R * 2 + 20;  // px off-screen buffer

function Glyph({ cfg, active }: { cfg: GlyphCfg; active: boolean }) {
  const y   = useSharedValue(H + GLYPH_OFF);
  const rot = useSharedValue(0);

  useEffect(() => {
    if (!active) { cancelAnimation(y); cancelAnimation(rot); return; }
    y.value = H + GLYPH_OFF;
    y.value = withDelay(
      cfg.delay,
      withRepeat(
        withTiming(-GLYPH_OFF, { duration: cfg.dur, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    rot.value = 0;
    rot.value = withDelay(
      cfg.delay,
      withRepeat(
        withTiming(360, { duration: cfg.dur, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    return () => { cancelAnimation(y); cancelAnimation(rot); };
  }, [active]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      y.value,
      [-GLYPH_OFF, H * 0.5, H + GLYPH_OFF],
      [0, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      { translateY: y.value },
      { rotate: `${rot.value}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.glyphWrap, { left: cfg.x - GLYPH_R }, animStyle]}>
      <View style={styles.glyphCircle}>
        <Text style={styles.glyphSymbol}>{cfg.symbol}</Text>
      </View>
    </Animated.View>
  );
}

// ── Single particle ───────────────────────────────────────────────────────────

function Particle({ cfg, active }: { cfg: ParticleCfg; active: boolean }) {
  const POFF = cfg.r + 10;
  const y = useSharedValue(H + POFF);

  useEffect(() => {
    if (!active) { cancelAnimation(y); return; }
    y.value = H + POFF;
    y.value = withDelay(
      cfg.delay,
      withRepeat(
        withTiming(-POFF, { duration: cfg.dur, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(y);
  }, [active]);

  const d = cfg.r * 2;
  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      y.value,
      [-POFF, H * 0.5, H + POFF],
      [0, cfg.maxOp, 0],
      Extrapolation.CLAMP,
    ),
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        { left: cfg.x - cfg.r, width: d, height: d, borderRadius: cfg.r },
        animStyle,
      ]}
    />
  );
}

// ── Ambient layer — position:absolute behind all UI ───────────────────────────

export default function AmbientLayer({ active }: { active: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <EdgeGlows active={active} />
      {GLYPH_CFGS.map(cfg => (
        <Glyph key={cfg.id} cfg={cfg} active={active} />
      ))}
      {PARTICLE_CFGS.map(cfg => (
        <Particle key={cfg.id} cfg={cfg} active={active} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  glyphWrap: {
    position: 'absolute',
    top: 0,
    width: GLYPH_R * 2,
    height: GLYPH_R * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphCircle: {
    width: GLYPH_R * 2,
    height: GLYPH_R * 2,
    borderRadius: GLYPH_R,
    borderWidth: 1.5,
    borderColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    // glow via shadow (iOS) / elevation (Android)
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 4,
  },
  glyphSymbol: {
    color: TEAL,
    fontSize: 13,
    lineHeight: 15,
    textAlign: 'center',
    includeFontPadding: false,
    textShadowColor: TEAL,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  particle: {
    position: 'absolute',
    top: 0,
    backgroundColor: TEAL,
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 4,
  },
});
