import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../../services/api';
import { colors, gradients, spacing, borderRadius, fontSize } from '../../theme';

const PLANOS = [
  { key: 'zapping_lite_plus', label: 'Zapping Lite Plus' },
  { key: 'zapping_full', label: 'Zapping Full' },
  { key: 'liteplus_full', label: 'Lite Plus + Full' },
];

const ORIGENS = ['Indicacao', 'WhatsApp', 'Porta a porta', 'Redes sociais', 'Telefone', 'Outro'];

export default function NovoNegocioScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [nome, setNome] = useState('');
  const [contato, setContato] = useState('');
  const [plano, setPlano] = useState('');
  const [valor, setValor] = useState('');
  const [origem, setOrigem] = useState('');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSalvar = async () => {
    if (!nome.trim()) { Alert.alert('Erro', 'Informe o nome do lead'); return; }
    setSaving(true);
    try {
      await api.criarNegocio({
        provedor_nome_lead: nome.trim(),
        contato_lead: contato.trim() || undefined,
        plano_interesse: plano || undefined,
        valor_estimado: parseFloat(valor) || undefined,
        origem: origem || undefined,
        observacoes: obs.trim() || undefined,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao salvar');
    }
    setSaving(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Novo Negocio</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Nome do Lead / Cliente *</Text>
        <TextInput style={styles.input} value={nome} onChangeText={setNome}
          placeholder="Nome completo" placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>Telefone / Contato</Text>
        <TextInput style={styles.input} value={contato} onChangeText={setContato}
          placeholder="(00) 00000-0000" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />

        <Text style={styles.label}>Plano de Interesse</Text>
        <View style={styles.planoRow}>
          {PLANOS.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.planoCard, plano === p.key && styles.planoCardActive]}
              onPress={() => setPlano(plano === p.key ? '' : p.key)}
            >
              <Ionicons name="tv-outline" size={16} color={plano === p.key ? colors.primary : colors.textMuted} />
              <Text style={[styles.planoText, plano === p.key && { color: colors.primary }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Valor Estimado (R$)</Text>
        <TextInput style={styles.input} value={valor} onChangeText={setValor}
          placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="numeric" />

        <Text style={styles.label}>Origem</Text>
        <View style={styles.origemRow}>
          {ORIGENS.map(o => (
            <TouchableOpacity
              key={o}
              style={[styles.origemChip, origem === o && styles.origemChipActive]}
              onPress={() => setOrigem(origem === o ? '' : o)}
            >
              <Text style={[styles.origemText, origem === o && { color: colors.primary }]}>{o}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Observacoes</Text>
        <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          value={obs} onChangeText={setObs} placeholder="Notas adicionais..."
          placeholderTextColor={colors.textMuted} multiline />

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSalvar} disabled={saving} activeOpacity={0.7}
        >
          {saving ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Salvar Negocio</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.textPrimary, fontSize: fontSize.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  planoRow: { gap: spacing.sm },
  planoCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bgCard, borderRadius: borderRadius.sm,
    padding: spacing.md, borderWidth: 1.5, borderColor: colors.border,
  },
  planoCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '11' },
  planoText: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '500' },
  origemRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  origemChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  origemChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '11' },
  origemText: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, marginTop: spacing.xl,
  },
  saveBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
});
