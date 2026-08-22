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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, radius, shadow, space, type as typo, MIN_TOUCH } from './theme';

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
  const bg =
    variant === 'primary' ? color.teal : variant === 'danger' ? color.danger : color.surface;
  const fg = variant === 'secondary' ? color.ink : '#FFFFFF';
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      // Pressed feedback rather than a hover state — there is no cursor here.
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && s.buttonOutline,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
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

const s = StyleSheet.create({
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
  buttonOutline: { borderWidth: 1, borderColor: color.hairline },
  buttonText: { fontSize: 16, fontWeight: '600' },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '600' },
  loading: { paddingVertical: space.xxl, alignItems: 'center' },
});
