import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { color, space } from './theme';

/**
 * The Dr. Joshi's wordmark, drawn rather than bitmapped.
 *
 * The clinic's logo.png is 176×68 — fine in a web header, but it would be visibly soft on a 3×
 * phone screen at any useful size, and there is no larger original. Setting it in type reproduces
 * the same mark (petrol-ink name, lime dot, teal rule, spaced strapline) and stays crisp at every
 * density, which a 6 KB raster upscaled 3× would not.
 */
export function Wordmark({ size = 'md', onDark = false }: { size?: 'sm' | 'md' | 'lg'; onDark?: boolean }) {
  const scale = size === 'lg' ? 1.35 : size === 'sm' ? 0.78 : 1;
  const ink = onDark ? '#FFFFFF' : color.petrolInk;
  const sub = onDark ? 'rgba(255,255,255,0.75)' : color.teal;

  return (
    <View style={{ alignItems: 'flex-start' }}>
      <View style={styles.nameRow}>
        <Text style={[styles.name, { fontSize: 22 * scale, color: ink }]}>DR. JOSHI</Text>
        {/* The lime dot sits over the apostrophe in the original mark. */}
        <View style={[styles.dot, { width: 7 * scale, height: 7 * scale, borderRadius: 4 * scale }]} />
        <Text style={[styles.name, { fontSize: 22 * scale, color: ink }]}>S</Text>
      </View>
      <View style={[styles.rule, { width: 128 * scale, backgroundColor: onDark ? 'rgba(255,255,255,0.5)' : color.teal }]} />
      <Text style={[styles.strap, { fontSize: 7.5 * scale, color: sub, letterSpacing: 2.1 * scale }]}>
        HOLISTIC MULTI SPECIALTY CLINIC
      </Text>
    </View>
  );
}

/**
 * The app's emblem: a lotus, in the brand palette.
 *
 * BRAND.md describes the clinic's mark as a peacock/lotus in teal, green, lime, blue and violet,
 * but only the wordmark exists as a file — so this is drawn from those tokens rather than traced
 * from an asset that was never supplied. Vector, so it is sharp wherever it appears.
 */
export function LotusMark({ size = 40, onDark = false }: { size?: number; onDark?: boolean }) {
  const petals = [
    { rotate: -60, fill: color.royalBlue },
    { rotate: -30, fill: color.teal },
    { rotate: 0, fill: color.tealBright },
    { rotate: 30, fill: color.leafGreen },
    { rotate: 60, fill: color.lime },
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G opacity={onDark ? 0.95 : 1}>
        {petals.map((p) => (
          <Ellipse
            key={p.rotate}
            cx={50}
            cy={44}
            rx={11}
            ry={30}
            fill={p.fill}
            opacity={0.9}
            origin="50, 74"
            rotation={p.rotate}
          />
        ))}
        {/* The seat the petals rise from. */}
        <Path d="M22 76 Q50 92 78 76 Q50 84 22 76 Z" fill={color.petrolInk} opacity={onDark ? 0.5 : 0.85} />
        <Circle cx={50} cy={72} r={5} fill={onDark ? '#FFFFFF' : color.petrolInk} opacity={0.9} />
      </G>
    </Svg>
  );
}

/** Emblem + wordmark, the way the login and splash screens use it. */
export function BrandLockup({ onDark = false, style }: { onDark?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ alignItems: 'center', gap: space.md }, style]}>
      <LotusMark size={64} onDark={onDark} />
      <Wordmark size="lg" onDark={onDark} />
    </View>
  );
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'flex-start' },
  // Tight tracking and heavy weight, matching the wordmark's compressed feel.
  name: { fontWeight: '800', letterSpacing: -0.5 },
  dot: { backgroundColor: color.lime, marginTop: 2, marginHorizontal: 1.5 },
  rule: { height: 3, borderRadius: 2, marginTop: 3 },
  strap: { fontWeight: '700', marginTop: 4 },
});
