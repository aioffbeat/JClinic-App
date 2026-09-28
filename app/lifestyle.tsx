import { useState } from 'react';
import { Stack } from 'expo-router';
import { StyleSheet, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dmy, portalApi } from '@/src/api';
import type { PortalLifestyleLog } from '@/src/portal-types';
import { AsOf, Body, Button, Caption, Card, H1, H2, Label, Loading, Notice, Screen, color, space } from '@/src/ui';

/**
 * The daily log — diet, activity, and home vitals.
 *
 * Worth knowing: submitting a blood pressure here is not inert. The server grades it and a crisis
 * reading raises an alert to the clinical team, the same path the symptom check-in uses. So the
 * screen says so, rather than presenting this as a private diary.
 */
export default function Lifestyle() {
  const qc = useQueryClient();
  const logs = useQuery({
    queryKey: ['portal', 'lifestyle'],
    queryFn: () => portalApi.lifestyle() as Promise<PortalLifestyleLog[]>,
  });

  const [form, setForm] = useState({
    dietSummary: '',
    exerciseMin: '',
    waterMl: '',
    weightKg: '',
    systolic: '',
    diastolic: '',
    bloodSugar: '',
    notes: '',
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const add = useMutation({
    mutationFn: () =>
      portalApi.addLifestyle({
        dietSummary: form.dietSummary.trim() || undefined,
        exerciseMin: whole(form.exerciseMin),
        waterMl: whole(form.waterMl),
        weightKg: num(form.weightKg),
        systolic: whole(form.systolic),
        diastolic: whole(form.diastolic),
        bloodSugar: whole(form.bloodSugar),
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      setForm({ dietSummary: '', exerciseMin: '', waterMl: '', weightKg: '', systolic: '', diastolic: '', bloodSugar: '', notes: '' });
      qc.invalidateQueries({ queryKey: ['portal', 'lifestyle'] });
    },
  });

  const rows = logs.data ?? [];
  const anything = Object.values(form).some((v) => v.trim());
  const rangeError = outOfRange(form);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Daily log', headerTintColor: color.petrolInk }} />
      <Screen refreshing={logs.isRefetching} onRefresh={() => logs.refetch()}>
        <H1>Daily log</H1>

        <Card>
          <H2>Today</H2>
          <Field label="What did you eat?" value={form.dietSummary} onChange={set('dietSummary')} />
          <View style={styles.pair}>
            <Field label="Exercise (min)" value={form.exerciseMin} onChange={set('exerciseMin')} numeric half />
            <Field label="Water (ml)" value={form.waterMl} onChange={set('waterMl')} numeric half />
          </View>
          <View style={styles.pair}>
            <Field label="Weight (kg)" value={form.weightKg} onChange={set('weightKg')} numeric half />
            <Field label="Blood sugar" value={form.bloodSugar} onChange={set('bloodSugar')} numeric half />
          </View>
          <View style={styles.pair}>
            <Field label="BP upper" value={form.systolic} onChange={set('systolic')} numeric half />
            <Field label="BP lower" value={form.diastolic} onChange={set('diastolic')} numeric half />
          </View>
          <Field label="Notes" value={form.notes} onChange={set('notes')} />

          <Caption>
            Your care team can see this. A blood pressure well outside the safe range alerts them
            automatically — but if you feel unwell, call your clinic rather than waiting.
          </Caption>

          <Button
            title="Save today"
            onPress={() => add.mutate()}
            loading={add.isPending}
            disabled={!anything || !!rangeError}
            style={{ marginTop: space.md }}
          />
          {!!rangeError && <Notice title="Check this before saving" body={rangeError} tone="bad" />}
          {add.isError && <Notice title="Could not save" body="Please try again once you have a connection." tone="bad" />}
        </Card>

        {logs.isLoading && <Loading />}
        {rows.map((l) => (
          <Card key={l.id}>
            <Label>{dmy(l.logDate)}</Label>
            {!!l.dietSummary && <Body>{l.dietSummary}</Body>}
            <Caption>{summarise(l) || 'No measurements'}</Caption>
            {!!l.notes && <Body muted>{l.notes}</Body>}
          </Card>
        ))}

        <AsOf at={logs.dataUpdatedAt || null} />
      </Screen>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  numeric,
  half,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  half?: boolean;
}) {
  return (
    <View style={half ? { flex: 1 } : undefined}>
      <Label>{label}</Label>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'numeric' : 'default'}
        placeholderTextColor={color.slate}
      />
    </View>
  );
}

function summarise(l: PortalLifestyleLog) {
  return [
    l.weightKg != null ? `${l.weightKg} kg` : null,
    l.systolic != null && l.diastolic != null ? `${l.systolic}/${l.diastolic} mmHg` : null,
    l.bloodSugar != null ? `sugar ${l.bloodSugar}` : null,
    l.exerciseMin != null ? `${l.exerciseMin} min exercise` : null,
    l.waterMl != null ? `${l.waterMl} ml water` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Empty stays undefined so the server keeps its own null rather than storing a zero. */
function num(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The DTO marks exercise, water, BP and sugar @IsInt, and the numeric keypad offers a decimal
 * point on both platforms — "30.5" minutes was a 400 the screen reported as a connection problem.
 */
function whole(v: string): number | undefined {
  const n = num(v);
  return n === undefined ? undefined : Math.round(n);
}

/**
 * Mirrors LifestyleLogDto's bounds. Checked here so a mistyped BP is caught while the field is
 * still on screen, instead of coming back as an opaque failure with the form full of values the
 * patient now has to re-examine one by one.
 */
const LIMITS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'weightKg', label: 'Weight', min: 1, max: 500 },
  { key: 'systolic', label: 'Systolic', min: 50, max: 300 },
  { key: 'diastolic', label: 'Diastolic', min: 30, max: 200 },
  { key: 'bloodSugar', label: 'Blood sugar', min: 20, max: 800 },
  { key: 'exerciseMin', label: 'Exercise', min: 0, max: 1440 },
  { key: 'waterMl', label: 'Water', min: 0, max: 20000 },
];
function outOfRange(form: Record<string, string>): string | null {
  for (const l of LIMITS) {
    const n = num(form[l.key] ?? '');
    if (n !== undefined && (n < l.min || n > l.max)) return `${l.label} should be between ${l.min} and ${l.max}.`;
  }
  return null;
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.md },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: 10,
    paddingHorizontal: space.md,
    marginTop: space.xs,
    marginBottom: space.md,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.surface,
  },
});
