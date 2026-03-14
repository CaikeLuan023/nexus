import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Animated, ActivityIndicator,
  Dimensions, Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import NexusLogo from '../components/NexusLogo';
import { colors, gradients, spacing, borderRadius, fontSize } from '../theme';

const { width: W, height: H } = Dimensions.get('window');
const NUM_PARTICLES = 35;

// Animated particle dot
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
        position: 'absolute',
        left: x,
        top: startY,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: Math.random() > 0.5 ? '#ff2d78' : '#c84bff',
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  // Animations
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const userFocus = useRef(new Animated.Value(0)).current;
  const passFocus = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(cardAnim, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }).start();
  }, []);

  function shake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  async function handleLogin() {
    if (!usuario.trim() || !senha.trim()) { setErro('Preencha todos os campos'); shake(); return; }
    setErro(''); setLoading(true);
    try {
      await signIn(usuario.trim(), senha);
    } catch (e: any) {
      setErro(e.message || 'Erro ao fazer login'); shake();
    } finally { setLoading(false); }
  }

  const userBorderColor = userFocus.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.1)', '#ff2d78'] });
  const passBorderColor = passFocus.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.1)', '#ff2d78'] });

  return (
    <LinearGradient colors={['#150535', '#0d0221', '#050110']} locations={[0, 0.4, 1]} style={styles.bg}>
      {/* Particles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: NUM_PARTICLES }).map((_, i) => (
          <Particle key={i} delay={i * 200} />
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <Animated.View style={[
          styles.card,
          {
            transform: [
              { translateX: shakeAnim },
              { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
              { scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
            ],
            opacity: cardAnim,
          }
        ]}>
          <NexusLogo />

          {/* Error */}
          {erro ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#ff8a9b" />
              <Text style={styles.errorText}>{erro}</Text>
            </View>
          ) : null}

          {/* Usuario */}
          <Text style={styles.label}>Usuario</Text>
          <Animated.View style={[styles.inputBox, { borderColor: userBorderColor }]}>
            <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.3)" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="seu.usuario"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={usuario}
              onChangeText={setUsuario}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => Animated.timing(userFocus, { toValue: 1, duration: 200, useNativeDriver: false }).start()}
              onBlur={() => Animated.timing(userFocus, { toValue: 0, duration: 200, useNativeDriver: false }).start()}
            />
          </Animated.View>

          {/* Senha */}
          <Text style={styles.label}>Senha</Text>
          <Animated.View style={[styles.inputBox, { borderColor: passBorderColor }]}>
            <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.3)" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Digite sua senha"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={senha}
              onChangeText={setSenha}
              secureTextEntry={!showPass}
              onFocus={() => Animated.timing(passFocus, { toValue: 1, duration: 200, useNativeDriver: false }).start()}
              onBlur={() => Animated.timing(passFocus, { toValue: 0, duration: 200, useNativeDriver: false }).start()}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          </Animated.View>

          {/* Button */}
          <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.8} style={{ marginTop: 8 }}>
            <LinearGradient
              colors={['#ff2d78', '#e91e63', '#7b2fbe']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btn}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.btnContent}>
                  <Ionicons name="log-in-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.btnText}>Entrar</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Footer */}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 25,
  },

  label: {
    fontWeight: '600',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 6,
  },

  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    paddingVertical: 14,
  },
  eyeBtn: { padding: 6 },

  btn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#ff2d78',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  btnContent: { flexDirection: 'row', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 53, 69, 0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(220, 53, 69, 0.3)',
    padding: 10,
    marginBottom: 16,
  },
  errorText: { color: '#ff8a9b', fontSize: 13, marginLeft: 6, flex: 1 },

  footer: {
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
  },
  footerText: { color: 'rgba(255, 255, 255, 0.25)', fontSize: 12 },
});
