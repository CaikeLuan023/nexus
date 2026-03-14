import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import KpiCard from '../components/KpiCard';
import SectionHeader from '../components/SectionHeader';
import RecentTicketItem from '../components/RecentTicketItem';
import { colors, gradients, spacing, borderRadius, fontSize } from '../theme';
import type { DashboardResumo, VendasDashboard, ChamadoRecente } from '../types';

function fmtCurrency(v: number) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function OverviewScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [vendas, setVendas] = useState<VendasDashboard | null>(null);
  const [chamados, setChamados] = useState<ChamadoRecente[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [r, v, c] = await Promise.all([
        api.getDashboardResumo(), api.getVendasDashboard(), api.getChamadosRecentes(),
      ]);
      setResumo(r); setVendas(v); setChamados(c);
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await fetchData(); setRefreshing(false);
  }, [fetchData]);

  const k = vendas?.kpis;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Nexus ISP</Text>
          <Text style={styles.headerSub}>Olá, {user?.nome?.split(' ')[0] || 'Usuário'}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Vendas */}
        <SectionHeader icon="trending-up" title="Vendas" color={colors.primary} />
        <View style={styles.grid}>
          <KpiCard icon="briefcase-outline" value={k?.totalNegocios ?? '-'} label="Negócios" color={colors.blue} />
          <KpiCard icon="rocket-outline" value={k?.ativacoesMes ?? '-'} label="Ativações Mês" color={colors.primary} />
          <KpiCard icon="cash-outline" value={k ? fmtCurrency(k.valorPipeline) : '-'} label="Pipeline" color={colors.warningDark} />
          <KpiCard icon="analytics-outline" value={k ? `${k.taxaConversao}%` : '-'} label="Conversão" color={colors.info} />
        </View>

        {/* Chamados */}
        <SectionHeader icon="headset" title="Chamados" color={colors.info} />
        <View style={styles.grid}>
          <KpiCard icon="albums-outline" value={resumo?.total_chamados ?? '-'} label="Total" color={colors.blue} />
          <KpiCard icon="warning-outline" value={resumo?.pendentes ?? '-'} label="Pendentes" color={colors.warning} />
          <KpiCard icon="sync-outline" value={resumo?.em_andamento ?? '-'} label="Em Andamento" color={colors.info} />
          <KpiCard icon="checkmark-circle-outline" value={resumo?.resolvidos ?? '-'} label="Resolvidos" color={colors.success} />
        </View>

        {/* Chamados Recentes */}
        {chamados.length > 0 && (
          <>
            <SectionHeader icon="time-outline" title="Chamados Recentes" color={colors.warningDark} />
            {chamados.slice(0, 5).map(c => (
              <RecentTicketItem key={c.id} item={c} />
            ))}
          </>
        )}

        <View style={{ height: spacing.xl }} />
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
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
