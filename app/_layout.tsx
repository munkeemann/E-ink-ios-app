import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, StyleSheet, Text } from 'react-native';
import { loadSettings } from '../src/storage/deckStorage';
import { configurePiDebug } from '../src/api/piServer';
import { initCardBackVariant } from '../src/api/sleeveService';

export default function RootLayout() {
  useEffect(() => {
    loadSettings().then(s => configurePiDebug(s.devMode && s.piDebugAlerts));
    initCardBackVariant();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#292E32' },
          headerTintColor: '#D0BCFF',
          headerTitleStyle: { fontWeight: 'bold', color: '#D4CDC1' },
          contentStyle: { backgroundColor: '#292E32' },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
            contentStyle: { backgroundColor: '#060c14' },
          }}
        />
        <Stack.Screen
          name="mtg/index"
          options={{
            title: 'MTG Deck Manager',
            headerRight: () => (
              <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={styles.gearBtn}>
                <Text style={styles.gearIcon}>⚙️</Text>
              </Pressable>
            ),
          }}
        />
        <Stack.Screen
          name="coming-soon"
          options={{ title: '', contentStyle: { backgroundColor: '#060c14' } }}
        />
        <Stack.Screen
          name="holdem/setup"
          options={{ title: "Texas Hold'em", contentStyle: { backgroundColor: '#060c14' } }}
        />
        <Stack.Screen
          name="holdem/game"
          options={{ title: "Texas Hold'em", contentStyle: { backgroundColor: '#060c14' } }}
        />
        <Stack.Screen
          name="cah/setup"
          options={{ title: 'Cards Against Humanity', contentStyle: { backgroundColor: '#060c14' } }}
        />
        <Stack.Screen
          name="cah/game"
          options={{ title: 'Cards Against Humanity', contentStyle: { backgroundColor: '#060c14' } }}
        />
        <Stack.Screen
          name="cah/game_maxs"
          options={{ title: "CAH — Max's Rules", contentStyle: { backgroundColor: '#060c14' } }}
        />
        <Stack.Screen name="import" options={{ title: 'Import Deck' }} />
        <Stack.Screen name="deck/[id]" options={{ title: 'Deck Preview' }} />
        <Stack.Screen name="game/[id]" options={{ title: 'In Game' }} />
        <Stack.Screen name="scry" options={{ title: 'Scry' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gearBtn: { marginRight: 4 },
  gearIcon: { fontSize: 20 },
});
