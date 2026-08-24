import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { dmy, portalApi, type PortalBill } from '@/src/api';
import { AsOf, Body, Button, Caption, Card, H1, H2, Label, Loading, Notice, Screen, space } from '@/src/ui';
import { usePatientSession } from '@/src/session-context';

/**
 * Home — what needs attention.
 *
 * The symptom check-in lives here rather than as its own tab because it is a task that appears and
 * disappears, not a place you navigate to.
 */
export default function Home() {
  const router = useRouter();
  const { patient, me, accessible, signOut } = usePatientSession();

  const followup = useQuery({ queryKey: ['portal', 'next-followup'], queryFn: () => portalApi.nextFollowup() });
  const bills = useQuery({ queryKey: ['portal', 'bills'], queryFn: () => portalApi.bills() });
  const unread = useQuery({ queryKey: ['portal', 'unread'], queryFn: () => portalApi.unread() });
  const feedback = useQuery({ queryKey: ['portal', 'feedback', 'pending'], queryFn: () => portalApi.feedbackPending() });

  // PortalBill carries `total` and `paidAmount` — there is no `outstanding` field. This screen
  // used to read one, so every balance silently showed as zero.
  const owed = useMemo(() => (bills.data ?? []).reduce((sum, b) => sum + outstandingOf(b), 0), [bills.data]);
  const unpaidCount = (bills.data ?? []).filter((b) => outstandingOf(b) > 0).length;

  const loading = followup.isLoading || bills.isLoading;
  const pendingFeedback = feedback.data?.length ?? 0;

  return (
    <Screen
      refreshing={followup.isRefetching || bills.isRefetching}
      onRefresh={() => {
        followup.refetch();
        bills.refetch();
        unread.refetch();
        feedback.refetch();
      }}
    >
      <H1>{patient?.name ? `Hello, ${patient.name.split(' ')[0]}` : 'Hello'}</H1>
      {!!me?.diseases.length && <Caption>{me.diseases.map((d) => d.disease).join(' · ')}</Caption>}

      {loading && <Loading />}

      {!!followup.data && (
        <Card>
          <Label>Next follow-up</Label>
          <H2>{dmy(followup.data.dueAt)}</H2>
          <Body muted>{followup.data.clinic ?? 'Your clinic'}</Body>
        </Card>
      )}

      {owed > 0 && (
        <Card>
          <Label>Outstanding</Label>
          <H2>{inr(owed)}</H2>
          <Body muted>
            {`${unpaidCount} unpaid bill${unpaidCount === 1 ? '' : 's'}. Please settle at the clinic.`}
          </Body>
        </Card>
      )}

      {!!unread.data?.unread && (
        <Card>
          <Label>New message</Label>
          <Body>
            {unread.data.unread === 1
              ? 'Your clinic has replied.'
              : `Your clinic has sent ${unread.data.unread} new messages.`}
          </Body>
          <Button title="Open chat" onPress={() => router.push('/(tabs)/chat')} style={{ marginTop: space.md }} />
        </Card>
      )}

      <Card>
        <Label>How are you feeling?</Label>
        <Body muted>A short check-in helps your doctor spot problems between visits.</Body>
        <Button title="Start check-in" onPress={() => router.push('/checkin')} style={{ marginTop: space.md }} />
      </Card>

      {pendingFeedback > 0 && (
        <Card>
          <Label>Your clinic asked for feedback</Label>
          <Body muted>It takes under a minute and only your clinic sees it unless you choose otherwise.</Body>
          <Button
            title="Give feedback"
            variant="secondary"
            onPress={() => router.push('/feedback')}
            style={{ marginTop: space.md }}
          />
        </Card>
      )}

      {accessible.length > 1 && (
        <Card>
          <Label>Family</Label>
          <Body muted>{`${accessible.length} people are linked to this number.`}</Body>
          <Button
            title="Switch person"
            variant="secondary"
            onPress={() => router.push('/family')}
            style={{ marginTop: space.md }}
          />
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

/** What is still owed on a bill. The API models paid-so-far, not remaining. */
function outstandingOf(b: PortalBill) {
  return Math.max(0, Number(b.total) - Number(b.paidAmount));
}

function inr(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
