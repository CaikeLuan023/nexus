import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, spacing } from '../theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  color?: string;
}

export default function SectionHeader({ icon, title, color = colors.primary }: Props) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={color} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, marginTop: spacing.lg },
  icon: { marginRight: spacing.sm },
  title: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: '700' },
});
