import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';
import type { CancelPrompt } from '@/lib/cancelCopy';

export type CancelSheetProps = {
  visible: boolean;
  copy: CancelPrompt;
  working: boolean;
  onKeep: () => void;
  onConfirm: () => void;
  // Opens the screen for moving the booking, when that is possible.
  onMove?: () => void;
};

// Asked before any booking is cancelled, declined or withdrawn. It says what
// happens to the session, the money and the other person, and puts anything
// the person may not expect (no refund, a late cancellation on an expert's
// record) in red. Keeping the booking is the easy answer: it is the first
// button, tapping outside does it, and so does the back button.
export const CancelSheet = ({
  visible,
  copy,
  working,
  onKeep,
  onConfirm,
  onMove,
}: CancelSheetProps) => {
  const close = () => {
    if (!working) onKeep();
  };
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={copy.keepLabel} />
      <View style={styles.sheet} accessibilityViewIsModal>
        {/* Scrolls on a short phone, so the buttons can always be reached. */}
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <Text style={styles.title} accessibilityRole="header">
          {copy.title}
        </Text>
        {copy.lines.map((line) => (
          <Text key={line} style={styles.body}>
            {line}
          </Text>
        ))}
        {copy.warning ? (
          <View style={styles.warningBox}>
            <Text style={styles.warning}>{copy.warning}</Text>
          </View>
        ) : null}
        <View style={styles.actions}>
          {copy.moveLabel && onMove ? (
            <Button title={copy.moveLabel} onPress={onMove} disabled={working} />
          ) : null}
          <Button title={copy.keepLabel} variant="secondary" onPress={close} disabled={working} />
          <Button
            title={copy.confirmLabel}
            variant="danger"
            onPress={onConfirm}
            loading={working}
          />
        </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
  },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  warningBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warning: { ...typography.bodyStrong, color: colors.danger },
  // Stacked, so long labels never squeeze and "keep" is always on top.
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
