import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, StyleSheet, Text } from 'react-native';
import { loadSettings } from '../src/storage/deckStorage';
import { configurePiDebug } from '../src/api/piServer';

export default function RootLayout() {
  useEffect(() => {
    loadSettings().then(s => configurePiDebug(s.devMode && s.piDebugAlerts));
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
            title: 'MTG Deck Manager',
            headerRight: () => (
              <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={styles.gearBtn}>
                <Text style={styles.gearIcon}>⚙️</Text>
              </Pressable>
            ),
          }}
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
