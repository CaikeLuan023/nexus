import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  TextInput, Alert, ActivityIndicator, Modal, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as api from '../../services/api';
import { colors, gradients, spacing, borderRadius, fontSize } from '../../theme';

const PLANOS = [
  { key: 'zapping_lite_plus', label: 'Zapping Lite Plus' },
  { key: 'zapping_full', label: 'Zapping Full' },
  { key: 'liteplus_full', label: 'Lite Plus + Full' },
];

const ADICIONAIS = ['Telecine', 'Combate', 'Premiere', 'HBO Max'];

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NovoContratoScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const params = route.params || {};
  const [clienteNome, setClienteNome] = useState(params.clienteNome || '');
  const [clienteTel, setClienteTel] = useState(params.clienteTel || '');
  const [plano, setPlano] = useState(params.plano || '');
  const [adicionais, setAdicionais] = useState<string[]>([]);
  const [valorMensal, setValorMensal] = useState(params.valor || '');
  const [dataInicio, setDataInicio] = useState(getToday());
  const [dataFim, setDataFim] = useState(addMonths(getToday(), 12));
  const negocioId = params.negocioId || null;
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [assinaturaUrl, setAssinaturaUrl] = useState('');

  // Auto-generate title and content
  useEffect(() => {
    const planoLabel = PLANOS.find(p => p.key === plano)?.label || '';
    if (clienteNome) {
      setTitulo(`Contrato - ${clienteNome}${planoLabel ? ` - ${planoLabel}` : ''}`);
    }
    const adcText = adicionais.length > 0 ? `\nAdicionais: ${adicionais.join(', ')}` : '';
    setConteudo(
      `CONTRATO DE PRESTACAO DE SERVICOS\n\n` +
      `Contratante: ${clienteNome || '___'}\n` +
      `Plano: ${planoLabel || '___'}\n` +
      `${adcText ? adcText + '\n' : ''}` +
      `Valor Mensal: R$ ${valorMensal || '___'}\n` +
      `Vigencia: ${dataInicio} a ${dataFim}\n\n` +
      `O presente contrato tem por objeto a prestacao de servicos de telecomunicacoes conforme plano contratado acima.\n\n` +
      `Fidelidade minima de 12 meses. Em caso de cancelamento antecipado, aplica-se multa proporcional ao periodo restante.\n\n` +
      `O contratante declara estar ciente e de acordo com os termos acima.`
    );
  }, [clienteNome, plano, adicionais, valorMensal, dataInicio, dataFim]);

  const toggleAdicional = (adc: string) => {
    setAdicionais(prev => prev.includes(adc) ? prev.filter(a => a !== adc) : [...prev, adc]);
  };

  const handleCriarEnviar = async () => {
    if (!clienteNome.trim()) { Alert.alert('Erro', 'Informe o nome do cliente'); return; }
    if (!plano) { Alert.alert('Erro', 'Selecione um plano'); return; }
    setSaving(true);
    try {
      const res = await api.criarContrato({
        provedor_nome: clienteNome.trim(),
        titulo: titulo || `Contrato - ${clienteNome}`,
        conteudo,
        valor_mensal: parseFloat(valorMensal) || 0,
        valor_total: (parseFloat(valorMensal) || 0) * 12,
        data_inicio: dataInicio,
        data_fim: dataFim,
        negocio_id: negocioId || undefined,
      });
      // Enviar para assinatura
      try {
        const envio = await api.enviarContratoAssinatura(res.id);
        const base = api.getBaseUrl();
        setAssinaturaUrl(`${base}/contrato-aceite/${envio.token}`);
      } catch {
        setAssinaturaUrl('');
      }
      setShowSuccess(true);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao criar contrato');
    }
    setSaving(false);
  };

  const handleSalvarRascunho = async () => {
    if (!clienteNome.trim()) { Alert.alert('Erro', 'Informe o nome do cliente'); return; }
    setSaving(true);
    try {
      await api.criarContrato({
        provedor_nome: clienteNome.trim(),
        titulo: titulo || `Contrato - ${clienteNome}`,
        conteudo,
        valor_mensal: parseFloat(valorMensal) || 0,
        valor_total: (parseFloat(valorMensal) || 0) * 12,
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      Alert.alert('Sucesso', 'Contrato salvo como rascunho');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao salvar');
    }
    setSaving(false);
  };

  const handleEnviarWhatsApp = () => {
    const phone = clienteTel.replace(/\D/g, '');
    const msg = encodeURIComponent(
      `Ola ${clienteNome}! Segue o link para assinatura do seu contrato:\n${assinaturaUrl}`
    );
    const url = phone
      ? `whatsapp://send?phone=55${phone}&text=${msg}`
      : `whatsapp://send?text=${msg}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://wa.me/${phone ? `55${phone}` : ''}?text=${msg}`).catch(() => {
        Alert.alert('Erro', 'Nao foi possivel abrir o WhatsApp');
      });
    });
  };

  const handleCopiarLink = async () => {
    if (assinaturaUrl) {
      await Clipboard.setStringAsync(assinaturaUrl);
      Alert.alert('Copiado!', 'Link copiado para a area de transferencia');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Ionicons name="flash" size={20} color={colors.primary} style={{ marginRight: 6 }} />
        <Text style={styles.headerTitle}>Novo Contrato</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Section: Cliente */}
        <Text style={styles.sectionLabel}>CLIENTE</Text>
        <TextInput style={styles.input} value={clienteNome} onChangeText={setClienteNome}
          placeholder="Nome do cliente *" placeholderTextColor={colors.textMuted} />
        <TextInput style={[styles.input, { marginTop: spacing.sm }]} value={clienteTel}
          onChangeText={setClienteTel} placeholder="Telefone (WhatsApp)"
          placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />

        {/* Section: Plano */}
        <Text style={styles.sectionLabel}>PLANO *</Text>
        <View style={styles.planoRow}>
          {PLANOS.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.planoCard, plano === p.key && styles.planoCardActive]}
              onPress={() => setPlano(p.key)} activeOpacity={0.7}
            >
              <Ionicons name="tv-outline" size={24}
                color={plano === p.key ? colors.primary : colors.textMuted} />
              <Text style={[styles.planoLabel, plano === p.key && { color: colors.primary }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Adicionais */}
        <Text style={styles.sectionLabel}>ADICIONAIS</Text>
        <View style={styles.adcRow}>
          {ADICIONAIS.map(adc => {
            const sel = adicionais.includes(adc);
            return (
              <TouchableOpacity
                key={adc}
                style={[styles.adcChip, sel && styles.adcChipActive]}
                onPress={() => toggleAdicional(adc)}
              >
                <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={16}
                  color={sel ? colors.primary : colors.textMuted} />
                <Text style={[styles.adcText, sel && { color: colors.primary }]}>{adc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Valor */}
        <Text style={styles.sectionLabel}>VALOR MENSAL (R$)</Text>
        <TextInput style={styles.input} value={valorMensal} onChangeText={setValorMensal}
          placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="numeric" />

        {/* Datas */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>INICIO</Text>
            <TextInput style={styles.input} value={dataInicio} onChangeText={setDataInicio}
              placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>FIM</Text>
            <TextInput style={styles.input} value={dataFim} onChangeText={setDataFim}
              placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
          </View>
        </View>

        {/* Titulo */}
        <Text style={styles.sectionLabel}>TITULO</Text>
        <TextInput style={styles.input} value={titulo} onChangeText={setTitulo}
          placeholder="Auto-gerado" placeholderTextColor={colors.textMuted} />

        {/* Conteudo */}
        <Text style={styles.sectionLabel}>TERMOS DO CONTRATO</Text>
        <TextInput style={[styles.input, { height: 160, textAlignVertical: 'top' }]}
          value={conteudo} onChangeText={setConteudo} multiline
          placeholderTextColor={colors.textMuted} />

        {/* Actions */}
        <TouchableOpacity
          style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
          onPress={handleCriarEnviar} disabled={saving} activeOpacity={0.7}
        >
          {saving ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="flash" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Criar e Enviar p/ Assinatura</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={handleSalvarRascunho}
          disabled={saving} activeOpacity={0.7}>
          <Ionicons name="save-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.secondaryBtnText}>Salvar Rascunho</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={56} color={colors.success} />
            </View>
            <Text style={styles.modalTitle}>Contrato Criado!</Text>
            <Text style={styles.modalSub}>O contrato foi enviado para assinatura digital</Text>

            {assinaturaUrl ? (
              <>
                <View style={styles.linkBox}>
                  <Text style={styles.linkText} numberOfLines={2}>{assinaturaUrl}</Text>
                </View>

                <TouchableOpacity style={styles.whatsappBtn} onPress={handleEnviarWhatsApp}>
                  <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                  <Text style={styles.whatsappBtnText}>Enviar via WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.copyBtn} onPress={handleCopiarLink}>
                  <Ionicons name="copy-outline" size={18} color={colors.primary} />
                  <Text style={styles.copyBtnText}>Copiar Link</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.modalSub}>Contrato salvo com sucesso</Text>
            )}

            <TouchableOpacity style={styles.closeModalBtn}
              onPress={() => { setShowSuccess(false); navigation.goBack(); }}>
              <Text style={styles.closeModalText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  sectionLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: '700',
    letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.textPrimary, fontSize: fontSize.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  planoRow: { flexDirection: 'row', gap: spacing.sm },
  planoCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, borderWidth: 2, borderColor: colors.border,
  },
  planoCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '11' },
  planoLabel: { color: colors.textPrimary, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  adcRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  adcChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm, backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border,
  },
  adcChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '11' },
  adcText: { color: colors.textPrimary, fontSize: fontSize.sm },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, marginTop: spacing.xl,
  },
  primaryBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: borderRadius.md, paddingVertical: spacing.md, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.xl, width: '100%', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  successIcon: { marginBottom: spacing.md },
  modalTitle: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing.xs },
  modalSub: { color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center', marginBottom: spacing.md },
  linkBox: {
    backgroundColor: colors.bgInput, borderRadius: borderRadius.sm,
    padding: spacing.sm, width: '100%', marginBottom: spacing.md,
  },
  linkText: { color: colors.info, fontSize: fontSize.xs, textAlign: 'center' },
  whatsappBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: '#25D366', borderRadius: borderRadius.md,
    paddingVertical: spacing.sm, width: '100%', marginBottom: spacing.sm,
  },
  whatsappBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: borderRadius.md, paddingVertical: spacing.sm, width: '100%',
    borderWidth: 1, borderColor: colors.primary + '44', marginBottom: spacing.sm,
  },
  copyBtnText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
  closeModalBtn: { paddingVertical: spacing.sm },
  closeModalText: { color: colors.textMuted, fontSize: fontSize.sm },
});
