// Palam brand theme — deep green + mint on white, Manrope type.
// Every screen/component pulls from here; no magic numbers in component files.

export const colors = {
  background: '#FFFFFF',
  surface: '#F6F9F7',
  surfaceAlt: '#EBF2EE',
  border: '#DFE8E3',
  textPrimary: '#12211B',
  textSecondary: '#54655D',
  textMuted: '#8A9A91',
  accent: '#0F6E56',
  accentSoft: '#E1F5EE',
  success: '#1D9E75',
  warning: '#BA7517',
  danger: '#C0392B',
  overlay: 'rgba(18,33,27,0.55)',
  shadow: 'rgba(18,33,27,0.08)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

// Manrope is loaded in app/_layout.tsx via @expo-google-fonts/manrope.
// Font families encode weight (static font files), so tokens set the family
// rather than fontWeight — combining both breaks weight selection on Android.
export const fonts = {
  regular: 'Manrope_400Regular',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 32, letterSpacing: -0.5 },
  title: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.semiBold, fontSize: 18 },
  body: { fontFamily: fonts.regular, fontSize: 15 },
  bodyStrong: { fontFamily: fonts.semiBold, fontSize: 15 },
  caption: { fontFamily: fonts.regular, fontSize: 13 },
  label: { fontFamily: fonts.semiBold, fontSize: 12, letterSpacing: 0.4 },
} as const;

export const shadow = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 6,
  },
} as const;

export const theme = { colors, spacing, radius, typography, fonts, shadow } as const;
export type Theme = typeof theme;
