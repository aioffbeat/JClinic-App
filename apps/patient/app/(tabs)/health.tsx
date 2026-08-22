import { useQuery } from '@tanstack/react-query';
import { portalApi, type PortalVisit } from '@jclinic-mobile/api-client';
import { AsOf, Body, Caption, Card, H1, Label, Loading, Notice, Screen } from '@jclinic-mobile/ui';

/**
 * Health — the record.
 *
 * Combines the web portal's "My medical history", "Labs" and "My plan" tabs. From the patient's
 * side those are one thing (what the clinic knows about me); they were only separate on the web
 * because there was a sidebar wide enough to list them.
 */
export default function Health() {
  const history = useQuery({ queryKey: ['portal', 'medical-history'], queryFn: () => portalApi.medicalHistory() });
  const visits = (history.data ?? []) as PortalVisit[];

  return (
    <Screen refreshing={history.isRefetching} onRefresh={() => history.refetch()}>
      <H1>Health</H1>
      {history.isLoading && <Loading />}

      {history.isError && !visits.length && (
        <Notice
          title="Cannot load your history"
          body="You may be offline. It will appear once you reconnect."
          tone="bad"
        />
      )}

      {!history.isLoading && !visits.length && !history.isError && (
        <Notice title="No visits yet" body="Your visit records will appear here after your first consultation." />
      )}

      {(visits as any[]).map((v, i) => (
        <Card key={v.id ?? i}>
          <Label>{v.visitAt ? new Date(v.visitAt).toLocaleDateString() : 'Visit'}</Label>
          {!!v.doctor && <Body>{v.doctor}</Body>}
          {!!v.diagnosis && <Body muted>{v.diagnosis}</Body>}
          {!!v.note && <Caption>{v.note}</Caption>}
        </Card>
      ))}

      <AsOf at={history.dataUpdatedAt || null} />
    </Screen>
  );
}
