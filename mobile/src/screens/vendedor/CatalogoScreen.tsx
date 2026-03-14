import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients, spacing, borderRadius, fontSize } from '../../theme';

interface Plano {
  key: string;
  nome: string;
  preco: string;
  precoNum: number;
  descricao: string;
  canais: string[];
  velocidade: string;
  destaque?: boolean;
  cor: string;
}

const PLANOS: Plano[] = [
  {
    key: 'zapping_lite_plus',
    nome: 'Zapping Lite Plus',
    preco: 'R$ 69,90',
    precoNum: 69.9,
    descricao: 'Ideal para quem quer o essencial com qualidade',
    canais: ['Canais abertos HD', 'SBT', 'Record', 'Band', 'Cultura', 'TV Aparecida', '+30 canais'],
    velocidade: '100 Mbps',
    cor: '#0dcaf0',
  },
  {
    key: 'zapping_full',
    nome: 'Zapping Full',
    preco: 'R$ 119,90',
    precoNum: 119.9,
    descricao: 'O pacote completo com esportes e filmes',
    canais: ['Tudo do Lite Plus', 'ESPN', 'SportTV', 'TNT', 'Discovery', 'History', 'National Geographic', '+80 canais'],
    velocidade: '300 Mbps',
    destaque: true,
    cor: colors.primary,
  },
  {
    key: 'liteplus_full',
    nome: 'Lite Plus + Full',
    preco: 'R$ 159,90',
    precoNum: 159.9,
    descricao: 'O melhor dos dois mundos - combo premium',
    canais: ['Tudo do Full', 'Canais premium', 'Conteudo 4K', 'Multi-tela (3 devices)', '+120 canais'],
    velocidade: '500 Mbps',
    cor: colors.purple,
  },
];

interface Adicional {
  nome: string;
  preco: string;
  precoNum: number;
  icon: string;
  descricao: string;
}

const ADICIONAIS: Adicional[] = [
  { nome: 'Telecine', preco: 'R$ 29,90', precoNum: 29.9, icon: 'film-outline', descricao: '4 canais de cinema premium + streaming' },
  { nome: 'Combate', preco: 'R$ 39,90', precoNum: 39.9, icon: 'fitness-outline', descricao: 'UFC, Boxe e MMA ao vivo' },
  { nome: 'Premiere', preco: 'R$ 49,90', precoNum: 49.9, icon: 'football-outline', descricao: 'Todos os jogos do Brasileirao' },
  { nome: 'HBO Max', preco: 'R$ 34,90', precoNum: 34.9, icon: 'play-circle-outline', descricao: 'Series, filmes e originais HBO' },
];

const OFERTAS = [
  { titulo: '3 meses gratis de HBO Max', descricao: 'Na contratacao do plano Full ou superior', validade: 'Valido ate 30/04', cor: '#7b2fbe' },
  { titulo: 'Instalacao gratis', descricao: 'Para novos clientes - sem taxa de adesao', validade: 'Promocao permanente', cor: colors.success },
  { titulo: 'Premiere por R$ 29,90', descricao: 'Desconto de R$ 20 no combo com Full', validade: 'Valido ate 15/04', cor: colors.primary },
];

export default function CatalogoScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [expandedPlan, setExpandedPlan] = useState<string | null>('zapping_full');

  const handleCompartilhar = async (plano: Plano) => {
    const adcList = ADICIONAIS.map(a => `  - ${a.nome}: ${a.preco}/mes`).join('\n');
    const msg =
      `*${plano.nome}* - ${plano.preco}/mes\n\n` +
      `${plano.descricao}\n` +
      `Internet: ${plano.velocidade}\n` +
      `Canais: ${plano.canais.join(', ')}\n\n` +
      `*Adicionais disponiveis:*\n${adcList}\n\n` +
      `Entre em contato para mais informacoes!`;
    try {
      await Share.share({ message: msg });
    } catch {}
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <Text style={styles.headerTitle}>Catalogo</Text>
        <Text style={styles.headerSub}>Planos e Ofertas</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Ofertas Ativas */}
        <Text style={styles.sectionTitle}>OFERTAS ATIVAS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
          {OFERTAS.map((oferta, i) => (
            <View key={i} style={[styles.ofertaCard, { borderLeftColor: oferta.cor }]}>
              <Text style={[styles.ofertaTitulo, { color: oferta.cor }]}>{oferta.titulo}</Text>
              <Text style={styles.ofertaDesc}>{oferta.descricao}</Text>
              <Text style={styles.ofertaValidade}>{oferta.validade}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Planos */}
        <Text style={styles.sectionTitle}>PLANOS</Text>
        {PLANOS.map((plano) => {
          const isExpanded = expandedPlan === plano.key;
          return (
            <TouchableOpacity
              key={plano.key}
              style={[styles.planoCard, plano.destaque && styles.planoDestaque, { borderLeftColor: plano.cor }]}
              onPress={() => setExpandedPlan(isExpanded ? null : plano.key)}
              activeOpacity={0.8}
            >
              {plano.destaque && (
                <View style={[styles.destaqueBadge, { backgroundColor: plano.cor }]}>
                  <Ionicons name="star" size={10} color="#fff" />
                  <Text style={styles.destaqueText}>MAIS VENDIDO</Text>
                </View>
              )}
              <View style={styles.planoHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planoNome}>{plano.nome}</Text>
                  <Text style={styles.planoDesc}>{plano.descricao}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.planoPreco, { color: plano.cor }]}>{plano.preco}</Text>
                  <Text style={styles.planoPeriodo}>/mes</Text>
                </View>
              </View>

              <View style={styles.planoTags}>
                <View style={[styles.tagChip, { backgroundColor: plano.cor + '18' }]}>
                  <Ionicons name="wifi" size={12} color={plano.cor} />
                  <Text style={[styles.tagChipText, { color: plano.cor }]}>{plano.velocidade}</Text>
                </View>
                <View style={[styles.tagChip, { backgroundColor: plano.cor + '18' }]}>
                  <Ionicons name="tv" size={12} color={plano.cor} />
                  <Text style={[styles.tagChipText, { color: plano.cor }]}>{plano.canais[plano.canais.length - 1]}</Text>
                </View>
              </View>

              {isExpanded && (
                <View style={styles.planoExpanded}>
                  <Text style={styles.canaisTitle}>Canais inclusos:</Text>
                  {plano.canais.map((canal, ci) => (
                    <View key={ci} style={styles.canalRow}>
                      <Ionicons name="checkmark-circle" size={14} color={plano.cor} />
                      <Text style={styles.canalText}>{canal}</Text>
                    </View>
                  ))}
                  <TouchableOpacity style={[styles.compartilharBtn, { borderColor: plano.cor }]}
                    onPress={() => handleCompartilhar(plano)}>
                    <Ionicons name="share-outline" size={16} color={plano.cor} />
                    <Text style={[styles.compartilharText, { color: plano.cor }]}>Enviar pro cliente</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Adicionais */}
        <Text style={styles.sectionTitle}>ADICIONAIS</Text>
        <View style={styles.adcGrid}>
          {ADICIONAIS.map((adc) => (
            <View key={adc.nome} style={styles.adcCard}>
              <Ionicons name={adc.icon as any} size={24} color={colors.primary} />
              <Text style={styles.adcNome}>{adc.nome}</Text>
              <Text style={styles.adcPreco}>{adc.preco}/mes</Text>
              <Text style={styles.adcDesc}>{adc.descricao}</Text>
            </View>
          ))}
        </View>

        {/* Tabela Comparativa Rapida */}
        <Text style={styles.sectionTitle}>COMPARATIVO</Text>
        <View style={styles.compareCard}>
          <View style={styles.compareRow}>
            <Text style={styles.compareLabel}>Recurso</Text>
            {PLANOS.map(p => (
              <Text key={p.key} style={[styles.compareHeader, { color: p.cor }]} numberOfLines={1}>{p.nome.replace('Zapping ', '').replace('Lite Plus + Full', 'LP+Full')}</Text>
            ))}
          </View>
          {[
            { label: 'Internet', values: PLANOS.map(p => p.velocidade) },
            { label: 'Canais HD', values: ['+30', '+80', '+120'] },
            { label: 'ESPN/SportTV', values: ['--', 'Sim', 'Sim'] },
            { label: 'Multi-tela', values: ['1', '2', '3'] },
            { label: 'Conteudo 4K', values: ['--', '--', 'Sim'] },
          ].map((row, i) => (
            <View key={i} style={[styles.compareRow, i % 2 === 0 && { backgroundColor: colors.bgInput }]}>
              <Text style={styles.compareLabel}>{row.label}</Text>
              {row.values.map((v, vi) => (
                <Text key={vi} style={[styles.compareValue, v === 'Sim' && { color: colors.success, fontWeight: '700' }, v === '--' && { color: colors.textMuted }]}>{v}</Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBody },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerTitle: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '700' },
  headerSub: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sectionTitle: {
    color: colors.textMuted, fontSize: 11, fontWeight: '700',
    letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.sm,
  },
  // Ofertas
  ofertaCard: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginRight: spacing.sm, width: 220,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3,
  },
  ofertaTitulo: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: 4 },
  ofertaDesc: { color: colors.textSecondary, fontSize: fontSize.xs },
  ofertaValidade: { color: colors.textMuted, fontSize: 10, marginTop: spacing.xs },
  // Planos
  planoCard: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3,
  },
  planoDestaque: { borderColor: colors.primary + '44' },
  destaqueBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: borderRadius.sm, marginBottom: spacing.xs,
  },
  destaqueText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  planoHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  planoNome: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '700' },
  planoDesc: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  planoPreco: { fontSize: fontSize.lg, fontWeight: '800' },
  planoPeriodo: { color: colors.textMuted, fontSize: fontSize.xs },
  planoTags: { flexDirection: 'row', gap: spacing.sm },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.sm,
  },
  tagChipText: { fontSize: fontSize.xs, fontWeight: '600' },
  planoExpanded: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  canaisTitle: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600', marginBottom: spacing.xs },
  canalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 2 },
  canalText: { color: colors.textPrimary, fontSize: fontSize.sm },
  compartilharBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    marginTop: spacing.sm, paddingVertical: spacing.sm, borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  compartilharText: { fontSize: fontSize.sm, fontWeight: '600' },
  // Adicionais
  adcGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  adcCard: {
    flexBasis: '47%', flexGrow: 1, backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  adcNome: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '700', marginTop: spacing.xs },
  adcPreco: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
  adcDesc: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  // Comparativo
  compareCard: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  compareLabel: { flex: 1, color: colors.textSecondary, fontSize: 10, fontWeight: '600' },
  compareHeader: { flex: 1, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  compareValue: { flex: 1, color: colors.textPrimary, fontSize: 10, textAlign: 'center' },
});
