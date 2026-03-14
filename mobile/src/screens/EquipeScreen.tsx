import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { colors, gradients, spacing, borderRadius, fontSize } from '../theme';

interface MembroEquipe {
  id: number;
  nome: string;
  perfil: string;
  foto_url: string | null;
  em_almoco: boolean;
}

const PERFIL_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  atendente: 'Atendente',
  tecnico_campo: 'Tecnico',
  vendedor: 'Vendedor',
};

function MembroCard({ membro }: { membro: MembroEquipe }) {
  const perfilLabel = PERFIL_LABELS[membro.perfil] || membro.perfil;
  const isAtendente = membro.perfil === 'atendente' || membro.perfil === 'admin' || membro.perfil === 'gerente';

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.avatar}>
        <Ionicons
          name={isAtendente ? 'headset-outline' : 'construct-outline'}
          size={22}
          color={membro.em_almoco ? colors.warningDark : colors.success}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={cardStyles.nome}>{membro.nome}</Text>
        <Text style={cardStyles.perfil}>{perfilLabel}</Text>
      </View>
      <View style={[
        cardStyles.statusBadge,
        { backgroundColor: membro.em_almoco ? colors.warningDark + '22' : colors.success + '22' }
      ]}>
        <Ionicons
          name={membro.em_almoco ? 'restaurant-outline' : 'radio-button-on'}
          size={12}
          color={membro.em_almoco ? colors.warningDark : colors.success}
        />
        <Text style={[
          cardStyles.statusText,
          { color: membro.em_almoco ? colors.warningDark : colors.success }
        ]}>
          {membro.em_almoco ? 'Almoco' : 'Disponivel'}
        </Text>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bgInput, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  nome: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '600' },
  perfil: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm, gap: 4,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: '600' },
});

export default function EquipeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [emAlmoco, setEmAlmoco] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [equipeLista, almocoStatus] = await Promise.all([
        api.getEquipeOnline(),
        api.getAlmocoStatus(),
      ]);
      setEquipe(equipeLista.filter(m => m.id !== user?.id));
      setEmAlmoco(almocoStatus.em_almoco);
    } catch {}
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleToggleAlmoco = async () => {
    setToggling(true);
    try {
      const res = await api.toggleAlmoco();
      setEmAlmoco(res.em_almoco);
      await fetchData();
    } catch {}
    setToggling(false);
  };

  const atendentes = equipe.filter(m => m.perfil !== 'tecnico_campo');
  const tecnicos = equipe.filter(m => m.perfil === 'tecnico_campo');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Equipe</Text>
          <Text style={styles.headerSub}>{equipe.length} online</Text>
        </View>
      </LinearGradient>

      {/* Lunch Break Toggle */}
      <View style={styles.almocoCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.almocoTitle}>
            <Ionicons name="restaurant-outline" size={16} color={colors.textPrimary} />
            {'  '}Pausa Almoco
          </Text>
          <Text style={styles.almocoSub}>
            {emAlmoco ? 'Voce esta em pausa para almoco' : 'Toque para iniciar sua pausa'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.almocoBtn, emAlmoco && styles.almocoBtnActive]}
          onPress={handleToggleAlmoco}
          disabled={toggling}
          activeOpacity={0.7}
        >
          {toggling ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons
                name={emAlmoco ? 'stop-circle-outline' : 'play-circle-outline'}
                size={18}
                color="#fff"
              />
              <Text style={styles.almocoBtnText}>
                {emAlmoco ? 'Finalizar' : 'Iniciar'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={[
            ...(atendentes.length > 0 ? [{ type: 'header', title: 'Atendentes', count: atendentes.length }] : []),
            ...atendentes.map(m => ({ type: 'member', ...m })),
            ...(tecnicos.length > 0 ? [{ type: 'header', title: 'Tecnicos', count: tecnicos.length }] : []),
            ...tecnicos.map(m => ({ type: 'member', ...m })),
          ] as any[]}
          keyExtractor={(item, idx) => item.type === 'header' ? `h-${item.title}` : `m-${item.id}`}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{item.title}</Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{item.count}</Text>
                  </View>
                </View>
              );
            }
            return <MembroCard membro={item as MembroEquipe} />;
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhum membro online</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBody },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerTitle: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '700' },
  headerSub: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  almocoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  almocoTitle: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '700' },
  almocoSub: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4 },
  almocoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.warningDark,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  almocoBtnActive: { backgroundColor: colors.success },
  almocoBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  sectionTitle: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  sectionBadge: {
    backgroundColor: colors.primary + '22', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2, marginLeft: spacing.sm,
  },
  sectionBadgeText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: spacing.xl * 2 },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md, marginTop: spacing.md },
});
