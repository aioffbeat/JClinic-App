import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { dmy, portalApi, type PortalBill } from '@/src/api';
import {
  AsOf, Body, Button, Caption, Card, Hero, HeroButton, Label, Loading, Notice,
  Screen, Tile, TileGrid, Wordmark, space,
} from '@/src/ui';
import { usePatientSession } from '@/src/session-context';

/**
 * Home — what needs attention.
 *
 * Laid out like the web portal's home: a gradient hero, then a grid of coloured tiles, then the
 * cards that only appear when there is something to say. The tiles are the same five gradients the
 * portal uses, so the two surfaces read as one product rather than two apps against one API.
 */
export default function Home() {
  const router = useRouter();
  const { patient, me, accessible, signOut } = usePatientSession();

  const followup = useQuery({ queryKey: ['portal', 'next-followup'], queryFn: () => portalApi.nextFollowup() });
  const bills = useQuery({ queryKey: ['portal', 'bills'], queryFn: () => portalApi.bills() });
  const unread = useQuery({ queryKey: ['portal', 'unread'], queryFn: () => portalApi.unread() });
  const feedback = useQuery({ queryKey: ['portal', 'feedback', 'pending'], queryFn: () => portalApi.feedbackPending() });
  const meds = useQuery({ queryKey: ['portal', 'medications'], queryFn: () => portalApi.medications() });
  const history = useQuery({ queryKey: ['portal', 'medical-history'], queryFn: () => portalApi.medicalHistory() });
  // A self-registered patient whose visiting charge is unpaid has an UNCONFIRMED first visit. That
  // must stay visible and reachable, or registration quietly dead-ends at the clinic door.
  const registration = useQuery({
    queryKey: ['portal', 'registration', 'status'],
    queryFn: () => portalApi.registrationStatus(),
  });

  // PortalBill carries `total` and `paidAmount` — there is no `outstanding` field.
  const owed = useMemo(() => (bills.data ?? []).reduce((sum, b) => sum + outstandingOf(b), 0), [bills.data]);
  const unpaidCount = (bills.data ?? []).filter((b) => outstandingOf(b) > 0).length;

  const dosesDue = (meds.data ?? []).filter((m) => m.anyDue).length;
  const visits = history.data?.length ?? 0;
  const pendingFeedback = feedback.data?.length ?? 0;
  const firstName = patient?.name?.split(' ')[0] ?? '';

  return (
    <Screen
      refreshing={followup.isRefetching || bills.isRefetching}
      onRefresh={() => {
        followup.refetch();
        bills.refetch();
        unread.refetch();
        feedback.refetch();
        meds.refetch();
      }}
    >
      <Wordmark size="sm" />

      <Hero
        title={firstName ? `Hello, ${firstName}` : 'Hello'}
        subtitle={
          me?.diseases.length
            ? me.diseases.map((d) => d.disease).join(' · ')
            : 'Your records, medicines and appointments — all in one place.'
        }
      >
        <HeroButton title="How are you feeling?" onPress={() => router.push('/checkin')} />
      </Hero>

      <TileGrid>
        <Tile
          label={dosesDue ? 'Doses due today' : 'All doses taken'}
          value={dosesDue ? String(dosesDue) : '✓'}
          tone="green"
          onPress={() => router.push('/(tabs)/medicines')}
        />
        <Tile
          label={unread.data?.unread ? 'New messages' : 'Messages'}
          value={String(unread.data?.unread ?? 0)}
          tone="violet"
          onPress={() => router.push('/(tabs)/chat')}
        />
        <Tile label="Visits recorded" value={String(visits)} tone="blue" onPress={() => router.push('/(tabs)/health')} />
        <Tile
          label={owed > 0 ? 'Outstanding' : 'Nothing due'}
          value={owed > 0 ? inr(owed) : '₹0'}
          tone={owed > 0 ? 'warm' : 'deep'}
        />
      </TileGrid>

      {(followup.isLoading || bills.isLoading) && <Loading />}

      {registration.data?.hasRegistrationVisit && registration.data.payState !== 'paid' && (
        <Card>
          <Label>Your first visit is not confirmed yet</Label>
          <Body muted>The visiting charge confirms your appointment.</Body>
          <Button title="Pay now" onPress={() => router.push('/pay')} style={{ marginTop: space.md }} />
        </Card>
      )}

      {!!followup.data && (
        <Card>
          <Label>Next follow-up</Label>
          <Body>{dmy(followup.data.dueAt)}</Body>
          <Caption>{followup.data.clinic ?? 'Your clinic'}</Caption>
        </Card>
      )}

      {owed > 0 && (
        <Card>
          <Label>Unpaid bills</Label>
          <Body>{`${inr(owed)} across ${unpaidCount} bill${unpaidCount === 1 ? '' : 's'}`}</Body>
          <Caption>Please settle at the clinic.</Caption>
        </Card>
      )}

      {pendingFeedback > 0 && (
        <Card>
          <Label>Your clinic asked for feedback</Label>
          <Body muted>It takes under a minute, and only your clinic sees it unless you choose otherwise.</Body>
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

      {/* Play policy: an app with account creation must make deletion discoverable IN the app, not
          only at a URL. The page itself lives on the web because the flow is human-verified — the
          clinic confirms the request against the registered number before deleting anything. */}
      <Button
        title="Delete my account & data"
        variant="secondary"
        onPress={() => Linking.openURL('https://clinic.drjoshis.in/legal/deletion')}
        style={{ marginTop: space.sm }}
      />
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
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
