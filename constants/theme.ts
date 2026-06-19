export const colors = {
  background: '#FFFFFF',
  surface: '#FAFAF7',
  surfaceAlt: '#F2EFEA',
  border: '#E8E4DC',
  textPrimary: '#0F0F0F',
  textSecondary: '#5C5A55',
  textMuted: '#9A958C',
  accent: '#E85D2A',
  accentSoft: '#FDE7DC',
  success: '#3F8F4A',
  warning: '#D89B22',
  danger: '#C8362B',
  overlay: 'rgba(15,15,15,0.55)',
  shadow: 'rgba(15,15,15,0.08)',
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

export const typography = {
  display: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.4 },
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

export const theme = { colors, spacing, radius, typography, shadow } as const;
export type Theme = typeof theme;
