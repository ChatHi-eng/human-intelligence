import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/constants/theme';

// Initials only make sense for a human-looking name. Anything id-like (digits,
// or one long unbroken token such as a UUID) falls back to a neutral glyph
// instead of raw id characters like "U7".
const NEUTRAL_GLYPH = '•';

const fallbackGlyph = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return NEUTRAL_GLYPH;
  if (/\d/.test(trimmed)) return NEUTRAL_GLYPH;
  if (!/\s/.test(trimmed) && trimmed.length >= 20) return NEUTRAL_GLYPH;
  const letters = trimmed
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part[0]);
  return letters.length > 0 ? letters.join('').toUpperCase() : NEUTRAL_GLYPH;
};

export type AvatarProps = {
  uri?: string | null;
  name: string;
  size?: number;
};

export const Avatar = ({ uri, name, size = 48 }: AvatarProps) => {
  const sizing = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, sizing]}
        transition={150}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[styles.fallback, sizing]}>
      <Text style={[styles.fallbackText, { fontSize: size * 0.4 }]}>{fallbackGlyph(name)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceAlt },
  fallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  fallbackText: { color: colors.textPrimary, fontWeight: '700' },
});
