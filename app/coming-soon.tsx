import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Theme, useTheme } from '../src/theme/colors';

export default function ComingSoonScreen() {
  const { game } = useLocalSearchParams<{ game: string }>();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔮</Text>
      <Text style={styles.title}>{game ?? 'Coming Soon'}</Text>
      <Text style={styles.subtitle}>Coming soon</Text>
    </View>
  );
}

function makeStyles(colors: Theme) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.app,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  icon: { fontSize: 48, marginBottom: 8 },
  title: {
    color: colors.accent.primary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
    textShadowColor: colors.overlay.accent40,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  subtitle: { color: colors.text.secondary, fontSize: 15, letterSpacing: 0.5 },
}); }
