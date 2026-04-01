import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {RootStackParamList} from '../types';
import SavedDecksScreen from '../screens/SavedDecksScreen';
import DeckImportScreen from '../screens/DeckImportScreen';
import DeckPreviewScreen from '../screens/DeckPreviewScreen';
import GameScreen from '../screens/GameScreen';
import ScryScreen from '../screens/ScryScreen';
import GraveyardScreen from '../screens/GraveyardScreen';
import SleeveManagerScreen from '../screens/SleeveManagerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const HEADER = {
  headerStyle: {backgroundColor: '#0C1F29'},
  headerTintColor: '#8AA2AE',
  headerTitleStyle: {fontWeight: 'bold' as const, color: '#8083D3'},
  contentStyle: {backgroundColor: '#0C1F29'},
};

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="SavedDecks" screenOptions={HEADER}>
        <Stack.Screen
          name="SavedDecks"
          component={SavedDecksScreen}
          options={{title: 'Decks'}}
        />
        <Stack.Screen
          name="DeckImport"
          component={DeckImportScreen}
          options={{title: 'Import Deck'}}
        />
        <Stack.Screen
          name="DeckPreview"
          component={DeckPreviewScreen}
          options={({route}) => ({title: route.params.deckName})}
        />
        <Stack.Screen
          name="Game"
          component={GameScreen}
          options={({route}) => ({title: route.params.deckName})}
        />
        <Stack.Screen
          name="Scry"
          component={ScryScreen}
          options={({route}) => ({title: `Scry ${route.params.scryCount}`})}
        />
        <Stack.Screen
          name="Graveyard"
          component={GraveyardScreen}
          options={{title: 'Graveyard'}}
        />
        <Stack.Screen
          name="SleeveManager"
          component={SleeveManagerScreen}
          options={{title: 'Sleeve Manager'}}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
