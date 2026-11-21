import { Image } from 'expo-image';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, fonts, portraitTints, radius } from '@/constants/theme';

// Initials only make sense for a human-looking name. Anything id-like (digits,
// or one long unbroken token such as a UUID) falls back to a neutral glyph
// instead of raw id characters like "U7".
const NEUTRAL_GLYPH = '•';

export const fallbackGlyph = (name: string): string => {
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

// The same person always gets the same soft ground.
export const tintFor = (name: string) => {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return portraitTints[sum % portraitTints.length] ?? portraitTints[0];
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
  const tint = tintFor(name);
  return (
    <View style={[styles.fallback, sizing, { backgroundColor: tint.background }]}>
      <Text style={[styles.fallbackText, { fontSize: size * 0.36, color: tint.ink }]}>
        {fallbackGlyph(name)}
      </Text>
    </View>
  );
};

export type PortraitProps = {
  uri?: string | null;
  name: string;
  /** Height in points; the portrait fills the width it is given. */
  height: number;
  rounded?: boolean;
  style?: ViewStyle;
};

// The big picture of a person on Discover and at the top of a profile. With
// no photo it is a soft coloured ground with their initials, so a row of
// experts still looks like a row of people.
export const Portrait = ({ uri, name, height, rounded = true, style }: PortraitProps) => {
  const shape = { height, borderRadius: rounded ? radius.lg : 0 };
  if (uri) {
    return (
      <View style={[styles.portrait, shape, style]}>
        <Image
          source={{ uri }}
          style={styles.portraitImage}
          transition={150}
          contentFit="cover"
          contentPosition="top"
        />
      </View>
    );
  }
  const tint = tintFor(name);
  return (
    <View style={[styles.portrait, styles.portraitFallback, shape, { backgroundColor: tint.background }, style]}>
      <Text style={[styles.portraitText, { fontSize: Math.min(height * 0.3, 64), color: tint.ink }]}>
        {fallbackGlyph(name)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceAlt },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  fallbackText: { fontFamily: fonts.semiBold },
  portrait: { width: '100%', backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  portraitImage: { width: '100%', height: '100%' },
  portraitFallback: { alignItems: 'center', justifyContent: 'center' },
  portraitText: { fontFamily: fonts.medium, letterSpacing: -0.5 },
});
