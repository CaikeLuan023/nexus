import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet, StatusBar, TextInput,
  Vibration, Platform, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { colors, gradients, spacing, borderRadius, fontSize } from '../theme';
import type { OrdemServico, OSResumo } from '../types';

async function playNotificationSound() {
  // Vibrate first (always works)
  Vibration.vibrate([0, 200, 100, 200]);
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
      staysActiveInBackground: true,
    });
    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/notification.wav'),
      { shouldPlay: true, volume: 1.0 }
    );
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
    });
  } catch (e) {
    console.warn('Notification sound error:', e);
  }
}

const STATUS_COLORS: Record<string, string> = {
  rascunho: colors.textMuted,
  enviada: colors.info,
  aceita: colors.blue,
  em_deslocamento: colors.warningDark,
  em_execucao: colors.warning,
  concluida: colors.success,
  recusada: colors.danger,
  cancelada: colors.danger,
};

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aceita: 'Aceita',
  em_deslocamento: 'Deslocamento',
  em_execucao: 'Execucao',
  concluida: 'Concluida',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
};

const PRIORIDADE_COLORS: Record<string, string> = {
  baixa: colors.success,
  normal: colors.info,
  alta: colors.warningDark,
  urgente: colors.danger,
  critica: colors.danger,
};

const FILTER_OPTIONS = [
  { key: 'todas', label: 'Todas' },
  { key: 'enviada', label: 'Enviadas' },
  { key: 'aceita', label: 'Aceitas' },
  { key: 'em_deslocamento', label: 'Desloc.' },
  { key: 'em_execucao', label: 'Execucao' },
  { key: 'concluida', label: 'Concluidas' },
];

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month} ${hours}:${mins}`;
  } catch {
    return dateStr;
  }
}

function MiniKpi({ value, label, color, onPress, active }: { value: number; label: string; color: string; onPress?: () => void; active?: boolean }) {
  return (
    <TouchableOpacity style={[miniStyles.card, active && { borderColor: color }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[miniStyles.value, { color }]}>{value}</Text>
      <Text style={miniStyles.label} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const miniStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    flex: 1, marginHorizontal: spacing.xs / 2, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  value: { fontSize: fontSize.xl, fontWeight: '700' },
  label: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
});

function OSCard({ item, onPress }: { item: OrdemServico; onPress: () => void }) {
  const statusColor = STATUS_COLORS[item.status] || colors.textMuted;
  const statusLabel = STATUS_LABELS[item.status] || item.status;
  const prioColor = PRIORIDADE_COLORS[item.prioridade] || colors.info;

  const isUrgent = item.prioridade === 'urgente' || item.prioridade === 'critica';

  return (
    <TouchableOpacity style={[cardStyles.card, isUrgent && { borderColor: colors.danger + '66' }]} onPress={onPress} activeOpacity={0.7}>
      <View style={cardStyles.topRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={cardStyles.numero}>#{item.numero}</Text>
          {isUrgent && <Ionicons name="alert-circle" size={16} color={colors.danger} style={{ marginLeft: 6 }} />}
        </View>
        <View style={[cardStyles.badge, { backgroundColor: statusColor + '22', borderColor: statusColor + '44' }]}>
          <Text style={[cardStyles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <Text style={cardStyles.cliente} numberOfLines={1}>
        <Ionicons name="person-outline" size={13} color={colors.textSecondary} /> {item.cliente_nome}
      </Text>
      <Text style={cardStyles.endereco} numberOfLines={1}>
        <Ionicons name="location-outline" size={12} color={colors.textMuted} /> {item.endereco}
      </Text>

      <View style={cardStyles.bottomRow}>
        <View style={[cardStyles.tagBadge, { backgroundColor: colors.purple + '22' }]}>
          <Ionicons name="construct-outline" size={10} color={colors.purpleLight} />
          <Text style={[cardStyles.tagText, { color: colors.purpleLight }]}> {item.tipo_servico}</Text>
        </View>
        <View style={[cardStyles.tagBadge, { backgroundColor: prioColor + '22' }]}>
          <Text style={[cardStyles.tagText, { color: prioColor }]}>{item.prioridade}</Text>
        </View>
        {item.data_agendamento ? (
          <Text style={cardStyles.date}>
            <Ionicons name="calendar-outline" size={11} color={colors.textMuted} /> {formatDate(item.data_agendamento)}
          </Text>
        ) : null}
      </View>

      {/* Checklist progress if available */}
      {item.checklist && item.checklist.length > 0 && (
        <View style={cardStyles.progressRow}>
          <View style={cardStyles.progressBar}>
            <View style={[cardStyles.progressFill, { width: `${(item.checklist.filter(c => c.concluido).length / item.checklist.length) * 100}%` }]} />
          </View>
          <Text style={cardStyles.progressText}>
            {item.checklist.filter(c => c.concluido).length}/{item.checklist.length}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  numero: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '700' },
  badge: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2,
    borderRadius: borderRadius.sm, borderWidth: 1,
  },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600' },
  cliente: { color: colors.textPrimary, fontSize: fontSize.md, marginBottom: 4 },
  endereco: { color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.sm },
  bottomRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  tagBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  tagText: { fontSize: fontSize.xs, fontWeight: '600' },
  date: { color: colors.textMuted, fontSize: fontSize.xs, marginLeft: 'auto' },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  progressBar: { flex: 1, height: 4, backgroundColor: colors.bgInput, borderRadius: 2, marginRight: spacing.sm },
  progressFill: { height: 4, backgroundColor: colors.success, borderRadius: 2 },
  progressText: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
});

export default function OSListScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [resumo, setResumo] = useState<OSResumo | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState('todas');

  const prevEnviadaCountRef = useRef<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([api.getMinhasOS(), api.getOSResumo()]);
      const newEnviadas = o.filter((os: OrdemServico) => os.status === 'enviada').length;
      if (prevEnviadaCountRef.current === null) {
        // First load: notify if there are pending OS
        if (newEnviadas > 0) {
          playNotificationSound();
          Alert.alert('OS pendentes!', `Voce tem ${newEnviadas} OS aguardando aceite.`);
        }
      } else if (newEnviadas > prevEnviadaCountRef.current) {
        // Polling: new OS arrived
        playNotificationSound();
        const diff = newEnviadas - prevEnviadaCountRef.current;
        Alert.alert('Nova OS recebida!', `Voce tem ${diff} nova${diff > 1 ? 's' : ''} OS aguardando aceite.`);
      }
      prevEnviadaCountRef.current = newEnviadas;
      setOrdens(o);
      setResumo(r);
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Polling every 5s to detect new OS
  useEffect(() => {
    pollingRef.current = setInterval(fetchData, 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchData]);

  // Re-fetch when returning from detail screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { fetchData(); });
    return unsubscribe;
  }, [navigation, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const filteredOrdens = useMemo(() => {
    let result = ordens;
    if (activeFilter !== 'todas') {
      result = result.filter(o => o.status === activeFilter);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(o =>
        o.numero.toLowerCase().includes(q) ||
        o.cliente_nome.toLowerCase().includes(q) ||
        o.endereco.toLowerCase().includes(q) ||
        o.tipo_servico.toLowerCase().includes(q)
      );
    }
    return result;
  }, [ordens, activeFilter, searchText]);

  const hoje = new Date().toISOString().slice(0, 10);
  const concluidasHoje = ordens.filter(o => o.status === 'concluida' && o.atualizado_em?.slice(0, 10) === hoje).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Minhas OS</Text>
          <Text style={styles.headerSub}>Ola, {user?.nome?.split(' ')[0] || 'Tecnico'}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar OS, cliente, endereco..."
            placeholderTextColor={colors.textMuted}
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={FILTER_OPTIONS}
        keyExtractor={item => item.key}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const isActive = activeFilter === item.key;
          const chipColor = item.key === 'todas' ? colors.primary : (STATUS_COLORS[item.key] || colors.primary);
          return (
            <TouchableOpacity
              style={[styles.filterChip, isActive && { backgroundColor: chipColor + '22', borderColor: chipColor }]}
              onPress={() => setActiveFilter(item.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, isActive && { color: chipColor }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <FlatList
        data={filteredOrdens}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        ListHeaderComponent={
          <View style={styles.kpiRow}>
            <MiniKpi
              value={resumo?.enviada ?? 0}
              label="Enviadas"
              color={colors.info}
              onPress={() => setActiveFilter(activeFilter === 'enviada' ? 'todas' : 'enviada')}
              active={activeFilter === 'enviada'}
            />
            <MiniKpi
              value={resumo?.em_execucao ?? 0}
              label="Em Exec."
              color={colors.warning}
              onPress={() => setActiveFilter(activeFilter === 'em_execucao' ? 'todas' : 'em_execucao')}
              active={activeFilter === 'em_execucao'}
            />
            <MiniKpi
              value={concluidasHoje}
              label="Feitas Hoje"
              color={colors.success}
            />
            <MiniKpi
              value={ordens.length}
              label="Total"
              color={colors.purpleLight}
              onPress={() => setActiveFilter('todas')}
              active={activeFilter === 'todas'}
            />
          </View>
        }
        renderItem={({ item }) => (
          <OSCard item={item} onPress={() => navigation.navigate('OSDetail', { osId: item.id })} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {searchText.trim() || activeFilter !== 'todas' ? 'Nenhuma OS encontrada com os filtros' : 'Nenhuma OS atribuida'}
            </Text>
            {(searchText.trim() || activeFilter !== 'todas') && (
              <TouchableOpacity onPress={() => { setSearchText(''); setActiveFilter('todas'); }} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Limpar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
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
  searchRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, color: colors.textPrimary, fontSize: fontSize.sm,
    marginLeft: spacing.sm, paddingVertical: 2,
  },
  filterRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  filterChipText: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600' },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  kpiRow: { flexDirection: 'row', marginVertical: spacing.sm },
  empty: { alignItems: 'center', marginTop: spacing.xl * 2 },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md, marginTop: spacing.md, textAlign: 'center' },
  clearBtn: {
    marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: borderRadius.md, backgroundColor: colors.primary + '22',
  },
  clearBtnText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
});
