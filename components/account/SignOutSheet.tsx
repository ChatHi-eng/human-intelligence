import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';

export type SignOutSheetProps = {
  visible: boolean;
  email: string | null;
  onClose: () => void;
  onSignOut: () => Promise<void>;
};

// Asks once before signing out. Getting back in means waiting for a new code
// by email, so a stray tap should not cost someone their session.
export const SignOutSheet = ({ visible, email, onClose, onSignOut }: SignOutSheetProps) => {
  const [working, setWorking] = useState(false);

  const confirm = async () => {
    setWorking(true);
    try {
      await onSignOut();
    } finally {
      setWorking(false);
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Stay signed in" />
      <View style={styles.sheet}>
        <Text style={styles.title}>Sign out?</Text>
        <Text style={styles.body}>
          {email ? `You're signed in as ${email}. ` : ''}
          To get back in, we&apos;ll email you a new code.
        </Text>
        <View style={styles.actions}>
          <Button
            title="Stay signed in"
            variant="secondary"
            onPress={onClose}
            disabled={working}
            style={{ flex: 1 }}
          />
          <Button
            title="Sign out"
            onPress={() => void confirm()}
            loading={working}
            style={{ flex: 1 }}
          />
        </View>
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
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
