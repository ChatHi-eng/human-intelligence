import { useMutation } from '@tanstack/react-query';
import { deleteMyAccount } from '@/services/account';

export const useDeleteAccount = () =>
  useMutation({
    mutationFn: deleteMyAccount,
  });
