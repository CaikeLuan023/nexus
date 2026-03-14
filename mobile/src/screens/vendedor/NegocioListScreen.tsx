import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar, TextInput,
  RefreshControl, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../../services/api';
import { colors, gradients, spacing, borderRadius, fontSize } from '../../theme';
import type { VendaNegocio } from '../../types';

const ESTAGIOS = [
  { key: 'todos', label: 'Todos', color: colors.primary },
  { key: 'lead', label: 'Leads', color: '#6c757d' },
  { key: 'contato', label: 'Contato', color: '#0dcaf0' },
  { key: 'proposta', label: 'Proposta', color: '#0d6efd' },
  { key: 'negociacao', label: 'Negociacao', color: '#ffc107' },
  { key: 'ativado', label: 'Ativados', color: '#198754' },
  { key: 'perdido', label: 'Perdidos', color: '#dc3545' },
];

const ESTAGIO_LABELS: Record<string, string> = {
  lead: 'Lead', contato: 'Contato', proposta: 'Proposta',
  negociacao: 'Negociacao', ativado: 'Ativado', perdido: 'Perdido',
};

const PLANO_LABELS: Record<string, string> = {
  zapping_lite_plus: 'Lite Plus', zapping_full: 'Full', liteplus_full: 'LP + Full',
};

function NegocioCard({ item, onPress }: { item: VendaNegocio; onPress: () => void }) {
  const estagioInfo = ESTAGIOS.find(e => e.key === item.estagio) || ESTAGIOS[0];
  const nome = item.provedor_nome_lead || item.provedor_nome || 'Sem nome';
  const phone = (item.contato_lead || '').replace(/\D/g, '');

  const handleLigar = () => {
    if (phone) Linking.openURL(`tel:${item.contato_lead}`);
  };

  const handleWhatsApp = () => {
    if (phone) {
      const msg = encodeURIComponent(`Ola ${nome}! Tudo bem?`);
      Linking.openURL(`whatsapp://send?phone=55${phone}&text=${msg}`).catch(() =>
        Linking.openURL(`https://wa.me/55${phone}?text=${msg}`).catch(() => {})
      );
    }
  };

  return (
    <TouchableOpacity style={cardStyles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={cardStyles.topRow}>
        <Text style={cardStyles.nome} numberOfLines={1}>{nome}</Text>
        <View style={[cardStyles.badge, { backgroundColor: estagioInfo.color + '22', borderColor: estagioInfo.color + '44' }]}>
          <Text style={[cardStyles.badgeText, { color: estagioInfo.color }]}>{ESTAGIO_LABELS[item.estagio] || item.estagio}</Text>
        </View>
      </View>
      {item.contato_lead ? (
        <Text style={cardStyles.contato} numberOfLines={1}>
          <Ionicons name="call-outline" size={12} color={colors.textMuted} /> {item.contato_lead}
        </Text>
      ) : null}
      <View style={cardStyles.bottomRow}>
        {item.plano_interesse ? (
          <View style={[cardStyles.tagBadge, { backgroundColor: colors.purple + '22' }]}>
            <Text style={[cardStyles.tagText, { color: colors.purpleLight }]}>{PLANO_LABELS[item.plano_interesse] || item.plano_interesse}</Text>
          </View>
        ) : null}
        {item.valor_estimado > 0 ? (
          <Text style={cardStyles.valor}>R$ {item.valor_estimado.toFixed(2)}</Text>
        ) : null}
        {item.origem ? (
          <Text style={cardStyles.origem}>{item.origem}</Text>
        ) : null}
      </View>
      {/* Quick Contact Buttons */}
      {phone ? (
        <View style={cardStyles.quickActions}>
          <TouchableOpacity style={cardStyles.quickBtn} onPress={handleLigar} activeOpacity={0.7}>
            <Ionicons name="call" size={14} color={colors.info} />
            <Text style={[cardStyles.quickBtnText, { color: colors.info }]}>Ligar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[cardStyles.quickBtn, { backgroundColor: '#25D366' + '18' }]} onPress={handleWhatsApp} activeOpacity={0.7}>
            <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
            <Text style={[cardStyles.quickBtnText, { color: '#25D366' }]}>WhatsApp</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  nome: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '700', flex: 1, marginRight: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm, borderWidth: 1 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600' },
  contato: { color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.xs },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  tagBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  tagText: { fontSize: fontSize.xs, fontWeight: '600' },
  valor: { color: colors.success, fontSize: fontSize.xs, fontWeight: '600' },
  origem: { color: colors.textMuted, fontSize: fontSize.xs, marginLeft: 'auto' },
  quickActions: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: borderRadius.sm, backgroundColor: colors.info + '18',
  },
  quickBtnText: { fontSize: fontSize.xs, fontWeight: '600' },
});

export default function NegocioListScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [negocios, setNegocios] = useState<VendaNegocio[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState('todos');

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getNegocios();
      setNegocios(data);
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
    let result = negocios;
    if (activeFilter !== 'todos') result = result.filter(n => n.estagio === activeFilter);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(n =>
        (n.provedor_nome_lead || '').toLowerCase().includes(q) ||
        (n.provedor_nome || '').toLowerCase().includes(q) ||
        (n.contato_lead || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [negocios, activeFilter, searchText]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <Text style={styles.headerTitle}>Pipeline</Text>
        <Text style={styles.headerSub}>{negocios.length} negocios</Text>
      </LinearGradient>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput} placeholder="Buscar lead, cliente..."
            placeholderTextColor={colors.textMuted} value={searchText}
            onChangeText={setSearchText} autoCapitalize="none" autoCorrect={false}
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
        horizontal showsHorizontalScrollIndicator={false}
        data={ESTAGIOS} keyExtractor={item => item.key}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const isActive = activeFilter === item.key;
          return (
            <TouchableOpacity
              style={[styles.filterChip, isActive && { backgroundColor: item.color + '22', borderColor: item.color }]}
              onPress={() => setActiveFilter(item.key)} activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, isActive && { color: item.color }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <FlatList
        data={filtered} keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        renderItem={({ item }) => (
          <NegocioCard item={item} onPress={() => navigation.navigate('NegocioDetail', { negocioId: item.id })} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="funnel-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum negocio encontrado</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NovoNegocio')} activeOpacity={0.8}>
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
  searchRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: fontSize.sm, marginLeft: spacing.sm, paddingVertical: 2 },
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
