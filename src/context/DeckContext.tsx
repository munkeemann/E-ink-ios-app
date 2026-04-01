import React, {createContext, useContext, useCallback} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Deck, Sleeve} from '../types';

const DECK_PREFIX = 'deck_';
const SLEEVES_KEY = 'sleeves';

interface DeckContextValue {
  loadAllDecks: () => Promise<Deck[]>;
  saveDeck: (deck: Deck) => Promise<void>;
  loadDeck: (name: string) => Promise<Deck | null>;
  deleteDeck: (name: string) => Promise<void>;

  loadSleeves: () => Promise<Sleeve[]>;
  saveSleeves: (sleeves: Sleeve[]) => Promise<void>;
}

const DeckContext = createContext<DeckContextValue | null>(null);

export function DeckProvider({children}: {children: React.ReactNode}) {
  const loadAllDecks = useCallback(async (): Promise<Deck[]> => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const deckKeys = keys.filter(k => k.startsWith(DECK_PREFIX));
      if (deckKeys.length === 0) {
        return [];
      }
      const pairs = await AsyncStorage.multiGet(deckKeys);
      return pairs
        .map(([, v]) => {
          try {
            return v ? (JSON.parse(v) as Deck) : null;
          } catch {
            return null;
          }
        })
        .filter((d): d is Deck => d !== null);
    } catch {
      return [];
    }
  }, []);

  const saveDeck = useCallback(async (deck: Deck): Promise<void> => {
    await AsyncStorage.setItem(`${DECK_PREFIX}${deck.name}`, JSON.stringify(deck));
  }, []);

  const loadDeck = useCallback(async (name: string): Promise<Deck | null> => {
    try {
      const val = await AsyncStorage.getItem(`${DECK_PREFIX}${name}`);
      return val ? (JSON.parse(val) as Deck) : null;
    } catch {
      return null;
    }
  }, []);

  const deleteDeck = useCallback(async (name: string): Promise<void> => {
    await AsyncStorage.removeItem(`${DECK_PREFIX}${name}`);
  }, []);

  const loadSleeves = useCallback(async (): Promise<Sleeve[]> => {
    try {
      const val = await AsyncStorage.getItem(SLEEVES_KEY);
      return val ? (JSON.parse(val) as Sleeve[]) : [];
    } catch {
      return [];
    }
  }, []);

  const saveSleeves = useCallback(async (sleeves: Sleeve[]): Promise<void> => {
    await AsyncStorage.setItem(SLEEVES_KEY, JSON.stringify(sleeves));
  }, []);

  return (
    <DeckContext.Provider
      value={{loadAllDecks, saveDeck, loadDeck, deleteDeck, loadSleeves, saveSleeves}}>
      {children}
    </DeckContext.Provider>
  );
}

export function useDeck(): DeckContextValue {
  const ctx = useContext(DeckContext);
  if (!ctx) {
    throw new Error('useDeck must be used inside DeckProvider');
  }
  return ctx;
}
