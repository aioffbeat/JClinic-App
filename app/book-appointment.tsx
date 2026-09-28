import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, portalApi } from '@/src/api';
import { Body, Button, Caption, Card, H1, Label, Loading, Notice, Screen, color, space } from '@/src/ui';

/**
 * Booking.
 *
 * Purpose is a fixed pair — "Doctor consultation" or "Therapy" — and that is a deliberate product
 * decision on the server, not a simplification here: patients were previously asked to pick from
 * the internal billing catalogue, which is not a question they can answer. Reception refines it
 * into a specific billable service when they confirm.
 *
 * Slots come from the server per date, already accounting for opening hours, the slot grid, lead
 * time and how many appointments can run in parallel. Nothing about availability is computed here.
 */
const PURPOSES = ['Doctor consultation', 'Therapy'] as const;
type Purpose = (typeof PURPOSES)[number];

export default function BookAppointment() {
  const router = useRouter();
  const qc = useQueryClient();
  /**
   * Doubles as the reschedule picker. Asking for a new time needs exactly what booking needs — the
   * clinic's real grid — and requestReschedule is validated against it just as strictly as book();
   * the old "same weekday next week" shortcut proposed times the server rejected outright.
   */
  const { reschedule: rescheduleId } = useLocalSearchParams<{ reschedule?: string }>();
  const isReschedule = !!rescheduleId;

  const [purpose, setPurpose] = useState<Purpose>('Doctor consultation');
  const [date, setDate] = useState(() => isoDate(addDays(new Date(), 1)));
  const [chosen, setChosen] = useState<string | null>(null);

  const slots = useQuery({
    queryKey: ['portal', 'slots', date],
    queryFn: () => portalApi.slots(date),
  });

  // Same key the Book tab uses, so this is normally a cache hit; it carries the clinic's horizon.
  const appts = useQuery({ queryKey: ['portal', 'appointments'], queryFn: () => portalApi.appointments() });

  const book = useMutation({
    // The two endpoints return different shapes and nothing here reads either — both are followed
    // by an invalidate and a navigation, so the result is deliberately widened to void.
    mutationFn: async (startsAt: string): Promise<void> => {
      if (isReschedule) await portalApi.requestReschedule(rescheduleId!, startsAt);
      else await portalApi.book({ startsAt, purpose });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'appointments'] });
      if (isReschedule) Alert.alert('Requested', 'The clinic will confirm your new time.');
      router.replace('/(tabs)/book');
    },
    onError: (e) => {
      // The server distinguishes taken, closed, too-far and past-the-cutoff, and each message says
      // what to do. Collapsing them into one sentence sent people to the phone unnecessarily.
      const msg = e instanceof ApiError ? (e.body as { message?: string } | undefined)?.message : null;
      Alert.alert(isReschedule ? 'Could not request' : 'Could not book', msg ?? 'Please pick another time and try again.');
      setChosen(null);
      slots.refetch();
    },
  });

  const free = (slots.data?.slots ?? []).filter((s) => s.free);
  const closed = slots.data?.closed ?? false;

  // Offering dates the clinic does not accept only produces a refusal the patient cannot
  // interpret, so the horizon comes from the appointments payload where the server states it.
  const horizon = Math.min(appts.data?.horizonDays ?? 14, 14);
  const days = Array.from({ length: horizon }, (_, i) => isoDate(addDays(new Date(), i + 1)));

  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: isReschedule ? 'Reschedule' : 'Book', headerTintColor: color.petrolInk }}
      />
      <Screen>
        <H1>{isReschedule ? 'Ask for another time' : 'Book a visit'}</H1>

        {/* Purpose belongs to the booking only — a reschedule keeps whatever the visit was for. */}
        {!isReschedule && (
          <Card>
            <Label>What is this for?</Label>
            <View style={styles.row}>
              {PURPOSES.map((p) => (
                <Choice key={p} text={p} on={purpose === p} onPress={() => setPurpose(p)} />
              ))}
            </View>
          </Card>
        )}

        <Card>
          <Label>Which day?</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
            <View style={styles.row}>
              {days.map((d) => (
                <Choice
                  key={d}
                  text={dayLabel(d)}
                  on={date === d}
                  onPress={() => {
                    setDate(d);
                    setChosen(null);
                  }}
                />
              ))}
            </View>
          </ScrollView>
        </Card>

        <Card>
          <Label>What time?</Label>
          {slots.isLoading && <Loading />}
          {closed && <Body muted>The clinic is closed on this day.</Body>}
          {!slots.isLoading && !closed && !free.length && (
            <Body muted>No free times left on this day — try another.</Body>
          )}
          <View style={[styles.row, { marginTop: space.md }]}>
            {free.map((s) => (
              <Choice key={s.start} text={timeLabel(s.start)} on={chosen === s.start} onPress={() => setChosen(s.start)} />
            ))}
          </View>
        </Card>

        {slots.isError && (
          <Notice title="Cannot load times" body="You may be offline. Try again once you reconnect." tone="bad" />
        )}
        {book.isError && (
          <Notice
            title="Could not book"
            body="That time may have just been taken. Pick another and try again."
            tone="bad"
          />
        )}

        <Button
          title={isReschedule ? 'Request this time' : 'Confirm booking'}
          onPress={() => chosen && book.mutate(chosen)}
          loading={book.isPending}
          disabled={!chosen}
        />
        <Caption>The clinic will confirm your appointment.</Caption>
      </Screen>
    </>
  );
}

function Choice({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && !on && { opacity: 0.7 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{text}</Text>
    </Pressable>
  );
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);
/** LOCAL calendar date. toISOString() is UTC, and the server reads this as an IST day — before
 *  05:30 IST that shifted the whole strip a day early, onto dates mostly inside the lead time. */
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.toLocaleDateString([], { weekday: 'short' })} ${d.getDate()}`;
};
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.surface,
  },
  choiceOn: { backgroundColor: color.teal, borderColor: color.teal },
  choiceText: { fontSize: 15, fontWeight: '600', color: color.ink },
  choiceTextOn: { color: '#FFFFFF' },
});
