import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors, gradients, spacing, borderRadius, fontSize } from '../../theme';

export default function PerfilVendedorScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <Text style={styles.headerTitle}>Perfil</Text>
      </LinearGradient>

      <View style={styles.content}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color={colors.primary} />
          </View>
          <Text style={styles.nome}>{user?.nome}</Text>
          <Text style={styles.usuario}>@{user?.usuario}</Text>
          <View style={styles.perfilBadge}>
            <Ionicons name="briefcase-outline" size={12} color={colors.primary} />
            <Text style={styles.perfilText}>Vendedor</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.infoLabel}>Nome</Text>
            <Text style={styles.infoValue}>{user?.nome}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="at-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.infoLabel}>Usuario</Text>
            <Text style={styles.infoValue}>{user?.usuario}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={signOut} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBody },
  header: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerTitle: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  avatarContainer: { alignItems: 'center', marginBottom: spacing.xl },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  nome: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '700' },
  usuario: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  perfilBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary + '22', paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg, marginTop: spacing.sm,
  },
  perfilText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '600' },
  infoCard: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  infoLabel: { color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 },
  infoValue: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '600' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.danger + '44', backgroundColor: colors.danger + '11',
  },
  logoutText: { color: colors.danger, fontSize: fontSize.md, fontWeight: '600' },
});
