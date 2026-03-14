import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../../services/api';
import { colors, gradients, spacing, borderRadius, fontSize } from '../../theme';
import type { VendaContrato } from '../../types';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: colors.warning },
  enviado: { label: 'Enviado', color: colors.info },
  assinado: { label: 'Assinado', color: colors.success },
  cancelado: { label: 'Cancelado', color: colors.danger },
};

const FILTER_OPTIONS = [
  { key: 'todos', label: 'Todos' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'enviado', label: 'Enviados' },
  { key: 'assinado', label: 'Assinados' },
];

function ContratoCard({ item }: { item: VendaContrato }) {
  const cfg = STATUS_CONFIG[item.status] || { label: item.status, color: colors.textMuted };
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.topRow}>
        <Text style={cardStyles.titulo} numberOfLines={1}>{item.titulo}</Text>
        <View style={[cardStyles.badge, { backgroundColor: cfg.color + '22', borderColor: cfg.color + '44' }]}>
          <Text style={[cardStyles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      <Text style={cardStyles.cliente} numberOfLines={1}>
        <Ionicons name="person-outline" size={12} color={colors.textMuted} /> {item.provedor_nome}
      </Text>
      <View style={cardStyles.bottomRow}>
        {item.valor_mensal > 0 && (
          <Text style={cardStyles.valor}>R$ {item.valor_mensal.toFixed(2)}/mes</Text>
        )}
        {item.data_inicio && (
          <Text style={cardStyles.data}>{item.data_inicio.slice(0, 10)}</Text>
        )}
        {item.numero_contrato && (
          <Text style={cardStyles.numero}>#{item.numero_contrato}</Text>
        )}
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  titulo: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '700', flex: 1, marginRight: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm, borderWidth: 1 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600' },
  cliente: { color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.xs },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  valor: { color: colors.success, fontSize: fontSize.sm, fontWeight: '600' },
  data: { color: colors.textMuted, fontSize: fontSize.xs },
  numero: { color: colors.textMuted, fontSize: fontSize.xs, marginLeft: 'auto' },
});

export default function ContratoListScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [contratos, setContratos] = useState<VendaContrato[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('todos');

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getContratos();
      setContratos(data);
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', fetchData);
    return unsub;
  }, [navigation, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (activeFilter === 'todos') return contratos;
    return contratos.filter(c => c.status === activeFilter);
  }, [contratos, activeFilter]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <Text style={styles.headerTitle}>Contratos</Text>
        <Text style={styles.headerSub}>{contratos.length} total</Text>
      </LinearGradient>

      {/* Filter Chips */}
      <FlatList
        horizontal showsHorizontalScrollIndicator={false}
        data={FILTER_OPTIONS} keyExtractor={item => item.key}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const isActive = activeFilter === item.key;
          const chipColor = item.key === 'todos' ? colors.primary : (STATUS_CONFIG[item.key]?.color || colors.primary);
          return (
            <TouchableOpacity
              style={[styles.filterChip, isActive && { backgroundColor: chipColor + '22', borderColor: chipColor }]}
              onPress={() => setActiveFilter(item.key)} activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, isActive && { color: chipColor }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <FlatList
        data={filtered} keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        renderItem={({ item }) => <ContratoCard item={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum contrato</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NovoContrato')} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBody },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerTitle: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '700' },
  headerSub: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  filterRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  filterChipText: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600' },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 80 },
  empty: { alignItems: 'center', marginTop: spacing.xl * 2 },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md, marginTop: spacing.md },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
});
