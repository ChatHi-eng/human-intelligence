import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';

export type VideoTileProps = {
  name: string;
  isLocal?: boolean;
  size?: 'small' | 'large';
};

// Placeholder for the real Daily.co video track. Once the dev build is in place we
// swap this for <DailyMediaView /> bound to a CallObject participant.
export const VideoTile = ({ name, isLocal, size = 'large' }: VideoTileProps) => (
  <View style={[styles.tile, size === 'small' ? styles.small : styles.large]}>
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>{name}</Text>
      <Text style={styles.placeholderHint}>
        {isLocal ? 'You (camera preview will appear here)' : 'Live video here'}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  large: { flex: 1, minHeight: 320 },
  small: { width: 120, height: 160 },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  placeholderText: { ...typography.heading, color: '#FFFFFF' },
  placeholderHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
