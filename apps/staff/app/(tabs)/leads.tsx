import { useQuery } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { leadsApi, type LeadRow } from '@jclinic-mobile/api-client';
import { AsOf, Body, Button, Caption, Card, H1, Label, Loading, Notice, Pill, Screen, space } from '@jclinic-mobile/ui';
import { useStaffSession } from '../../src/session-context';

/**
 * The lead worklist.
 *
 * Scoped to "mine" rather than the whole funnel: the web page exists to manage a pipeline across
 * segments, whereas the phone version answers one question — who do I call next. The rest of the
 * CRM stays on the desktop where the tables fit.
 */
export default function Leads() {
  const { clinicId, can } = useStaffSession();

  const leads = useQuery({
    queryKey: ['leads', 'mine', clinicId],
    queryFn: () => leadsApi.list('?segment=mine'),
    enabled: !!clinicId && can.leads,
  });

  const rows = (leads.data ?? []) as LeadRow[];

  /**
   * Dial from the handset.
   *
   * A plain tel: link, NOT Ozonetel click-to-call. The proven Ozonetel path needs the agent to be
   * Ready with a connected phone and an agent ID that is a short code rather than an email — none
   * of which can be assumed of someone standing in a corridor with their mobile. Wiring
   * telephonyApi in properly (so the call is recorded against the lead) is worth doing, but it
   * needs the agent-state handling the web app has and this screen does not yet.
   */
  function call(phone: string | null | undefined) {
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
  }

  return (
    <Screen refreshing={leads.isRefetching} onRefresh={() => leads.refetch()}>
      <H1>My leads</H1>
      {leads.isLoading && <Loading />}

      {leads.isError && !rows.length && (
        <Notice title="Cannot load leads" body="You may be offline. Try again once you reconnect." tone="bad" />
      )}

      {!leads.isLoading && !rows.length && !leads.isError && (
        <Notice title="Nothing assigned" body="You have no leads to work right now." />
      )}

      {rows.map((lead: any) => (
        <Card key={lead.id}>
          <Label>{lead.name ?? 'Unnamed lead'}</Label>
          {!!lead.stage && <Pill text={lead.stage} />}
          {!!lead.disease && <Body muted>{lead.disease}</Body>}
          {!!lead.source && <Caption>{`via ${lead.source}`}</Caption>}
          {!!lead.phone && (
            <Button title={`Call ${lead.phone}`} onPress={() => call(lead.phone)} style={{ marginTop: space.md }} />
          )}
        </Card>
      ))}

      <AsOf at={leads.dataUpdatedAt || null} />
    </Screen>
  );
}
