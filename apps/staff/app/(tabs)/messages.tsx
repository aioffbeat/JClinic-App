import { useQuery } from '@tanstack/react-query';
import { portalStaffApi, type ChatThreadRow } from '@jclinic-mobile/api-client';
import { AsOf, Body, Caption, Card, H1, Label, Loading, Notice, Pill, Screen } from '@jclinic-mobile/ui';
import { useStaffSession } from '../../src/session-context';

/**
 * Staff side of patient messaging.
 *
 * The list only. Replying is a compose flow that belongs on a pushed route, and the ePRO symptom
 * alerts and refill requests that share this module each deserve their own screen rather than
 * being crushed into a single feed.
 */
export default function Messages() {
  const { clinicId, can } = useStaffSession();

  const threads = useQuery({
    queryKey: ['portal-staff', 'threads', clinicId],
    queryFn: () => portalStaffApi.threads(),
    enabled: !!clinicId && can.messages,
    refetchInterval: 60_000,
  });

  const rows = (threads.data ?? []) as ChatThreadRow[];
  const unreadFirst = [...rows].sort((a, b) => b.unread - a.unread || (a.lastAt < b.lastAt ? 1 : -1));

  return (
    <Screen refreshing={threads.isRefetching} onRefresh={() => threads.refetch()}>
      <H1>Messages</H1>
      {threads.isLoading && <Loading />}

      {threads.isError && !rows.length && (
        <Notice title="Cannot load messages" body="You may be offline. Try again once you reconnect." tone="bad" />
      )}

      {!threads.isLoading && !rows.length && !threads.isError && (
        <Notice title="No conversations" body="Nothing from patients right now." />
      )}

      {unreadFirst.map((t) => (
        <Card key={t.patientId}>
          <Label>{t.patient}</Label>
          {t.unread > 0 && <Pill text={`${t.unread} unread`} tone="info" />}
          <Body muted>{t.lastBody}</Body>
          <Caption>
            {`${t.lastSender === 'staff' ? 'You' : t.patient} · ${new Date(t.lastAt).toLocaleString()}`}
            {t.closedAt ? ' · closed' : ''}
          </Caption>
        </Card>
      ))}

      <AsOf at={threads.dataUpdatedAt || null} />
    </Screen>
  );
}
