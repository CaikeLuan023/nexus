import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  TextInput, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../../services/api';
import { colors, gradients, spacing, borderRadius, fontSize } from '../../theme';
import type { VendaNegocioDetalhe } from '../../types';

const ESTAGIOS_ORDER = ['lead', 'contato', 'proposta', 'negociacao', 'ativado'];
const ESTAGIO_COLORS: Record<string, string> = {
  lead: '#6c757d', contato: '#0dcaf0', proposta: '#0d6efd',
  negociacao: '#ffc107', ativado: '#198754', perdido: '#dc3545',
};
const ESTAGIO_LABELS: Record<string, string> = {
  lead: 'Lead', contato: 'Contato', proposta: 'Proposta',
  negociacao: 'Negociacao', ativado: 'Ativado', perdido: 'Perdido',
};
const PLANO_LABELS: Record<string, string> = {
  zapping_lite_plus: 'Zapping Lite Plus', zapping_full: 'Zapping Full', liteplus_full: 'Lite Plus + Full',
};

const INTERACAO_ICONS: Record<string, string> = {
  nota: 'document-text-outline', ligacao: 'call-outline', reuniao: 'people-outline',
  email: 'mail-outline', whatsapp: 'logo-whatsapp',
};

export default function NegocioDetailScreen({ route, navigation }: any) {
  const { negocioId } = route.params;
  const insets = useSafeAreaInsets();
  const [negocio, setNegocio] = useState<VendaNegocioDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [interacaoText, setInteracaoText] = useState('');
  const [interacaoTipo, setInteracaoTipo] = useState('nota');
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const d = await api.getNegocioDetalhe(negocioId);
      setNegocio(d);
    } catch {}
    setLoading(false);
  }, [negocioId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMudarEstagio = async (novoEstagio: string) => {
    if (novoEstagio === 'perdido') {
      Alert.alert('Marcar como Perdido?', 'Confirma que deseja marcar este negocio como perdido?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: async () => {
          try { await api.mudarEstagioNegocio(negocioId, novoEstagio); fetchData(); } catch {}
        }},
      ]);
      return;
    }
    try {
      await api.mudarEstagioNegocio(negocioId, novoEstagio);
      fetchData();
    } catch {}
  };

  const handleAddInteracao = async () => {
    if (!interacaoText.trim() || sending) return;
    setSending(true);
    try {
      await api.adicionarInteracao(negocioId, interacaoTipo, interacaoText.trim());
      setInteracaoText('');
      fetchData();
    } catch {}
    setSending(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!negocio) return null;

  const currentIdx = ESTAGIOS_ORDER.indexOf(negocio.estagio);
  const isPerdido = negocio.estagio === 'perdido';
  const isAtivado = negocio.estagio === 'ativado';
  const nextEstagio = !isPerdido && !isAtivado && currentIdx < ESTAGIOS_ORDER.length - 1
    ? ESTAGIOS_ORDER[currentIdx + 1] : null;
  const nome = negocio.provedor_nome_lead || negocio.provedor_nome || 'Sem nome';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{nome}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={[styles.estagBadge, { backgroundColor: (ESTAGIO_COLORS[negocio.estagio] || '#666') + '33' }]}>
              <Text style={[styles.estagText, { color: ESTAGIO_COLORS[negocio.estagio] || '#666' }]}>
                {ESTAGIO_LABELS[negocio.estagio] || negocio.estagio}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Stepper */}
        <View style={styles.stepper}>
          {ESTAGIOS_ORDER.map((e, i) => {
            const done = currentIdx >= i && !isPerdido;
            const active = negocio.estagio === e;
            const stepColor = done ? ESTAGIO_COLORS[e] : colors.border;
            return (
              <View key={e} style={styles.stepItem}>
                <View style={[styles.stepDot, { backgroundColor: done ? stepColor : 'transparent', borderColor: stepColor }]}>
                  {done && <Ionicons name="checkmark" size={10} color="#fff" />}
                </View>
                <Text style={[styles.stepLabel, active && { color: stepColor, fontWeight: '700' }]}>
                  {ESTAGIO_LABELS[e]}
                </Text>
                {i < ESTAGIOS_ORDER.length - 1 && (
                  <View style={[styles.stepLine, { backgroundColor: currentIdx > i ? stepColor : colors.border }]} />
                )}
              </View>
            );
          })}
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <InfoRow icon="person-outline" label="Lead" value={nome} />
          {negocio.contato_lead && (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${negocio.contato_lead}`)}>
              <InfoRow icon="call-outline" label="Contato" value={negocio.contato_lead} valueColor={colors.info} />
            </TouchableOpacity>
          )}
          {negocio.plano_interesse && <InfoRow icon="tv-outline" label="Plano" value={PLANO_LABELS[negocio.plano_interesse] || negocio.plano_interesse} />}
          {negocio.valor_estimado > 0 && <InfoRow icon="cash-outline" label="Valor" value={`R$ ${negocio.valor_estimado.toFixed(2)}`} valueColor={colors.success} />}
          {negocio.origem && <InfoRow icon="navigate-outline" label="Origem" value={negocio.origem} />}
          {negocio.observacoes && <InfoRow icon="document-text-outline" label="Obs." value={negocio.observacoes} />}
          {isPerdido && negocio.motivo_perda && <InfoRow icon="alert-circle-outline" label="Motivo Perda" value={negocio.motivo_perda} valueColor={colors.danger} />}
        </View>

        {/* Quick Contact */}
        {negocio.contato_lead && (
          <View style={styles.contactRow}>
            <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`tel:${negocio.contato_lead}`)}>
              <Ionicons name="call" size={18} color={colors.info} />
              <Text style={[styles.contactBtnText, { color: colors.info }]}>Ligar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.contactBtn, { backgroundColor: '#25D366' + '18' }]}
              onPress={() => {
                const phone = (negocio.contato_lead || '').replace(/\D/g, '');
                const msg = encodeURIComponent(`Ola ${nome}! Tudo bem?`);
                Linking.openURL(`whatsapp://send?phone=55${phone}&text=${msg}`).catch(() =>
                  Linking.openURL(`https://wa.me/55${phone}?text=${msg}`).catch(() => {})
                );
              }}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
              <Text style={[styles.contactBtnText, { color: '#25D366' }]}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Stage Change */}
        {!isAtivado && !isPerdido && (
          <View style={styles.actionsRow}>
            {nextEstagio && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: ESTAGIO_COLORS[nextEstagio] }]}
                onPress={() => handleMudarEstagio(nextEstagio)}
              >
                <Ionicons name="arrow-forward" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Mover p/ {ESTAGIO_LABELS[nextEstagio]}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.danger }]}
              onPress={() => handleMudarEstagio('perdido')}
            >
              <Ionicons name="close-circle-outline" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Perdido</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Fechar Contrato */}
        {!isPerdido && (
          <TouchableOpacity style={styles.fecharContratoBtn}
            onPress={() => navigation.navigate('FecharContrato', {
              clienteNome: nome,
              clienteTel: negocio.contato_lead || '',
              plano: negocio.plano_interesse || '',
              valor: negocio.valor_estimado > 0 ? String(negocio.valor_estimado) : '',
              negocioId: negocio.id,
            })} activeOpacity={0.7}>
            <Ionicons name="flash" size={20} color="#fff" />
            <Text style={styles.fecharContratoBtnText}>Fechar Contrato</Text>
          </TouchableOpacity>
        )}

        {/* Interacoes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historico ({negocio.interacoes?.length || 0})</Text>
          {(negocio.interacoes || []).map((inter) => (
            <View key={inter.id} style={styles.interItem}>
              <Ionicons name={(INTERACAO_ICONS[inter.tipo] || 'document-text-outline') as any} size={16} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.interDesc}>{inter.descricao}</Text>
                <Text style={styles.interMeta}>{inter.criado_por} - {inter.criado_em?.slice(0, 16).replace('T', ' ')}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Add Interaction */}
        <View style={styles.addInterRow}>
          <View style={styles.tipoRow}>
            {['nota', 'ligacao', 'reuniao', 'whatsapp'].map((t) => (
              <TouchableOpacity
                key={t} style={[styles.tipoBtn, interacaoTipo === t && styles.tipoBtnActive]}
                onPress={() => setInteracaoTipo(t)}
              >
                <Ionicons name={(INTERACAO_ICONS[t] || 'document-text-outline') as any} size={16}
                  color={interacaoTipo === t ? colors.primary : colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.interInput} placeholder="Adicionar nota..."
              placeholderTextColor={colors.textMuted} value={interacaoText}
              onChangeText={setInteracaoText} multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, !interacaoText.trim() && { opacity: 0.4 }]}
              onPress={handleAddInteracao} disabled={!interacaoText.trim() || sending}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value, valueColor }: { icon: string; label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={16} color={colors.textSecondary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBody },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.glassLight, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  headerTitle: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: '700' },
  estagBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  estagText: { fontSize: fontSize.xs, fontWeight: '700' },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: spacing.md },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  stepLabel: { color: colors.textMuted, fontSize: 9, position: 'absolute', top: 22, width: 60, textAlign: 'center', left: -20 },
  stepLine: { width: 24, height: 2, marginHorizontal: 2 },
  infoCard: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginTop: spacing.xl, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textSecondary, fontSize: fontSize.sm, width: 60 },
  infoValue: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '500', flex: 1, textAlign: 'right' },
  contactRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  contactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: spacing.sm, borderRadius: borderRadius.sm,
    backgroundColor: colors.info + '18',
  },
  contactBtnText: { fontSize: fontSize.sm, fontWeight: '600' },
  fecharContratoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, marginBottom: spacing.md,
  },
  fecharContratoBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: spacing.sm, borderRadius: borderRadius.sm,
  },
  actionBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },
  section: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.sm },
  interItem: {
    flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  interDesc: { color: colors.textPrimary, fontSize: fontSize.sm },
  interMeta: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  addInterRow: { marginBottom: spacing.lg },
  tipoRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tipoBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  tipoBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '22' },
  inputRow: { flexDirection: 'row', gap: spacing.sm },
  interInput: {
    flex: 1, backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.textPrimary, fontSize: fontSize.sm,
    borderWidth: 1, borderColor: colors.border, maxHeight: 80,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
});
