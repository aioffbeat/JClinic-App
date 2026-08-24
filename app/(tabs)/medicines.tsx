import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi, type PortalMedication } from '@/src/api';
import type { PortalRefillRequest } from '@/src/portal-types';
import { AsOf, Body, Button, Caption, Card, H1, H2, Label, Loading, Notice, Pill, Screen, color, space } from '@/src/ui';

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

  const outside = useQuery({ queryKey: ['portal', 'outside-medications'], queryFn: () => portalApi.outsideMedications() });
  const refills = useQuery({
    queryKey: ['portal', 'refills'],
    queryFn: () => portalApi.refills() as Promise<PortalRefillRequest[]>,
  });

  const askRefill = useMutation({
    mutationFn: () => portalApi.requestRefill({}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'refills'] });
      Alert.alert('Requested', 'Your clinic will prepare your refill and let you know.');
    },
    onError: () => Alert.alert('Could not request', 'Please try again, or call the clinic.'),
  });

  const rows = meds.data ?? [];
  const outsideRows = outside.data ?? [];
  const refillRows = refills.data ?? [];
  const openRefill = refillRows.find((r) => r.status !== 'done' && r.status !== 'rejected');
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

      {/* Refills are a request, not a transaction — the clinic dispenses. Showing an open request
          matters more than the button: without it patients ask again, and again. */}
      {!!rows.length && (
        <Card>
          <H2>Need a refill?</H2>
          {openRefill ? (
            <>
              <Body>Your clinic is working on your last request.</Body>
              <Pill text={openRefill.status} tone="neutral" />
              <Caption>{`Asked on ${new Date(openRefill.createdAt).toLocaleDateString()}`}</Caption>
            </>
          ) : (
            <>
              <Body muted>Ask your clinic to prepare your next course.</Body>
              <Button
                title="Request a refill"
                onPress={() => askRefill.mutate()}
                loading={askRefill.isPending}
                style={{ marginTop: space.md }}
              />
            </>
          )}
        </Card>
      )}

      {/* Medicines from elsewhere. Read-only by design: this clinic did not prescribe them and must
          not appear to have. The one actionable thing is a change the doctor has recommended. */}
      {!!outsideRows.length && (
        <>
          <Text style={styles.section}>From other doctors</Text>
          {outsideRows.map((m) => (
            <Card key={m.label}>
              <Text style={styles.name}>{[m.label, m.strength].filter(Boolean).join(' ')}</Text>
              <Caption>{[m.form, m.frequencyText || m.frequency, m.indication].filter(Boolean).join(' · ')}</Caption>
              {!!m.prescribedBy && <Caption>{`Prescribed by ${m.prescribedBy}`}</Caption>}

              {!!m.recommendation && (
                <View style={styles.reco}>
                  <Label>Your doctor suggests</Label>
                  <Body>{m.recommendation.what}</Body>
                  {!!m.recommendation.toStrength && <Caption>{`New strength: ${m.recommendation.toStrength}`}</Caption>}
                  {!!m.recommendation.toFrequencyText && <Caption>{`New timing: ${m.recommendation.toFrequencyText}`}</Caption>}
                  {!!m.recommendation.reason && <Body muted>{m.recommendation.reason}</Body>}
                  <Caption>Please confirm with the doctor who prescribed it before changing.</Caption>
                </View>
              )}
            </Card>
          ))}
        </>
      )}

      <AsOf at={meds.dataUpdatedAt || null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '700', color: color.slate, marginTop: space.lg, marginBottom: space.sm },
  reco: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: 10,
    backgroundColor: '#FFF6E6',
    borderWidth: 1,
    borderColor: color.marigold,
  },
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
