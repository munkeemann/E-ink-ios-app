# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**E-Cards** is a React Native (Expo) mobile app for managing Magic: The Gathering decks with hardware integration. Card images are sent to physical e-ink sleeves controlled by a Raspberry Pi server over Wi-Fi.

## Commands

```bash
npx expo start          # Start dev server (scan QR with Expo Go or simulator)
npx expo run:ios        # Build and run on iOS simulator/device
npx expo run:android    # Build and run on Android emulator/device
```

No test framework is configured. There is no lint script — TypeScript strict mode (`tsconfig.json`) is the primary static check.

## Architecture

### Navigation & Screens (`/app`)
Expo Router file-based routing:
- `index.tsx` — Deck list (home screen)
- `import.tsx` — Import a deck from pasted text; fetches card data and pre-caches art
- `deck/[id].tsx` — Deck preview; manage tokens, navigate to game
- `game/[id].tsx` — Core in-game UI: zone management, mulligan, scry, mill, token creation
- `scry.tsx` — Draggable card ordering for scry/surveil

### Data Layer (`/src`)
- `src/types/index.ts` — All TypeScript interfaces (`Deck`, `CardInstance`, `TokenTemplate`)
- `src/storage/deckStorage.ts` — AsyncStorage persistence under key `deck_v1`
- `src/api/scryfall.ts` — Scryfall API: bulk card data (24h cache in AsyncStorage), image fetching with per-card cache
- `src/api/piServer.ts` — HTTP to Raspberry Pi at `http://192.168.4.1:5050`; endpoints: `GET /sleeves`, `POST /display?sleeve_id=N`, `POST /clear?sleeve_id=N`

### Key Data Structures

**CardInstance** — one copy of a card in a deck:
```typescript
{
  baseName: string,       // canonical name ("Lightning Bolt")
  displayName: string,    // with duplicate counter ("Lightning Bolt 2")
  imagePath: string,      // Scryfall image URL
  place: string,          // "commander" | "1" | "2" | ... (library order)
  zone: string            // "LIB" | "HND" | "BTFLD" | "GRV" | "EXL" | "CMD"
}
```

**Deck**:
```typescript
{
  id: string,                   // timestamp-based
  name: string,
  commanderImagePath: string,
  colors: string[],             // ["W","U","B","R","G"]
  cards: CardInstance[],
  tokens?: TokenTemplate[]
}
```

### Hardware Integration
The app posts JPEG bytes of card images to the Pi server to render on physical e-ink sleeves. The Pi must be on the same Wi-Fi network (SSID `E-ink`). All Pi calls are fire-and-forget with graceful offline handling — sleeve display is a nice-to-have, not blocking.

## Development Notes

- The app is primarily tested on iOS. The `ios/` and `android/` native directories exist for `expo run:*` builds, not Expo Go.
- Scryfall bulk data is cached for 24 hours; card images are cached per-card. Both use AsyncStorage.
- Game state lives in React component state in `game/[id].tsx` — nothing is persisted mid-game. A fresh game always starts from a shuffled library.
- Token templates are stored per-deck in the `tokens` field of the `Deck` object.
- The color palette is dark Material 3: primary purple `#9C6ADE`, background `#1A1A2E`, surface `#2A2A3E`.
