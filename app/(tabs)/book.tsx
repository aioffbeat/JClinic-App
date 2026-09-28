import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi, type PortalAppointment } from '@/src/api';
import { AsOf, Body, Button, Caption, Card, H1, Label, Loading, Notice, Pill, Screen, color, space } from '@/src/ui';

/**
 * Appointments.
 *
 * The endpoint returns an OBJECT — { upcoming, past, cancelCutoffMin, horizonDays } — not an array.
 * This screen previously iterated it as one, which is the kind of thing a cast hides and a device
 * does not.
 *
 * Cancel eligibility comes from the server's own `canCancel`, not from comparing the start time
 * against `cancelCutoffMin` here. Same rule as the dose slots on Medicines: the server owns the
 * decision, and a second implementation in the app is a second answer. `cancelCutoffMin` is used
 * only to explain to the patient why an appointment can no longer be cancelled.
 */
export default function Book() {
  const qc = useQueryClient();
  const router = useRouter();

  const appts = useQuery({
    queryKey: ['portal', 'appointments'],
    queryFn: () => portalApi.appointments(),
  });


  /**
   * A reschedule is a REQUEST, not a move: the clinic confirms it. But the proposed time is
   * validated against the clinic's grid exactly as a new booking is, so this hands off to the
   * picker instead of proposing one. It used to offer "the same weekday next week", which the
   * server rejected with outside_hours whenever that instant was not itself a free slot — the
   * common case, since staff-booked visits are frequently off-grid to begin with.
   */
  function askReschedule(a: PortalAppointment) {
    router.push({ pathname: '/book-appointment', params: { reschedule: a.id } });
  }

  const cancel = useMutation({
    mutationFn: (id: string) => portalApi.cancelAppointment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'appointments'] }),
    onError: () => Alert.alert('Could not cancel', 'Please try again, or call the clinic.'),
  });

  const cutoffMin = appts.data?.cancelCutoffMin ?? 0;
  const upcoming = appts.data?.upcoming ?? [];
  const past = appts.data?.past ?? [];

  function confirmCancel(a: PortalAppointment) {
    Alert.alert('Cancel this appointment?', when(a.startsAt), [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel it', style: 'destructive', onPress: () => cancel.mutate(a.id) },
    ]);
  }

  return (
    <Screen refreshing={appts.isRefetching} onRefresh={() => appts.refetch()}>
      <H1>Appointments</H1>
      <Button title="Book a visit" onPress={() => router.push('/book-appointment')} style={{ marginBottom: space.lg }} />
      {appts.isLoading && <Loading />}

      {appts.isError && !appts.data && (
        <Notice
          title="Cannot load your appointments"
          body="You may be offline. They will appear once you reconnect."
          tone="bad"
        />
      )}

      {!!appts.data && !upcoming.length && <Notice title="Nothing booked" body="You have no upcoming appointments." />}

      {upcoming.map((a) => (
        <Card key={a.id}>
          <Label>{when(a.startsAt)}</Label>
          <Body>{a.patientNote ?? a.service ?? modeLabel(a.type)}</Body>
          {!!a.clinic?.name && <Caption>{a.clinic.name}</Caption>}
          {!!a.practitioner && <Caption>{a.practitioner}</Caption>}

          <View style={styles.row}>
            <Pill text={statusLabel(a.status)} tone={a.status === 'confirmed' ? 'ok' : 'neutral'} />
          </View>

          {!!a.rescheduleRequestedFor && (
            <Caption>{`Reschedule requested for ${when(a.rescheduleRequestedFor)} — the clinic will confirm.`}</Caption>
          )}

          {a.canReschedule && !a.rescheduleRequestedFor && (
            <Button
              title="Ask to move this"
              variant="secondary"
              onPress={() => askReschedule(a)}
              style={{ marginTop: space.md }}
            />
          )}

          {a.canCancel ? (
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => confirmCancel(a)}
              loading={cancel.isPending && cancel.variables === a.id}
              style={{ marginTop: space.md }}
            />
          ) : (
            <Caption>
              {cutoffMin
                ? `Changes close ${cutoffMin} minutes before the appointment — please call the clinic.`
                : 'Please call the clinic to change this appointment.'}
            </Caption>
          )}
        </Card>
      ))}

      {!!past.length && (
        <>
          <Text style={styles.section}>Past</Text>
          {past.slice(0, 10).map((a) => (
            <Card key={a.id}>
              <Label>{when(a.startsAt)}</Label>
              <Body muted>{a.patientNote ?? a.service ?? modeLabel(a.type)}</Body>
              {!!a.clinic?.name && <Caption>{a.clinic.name}</Caption>}
            </Card>
          ))}
        </>
      )}

      <AsOf at={appts.dataUpdatedAt || null} />
    </Screen>
  );
}

/**
 * What the patient booked. Portal bookings store the chosen purpose in `patientNote` and leave
 * `service` null on purpose (the service catalogue is internal and reception refines it), so the
 * card used to fall through to `type` and read "physical".
 */
function modeLabel(type: string) {
  return type === 'online' ? 'Online consultation' : 'Clinic visit';
}
/** Raw DB values — `no_show`, `checked_in` — are not sentences. */
function statusLabel(status: string) {
  const s = status.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function when(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginTop: space.sm },
  section: { fontSize: 13, fontWeight: '700', color: color.slate, marginTop: space.lg, marginBottom: space.sm },
});
