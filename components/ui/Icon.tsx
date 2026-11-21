import Feather from '@expo/vector-icons/Feather';
import { colors } from '@/constants/theme';

export type IconName = keyof typeof Feather.glyphMap;

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

// The one icon set in the app (Feather line icons). Icons take the colour of
// the text they sit beside; they never bring their own.
export const Icon = ({ name, size = 18, color = colors.textSecondary }: IconProps) => (
  <Feather name={name} size={size} color={color} />
);
