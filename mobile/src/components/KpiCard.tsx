import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, fontSize, spacing } from '../theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  value: string | number;
  label: string;
  color: string;
}

export default function KpiCard({ icon, value, label, color }: Props) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconBox, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, width: '48%', marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  iconBox: {
    width: 48, height: 48, borderRadius: borderRadius.sm,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  value: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '700', marginBottom: 2 },
  label: { color: colors.textSecondary, fontSize: fontSize.sm },
});
