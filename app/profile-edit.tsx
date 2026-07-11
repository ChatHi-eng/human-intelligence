import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile, useUpdateMyProfile, useUploadImage } from '@/hooks/useProfile';

export default function ProfileEditScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: profile, isLoading } = useMyProfile();
  const { mutate: update, isPending: saving } = useUpdateMyProfile();
  const { mutateAsync: upload, isPending: uploading } = useUploadImage();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setAvatarUrl(profile.avatarUrl);
    }
  }, [profile]);

  const onPickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Photo permission needed' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    try {
      const url = await upload({
        bucket: 'avatars',
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setAvatarUrl(url);
      Toast.show({ type: 'success', text1: 'Photo uploaded' });
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Upload failed',
        text2: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const onSave = () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      Toast.show({ type: 'error', text1: 'Name cannot be empty' });
      return;
    }
    update(
      { displayName: trimmedName, avatarUrl },
      {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: 'Account updated' });
          router.back();
        },
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not save',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  if (isLoading || !user) return <LoadingView label="Loading your account…" />;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SectionHeader
          title="Edit account"
          caption="Basic info. If you're an expert, edit your public expert profile separately."
        />

        <View style={styles.avatarRow}>
          <Avatar uri={avatarUrl} name={displayName || 'You'} size={96} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Button
              title={uploading ? 'Uploading…' : 'Change photo'}
              variant="secondary"
              onPress={onPickAvatar}
              disabled={uploading}
            />
            {avatarUrl && (
              <Pressable onPress={() => setAvatarUrl(null)}>
                <Text style={styles.removeText}>Remove photo</Text>
              </Pressable>
            )}
          </View>
        </View>

        <Text style={styles.label}>Name</Text>
        <TextInput
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
          value={displayName}
          onChangeText={setDisplayName}
          style={styles.input}
          maxLength={80}
        />

        <Button
          title="Save"
          onPress={onSave}
          loading={saving}
          fullWidth
          style={{ marginTop: spacing.lg }}
        />
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} fullWidth />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  removeText: { ...typography.caption, color: colors.danger, textAlign: 'center' },
  label: { ...typography.label, color: colors.textSecondary, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
