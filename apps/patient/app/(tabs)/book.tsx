import { useQuery } from '@tanstack/react-query';
import { portalApi, type PortalAppointment } from '@jclinic-mobile/api-client';
import { AsOf, Body, Caption, Card, H1, Label, Loading, Notice, Pill, Screen } from '@jclinic-mobile/ui';

/**
 * Appointments.
 *
 * Lists what is booked. The booking flow itself (pick a date, see free slots, choose consultation
 * or therapy, confirm) is a multi-step form and belongs on its own pushed route rather than inside
 * a tab the user might swipe away from halfway through.
 */
export default function Book() {
  const appts = useQuery({ queryKey: ['portal', 'appointments'], queryFn: () => portalApi.appointments() });
  const rows = (appts.data ?? []) as PortalAppointment[];

  return (
    <Screen refreshing={appts.isRefetching} onRefresh={() => appts.refetch()}>
      <H1>Appointments</H1>
      {appts.isLoading && <Loading />}

      {!appts.isLoading && !rows.length && <Notice title="Nothing booked" body="You have no upcoming appointments." />}

      {(rows as any[]).map((a, i) => (
        <Card key={a.id ?? i}>
          <Label>{a.startsAt ? new Date(a.startsAt).toLocaleString() : 'Appointment'}</Label>
          {!!a.purpose && <Body>{a.purpose}</Body>}
          {!!a.clinic && <Caption>{a.clinic}</Caption>}
          {!!a.status && <Pill text={a.status} tone={a.status === 'confirmed' ? 'ok' : 'neutral'} />}
        </Card>
      ))}

      <AsOf at={appts.dataUpdatedAt || null} />
    </Screen>
  );
}
