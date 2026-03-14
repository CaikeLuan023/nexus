import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, borderRadius, fontSize, spacing } from '../theme';
import type { ChamadoRecente } from '../types';

const statusColors: Record<string, string> = {
  aberto: colors.info,
  em_andamento: colors.warning,
  resolvido: colors.success,
  fechado: colors.textMuted,
  pendente: colors.warningDark,
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function RecentTicketItem({ item }: { item: ChamadoRecente }) {
  const dotColor = statusColors[item.status] || colors.textMuted;
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{item.titulo}</Text>
        <Text style={styles.meta}>{item.provedor_nome} · {item.categoria}</Text>
      </View>
      <View style={styles.right}>
        <View style={[styles.badge, { backgroundColor: dotColor + '22' }]}>
          <Text style={[styles.badgeText, { color: dotColor }]}>{item.status.replace('_', ' ')}</Text>
        </View>
        <Text style={styles.date}>{formatDate(item.data_abertura)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard, borderRadius: borderRadius.sm,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  info: { flex: 1, marginRight: spacing.sm },
  title: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '600', marginBottom: 2 },
  meta: { color: colors.textMuted, fontSize: fontSize.xs },
  right: { alignItems: 'flex-end' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginBottom: 4 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  date: { color: colors.textMuted, fontSize: fontSize.xs },
});
