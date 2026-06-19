import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { initials } from '@/lib/format';

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
      <Text style={[styles.fallbackText, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
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
