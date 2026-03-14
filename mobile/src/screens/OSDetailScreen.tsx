import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, StatusBar,
  Alert, TextInput, ActivityIndicator, Modal, Image, Dimensions, Linking, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as api from '../services/api';
import SignaturePad from '../components/SignaturePad';
import { colors, gradients, spacing, borderRadius, fontSize } from '../theme';
import type { OrdemServico, OSFoto } from '../types';

const { width: SCREEN_W } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_W - spacing.lg * 2 - spacing.md * 2 - spacing.sm * 2) / 3;

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

const STEPS = [
  { key: 'enviada', label: 'Enviada', icon: 'paper-plane-outline' as const },
  { key: 'aceita', label: 'Aceita', icon: 'checkmark-circle-outline' as const },
  { key: 'em_deslocamento', label: 'Desloc.', icon: 'car-outline' as const },
  { key: 'em_execucao', label: 'Execucao', icon: 'construct-outline' as const },
  { key: 'concluida', label: 'Concluida', icon: 'trophy-outline' as const },
];

function getStepIndex(status: string): number {
  const idx = STEPS.findIndex(s => s.key === status);
  return idx >= 0 ? idx : -1;
}

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch {
    return dateStr;
  }
}

function StatusStepper({ status }: { status: string }) {
  const currentIdx = getStepIndex(status);
  const isTerminal = status === 'recusada' || status === 'cancelada';

  return (
    <View style={stepperStyles.container}>
      {STEPS.map((step, i) => {
        const isActive = i <= currentIdx && !isTerminal;
        const isCurrent = i === currentIdx && !isTerminal;
        const stepColor = isActive ? (STATUS_COLORS[step.key] || colors.primary) : colors.textMuted;

        return (
          <React.Fragment key={step.key}>
            <View style={stepperStyles.stepCol}>
              <View style={[
                stepperStyles.circle,
                { backgroundColor: isActive ? stepColor + '22' : colors.bgInput, borderColor: stepColor },
                isCurrent && { borderWidth: 2 },
              ]}>
                <Ionicons name={step.icon} size={16} color={stepColor} />
              </View>
              <Text style={[stepperStyles.label, { color: isActive ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>
                {step.label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[stepperStyles.line, { backgroundColor: i < currentIdx && !isTerminal ? stepColor : colors.border }]} />
            )}
          </React.Fragment>
        );
      })}
      {isTerminal && (
        <View style={[stepperStyles.terminalBadge, { backgroundColor: colors.danger + '22' }]}>
          <Ionicons name="close-circle" size={16} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: fontSize.xs, fontWeight: '600', marginLeft: 4 }}>
            {status === 'recusada' ? 'Recusada' : 'Cancelada'}
          </Text>
        </View>
      )}
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border, flexWrap: 'wrap',
  },
  stepCol: { alignItems: 'center', width: 52 },
  circle: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginBottom: 4,
  },
  label: { fontSize: 9, textAlign: 'center' },
  line: { height: 2, flex: 1, alignSelf: 'center', marginTop: 17, marginHorizontal: -2 },
  terminalBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm, marginTop: spacing.sm, width: '100%', justifyContent: 'center',
  },
});

function InfoRow({ icon, label, value, action }: { icon: any; label: string; value?: string | null; action?: React.ReactNode }) {
  if (!value) return null;
  return (
    <View style={infoStyles.row}>
      <Ionicons name={icon} size={16} color={colors.textMuted} style={{ marginRight: spacing.sm, marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={infoStyles.label}>{label}</Text>
        <Text style={infoStyles.value} numberOfLines={3}>{value}</Text>
      </View>
      {action}
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600', marginBottom: 2 },
  value: { color: colors.textPrimary, fontSize: fontSize.sm },
});

function SectionHeader({ icon, color, title, right }: { icon: string; color: string; title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

export default function OSDetailScreen({ route, navigation }: any) {
  const { osId } = route.params;
  const insets = useSafeAreaInsets();
  const [os, setOs] = useState<OrdemServico | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [obsText, setObsText] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<OSFoto | null>(null);
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  const baseUrl = api.getBaseUrl();

  const fetchOS = useCallback(async () => {
    try {
      const data = await api.getOSDetalhe(osId);
      setOs(data);
    } catch {}
  }, [osId]);

  useEffect(() => { fetchOS(); }, [fetchOS]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOS();
    setRefreshing(false);
  }, [fetchOS]);

  const handleAction = async (action: () => Promise<any>, confirmMsg?: string) => {
    if (confirmMsg) {
      return new Promise<void>((resolve) => {
        Alert.alert('Confirmar', confirmMsg, [
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve() },
          {
            text: 'Confirmar', onPress: async () => {
              setActionLoading(true);
              try { await action(); await fetchOS(); } catch (e: any) { Alert.alert('Erro', e.message || 'Erro ao executar acao'); }
              setActionLoading(false);
              resolve();
            },
          },
        ]);
      });
    }
    setActionLoading(true);
    try { await action(); await fetchOS(); } catch (e: any) { Alert.alert('Erro', e.message || 'Erro ao executar acao'); }
    setActionLoading(false);
  };

  const handleRecusar = () => {
    Alert.prompt
      ? Alert.prompt('Recusar OS', 'Informe o motivo:', (motivo) => {
          if (motivo) handleAction(() => api.recusarOS(osId, motivo));
        })
      : Alert.alert('Recusar OS', 'Deseja recusar esta OS?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Recusar', style: 'destructive', onPress: () => handleAction(() => api.recusarOS(osId, 'Recusada pelo tecnico')) },
        ]);
  };

  const handleConcluir = () => {
    // Show signature modal first
    setSignatureModalVisible(true);
  };

  const confirmarConclusao = () => {
    setSignatureModalVisible(false);
    handleAction(
      () => api.concluirOS(osId, {
        observacoes_tecnico: obsText || undefined,
        assinatura_base64: signatureBase64 || undefined,
      }),
      'Confirmar conclusao desta OS?',
    );
  };

  const handleToggleChecklist = async (itemId: number) => {
    try {
      await api.toggleChecklistOS(itemId);
      await fetchOS();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao atualizar checklist');
    }
  };

  const openMaps = () => {
    if (!os) return;
    const address = encodeURIComponent(`${os.endereco}${os.endereco_complemento ? ', ' + os.endereco_complemento : ''}`);
    if (os.latitude && os.longitude) {
      const url = Platform.select({
        ios: `maps:0,0?q=${os.latitude},${os.longitude}`,
        android: `geo:${os.latitude},${os.longitude}?q=${os.latitude},${os.longitude}(${address})`,
      });
      if (url) Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`));
    } else {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`);
    }
  };

  const callClient = () => {
    if (os?.cliente_telefone) {
      Linking.openURL(`tel:${os.cliente_telefone}`);
    }
  };

  const pickPhoto = async (tipo: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissao necessaria', 'Precisamos de acesso a camera para tirar fotos.');
      return;
    }

    Alert.alert('Adicionar Foto', `Tipo: ${tipo === 'antes' ? 'Antes' : tipo === 'depois' ? 'Depois' : 'Evidencia'}`, [
      {
        text: 'Camera',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.7,
          });
          if (!result.canceled && result.assets[0]) {
            uploadPhoto(result.assets[0].uri, tipo);
          }
        },
      },
      {
        text: 'Galeria',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.7,
          });
          if (!result.canceled && result.assets[0]) {
            uploadPhoto(result.assets[0].uri, tipo);
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const uploadPhoto = async (uri: string, tipo: string) => {
    setUploadingPhoto(true);
    try {
      await api.uploadFotoOS(osId, uri, tipo);
      await fetchOS();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao enviar foto');
    }
    setUploadingPhoto(false);
  };

  const deletePhoto = (fotoId: number) => {
    Alert.alert('Remover foto', 'Deseja remover esta foto?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteFotoOS(fotoId);
            setPhotoViewerVisible(false);
            await fetchOS();
          } catch (e: any) {
            Alert.alert('Erro', e.message || 'Erro ao remover foto');
          }
        },
      },
    ]);
  };

  if (!os) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const statusColor = STATUS_COLORS[os.status] || colors.textMuted;
  const fotos = os.fotos || [];
  const fotosAntes = fotos.filter(f => f.tipo === 'antes');
  const fotosDepois = fotos.filter(f => f.tipo === 'depois');
  const fotosEvidencia = fotos.filter(f => f.tipo === 'evidencia' || (!f.tipo));

  const canAddPhotos = ['aceita', 'em_deslocamento', 'em_execucao'].includes(os.status);
  const checklistDone = os.checklist ? os.checklist.filter(c => c.concluido).length : 0;
  const checklistTotal = os.checklist ? os.checklist.length : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>OS #{os.numero}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.headerSub, { color: statusColor }]}>
              {os.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('OSChat', { osId: os.id, osNumero: os.numero })} style={styles.chatBtn}>
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Status Stepper */}
        <StatusStepper status={os.status} />

        {/* Client Info */}
        <View style={styles.section}>
          <SectionHeader icon="person-outline" color={colors.primary} title="Cliente" />
          <InfoRow icon="person" label="Nome" value={os.cliente_nome} />
          <InfoRow
            icon="call-outline"
            label="Telefone"
            value={os.cliente_telefone}
            action={os.cliente_telefone ? (
              <TouchableOpacity onPress={callClient} style={styles.actionIconBtn}>
                <Ionicons name="call" size={18} color={colors.success} />
              </TouchableOpacity>
            ) : undefined}
          />
          <InfoRow icon="document-text-outline" label="Documento" value={os.cliente_documento} />
          <InfoRow
            icon="location-outline"
            label="Endereco"
            value={`${os.endereco}${os.endereco_complemento ? '\n' + os.endereco_complemento : ''}`}
            action={
              <TouchableOpacity onPress={openMaps} style={styles.actionIconBtn}>
                <Ionicons name="navigate" size={18} color={colors.info} />
              </TouchableOpacity>
            }
          />
        </View>

        {/* Service Info */}
        <View style={styles.section}>
          <SectionHeader icon="construct-outline" color={colors.purpleLight} title="Servico" />
          <InfoRow icon="pricetag-outline" label="Tipo" value={os.tipo_servico} />
          <InfoRow icon="alert-circle-outline" label="Prioridade" value={os.prioridade} />
          <InfoRow icon="calendar-outline" label="Agendamento" value={formatDateTime(os.data_agendamento)} />
          <InfoRow icon="person-outline" label="Criado por" value={os.criador_nome} />
          {os.descricao ? (
            <View style={styles.descBox}>
              <Text style={styles.descLabel}>Descricao</Text>
              <Text style={styles.descText}>{os.descricao}</Text>
            </View>
          ) : null}
        </View>

        {/* Equipment */}
        {os.equipamentos ? (
          <View style={styles.section}>
            <SectionHeader icon="hardware-chip-outline" color={colors.warningDark} title="Equipamentos" />
            {os.equipamentos.split(/[,\n]/).filter(e => e.trim()).map((equip, i) => (
              <View key={i} style={styles.equipItem}>
                <Ionicons name="cube-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.equipText}>{equip.trim()}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Checklist */}
        {os.checklist && os.checklist.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              icon="checkbox-outline"
              color={colors.success}
              title="Checklist"
              right={
                <View style={styles.checkCountRow}>
                  <View style={styles.checkProgressBar}>
                    <View style={[styles.checkProgressFill, { width: `${checklistTotal > 0 ? (checklistDone / checklistTotal) * 100 : 0}%` }]} />
                  </View>
                  <Text style={styles.checkCount}>{checklistDone}/{checklistTotal}</Text>
                </View>
              }
            />
            {os.checklist.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.checkItem}
                onPress={() => handleToggleChecklist(item.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.concluido ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={item.concluido ? colors.success : colors.textMuted}
                />
                <Text style={[
                  styles.checkText,
                  item.concluido ? { textDecorationLine: 'line-through' as const, color: colors.textMuted } : null,
                ]}>
                  {item.descricao}
                </Text>
                {item.concluido_em && (
                  <Text style={styles.checkTime}>{formatDateTime(item.concluido_em).slice(0, 5)}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Photos Section */}
        <View style={styles.section}>
          <SectionHeader icon="camera-outline" color={colors.info} title="Fotos" right={
            <Text style={styles.photoCount}>{fotos.length} foto{fotos.length !== 1 ? 's' : ''}</Text>
          } />

          {canAddPhotos && (
            <View style={styles.photoActions}>
              <TouchableOpacity style={[styles.photoBtn, { borderColor: colors.info }]} onPress={() => pickPhoto('antes')} disabled={uploadingPhoto}>
                <Ionicons name="camera-outline" size={18} color={colors.info} />
                <Text style={[styles.photoBtnText, { color: colors.info }]}>Antes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.photoBtn, { borderColor: colors.success }]} onPress={() => pickPhoto('depois')} disabled={uploadingPhoto}>
                <Ionicons name="camera-outline" size={18} color={colors.success} />
                <Text style={[styles.photoBtnText, { color: colors.success }]}>Depois</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.photoBtn, { borderColor: colors.warningDark }]} onPress={() => pickPhoto('evidencia')} disabled={uploadingPhoto}>
                <Ionicons name="image-outline" size={18} color={colors.warningDark} />
                <Text style={[styles.photoBtnText, { color: colors.warningDark }]}>Evidencia</Text>
              </TouchableOpacity>
            </View>
          )}

          {uploadingPhoto && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.uploadingText}>Enviando foto...</Text>
            </View>
          )}

          {fotos.length === 0 && !canAddPhotos && (
            <Text style={styles.noPhotos}>Nenhuma foto registrada</Text>
          )}

          {/* Photo groups */}
          {fotosAntes.length > 0 && (
            <View style={styles.photoGroup}>
              <Text style={[styles.photoGroupLabel, { color: colors.info }]}>Antes ({fotosAntes.length})</Text>
              <View style={styles.photoGrid}>
                {fotosAntes.map(f => (
                  <TouchableOpacity key={f.id} onPress={() => { setSelectedPhoto(f); setPhotoViewerVisible(true); }}>
                    <Image source={{ uri: `${baseUrl}${f.caminho}` }} style={styles.photoThumb} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {fotosDepois.length > 0 && (
            <View style={styles.photoGroup}>
              <Text style={[styles.photoGroupLabel, { color: colors.success }]}>Depois ({fotosDepois.length})</Text>
              <View style={styles.photoGrid}>
                {fotosDepois.map(f => (
                  <TouchableOpacity key={f.id} onPress={() => { setSelectedPhoto(f); setPhotoViewerVisible(true); }}>
                    <Image source={{ uri: `${baseUrl}${f.caminho}` }} style={styles.photoThumb} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {fotosEvidencia.length > 0 && (
            <View style={styles.photoGroup}>
              <Text style={[styles.photoGroupLabel, { color: colors.warningDark }]}>Evidencias ({fotosEvidencia.length})</Text>
              <View style={styles.photoGrid}>
                {fotosEvidencia.map(f => (
                  <TouchableOpacity key={f.id} onPress={() => { setSelectedPhoto(f); setPhotoViewerVisible(true); }}>
                    <Image source={{ uri: `${baseUrl}${f.caminho}` }} style={styles.photoThumb} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Historico */}
        {os.historico && os.historico.length > 0 && (
          <View style={styles.section}>
            <SectionHeader icon="time-outline" color={colors.warningDark} title="Historico" />
            {os.historico.map(h => (
              <View key={h.id} style={styles.histItem}>
                <View style={styles.histDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.histAcao}>{h.acao}</Text>
                  {h.detalhes ? <Text style={styles.histDetail}>{h.detalhes}</Text> : null}
                  <Text style={styles.histDate}>
                    {h.usuario_nome ? `${h.usuario_nome} - ` : ''}{formatDateTime(h.criado_em)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Timestamps */}
        <View style={styles.section}>
          <SectionHeader icon="timer-outline" color={colors.textSecondary} title="Tempos" />
          <InfoRow icon="create-outline" label="Criada" value={formatDateTime(os.criado_em)} />
          <InfoRow icon="paper-plane-outline" label="Enviada" value={formatDateTime(os.data_envio)} />
          <InfoRow icon="checkmark-circle-outline" label="Aceita" value={formatDateTime(os.data_aceite)} />
          <InfoRow icon="car-outline" label="Deslocamento" value={formatDateTime(os.data_inicio_deslocamento)} />
          <InfoRow icon="construct-outline" label="Execucao" value={formatDateTime(os.data_inicio_execucao)} />
          <InfoRow icon="trophy-outline" label="Conclusao" value={formatDateTime(os.data_conclusao)} />
        </View>

        {/* Observacoes tecnico (for em_execucao) */}
        {os.status === 'em_execucao' && (
          <View style={styles.section}>
            <SectionHeader icon="create-outline" color={colors.info} title="Observacoes do Tecnico" />
            <TextInput
              style={styles.obsInput}
              placeholder="Descreva o que foi realizado, problemas encontrados..."
              placeholderTextColor={colors.textMuted}
              value={obsText}
              onChangeText={setObsText}
              multiline
              numberOfLines={4}
            />
          </View>
        )}

        {/* Existing observations if concluded */}
        {os.observacoes_tecnico && os.status !== 'em_execucao' && (
          <View style={styles.section}>
            <SectionHeader icon="create-outline" color={colors.info} title="Observacoes do Tecnico" />
            <Text style={styles.descText}>{os.observacoes_tecnico}</Text>
          </View>
        )}

        {/* Existing signature if concluded */}
        {os.assinatura_base64 && os.status !== 'em_execucao' && (
          <View style={styles.section}>
            <SectionHeader icon="pencil-outline" color={colors.purple} title="Assinatura do Cliente" />
            <View style={styles.signedBadge}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.signedText}>Assinatura registrada</Text>
            </View>
          </View>
        )}

        {/* Spacer for action buttons */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action Buttons */}
      {actionLoading ? (
        <View style={styles.actionBar}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : os.status === 'enviada' ? (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.success, flex: 1, marginRight: spacing.sm }]}
            onPress={() => handleAction(() => api.aceitarOS(osId), 'Aceitar esta OS?')}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Aceitar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.danger, flex: 1 }]}
            onPress={handleRecusar}
          >
            <Ionicons name="close-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Recusar</Text>
          </TouchableOpacity>
        </View>
      ) : os.status === 'aceita' ? (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.blue, flex: 1 }]}
            onPress={() => handleAction(() => api.deslocamentoOS(osId), 'Iniciar deslocamento?')}
          >
            <Ionicons name="car" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Iniciar Deslocamento</Text>
          </TouchableOpacity>
        </View>
      ) : os.status === 'em_deslocamento' ? (
        <View style={styles.actionBar}>
          <TouchableOpacity onPress={openMaps} style={[styles.actionBtn, { backgroundColor: colors.info, marginRight: spacing.sm }]}>
            <Ionicons name="navigate" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.warningDark, flex: 1 }]}
            onPress={() => handleAction(() => api.iniciarOS(osId), 'Chegou no local? Iniciar execucao?')}
          >
            <Ionicons name="construct" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Cheguei - Iniciar</Text>
          </TouchableOpacity>
        </View>
      ) : os.status === 'em_execucao' ? (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.success, flex: 1 }]}
            onPress={handleConcluir}
          >
            <Ionicons name="trophy" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Concluir OS</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Floating Chat Button for terminal states */}
      {(os.status === 'concluida' || os.status === 'recusada' || os.status === 'cancelada') && (
        <TouchableOpacity
          style={styles.floatingChat}
          onPress={() => navigation.navigate('OSChat', { osId: os.id, osNumero: os.numero })}
        >
          <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Signature Modal */}
      <Modal visible={signatureModalVisible} transparent animationType="slide" onRequestClose={() => setSignatureModalVisible(false)}>
        <View style={styles.signatureModalOverlay}>
          <View style={styles.signatureModalContent}>
            <View style={styles.signatureModalHeader}>
              <Text style={styles.signatureModalTitle}>Assinatura do Cliente</Text>
              <TouchableOpacity onPress={() => setSignatureModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.signatureModalSubtitle}>
              Solicite ao cliente que assine abaixo para confirmar o servico realizado.
            </Text>
            {signatureBase64 ? (
              <View>
                <View style={styles.signedBadge}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <Text style={styles.signedText}>Assinatura capturada</Text>
                </View>
                <TouchableOpacity onPress={() => setSignatureBase64(null)} style={styles.resignBtn}>
                  <Text style={styles.resignBtnText}>Assinar novamente</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <SignaturePad
                onSignatureCapture={(base64) => setSignatureBase64(base64)}
                onClear={() => setSignatureBase64(null)}
              />
            )}
            <View style={styles.signatureModalActions}>
              {!signatureBase64 && (
                <TouchableOpacity
                  style={[styles.signatureModalBtn, styles.signatureModalBtnSkip]}
                  onPress={confirmarConclusao}
                >
                  <Text style={styles.signatureModalBtnSkipText}>Pular e concluir</Text>
                </TouchableOpacity>
              )}
              {signatureBase64 && (
                <TouchableOpacity
                  style={[styles.signatureModalBtn, styles.signatureModalBtnConfirm]}
                  onPress={confirmarConclusao}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.signatureModalBtnConfirmText}>Concluir OS</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo Viewer Modal */}
      <Modal visible={photoViewerVisible} transparent animationType="fade" onRequestClose={() => setPhotoViewerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setPhotoViewerVisible(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {selectedPhoto?.tipo === 'antes' ? 'Antes' : selectedPhoto?.tipo === 'depois' ? 'Depois' : 'Evidencia'}
            </Text>
            {canAddPhotos && selectedPhoto && (
              <TouchableOpacity onPress={() => deletePhoto(selectedPhoto.id)} style={styles.modalDeleteBtn}>
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>
          {selectedPhoto && (
            <Image
              source={{ uri: `${baseUrl}${selectedPhoto.caminho}` }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          )}
          {selectedPhoto?.legenda && (
            <Text style={styles.modalCaption}>{selectedPhoto.legenda}</Text>
          )}
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
  headerSub: { fontSize: fontSize.sm, fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  chatBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.glassLight, alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg },
  section: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '700', marginLeft: spacing.sm, flex: 1 },
  actionIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.glassLight, alignItems: 'center', justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  descBox: { marginTop: spacing.sm, backgroundColor: colors.bgInput, borderRadius: borderRadius.sm, padding: spacing.md },
  descLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600', marginBottom: 4 },
  descText: { color: colors.textPrimary, fontSize: fontSize.sm, lineHeight: 20 },

  // Equipment
  equipItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  equipText: { color: colors.textPrimary, fontSize: fontSize.sm, marginLeft: spacing.sm, flex: 1 },

  // Checklist
  checkCountRow: { flexDirection: 'row', alignItems: 'center' },
  checkProgressBar: { width: 40, height: 4, backgroundColor: colors.bgInput, borderRadius: 2, marginRight: spacing.sm },
  checkProgressFill: { height: 4, backgroundColor: colors.success, borderRadius: 2 },
  checkCount: { color: colors.textSecondary, fontSize: fontSize.sm },
  checkItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  checkText: { color: colors.textPrimary, fontSize: fontSize.sm, marginLeft: spacing.sm, flex: 1 },
  checkTime: { color: colors.textMuted, fontSize: 10 },

  // Photos
  photoCount: { color: colors.textSecondary, fontSize: fontSize.sm },
  photoActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  photoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm, borderRadius: borderRadius.sm,
    borderWidth: 1, borderStyle: 'dashed',
  },
  photoBtnText: { fontSize: fontSize.xs, fontWeight: '600', marginLeft: 4 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  uploadingText: { color: colors.textSecondary, fontSize: fontSize.sm, marginLeft: spacing.sm },
  noPhotos: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: spacing.md },
  photoGroup: { marginBottom: spacing.sm },
  photoGroupLabel: { fontSize: fontSize.xs, fontWeight: '700', marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoThumb: {
    width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: borderRadius.sm,
    backgroundColor: colors.bgInput,
  },

  // History
  histItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  histDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary,
    marginTop: 5, marginRight: spacing.sm,
  },
  histAcao: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '600' },
  histDetail: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  histDate: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },

  // Signature
  signedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.success + '15', borderRadius: borderRadius.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.success + '33',
  },
  signedText: {
    color: colors.success, fontSize: fontSize.sm, fontWeight: '600', marginLeft: spacing.sm,
  },
  resignBtn: {
    alignItems: 'center', marginTop: spacing.sm,
  },
  resignBtnText: {
    color: colors.textSecondary, fontSize: fontSize.xs, textDecorationLine: 'underline',
  },

  // Signature modal
  signatureModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  signatureModalContent: {
    backgroundColor: colors.bgBody, borderTopLeftRadius: borderRadius.lg, borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg, paddingBottom: spacing.xl,
  },
  signatureModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  signatureModalTitle: {
    color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: '700',
  },
  signatureModalSubtitle: {
    color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.md, lineHeight: 20,
  },
  signatureModalActions: {
    marginTop: spacing.md, gap: spacing.sm,
  },
  signatureModalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, borderRadius: borderRadius.md,
  },
  signatureModalBtnSkip: {
    backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border,
  },
  signatureModalBtnSkipText: {
    color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '600',
  },
  signatureModalBtnConfirm: {
    backgroundColor: colors.success,
  },
  signatureModalBtnConfirmText: {
    color: '#fff', fontSize: fontSize.md, fontWeight: '700', marginLeft: spacing.sm,
  },

  // Observations
  obsInput: {
    backgroundColor: colors.bgInput, borderRadius: borderRadius.sm,
    padding: spacing.md, color: colors.textPrimary, fontSize: fontSize.sm,
    minHeight: 100, textAlignVertical: 'top',
    borderWidth: 1, borderColor: colors.border,
  },

  // Action bar
  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.bgBody, borderTopWidth: 1, borderTopColor: colors.border,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, borderRadius: borderRadius.md, paddingHorizontal: spacing.md,
  },
  actionBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700', marginLeft: spacing.sm },
  floatingChat: {
    position: 'absolute', bottom: spacing.lg, right: spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 6,
  },

  // Photo viewer modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalHeader: {
    position: 'absolute', top: 50, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, zIndex: 10,
  },
  modalCloseBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: '#fff', fontSize: fontSize.lg, fontWeight: '700' },
  modalDeleteBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalImage: { width: SCREEN_W - spacing.lg * 2, height: SCREEN_W - spacing.lg * 2, borderRadius: borderRadius.md },
  modalCaption: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.md, textAlign: 'center' },
});
