import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';

export type CallControlsProps = {
  muted: boolean;
  cameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEnd: () => void;
};

export const CallControls = ({
  muted,
  cameraOff,
  onToggleMute,
  onToggleCamera,
  onEnd,
}: CallControlsProps) => (
  <View style={styles.container}>
    <ControlButton label={muted ? 'Unmute' : 'Mute'} onPress={onToggleMute} active={muted} />
    <ControlButton
      label={cameraOff ? 'Start video' : 'Stop video'}
      onPress={onToggleCamera}
      active={cameraOff}
    />
    <Pressable onPress={onEnd} style={[styles.button, styles.endButton]}>
      <Text style={[styles.label, styles.endLabel]}>End</Text>
    </Pressable>
  </View>
);

type ControlButtonProps = {
  label: string;
  onPress: () => void;
  active?: boolean;
};

const ControlButton = ({ label, onPress, active }: ControlButtonProps) => (
  <Pressable onPress={onPress} style={[styles.button, active && styles.activeButton]}>
    <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  label: { ...typography.bodyStrong, color: '#FFFFFF' },
  activeButton: { backgroundColor: '#FFFFFF' },
  activeLabel: { color: colors.textPrimary },
  endButton: { backgroundColor: colors.danger },
  endLabel: { color: '#FFFFFF' },
});
