import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, gradient, radius, shadow, space, type as typo, MIN_TOUCH } from './theme';
import { Icon, type IconName } from './icon';

/** Standard screen frame: brand background, safe-area aware, optional pull-to-refresh. */
export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl };

  if (!scroll) return <View style={[s.screen, pad, style]}>{children}</View>;

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={[{ padding: space.lg }, pad, style]}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.teal} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={typo.display}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={typo.title}>{children}</Text>;
}
export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[typo.body, muted && { color: color.slate }]}>{children}</Text>;
}
export function Label({ children }: { children: ReactNode }) {
  return <Text style={typo.label}>{children}</Text>;
}
export function Caption({ children }: { children: ReactNode }) {
  return <Text style={typo.caption}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = variant === 'secondary' ? color.ink : '#FFFFFF';
  const off = disabled || loading;
  const inner = loading ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{title}</Text>;

  // The web's primary action is a teal-to-blue gradient (--brand-grad), not a flat fill. Matching
  // it is most of why the two surfaces read as one product.
  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={off}
        style={({ pressed }) => [{ opacity: off ? 0.5 : pressed ? 0.9 : 1 }, style]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!off, busy: !!loading }}
      >
        <LinearGradient
          colors={[...gradient.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.6 }}
          style={[s.button, s.buttonPrimary]}
        >
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      // Pressed feedback rather than a hover state — there is no cursor here.
      style={({ pressed }) => [
        s.button,
        { backgroundColor: variant === 'danger' ? color.danger : color.surface, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && s.buttonOutline,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
    >
      {inner}
    </Pressable>
  );
}

/**
 * The hero panel that opens the portal's home screen.
 *
 * Same three-stop gradient and 22px radius as the web, including the soft blob in the corner —
 * that highlight is what stops a large saturated rectangle looking flat.
 */
export function Hero({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <LinearGradient
      colors={[...gradient.hero]}
      start={{ x: 0.9, y: 0 }}
      end={{ x: 0.1, y: 1 }}
      style={s.hero}
    >
      <View style={s.heroBlob} />
      <Text style={s.heroTitle}>{title}</Text>
      {!!subtitle && <Text style={s.heroSub}>{subtitle}</Text>}
      {children}
    </LinearGradient>
  );
}

/** White pill CTA that sits on the hero — `.p-cta` on the web. */
export function HeroButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.heroCta, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
    >
      <Text style={s.heroCtaText}>{title}</Text>
    </Pressable>
  );
}

/** A coloured dashboard tile. Tones map to the portal's grad-1..5. */
export function Tile({
  label,
  value,
  tone = 'blue',
  onPress,
}: {
  label: string;
  value: string;
  tone?: keyof typeof gradient.tile;
  onPress?: () => void;
}) {
  const body = (
    <LinearGradient
      colors={[...gradient.tile[tone]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.tile}
    >
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </LinearGradient>
  );
  if (!onPress) return <View style={s.tileWrap}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.tileWrap, pressed && { transform: [{ scale: 0.98 }] }]}
      accessibilityRole="button"
    >
      {body}
    </Pressable>
  );
}

/** Two-column tile grid, as the portal lays them out. */
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={s.tileGrid}>{children}</View>;
}

/** Coloured status chip — biomarker flags, appointment states, lead stages. */
export function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' }) {
  const bg = {
    neutral: color.hairline,
    ok: color.success,
    warn: color.warning,
    bad: color.danger,
    info: color.info,
  }[tone];
  const fg = tone === 'neutral' ? color.slate : '#FFFFFF';
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/**
 * Empty / loading / error state.
 *
 * One component so every screen fails the same way. `stale` is the offline case: there IS cached
 * content on screen, and the point is to say how old it is rather than to hide it.
 */
export function Notice({ title, body, tone = 'neutral' }: { title: string; body?: string; tone?: 'neutral' | 'bad' }) {
  return (
    <Card style={tone === 'bad' ? { borderColor: color.danger } : undefined}>
      <Text style={[typo.heading, tone === 'bad' && { color: color.danger }]}>{title}</Text>
      {!!body && <Text style={[typo.body, { color: color.slate, marginTop: space.xs }]}>{body}</Text>}
    </Card>
  );
}

export function Loading() {
  return (
    <View style={s.loading}>
      <ActivityIndicator color={color.teal} />
    </View>
  );
}

/**
 * "As of <time>" stamp.
 *
 * Non-negotiable on any screen served from the offline cache. A prescription list from yesterday
 * that looks live is a clinical-safety problem, not a UX nitpick.
 */
export function AsOf({ at }: { at: number | null }) {
  if (!at) return null;
  const mins = Math.round((Date.now() - at) / 60000);
  const text =
    mins < 1 ? 'Just now' : mins < 60 ? `As of ${mins} min ago` : `As of ${new Date(at).toLocaleString()}`;
  return <Text style={[typo.caption, { marginTop: space.sm }]}>{text}</Text>;
}

/**
 * A tappable row with an icon, a title and a chevron.
 *
 * The other tabs were a card per item, which turns any list into a wall of identical white
 * rectangles with no rhythm. Grouping rows inside ONE card gives a list a shape — the icon carries
 * the meaning, the divider carries the structure, and the card carries the group.
 */
export function Row({
  icon,
  title,
  subtitle,
  meta,
  tone,
  onPress,
  first,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  meta?: string;
  tone?: string;
  onPress?: () => void;
  first?: boolean;
}) {
  const body = (
    <View style={[s.row, !first && s.rowDivider]}>
      {!!icon && (
        <View style={[s.rowIcon, tone ? { backgroundColor: withAlpha(tone) } : null]}>
          <Icon name={icon} size={18} tint={tone ?? color.teal} strokeWidth={2} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={s.rowSub} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {!!meta && <Text style={s.rowMeta}>{meta}</Text>}
      {!!onPress && <Icon name="chevron" size={16} tint={color.slate} />}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>
      {body}
    </Pressable>
  );
}

/** A group heading above a card. Sets rhythm without the weight of another card. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

/**
 * The state a screen shows when there is genuinely nothing — which, in a clinic app, is most
 * screens for most new patients. A muted mark and a plain sentence reads as "nothing here yet"
 * rather than as a failure.
 */
export function Empty({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon name={icon} size={26} tint={color.teal} strokeWidth={1.6} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {!!body && <Text style={s.emptyBody}>{body}</Text>}
    </View>
  );
}

/** 12% tint of a brand colour, for icon chips. */
function withAlpha(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.12)`;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowDivider: { borderTopWidth: 1, borderTopColor: color.hairline },
  rowIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: color.tealSoft, alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '600', color: color.ink },
  rowSub: { fontSize: 13, color: color.slate, marginTop: 2, lineHeight: 18 },
  rowMeta: { fontSize: 13, fontWeight: '600', color: color.slate },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: color.slate,
    letterSpacing: 0.6, textTransform: 'uppercase',
    marginTop: space.lg, marginBottom: space.sm,
  },
  empty: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: color.tealSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: space.md,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: color.ink, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: color.slate, textAlign: 'center', marginTop: space.xs, lineHeight: 20 },
  screen: { flex: 1, backgroundColor: color.mist },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow.card,
  },
  button: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonPrimary: { paddingVertical: space.sm },
  buttonOutline: { borderWidth: 1, borderColor: color.hairline },
  hero: {
    borderRadius: radius.hero,
    padding: space.xl,
    marginBottom: space.md,
    overflow: 'hidden',
  },
  heroBlob: {
    position: 'absolute',
    right: -40,
    bottom: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(96,235,210,0.22)',
  },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3 },
  heroSub: { fontSize: 13.5, lineHeight: 20, color: 'rgba(255,255,255,0.9)', marginTop: space.xs },
  heroCta: {
    marginTop: space.lg,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  heroCtaText: { color: '#15506b', fontWeight: '700', fontSize: 14 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.md },
  tileWrap: { flexGrow: 1, flexBasis: '46%', ...shadow.tile },
  tile: { borderRadius: radius.tile, padding: space.lg, minHeight: 92, justifyContent: 'center' },
  tileValue: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  tileLabel: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '600' },
  loading: { paddingVertical: space.xxl, alignItems: 'center' },
});
