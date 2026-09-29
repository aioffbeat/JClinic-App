import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { color } from './theme';

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
 * The clinic's logo, as supplied.
 *
 * This used to be a lotus drawn in SVG, with a comment explaining that only a 176x68 wordmark
 * existed as a file and upscaling it would look soft. The real 1920px mark arrived on 28 Sep 2026
 * and the icons moved to it the same day; this screen did not, so the app opened on a symbol the
 * clinic does not use. The asset is cut from that master by scripts/make-icons-from-logo.py, so
 * it cannot drift from the launcher icon or the website.
 */
export function BrandLockup({ style, width = 240 }: { style?: StyleProp<ViewStyle>; width?: number }) {
  return (
    <View style={[{ alignItems: 'center' }, style]}>
      <Image
        source={require('../../assets/brand/logo-lockup.png')}
        style={{ width, height: width * (205 / 720), borderRadius: 10 }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Dr. Joshi's — Holistic Multi Specialty Clinic"
      />
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
