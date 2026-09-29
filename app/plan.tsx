import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { dmy, portalApi } from '@/src/api';
import type { PortalCarePlan, PortalPackage } from '@/src/portal-types';
import { AsOf, Body, Caption, Card, H1, H2, Label, Loading, Notice, Pill, Screen, color, space } from '@/src/ui';

/**
 * My plan — what the doctor advised, and what the patient has already paid for.
 *
 * The package balances come from the same allowance engine the billing counter uses, so the number
 * here can never disagree with what reception will actually hand over. That is the point of showing
 * it at all: a patient who thinks they have four sessions left and is told otherwise at the desk is
 * a worse outcome than not showing a balance.
 */
export default function Plan() {
  const plan = useQuery({
    queryKey: ['portal', 'care-plan'],
    queryFn: () => portalApi.carePlan() as Promise<PortalCarePlan>,
  });
  const packages = useQuery({
    queryKey: ['portal', 'packages'],
    queryFn: () => portalApi.packages() as Promise<PortalPackage[]>,
  });
  const recommended = useQuery({
    queryKey: ['portal', 'package-recommendations'],
    queryFn: () => portalApi.packageRecommendations(),
  });

  const p = plan.data;
  const bought = packages.data ?? [];
  const recs = recommended.data ?? [];

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'My plan', headerTintColor: color.petrolInk }} />
      <Screen
        refreshing={plan.isRefetching}
        onRefresh={() => { plan.refetch(); packages.refetch(); recommended.refetch(); }}
      >
        <H1>My plan</H1>
        {plan.isLoading && <Loading />}
        {plan.isError && !p && <Notice title="Cannot load your plan" body="You may be offline." tone="bad" />}

        {!!p?.diseases.length && (
          <Card>
            <H2>Conditions</H2>
            {p.diseases.map((d, i) => (
              <View key={`${d.disease}-${i}`} style={styles.row}>
                <Text style={styles.rowKey}>{d.disease}</Text>
                <Text style={styles.rowVal}>
                  {[d.stage != null ? `Stage ${d.stage}` : null, d.status].filter(Boolean).join(' · ')}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {!!p?.due.length && (
          <Card>
            <H2>Tests coming up</H2>
            {p.due.slice(0, 8).map((t, i) => (
              <View key={`${t.test}-${i}`} style={styles.row}>
                <Text style={styles.rowKey}>{t.test}</Text>
                <Text style={[styles.rowVal, t.overdue && { color: color.danger }]}>
                  {t.overdue
                    ? t.daysLate > 0
                      ? `${t.daysLate} days late`
                      : 'Overdue'
                    : t.nextDue
                      ? dmy(t.nextDue)
                      : '—'}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {!!p?.dietPlan && (
          <Card>
            <H2>Diet & routine</H2>
            <Caption>{`Advised ${dmy(p.dietPlan.date)}`}</Caption>
            <StringList label="Daily routine" items={p.dietPlan.dinacharya} />
            <StringList label="Yoga asanas" items={p.dietPlan.yogaAsanas} />
            <StringList label="Pranayama" items={p.dietPlan.pranayama} />
            {!!p.dietPlan.dinacharyaPlan && <Body muted>{p.dietPlan.dinacharyaPlan}</Body>}
            {!!p.dietPlan.yogasanaAdvice && <Body muted>{p.dietPlan.yogasanaAdvice}</Body>}
            {!!p.dietPlan.lifestyleNotes && <Body muted>{p.dietPlan.lifestyleNotes}</Body>}
          </Card>
        )}

        {bought.map((pkg, i) => (
          <Card key={`${pkg.name}-${i}`}>
            <View style={styles.head}>
              <Label>{pkg.name}</Label>
              {pkg.lapsed && <Pill text="Expired" tone="warn" />}
            </View>

            {pkg.sessionsTotal > 0 && (
              <Body>{`${pkg.sessionsLeft} of ${pkg.sessionsTotal} sessions left`}</Body>
            )}
            {pkg.valueAllotted > 0 && (
              <Body>{`₹${pkg.valueRemaining.toLocaleString('en-IN')} of ₹${pkg.valueAllotted.toLocaleString('en-IN')} remaining`}</Body>
            )}
            {!!pkg.expiresAt && <Caption>{`Valid until ${dmy(pkg.expiresAt)}`}</Caption>}

            {/* A suspended protocol is the one thing here the patient must act on — it means the
                clinic cannot draw against it until the balance is settled. */}
            {!!pkg.payment && pkg.payment.outstanding > 0 && (
              <View style={styles.warn}>
                <Label>{pkg.payment.suspended ? 'On hold until paid' : 'Balance outstanding'}</Label>
                <Body>{`₹${pkg.payment.outstanding.toLocaleString('en-IN')} due${pkg.payment.payByDate ? ` by ${dmy(pkg.payment.payByDate)}` : ''}`}</Body>
                <Caption>Please settle this at the clinic.</Caption>
              </View>
            )}

            {pkg.lapsed && <Caption>Ask reception about extending this.</Caption>}
          </Card>
        ))}

        {!!recs.length && (
          <Card>
            <H2>Recommended for you</H2>
            {recs.map((r) => (
              <View key={r.id} style={styles.rec}>
                <Label>{r.name}</Label>
                <Body>{`₹${Number(r.price).toLocaleString('en-IN')}${r.durationMonths ? ` · ${r.durationMonths} months` : ''}`}</Body>
                {!!r.note && <Body muted>{r.note}</Body>}
                {!!r.recommendedBy && <Caption>{`Suggested by ${r.recommendedBy}`}</Caption>}
              </View>
            ))}
            <Caption>Speak to reception if you would like to start one of these.</Caption>
          </Card>
        )}

        {/* Tests due and the diet plan are a plan too — this notice used to sit directly above
            both of them. */}
        {!plan.isLoading && !p?.diseases.length && !bought.length && !recs.length
          && !p?.due?.length && !p?.dietPlan && !p?.treatmentPlan && (
          <Notice title="No plan yet" body="Your care plan appears here once your doctor has set one." />
        )}

        <AsOf at={plan.dataUpdatedAt || null} />
      </Screen>
    </>
  );
}

function StringList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{label}</Text>
      <Text style={styles.rowVal}>{items.join(', ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  row: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  rowKey: { flex: 1, fontSize: 14, color: color.slate },
  rowVal: { flex: 1.4, fontSize: 14, color: color.ink, fontWeight: '500' },
  rec: { marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.hairline },
  warn: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: 10,
    backgroundColor: '#FDF0EF',
    borderWidth: 1,
    borderColor: color.danger,
  },
});
