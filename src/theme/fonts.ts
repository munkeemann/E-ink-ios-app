/**
 * App-wide font families. Cinzel for display/headers (engraved-stone Roman
 * capitals), EB Garamond for body (old-press serif).
 *
 * Theme-independent — same families across DEFAULT/SLATE/ARCANE — so this
 * lives outside src/theme/colors.ts. Same precedent as src/mtg/zoneColors.ts
 * (shared tokens that don't vary per theme).
 *
 * Loaded once in app/_layout.tsx via useFonts(). The string values must
 * match the named exports from @expo-google-fonts/* packages, which double
 * as both the import name and the runtime-registered fontFamily.
 *
 * Usage:
 *   import { fonts } from '../src/theme/fonts';
 *   const styles = StyleSheet.create({
 *     title: { fontFamily: fonts.displayBold, fontSize: 24 },
 *     body:  { fontFamily: fonts.body,        fontSize: 15 },
 *   });
 */
export const fonts = {
  display: 'Cinzel_600SemiBold',
  displayBold: 'Cinzel_700Bold',
  displayRegular: 'Cinzel_400Regular',
  body: 'EBGaramond_400Regular',
  bodyItalic: 'EBGaramond_400Regular_Italic',
  bodyBold: 'EBGaramond_700Bold',
} as const;

export type FontKey = keyof typeof fonts;
