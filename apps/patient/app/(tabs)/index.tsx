import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { portalApi } from '@jclinic-mobile/api-client';
import { AsOf, Body, Button, Caption, Card, H1, H2, Label, Loading, Notice, Screen, space } from '@jclinic-mobile/ui';
import { usePatientSession } from '../../src/session-context';

/**
 * Home — the "what needs my attention" screen.
 *
 * Mirrors the web portal's Home tab: next follow-up, anything outstanding to pay, and the periodic
 * symptom check-in. The check-in lives here rather than as its own tab because it is a task that
 * appears and disappears, not a place you navigate to.
 */
export default function Home() {
  const router = useRouter();
  const { patient, accessible, switchPatient, signOut } = usePatientSession();

  const followup = useQuery({ queryKey: ['portal', 'next-followup'], queryFn: () => portalApi.nextFollowup() });
  const bills = useQuery({ queryKey: ['portal', 'bills'], queryFn: () => portalApi.bills() });

  const loading = followup.isLoading || bills.isLoading;
  const outstanding = ((bills.data ?? []) as any[]).filter((b) => Number(b.outstanding ?? 0) > 0);
  const owed = outstanding.reduce((sum: number, b: any) => sum + Number(b.outstanding ?? 0), 0);

  return (
    <Screen
      refreshing={followup.isRefetching || bills.isRefetching}
      onRefresh={() => {
        followup.refetch();
        bills.refetch();
      }}
    >
      <H1>{patient?.name ? `Hello, ${patient.name.split(' ')[0]}` : 'Hello'}</H1>
      {loading && <Loading />}

      {!!followup.data && (
        <Card>
          <Label>Next follow-up</Label>
          <H2>{new Date(followup.data.dueAt).toLocaleDateString()}</H2>
          <Body muted>{followup.data.clinic ?? 'Your clinic'}</Body>
        </Card>
      )}

      {owed > 0 && (
        <Card>
          <Label>Outstanding</Label>
          <H2>{`₹${owed.toLocaleString('en-IN')}`}</H2>
          <Body muted>
            {`${outstanding.length} unpaid bill${outstanding.length > 1 ? 's' : ''}. Please settle at the clinic.`}
          </Body>
        </Card>
      )}

      <Card>
        <Label>How are you feeling?</Label>
        <Body muted>A short check-in helps your doctor spot problems between visits.</Body>
        <Button title="Start check-in" onPress={() => router.push('/checkin')} style={{ marginTop: space.md }} />
      </Card>

      {/* One phone can legitimately hold several charts in a family. Switching re-mints the token
          server-side — the active patient is always the token's subject, never a header — which is
          why this goes through the session context rather than a request parameter. */}
      {accessible.length > 1 && (
        <Card>
          <Label>Switch person</Label>
          {accessible.map((a) => (
            <Button
              key={a.patientId}
              title={`${a.name}${a.patientId === patient?.id ? ' (viewing)' : ''}`}
              variant="secondary"
              disabled={a.patientId === patient?.id}
              onPress={() => switchPatient(a.patientId)}
              style={{ marginTop: space.sm }}
            />
          ))}
        </Card>
      )}

      {followup.isError && bills.isError && (
        <Notice title="Cannot reach the clinic" body="You may be offline. Showing what we last had." tone="bad" />
      )}

      <Button title="Sign out" variant="secondary" onPress={signOut} style={{ marginTop: space.lg }} />
      <Caption>Your records are private to you.</Caption>
      <AsOf at={followup.dataUpdatedAt || null} />
    </Screen>
  );
}
