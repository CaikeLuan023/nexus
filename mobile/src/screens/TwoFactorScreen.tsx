import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Easing,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, fontSize } from '../theme';

const { width: W, height: H } = Dimensions.get('window');
const NUM_PARTICLES = 25;

function Particle({ delay }: { delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const x = useRef(Math.random() * W).current;
  const startY = useRef(Math.random() * H).current;
  const size = useRef(1.5 + Math.random() * 2.5).current;
  const duration = useRef(6000 + Math.random() * 8000).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.4 + Math.random() * 0.4, duration: duration / 2, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: duration / 2, useNativeDriver: true }),
          ]),
          Animated.timing(translateY, { toValue: -80 - Math.random() * 60, duration, easing: Easing.linear, useNativeDriver: true }),
        ])
      ).start();
    }, delay);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute', left: x, top: startY, width: size, height: size,
        borderRadius: size / 2, backgroundColor: Math.random() > 0.5 ? '#ff2d78' : '#c84bff',
        opacity, transform: [{ translateY }],
      }}
    />
  );
}

export default function TwoFactorScreen() {
  const { verify2fa } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(cardAnim, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }).start();
  }, []);

  async function handleVerify() {
    if (codigo.length < 6) { setErro('Digite o codigo de 6 digitos'); return; }
    setErro(''); setLoading(true);
    try { await verify2fa(codigo); } catch (e: any) { setErro(e.message || 'Codigo invalido'); } finally { setLoading(false); }
  }

  return (
    <LinearGradient colors={['#150535', '#0d0221', '#050110']} locations={[0, 0.4, 1]} style={styles.bg}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: NUM_PARTICLES }).map((_, i) => (
          <Particle key={i} delay={i * 250} />
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <Animated.View style={[
          styles.card,
          {
            opacity: cardAnim,
            transform: [
              { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
              { scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
            ],
          }
        ]}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark" size={36} color="#ff2d78" />
          </View>
          <Text style={styles.title}>Verificacao em 2 Etapas</Text>
          <Text style={styles.hint}>Digite o codigo do seu app autenticador</Text>

          {erro ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#ff8a9b" />
              <Text style={styles.errorText}>{erro}</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.codeInput}
            value={codigo}
            onChangeText={t => setCodigo(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            placeholderTextColor="rgba(255,255,255,0.25)"
            textAlign="center"
          />

          <TouchableOpacity onPress={handleVerify} disabled={loading} activeOpacity={0.8} style={{ alignSelf: 'stretch' }}>
            <LinearGradient colors={['#ff2d78', '#e91e63', '#7b2fbe']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
              {loading ? <ActivityIndicator color="#fff" /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.btnText}>Verificar</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Nexus &copy; 2025</Text>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: 'rgba(13, 2, 33, 0.75)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 45, 120, 0.15)',
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 25,
  },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255, 45, 120, 0.12)',
    borderWidth: 1, borderColor: 'rgba(255, 45, 120, 0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  hint: { color: 'rgba(255,255,255,0.4)', fontSize: fontSize.sm, marginBottom: 20, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(220, 53, 69, 0.15)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(220, 53, 69, 0.3)',
    padding: 10, marginBottom: 16, alignSelf: 'stretch',
  },
  errorText: { color: '#ff8a9b', fontSize: 13, marginLeft: 6, flex: 1 },
  codeInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: '#fff',
    fontSize: 30, fontWeight: '700', letterSpacing: 10, paddingVertical: 14,
    paddingHorizontal: 24, marginBottom: 20, alignSelf: 'stretch',
  },
  btn: {
    borderRadius: 12, paddingVertical: 15, alignItems: 'center',
    shadowColor: '#ff2d78', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: {
    marginTop: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.06)',
    alignSelf: 'stretch', alignItems: 'center',
  },
  footerText: { color: 'rgba(255, 255, 255, 0.25)', fontSize: 12 },
});
