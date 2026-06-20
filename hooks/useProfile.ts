import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchMyProfile,
  updateMyProfile,
  uploadImage,
  type ImageBucket,
  type ProfilePatch,
} from '@/services/api';
import { useAuthStore } from '@/store/authStore';

export const useMyProfile = () => {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['my-profile', userId],
    enabled: Boolean(userId),
    queryFn: () => (userId ? fetchMyProfile(userId) : Promise.resolve(null)),
  });
};

export const useUpdateMyProfile = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const refresh = useAuthStore((s) => s.refreshProfile);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      if (!userId) throw new Error('Not signed in');
      await updateMyProfile(userId, patch);
    },
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ['my-profile'] });
      void qc.invalidateQueries({ queryKey: ['my-expert-profile'] });
      void qc.invalidateQueries({ queryKey: ['experts'] });
      if (userId) void qc.invalidateQueries({ queryKey: ['expert', userId] });
      await refresh();
    },
  });
};

export const useUploadImage = () => {
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: async (input: { bucket: ImageBucket; uri: string; mimeType: string }) => {
      if (!userId) throw new Error('Not signed in');
      return uploadImage(input.bucket, userId, input.uri, input.mimeType);
    },
  });
};
