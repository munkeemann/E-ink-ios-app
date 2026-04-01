/**
 * Root component.
 * GestureHandlerRootView is required by react-native-draggable-flatlist
 * (and react-native-gesture-handler in general).
 */
import React from 'react';
import {StyleSheet} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {DeckProvider} from './src/context/DeckContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <DeckProvider>
        <AppNavigator />
      </DeckProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
});
