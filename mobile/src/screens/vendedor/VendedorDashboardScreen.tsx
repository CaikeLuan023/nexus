import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../services/api';
import { colors, gradients, spacing, borderRadius, fontSize } from '../../theme';
import type { VendedorDashboard } from '../../types';

function KpiCard({ value, label, icon, color }: { value: string | number; label: string; icon: string; color: string }) {
  return (
    <View style={kpiStyles.card}>
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={[kpiStyles.value, { color }]}>{value}</Text>
      <Text style={kpiStyles.label}>{label}</Text>
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: colors.bgCard, borderRadius: borderRadius.sm,
    padding: spacing.sm, alignItems: 'center', marginHorizontal: spacing.xs / 2,
    borderWidth: 1, borderColor: colors.border,
  },
  value: { fontSize: fontSize.xl, fontWeight: '700', marginTop: 4 },
  label: { color: colors.textSecondary, fontSize: 10, marginTop: 2, textAlign: 'center' },
});

const META_LABELS: Record<string, string> = {
  quantidade_ativacoes: 'Ativacoes',
  valor_ativacoes: 'Valor Ativado',
  quantidade_negocios: 'Negocios',
  visitas: 'Visitas',
};

function formatCurrency(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
}

export default function VendedorDashboardScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<VendedorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const d = await api.getVendedorDashboard();
      setData(d);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleConcluirTarefa = async (id: number) => {
    try {
      await api.concluirTarefa(id);
      fetchData();
    } catch {}
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const s = data?.stats;
  const pipeline = Number(data?.valor_pipeline) || 0;
  const conversao = data?.taxa_conversao ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Text style={styles.headerSub}>Ola, {user?.nome?.split(' ')[0] || 'Vendedor'}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* KPIs */}
        <View style={styles.kpiRow}>
          <KpiCard value={s?.negocios_ativos ?? 0} label="Negocios" icon="briefcase-outline" color={colors.info} />
          <KpiCard value={s?.ativacoes_mes ?? 0} label="Ativacoes" icon="rocket-outline" color={colors.primary} />
          <KpiCard value={`R$${formatCurrency(pipeline)}`} label="Pipeline" icon="cash-outline" color={colors.warningDark} />
          <KpiCard value={`${conversao}%`} label="Conversao" icon="analytics-outline" color={colors.success} />
        </View>

        {/* Metas */}
        {data?.metas && data.metas.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Metas do Mes</Text>
            {data.metas.map((m) => {
              const pct = Math.min(100, m.percentual_atingido || 0);
              const metaColor = pct >= 80 ? colors.success : pct >= 50 ? colors.warning : colors.danger;
              return (
                <View key={m.id} style={styles.metaItem}>
                  <View style={styles.metaHeader}>
                    <Text style={styles.metaLabel}>{META_LABELS[m.tipo_meta] || m.tipo_meta}</Text>
                    <Text style={[styles.metaPct, { color: metaColor }]}>{pct.toFixed(0)}%</Text>
                  </View>
                  <View style={styles.metaBarBg}>
                    <View style={[styles.metaBarFill, { width: `${pct}%`, backgroundColor: metaColor }]} />
                  </View>
                  <Text style={styles.metaValues}>{m.valor_atual} / {m.valor_alvo}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Proximas Tarefas */}
        {data?.proximas_tarefas && data.proximas_tarefas.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Proximas Tarefas</Text>
            {data.proximas_tarefas.slice(0, 5).map((t) => (
              <View key={t.id} style={styles.tarefaItem}>
                <TouchableOpacity style={styles.tarefaCheck} onPress={() => handleConcluirTarefa(t.id)}>
                  <Ionicons name="square-outline" size={20} color={colors.textMuted} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tarefaTitulo}>{t.titulo}</Text>
                  <Text style={styles.tarefaMeta}>
                    {t.provedor_nome ? `${t.provedor_nome} - ` : ''}{t.data_hora?.slice(0, 16).replace('T', ' ')}
                  </Text>
                </View>
                <View style={[styles.tipoBadge, { backgroundColor: colors.info + '22' }]}>
                  <Text style={[styles.tipoText, { color: colors.info }]}>{t.tipo}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Negocios Parados */}
        {data?.performance?.negocios_parados && data.performance.negocios_parados.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Atencao Necessaria</Text>
            {data.performance.negocios_parados.slice(0, 3).map((n) => (
              <View key={n.id} style={styles.paradoItem}>
                <Ionicons name="alert-circle" size={16} color={colors.warningDark} />
                <Text style={styles.paradoText}>
                  {n.provedor_nome_lead || n.provedor_nome} - {n.dias_parado} dias parado
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBody },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerTitle: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '700' },
  headerSub: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  logoutBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.glassLight, alignItems: 'center', justifyContent: 'center',
  },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  kpiRow: { flexDirection: 'row', marginBottom: spacing.md },
  section: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.sm },
  metaItem: { marginBottom: spacing.sm },
  metaHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  metaPct: { fontSize: fontSize.sm, fontWeight: '700' },
  metaBarBg: { height: 6, backgroundColor: colors.bgInput, borderRadius: 3 },
  metaBarFill: { height: 6, borderRadius: 3 },
  metaValues: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  tarefaItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tarefaCheck: { padding: 2 },
  tarefaTitulo: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '500' },
  tarefaMeta: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  tipoBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.sm },
  tipoText: { fontSize: 9, fontWeight: '600' },
  paradoItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  paradoText: { color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 },
});
