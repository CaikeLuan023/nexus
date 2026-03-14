import React, { useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, fontSize } from '../theme';

const PAD_HEIGHT = 200;

interface Point { x: number; y: number; }

interface Props {
  onSignatureCapture: (base64: string) => void;
  onClear?: () => void;
}

export default function SignaturePad({ onSignatureCapture, onClear }: Props) {
  const [paths, setPaths] = useState<Point[][]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [signed, setSigned] = useState(false);

  const currentPathRef = useRef<Point[]>([]);
  const pathsRef = useRef<Point[][]>([]);

  const handleTouchStart = useCallback((e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    currentPathRef.current = [{ x: locationX, y: locationY }];
    setCurrentPath([{ x: locationX, y: locationY }]);
  }, []);

  const handleTouchMove = useCallback((e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    currentPathRef.current.push({ x: locationX, y: locationY });
    // Only update state every few points to reduce re-renders
    if (currentPathRef.current.length % 2 === 0) {
      setCurrentPath([...currentPathRef.current]);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (currentPathRef.current.length > 1) {
      pathsRef.current = [...pathsRef.current, [...currentPathRef.current]];
      setPaths([...pathsRef.current]);
    }
    currentPathRef.current = [];
    setCurrentPath([]);
    setSigned(true);
  }, []);

  const clearSignature = useCallback(() => {
    pathsRef.current = [];
    currentPathRef.current = [];
    setPaths([]);
    setCurrentPath([]);
    setSigned(false);
    onClear?.();
  }, [onClear]);

  const confirmSignature = useCallback(() => {
    const allPoints = pathsRef.current.filter(p => p.length > 1);
    if (allPoints.length === 0) return;

    const svgPaths = allPoints.map(points => {
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      return `<path d="${d}" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    }).join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${PAD_HEIGHT}" viewBox="0 0 400 ${PAD_HEIGHT}"><rect width="400" height="${PAD_HEIGHT}" fill="#fff"/>${svgPaths}</svg>`;

    // Encode SVG as base64
    let encoded = '';
    try {
      encoded = btoa(svg);
    } catch {
      // btoa fallback for React Native
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let i = 0;
      while (i < svg.length) {
        const a = svg.charCodeAt(i++);
        const b = i < svg.length ? svg.charCodeAt(i++) : 0;
        const c = i < svg.length ? svg.charCodeAt(i++) : 0;
        const n = (a << 16) | (b << 8) | c;
        encoded += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
        encoded += (i - 2 < svg.length) ? chars[(n >> 6) & 63] : '=';
        encoded += (i - 1 < svg.length) ? chars[n & 63] : '=';
      }
    }

    if (encoded) {
      onSignatureCapture(`data:image/svg+xml;base64,${encoded}`);
    }
  }, [onSignatureCapture]);

  return (
    <View style={styles.container}>
      <View style={styles.padWrapper}>
        <View
          style={styles.pad}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleTouchStart}
          onResponderMove={handleTouchMove}
          onResponderRelease={handleTouchEnd}
        >
          {/* Render completed paths */}
          {paths.map((path, pIdx) =>
            path.map((point, i) => {
              if (i === 0) return null;
              const prev = path[i - 1];
              const dx = point.x - prev.x;
              const dy = point.y - prev.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <View
                  key={`${pIdx}-${i}`}
                  style={{
                    position: 'absolute',
                    left: prev.x,
                    top: prev.y - 1,
                    width: len,
                    height: 2.5,
                    backgroundColor: '#1a1a2e',
                    transform: [{ rotate: `${angle}deg` }],
                    transformOrigin: 'left center',
                  }}
                />
              );
            })
          )}
          {/* Render current path */}
          {currentPath.map((point, i) => {
            if (i === 0) return null;
            const prev = currentPath[i - 1];
            const dx = point.x - prev.x;
            const dy = point.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View
                key={`cur-${i}`}
                style={{
                  position: 'absolute',
                  left: prev.x,
                  top: prev.y - 1,
                  width: len,
                  height: 2.5,
                  backgroundColor: '#1a1a2e',
                  transform: [{ rotate: `${angle}deg` }],
                  transformOrigin: 'left center',
                }}
              />
            );
          })}
          {/* Placeholder */}
          {!signed && paths.length === 0 && (
            <View style={styles.placeholder}>
              <Ionicons name="finger-print-outline" size={28} color="rgba(0,0,0,0.15)" />
              <Text style={styles.placeholderText}>Assine aqui com o dedo</Text>
            </View>
          )}
          <View style={styles.signatureLine} />
        </View>
      </View>
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.clearBtn} onPress={clearSignature}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={[styles.btnText, { color: colors.danger }]}>Limpar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, !signed && { opacity: 0.5 }]}
          onPress={confirmSignature}
          disabled={!signed}
        >
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={[styles.btnText, { color: '#fff' }]}>Confirmar Assinatura</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.sm },
  padWrapper: {
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  pad: {
    height: PAD_HEIGHT,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  placeholder: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: 'rgba(0,0,0,0.2)',
    fontSize: fontSize.sm,
    marginTop: 4,
  },
  signatureLine: {
    position: 'absolute',
    bottom: 40, left: 30, right: 30,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  btnRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.danger + '44',
    backgroundColor: colors.danger + '11',
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.success,
  },
  btnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
});
