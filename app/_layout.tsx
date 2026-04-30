import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { loadSettings, syncSleeveCountFromPi } from '../src/storage/deckStorage';
import { configurePiDebug } from '../src/api/piServer';
import { ThemeProvider, useTheme } from '../src/theme/colors';

function StackWithTheme() {
  const colors = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg.app },
        headerTintColor: colors.accent.primary,
        headerTitleStyle: { fontWeight: 'bold', color: colors.text.primary },
        contentStyle: { backgroundColor: colors.bg.app },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg.app },
        }}
      />
      <Stack.Screen
        name="mtg/index"
        options={{ title: 'MTG Deck Manager' }}
      />
      <Stack.Screen
        name="coming-soon"
        options={{ title: '', contentStyle: { backgroundColor: colors.bg.app } }}
      />
      <Stack.Screen
        name="holdem/setup"
        options={{ title: "Texas Hold'em", contentStyle: { backgroundColor: colors.bg.app } }}
      />
      <Stack.Screen
        name="holdem/game"
        options={{ title: "Texas Hold'em", contentStyle: { backgroundColor: colors.bg.app } }}
      />
      <Stack.Screen
        name="cah/setup"
        options={{ title: 'Cards Against Humanity', contentStyle: { backgroundColor: colors.bg.app } }}
      />
      <Stack.Screen
        name="cah/game"
        options={{ title: 'Cards Against Humanity', contentStyle: { backgroundColor: colors.bg.app } }}
      />
      <Stack.Screen
        name="cah/game_maxs"
        options={{ title: "CAH — Max's Rules", contentStyle: { backgroundColor: colors.bg.app } }}
      />
      <Stack.Screen
        name="dnd/index"
        options={{ title: 'D&D Decks', contentStyle: { backgroundColor: colors.bg.app } }}
      />
      <Stack.Screen
        name="dnd/new"
        options={{ title: 'New D&D Deck', contentStyle: { backgroundColor: colors.bg.app } }}
      />
      <Stack.Screen
        name="dnd/[id]"
        options={{ title: 'Deck', contentStyle: { backgroundColor: colors.bg.app } }}
      />
      <Stack.Screen name="import" options={{ title: 'Import Deck' }} />
      <Stack.Screen name="deck/[id]" options={{ title: 'Deck Preview' }} />
      <Stack.Screen name="game/[id]" options={{ title: 'In Game' }} />
      <Stack.Screen name="scry" options={{ title: 'Scry' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    loadSettings().then(s => configurePiDebug(s.devMode && s.piDebugAlerts));
    syncSleeveCountFromPi().catch(e => console.warn('[settings] sleeveCount sync failed:', e));
  }, []);

  return (
    <GestureHandlerRootView style={rootStyles.root}>
      <ThemeProvider>
        <StackWithTheme />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const rootStyles = StyleSheet.create({
  root: { flex: 1 },
});
