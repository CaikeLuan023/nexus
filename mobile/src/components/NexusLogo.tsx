import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fontSize } from '../theme';

interface Props { size?: 'small' | 'large'; }

export default function NexusLogo({ size = 'large' }: Props) {
  const isLarge = size === 'large';
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!isLarge) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.7, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  if (!isLarge) {
    return (
      <View style={styles.smallRow}>
        <LinearGradient colors={['#c84bff', '#ff2d78', '#7b2fbe']} style={styles.circleSmall}>
          <Text style={styles.letterSmall}>N</Text>
        </LinearGradient>
        <Text style={styles.titleSmall}>Nexus</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.sphereWrap, { transform: [{ scale: pulseAnim }] }]}>
        {/* Outer glow rings */}
        <Animated.View style={[styles.glowRing3, { opacity: glowAnim }]} />
        <Animated.View style={[styles.glowRing2, { opacity: Animated.multiply(glowAnim, 1.3) }]} />
        <Animated.View style={[styles.glowRing1, { opacity: Animated.multiply(glowAnim, 1.6) }]} />
        {/* Sphere */}
        <LinearGradient
          colors={['#c84bff', '#ff2d78', '#7b2fbe']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.sphere}
        >
          {/* Inner light reflection */}
          <View style={styles.sphereHighlight} />
          <Text style={styles.letter}>N</Text>
        </LinearGradient>
      </Animated.View>
      <Text style={styles.title}>Nexus</Text>
      <Text style={styles.subtitle}>Faca login para continuar</Text>
    </View>
  );
}

const SPHERE_SIZE = 100;

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginBottom: 28 },

  // Sphere wrapper
  sphereWrap: {
    width: SPHERE_SIZE + 60,
    height: SPHERE_SIZE + 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  // Glow rings
  glowRing3: {
    position: 'absolute',
    width: SPHERE_SIZE + 56,
    height: SPHERE_SIZE + 56,
    borderRadius: (SPHERE_SIZE + 56) / 2,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(200, 75, 255, 0.1)',
  },
  glowRing2: {
    position: 'absolute',
    width: SPHERE_SIZE + 36,
    height: SPHERE_SIZE + 36,
    borderRadius: (SPHERE_SIZE + 36) / 2,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 45, 120, 0.12)',
  },
  glowRing1: {
    position: 'absolute',
    width: SPHERE_SIZE + 16,
    height: SPHERE_SIZE + 16,
    borderRadius: (SPHERE_SIZE + 16) / 2,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'rgba(255, 45, 120, 0.18)',
  },

  // Sphere
  sphere: {
    width: SPHERE_SIZE,
    height: SPHERE_SIZE,
    borderRadius: SPHERE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff2d78',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 20,
    overflow: 'hidden',
  },
  sphereHighlight: {
    position: 'absolute',
    top: 8,
    left: 14,
    width: 36,
    height: 24,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    transform: [{ rotate: '-25deg' }],
  },

  letter: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 44,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  title: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 28,
    letterSpacing: 1,
    marginBottom: 4,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: fontSize.sm,
  },

  // Small variant
  smallRow: { flexDirection: 'row', alignItems: 'center' },
  circleSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  letterSmall: { color: '#fff', fontWeight: '900', fontSize: 18 },
  titleSmall: { color: colors.textPrimary, fontWeight: '700', fontSize: fontSize.xl },
});
