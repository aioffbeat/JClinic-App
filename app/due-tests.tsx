import { useState } from 'react';
import { Stack } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi, type PortalDueTest } from '@/src/api';
import { Body, Button, Caption, Card, H1, Label, Loading, Notice, Pill, Screen, color, space } from '@/src/ui';

/**
 * Tests that are due, and booking them with a lab partner.
 *
 * The schedule is derived server-side from the patient's conditions and what has already been done,
 * so a test that was taken last week stops appearing immediately — the reason the reminder engine
 * was moved off stored rows in the first place. Nothing about "due" is decided here.
 *
 * Only tests the server marks `bookable` can be ordered, and only those sharing one lab partner can
 * go in a single order.
 */
export default function DueTests() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const due = useQuery({ queryKey: ['portal', 'due-tests'], queryFn: () => portalApi.dueTests() });

  const order = useMutation({
    mutationFn: ({ labPartnerId, codes }: { labPartnerId: string; codes: string[] }) =>
      portalApi.bookTests(labPartnerId, codes),
    onSuccess: (res) => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['portal', 'due-tests'] });
      Alert.alert('Requested', `${res.requested} test${res.requested === 1 ? '' : 's'} sent to the lab.`);
    },
    onError: () => Alert.alert('Could not book', 'Please try again, or call the clinic.'),
  });

  const tests = due.data?.tests ?? [];
  const diseases = due.data?.diseases ?? [];

  const chosen = tests.filter((t) => selected.has(t.biomarkerId) && t.bookable);
  // A lab order goes to one partner, so a mixed selection cannot be sent as one request.
  const partners = new Set(chosen.map((t) => t.bookable?.labPartnerId));
  const oneLab = partners.size === 1;
  const total = chosen.reduce((sum, t) => sum + (t.bookable?.price ?? 0), 0);

  function toggle(t: PortalDueTest) {
    if (!t.bookable || t.alreadyBooked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t.biomarkerId)) next.delete(t.biomarkerId);
      else next.add(t.biomarkerId);
      return next;
    });
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Tests due', headerTintColor: color.petrolInk }} />
      <Screen refreshing={due.isRefetching} onRefresh={() => due.refetch()}>
        <H1>Tests due</H1>
        {!!diseases.length && <Caption>{diseases.map((d) => d.name).join(' · ')}</Caption>}

        {due.isLoading && <Loading />}
        {due.isError && <Notice title="Cannot load your tests" body="You may be offline." tone="bad" />}

        {!due.isLoading && !tests.length && !due.isError && (
          <Notice title="Nothing due" body="You have no tests due right now." />
        )}

        {tests.map((t) => {
          const on = selected.has(t.biomarkerId);
          const selectable = !!t.bookable && !t.alreadyBooked;
          return (
            <Pressable key={t.biomarkerId} onPress={() => toggle(t)} disabled={!selectable}>
              {({ pressed }) => (
                <Card style={[on && styles.cardOn, pressed && selectable ? { opacity: 0.8 } : null]}>
                  <View style={styles.head}>
                    <Label>{t.name}</Label>
                    <Pill text={statusLabel(t)} tone={t.status === 'scheduled' ? 'neutral' : 'warn'} />
                  </View>
                  {!!t.assesses && <Caption>{t.assesses}</Caption>}
                  <Caption>
                    {t.lastDone
                      ? `Last done ${new Date(t.lastDone).toLocaleDateString()}`
                      : 'Not done before'}
                    {t.frequency ? ` · every ${t.frequency}` : ''}
                  </Caption>

                  {t.alreadyBooked ? (
                    <Pill text="Already booked" tone="ok" />
                  ) : t.bookable ? (
                    <Text style={[styles.book, on && { color: color.teal }]}>
                      {`${on ? '✓ ' : ''}${t.bookable.labPartner}${t.bookable.price ? ` · ₹${t.bookable.price}` : ''}`}
                    </Text>
                  ) : (
                    <Caption>Ask your clinic to arrange this one.</Caption>
                  )}
                </Card>
              )}
            </Pressable>
          );
        })}

        {chosen.length > 0 && (
          <Card>
            <Label>{`${chosen.length} test${chosen.length === 1 ? '' : 's'} selected`}</Label>
            {total > 0 && <Body>{`₹${total.toLocaleString('en-IN')}`}</Body>}
            {!oneLab && (
              <Body muted>These use different labs — book one lab at a time.</Body>
            )}
            <Button
              title="Request these tests"
              onPress={() => {
                const labPartnerId = chosen[0].bookable?.labPartnerId;
                if (!labPartnerId) return;
                order.mutate({ labPartnerId, codes: chosen.map((t) => t.bookable!.partnerCode) });
              }}
              loading={order.isPending}
              disabled={!oneLab}
              style={{ marginTop: space.md }}
            />
          </Card>
        )}
      </Screen>
    </>
  );
}

function statusLabel(t: PortalDueTest) {
  if (t.status === 'overdue') return 'Overdue';
  if (t.status === 'never') return 'Never done';
  return t.nextDue ? `Due ${new Date(t.nextDue).toLocaleDateString()}` : 'Scheduled';
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  cardOn: { borderColor: color.teal },
  book: { fontSize: 14, fontWeight: '600', color: color.slate, marginTop: space.sm },
});
