import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { expertShareUrl } from '@/constants/links';

// Copies an expert's public web link and confirms with a toast. Used by the
// You tab and Studio "Share your profile" buttons.
export const copyExpertShareLink = async (expertId: string): Promise<void> => {
  const url = expertShareUrl(expertId);
  try {
    await Clipboard.setStringAsync(url);
    Toast.show({ type: 'success', text1: 'Link copied', text2: url });
  } catch {
    Toast.show({ type: 'error', text1: 'Could not copy', text2: url });
  }
};
