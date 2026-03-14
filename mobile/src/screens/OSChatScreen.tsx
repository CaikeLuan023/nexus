import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, StatusBar,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { colors, gradients, spacing, borderRadius, fontSize } from '../theme';
import type { OSMensagem } from '../types';

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  } catch {
    return '';
  }
}

function formatDateSeparator(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const today = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    if (d.toDateString() === today.toDateString()) return 'Hoje';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return `${day}/${month}/${d.getFullYear()}`;
  } catch {
    return '';
  }
}

function MessageBubble({ msg, isMine }: { msg: OSMensagem; isMine: boolean }) {
  return (
    <View style={[bubbleStyles.row, isMine ? bubbleStyles.rowRight : bubbleStyles.rowLeft]}>
      <View style={[bubbleStyles.bubble, isMine ? bubbleStyles.mine : bubbleStyles.other]}>
        {!isMine && msg.usuario_nome && (
          <Text style={bubbleStyles.senderName}>{msg.usuario_nome}</Text>
        )}
        <Text style={bubbleStyles.text}>{msg.texto}</Text>
        <Text style={[bubbleStyles.time, isMine ? bubbleStyles.timeRight : bubbleStyles.timeLeft]}>
          {formatTime(msg.criado_em)}
        </Text>
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: { marginBottom: spacing.sm, paddingHorizontal: spacing.md },
  rowRight: { alignItems: 'flex-end' },
  rowLeft: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '80%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  mine: {
    backgroundColor: colors.primary + '33',
    borderBottomRightRadius: spacing.xs,
    borderWidth: 1, borderColor: colors.primary + '44',
  },
  other: {
    backgroundColor: colors.bgCard,
    borderBottomLeftRadius: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  senderName: { color: colors.purpleLight, fontSize: fontSize.xs, fontWeight: '700', marginBottom: 2 },
  text: { color: colors.textPrimary, fontSize: fontSize.sm, lineHeight: 20 },
  time: { fontSize: 10, marginTop: 4 },
  timeRight: { color: colors.primaryLight, textAlign: 'right' },
  timeLeft: { color: colors.textMuted, textAlign: 'left' },
});

export default function OSChatScreen({ route, navigation }: any) {
  const { osId, osNumero } = route.params;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [mensagens, setMensagens] = useState<OSMensagem[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMensagens = useCallback(async () => {
    try {
      const data = await api.getMensagensOS(osId, 'desc');
      setMensagens(data);
    } catch {}
    setLoading(false);
  }, [osId]);

  useEffect(() => {
    fetchMensagens();
    intervalRef.current = setInterval(fetchMensagens, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchMensagens]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    setInputText('');
    // Optimistic: show message immediately
    const tempMsg: OSMensagem = {
      id: Date.now(),
      os_id: osId,
      usuario_id: user?.id || 0,
      usuario_nome: user?.nome,
      texto: text,
      lido: 0,
      criado_em: new Date().toISOString(),
    };
    setMensagens(prev => [tempMsg, ...prev]);
    try {
      await api.enviarMensagemOS(osId, text);
      await fetchMensagens();
    } catch {}
    setSending(false);
  };

  // Group messages by date for separators
  const renderItem = ({ item, index }: { item: OSMensagem; index: number }) => {
    const isMine = item.usuario_id === user?.id;
    const prevMsg = index < mensagens.length - 1 ? mensagens[index + 1] : null; // inverted list
    const currentDate = item.criado_em.slice(0, 10);
    const prevDate = prevMsg?.criado_em.slice(0, 10);
    const showSeparator = currentDate !== prevDate;

    return (
      <>
        <MessageBubble msg={item} isMine={isMine} />
        {showSeparator && (
          <View style={styles.dateSeparator}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>{formatDateSeparator(item.criado_em)}</Text>
            <View style={styles.dateLine} />
          </View>
        )}
      </>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBody} />
      <LinearGradient colors={[...gradients.header]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Chat OS #{osNumero}</Text>
          <Text style={styles.headerSub}>{mensagens.length} mensagens</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={mensagens}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyText}>Nenhuma mensagem</Text>
                <Text style={styles.emptySubText}>Inicie a conversa sobre esta OS</Text>
              </View>
            }
          />
        )}

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <TextInput
            style={styles.input}
            placeholder="Digite uma mensagem..."
            placeholderTextColor={colors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  headerSub: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingVertical: spacing.md },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xl * 3, transform: [{ scaleY: -1 }] },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md, marginTop: spacing.md },
  emptySubText: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs },
  dateSeparator: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  dateLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dateText: {
    color: colors.textMuted, fontSize: fontSize.xs,
    marginHorizontal: spacing.md, fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: spacing.md, paddingTop: spacing.sm,
    backgroundColor: colors.bgCard, borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, backgroundColor: colors.bgInput, borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.textPrimary, fontSize: fontSize.sm,
    maxHeight: 100, borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  sendBtnDisabled: { backgroundColor: colors.textMuted },
});
