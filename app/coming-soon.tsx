import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function ComingSoonScreen() {
  const { game } = useLocalSearchParams<{ game: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔮</Text>
      <Text style={styles.title}>{game ?? 'Coming Soon'}</Text>
      <Text style={styles.subtitle}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060c14',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  icon: { fontSize: 48, marginBottom: 8 },
  title: {
    color: '#22d3ee',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
    textShadowColor: 'rgba(34,211,238,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  subtitle: { color: '#64b5c8', fontSize: 15, letterSpacing: 0.5 },
});
