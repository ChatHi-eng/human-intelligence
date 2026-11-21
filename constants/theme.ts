// Palam theme. The look is a people marketplace: white and light, photos of
// experts carry the color, and Palam green appears only on the main action
// and the "vetted" mark. Every screen and component pulls from here; no
// magic numbers in component files.

export const colors = {
  background: '#FFFFFF',
  // Neutral greys with no green cast: the green is saved for the accent.
  surface: '#F7F7F6',
  surfaceAlt: '#EFEFED',
  border: '#E4E5E3',
  textPrimary: '#1C1F1D',
  textSecondary: '#5F6662',
  textMuted: '#6B726E',
  accent: '#0F6E56',
  // Darker green for small green text, which needs more contrast than a fill.
  accentInk: '#0B5642',
  accentSoft: '#E1F5EE',
  success: '#0B5642',
  successSoft: '#E1F5EE',
  warning: '#8A5A0B',
  warningSoft: '#FBF1DC',
  danger: '#C0392B',
  dangerSoft: '#FBEAE7',
  overlay: 'rgba(28,31,29,0.5)',
  shadow: 'rgba(0,0,0,0.06)',
} as const;

// Soft grounds for an expert who has no photo yet, picked by name so the
// same person always gets the same one.
export const portraitTints = [
  { background: '#F5DDD3', ink: '#7A3A20' },
  { background: '#D9E6F5', ink: '#1F4A7A' },
  { background: '#F3E6C4', ink: '#6B4A0B' },
  { background: '#DCEBDD', ink: '#2C5A33' },
  { background: '#E8DDF2', ink: '#51357A' },
  { background: '#F2DCE4', ink: '#7A2F4A' },
] as const;

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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

// Manrope is loaded in app/_layout.tsx via @expo-google-fonts/manrope.
// Font families encode weight (static font files), so tokens set the family
// rather than fontWeight — combining both breaks weight selection on Android.
export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

// Size does the work of hierarchy; nothing is heavier than semi-bold except
// the wordmark.
export const typography = {
  display: { fontFamily: fonts.semiBold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: fonts.semiBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.semiBold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
} as const;

export const shadow = {
  // Cards sit on a hairline, not a shadow. This is only a hint of lift.
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 0,
  },
  floating: {
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

export const theme = { colors, spacing, radius, typography, fonts, shadow } as const;
export type Theme = typeof theme;
