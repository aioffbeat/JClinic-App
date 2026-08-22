import { useQuery } from '@tanstack/react-query';
import { analyticsApi, schedulingApi } from '@jclinic-mobile/api-client';
import { AsOf, Body, Button, Caption, Card, H1, H2, Label, Loading, Notice, Pill, Screen, space } from '@jclinic-mobile/ui';
import { useStaffSession } from '../../src/session-context';

/**
 * Today — the staff landing screen.
 *
 * Deliberately not a port of the web dashboard's tile grid. On a phone the two useful questions are
 * "who is waiting" and "how are we doing today", and both already have endpoints.
 */
export default function Today() {
  const { user, can, clinicId, chooseClinic, signOut } = useStaffSession();

  const queue = useQuery({
    queryKey: ['queue', clinicId],
    queryFn: () => schedulingApi.queue(),
    enabled: !!clinicId && can.queue,
    // The waiting room changes while you are looking at it.
    refetchInterval: 60_000,
  });

  const collection = useQuery({
    queryKey: ['analytics', 'collection', clinicId],
    queryFn: () => analyticsApi.collection(),
    enabled: !!clinicId && can.collection,
  });

  const waiting = (queue.data ?? []).filter((q) => q.state !== 'done');

  return (
    <Screen
      refreshing={queue.isRefetching || collection.isRefetching}
      onRefresh={() => {
        queue.refetch();
        collection.refetch();
      }}
    >
      <H1>{user?.name ? `Hello, ${user.name.split(' ')[0]}` : 'Today'}</H1>

      {!clinicId && (
        <Notice title="No clinic selected" body="Nearly every screen needs a clinic. Pick one to continue." tone="bad" />
      )}

      {(queue.isLoading || collection.isLoading) && <Loading />}

      {can.queue && (
        <Card>
          <Label>Waiting now</Label>
          <H2>{String(waiting.length)}</H2>
          {waiting.slice(0, 6).map((q) => (
            <Body key={q.id} muted>
              {`${q.number}. ${q.patient?.fullName ?? 'Patient'}${q.appointment?.type ? ` — ${q.appointment.type}` : ''}`}
            </Body>
          ))}
          {waiting.length > 6 && <Caption>{`+${waiting.length - 6} more`}</Caption>}
          {!waiting.length && <Body muted>Nobody is waiting.</Body>}
        </Card>
      )}

      {/*
        Today's collection is its own permission, held by EVERY role — the owner's decision that the
        whole team should see how each branch is doing. Deliberately not analytics_finance, which
        would also unlock revenue trends, GST, margins and patient LTV. It is also the one report
        not bounded to a single clinic, which is why every branch is listed here.
      */}
      {can.collection && !!collection.data && (
        <Card>
          <Label>Collected today</Label>
          <H2>{`₹${Number(collection.data.total.collected).toLocaleString('en-IN')}`}</H2>
          {collection.data.clinics.map((c: any) => (
            <Body key={c.clinicId ?? c.name} muted>
              {`${c.name}: ₹${Number(c.collected ?? 0).toLocaleString('en-IN')}`}
            </Body>
          ))}
        </Card>
      )}

      {/* More than one clinic means this person works across branches. X-Clinic-Id decides what
          every other screen shows, so switching has to be reachable from the first screen. */}
      {(user?.clinics.length ?? 0) > 1 && (
        <Card>
          <Label>Clinic</Label>
          {user!.clinics.map((c) => (
            <Button
              key={c}
              title={c === clinicId ? `${c} (current)` : c}
              variant="secondary"
              disabled={c === clinicId}
              onPress={() => chooseClinic(c)}
              style={{ marginTop: space.sm }}
            />
          ))}
        </Card>
      )}

      {!can.queue && !can.collection && (
        <Notice title="Nothing to show here" body="Your account does not have access to the queue or collections." />
      )}

      <Pill text={user?.roles.join(', ') ?? ''} />
      <Button title="Sign out" variant="secondary" onPress={signOut} style={{ marginTop: space.lg }} />
      <AsOf at={queue.dataUpdatedAt || collection.dataUpdatedAt || null} />
    </Screen>
  );
}
