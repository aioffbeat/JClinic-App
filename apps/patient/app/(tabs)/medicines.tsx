import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi, type PortalMedication } from '@jclinic-mobile/api-client';
import { AsOf, Body, Caption, Card, H1, Label, Loading, Notice, Pill, Screen, color, space } from '@jclinic-mobile/ui';

/**
 * Dose ticking.
 *
 * This screen is the reason the push work exists. The API has generated medication reminders at
 * 08:00 / 14:00 / 20:00 IST for months (NotificationsService.sendDoseReminders) and, without push,
 * they only ever became a row nobody saw unless they happened to open the website. Tapping a dose
 * here is what closes that loop.
 *
 * All the per-slot state — which slots apply today, what has been ticked, the adherence streak —
 * is computed server-side and arrives on PortalMedication. Nothing is derived here on purpose:
 * the server owns "is this dose due", and a second implementation in the app would be a second
 * answer to a clinical question.
 */
export default function Medicines() {
  const qc = useQueryClient();

  const meds = useQuery({
    queryKey: ['portal', 'medications'],
    queryFn: () => portalApi.medications(),
  });

  const mark = useMutation({
    mutationFn: (v: { label: string; slot: string; medicineId: string | null }) =>
      portalApi.markMedication({ label: v.label, slot: v.slot, medicineId: v.medicineId, status: 'taken' }),
    /**
     * Optimistic, deliberately. A dose tick that waits on a round-trip feels broken on clinic wifi,
     * and the patient has already swallowed the tablet — the UI should agree with reality at once.
     * onError restores the previous state if the write actually failed.
     */
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['portal', 'medications'] });
      const previous = qc.getQueryData<PortalMedication[]>(['portal', 'medications']);
      qc.setQueryData<PortalMedication[]>(['portal', 'medications'], (old) =>
        (old ?? []).map((med) =>
          med.label !== v.label
            ? med
            : {
                ...med,
                slots: med.slots.map((s) => (s.key === v.slot ? { ...s, takenToday: true, due: false } : s)),
              },
        ),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(['portal', 'medications'], ctx.previous);
    },
    // Re-read regardless: the server owns the streak and the "already ticked today" window.
    onSettled: () => qc.invalidateQueries({ queryKey: ['portal', 'medications'] }),
  });

  const rows = meds.data ?? [];
  const nothingDue = rows.length > 0 && rows.every((m) => !m.anyDue);

  return (
    <Screen refreshing={meds.isRefetching} onRefresh={() => meds.refetch()}>
      <H1>Medicines</H1>
      {meds.isLoading && <Loading />}

      {meds.isError && !rows.length && (
        <Notice
          title="Cannot load your medicines"
          body="You may be offline. Your list will appear as soon as you reconnect."
          tone="bad"
        />
      )}

      {!meds.isLoading && !rows.length && !meds.isError && (
        <Notice title="No medicines" body="Nothing is prescribed for you right now." />
      )}

      {nothingDue && (
        <Card>
          <Label>All done for today</Label>
          <Body muted>Every dose scheduled for today has been ticked off.</Body>
        </Card>
      )}

      {rows.map((med) => (
        <Card key={med.label}>
          <View style={styles.head}>
            <Text style={styles.name}>{med.label}</Text>
            {med.streak > 1 && <Pill text={`${med.streak}-day streak`} tone="ok" />}
          </View>

          <Caption>{[med.dose, med.frequencyText].filter(Boolean).join(' · ')}</Caption>

          {/* An as-needed medicine has no schedule to tick against — showing empty slot buttons
              would invite a patient to record a dose the doctor never scheduled. */}
          {med.asNeeded ? (
            <Body muted>Take only when needed.</Body>
          ) : (
            <View style={styles.slots}>
              {med.slots.map((slot) => (
                <Pressable
                  key={slot.key}
                  disabled={slot.takenToday || mark.isPending}
                  onPress={() => mark.mutate({ label: med.label, slot: slot.key, medicineId: med.medicineId })}
                  style={({ pressed }) => [
                    styles.slot,
                    slot.takenToday && styles.slotTaken,
                    pressed && !slot.takenToday && { opacity: 0.7 },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: slot.takenToday }}
                  accessibilityLabel={`${slot.label} dose of ${med.label}`}
                >
                  <Text style={[styles.slotText, slot.takenToday && styles.slotTextTaken]}>
                    {slot.takenToday ? `✓ ${slot.label}` : slot.label}
                  </Text>
                  {!!slot.time && <Text style={styles.slotTime}>{slot.time}</Text>}
                </Pressable>
              ))}
            </View>
          )}

          {!!med.endsOn && <Caption>{`Until ${new Date(med.endsOn).toLocaleDateString()}`}</Caption>}
        </Card>
      ))}

      <AsOf at={meds.dataUpdatedAt || null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  name: { fontSize: 16, fontWeight: '700', color: color.ink, flexShrink: 1 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  slot: {
    // 44pt floor. This is the primary interaction of the entire app, tapped with a thumb, often by
    // someone elderly or unwell.
    minHeight: 44,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.teal,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  slotTaken: { backgroundColor: color.success, borderColor: color.success },
  slotText: { fontSize: 15, fontWeight: '600', color: color.teal },
  slotTextTaken: { color: '#FFFFFF' },
  slotTime: { fontSize: 11, color: color.slate, marginTop: 2 },
});
