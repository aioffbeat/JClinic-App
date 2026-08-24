import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { dmy, portalApi } from '@/src/api';
import type { PortalPrescription } from '@/src/portal-types';
import { AsOf, Body, Caption, Card, H1, Label, Loading, Notice, Pill, Screen, color, space } from '@/src/ui';

/**
 * Prescriptions, as written.
 *
 * Distinct from the Medicines tab, which is a daily checklist. This is the document: what was
 * prescribed, by whom, on what date, with the dosing text the server derived from the frequency
 * code. A patient asked to bring "the prescription" to another doctor needs this view, not a list
 * of today's ticks.
 */
export default function Prescriptions() {
  const rx = useQuery({
    queryKey: ['portal', 'prescriptions'],
    queryFn: () => portalApi.prescriptions() as Promise<PortalPrescription[]>,
  });

  const rows = rx.data ?? [];

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Prescriptions', headerTintColor: color.petrolInk }} />
      <Screen refreshing={rx.isRefetching} onRefresh={() => rx.refetch()}>
        <H1>Prescriptions</H1>
        {rx.isLoading && <Loading />}

        {rx.isError && !rows.length && (
          <Notice title="Cannot load prescriptions" body="You may be offline." tone="bad" />
        )}

        {!rx.isLoading && !rows.length && !rx.isError && (
          <Notice title="Nothing prescribed yet" body="Your prescriptions will appear here after a consultation." />
        )}

        {rows.map((r) => (
          <Card key={r.id}>
            <View style={styles.head}>
              <Label>{dmy(r.date)}</Label>
              <Pill text={r.status} tone={r.status === 'signed' ? 'ok' : 'neutral'} />
            </View>
            {!!r.prescriber && <Caption>{r.prescriber}</Caption>}

            {r.items.map((it, i) => (
              <View key={`${it.medicine}-${i}`} style={styles.item}>
                <Text style={styles.medicine}>{it.medicine}</Text>
                <Caption>
                  {[it.dose, it.timing || it.frequency, it.durationDays ? `${it.durationDays} days` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Caption>
                {!!it.instructions && <Body muted>{it.instructions}</Body>}
              </View>
            ))}
          </Card>
        ))}

        <AsOf at={rx.dataUpdatedAt || null} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  item: { marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.hairline },
  medicine: { fontSize: 16, fontWeight: '600', color: color.ink },
});
