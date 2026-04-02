import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#e0c070',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#0d0d1a' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'MTG Deck Manager' }} />
        <Stack.Screen name="import" options={{ title: 'Import Deck' }} />
        <Stack.Screen name="deck/[id]" options={{ title: 'Deck Preview' }} />
        <Stack.Screen name="game/[id]" options={{ title: 'In Game' }} />
        <Stack.Screen name="scry" options={{ title: 'Scry' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
