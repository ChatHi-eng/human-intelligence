import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { typography } from '@/constants/theme';

export type CallTimerProps = {
  startedAt: number;
};

const pad = (n: number) => n.toString().padStart(2, '0');

export const CallTimer = ({ startedAt }: CallTimerProps) => {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return <Text style={styles.text}>{`${pad(mins)}:${pad(secs)}`}</Text>;
};

const styles = StyleSheet.create({
  text: { ...typography.bodyStrong, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
});
