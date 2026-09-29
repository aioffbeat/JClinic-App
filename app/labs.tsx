import { Stack } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '@/src/api';
import type { PortalLabMarker } from '@/src/portal-types';
import { AsOf, Body, Button, Caption, Card, H1, H2, Label, Loading, Notice, Pill, Screen, color, flag, space } from '@/src/ui';

/**
 * Lab results, and sending the clinic a report from outside.
 *
 * Results arrive grouped by biomarker with the full history oldest → newest, so the trend is
 * already there without a second request. The latest value carries a `flag` the server set against
 * the reference range — it is shown as-is and never recomputed, because "is this abnormal" is the
 * lab's judgement and the patient's doctor's, not the app's.
 */
export default function Labs() {
  const qc = useQueryClient();

  const results = useQuery({
    queryKey: ['portal', 'labs'],
    queryFn: () => portalApi.labs() as Promise<PortalLabMarker[]>,
  });

  const uploads = useQuery({ queryKey: ['portal', 'lab-uploads'], queryFn: () => portalApi.myLabUploads() });

  const upload = useMutation({
    mutationFn: async () => {
      const picked = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
      if (picked.canceled || !picked.assets.length) return null;
      const asset = picked.assets[0];
      // React Native's FormData takes a { uri, name, type } descriptor rather than a File, so the
      // shared client's File[] signature is satisfied structurally here.
      const file = {
        uri: asset.uri,
        name: asset.fileName ?? `lab-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as File;
      return portalApi.uploadLab([file]);
    },
    onSuccess: (res) => {
      if (!res) return; // cancelled
      qc.invalidateQueries({ queryKey: ['portal', 'lab-uploads'] });
      Alert.alert('Sent', 'Your clinic will review this report and add it to your record.');
    },
    onError: () => Alert.alert('Could not send', 'Please try again, or bring the report to the clinic.'),
  });

  async function onPhotograph() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera needed', 'Allow camera access to photograph a report.');
      return;
    }
    upload.mutate();
  }

  const markers = results.data ?? [];
  const sent = uploads.data ?? [];

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Labs', headerTintColor: color.petrolInk }} />
      <Screen refreshing={results.isRefetching} onRefresh={() => { results.refetch(); uploads.refetch(); }}>
        <H1>Lab results</H1>
        {results.isLoading && <Loading />}

        {results.isError && !markers.length && (
          <Notice title="Cannot load results" body="You may be offline. They will appear once you reconnect." tone="bad" />
        )}

        {!results.isLoading && !markers.length && !results.isError && (
          <Notice title="No results yet" body="Results appear here once your clinic has entered them." />
        )}

        {markers.map((m) => (
          <Card key={m.biomarker}>
            <View style={styles.head}>
              <Label>{m.biomarker}</Label>
              {!!m.latest.flag && <Pill text={m.latest.flag.replace('_', ' ')} tone={toneFor(m.latest.flag)} />}
            </View>
            {!!m.assesses && <Caption>{m.assesses}</Caption>}

            <Text style={[styles.value, { color: colourFor(m.latest.flag) }]}>
              {m.latest.value ?? m.latest.valueText ?? '—'}
              {m.unit ? <Text style={styles.unit}>{` ${m.unit}`}</Text> : null}
            </Text>
            <Caption>{`${new Date(m.latest.takenAt).toLocaleDateString()} · ${m.count} reading${m.count === 1 ? '' : 's'}`}</Caption>

            {/* Previous readings, newest first after the current one. A number next to the last few
                is more use to a patient than a sparkline they cannot read exact values off. */}
            {m.history.length > 1 && (
              <View style={styles.history}>
                {[...m.history]
                  .slice(0, -1)
                  .reverse()
                  .slice(0, 4)
                  .map((h, i) => (
                    <Caption key={`${h.takenAt}-${i}`}>
                      {`${new Date(h.takenAt).toLocaleDateString()}  ${h.value ?? h.valueText ?? '—'}`}
                    </Caption>
                  ))}
              </View>
            )}
          </Card>
        ))}

        <Card>
          <H2>Have a report from elsewhere?</H2>
          <Body muted>
            Photograph it and your clinic will add it to your record. They will check it before it
            appears above.
          </Body>
          <Button
            title="Photograph a report"
            onPress={onPhotograph}
            loading={upload.isPending}
            style={{ marginTop: space.md }}
          />

          {sent.map((u) => (
            <View key={u.id} style={styles.uploadRow}>
              <View style={{ flex: 1 }}>
                <Body>{u.fileName}</Body>
                <Caption>{new Date(u.createdAt).toLocaleDateString()}</Caption>
              </View>
              <Pill text={uploadState(u.status, u.reviewedAt).text} tone={uploadState(u.status, u.reviewedAt).tone} />
            </View>
          ))}
        </Card>

        <AsOf at={results.dataUpdatedAt || null} />
      </Screen>
    </>
  );
}

/** The server's flag vocabulary, mapped to the same colours the web uses. */
function toneFor(f: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  if (f === 'normal') return 'ok';
  if (f.startsWith('critical')) return 'bad';
  if (f === 'low' || f === 'high' || f === 'abnormal') return 'warn';
  return 'neutral';
}
function colourFor(f: string | null) {
  if (!f) return color.ink;
  return flag[f as keyof typeof flag] ?? color.ink;
}

/**
 * Raw upload states are for the clinic, not the patient — and a REJECTED upload carries a
 * reviewedAt, so "reviewed ? green Reviewed" told a patient their unusable photo had been filed.
 * Same sentences the web portal shows.
 */
function uploadState(status: string, reviewedAt?: string | null): { text: string; tone: 'ok' | 'bad' | 'neutral' } {
  if (status === 'rejected') return { text: 'Not added — check with the clinic', tone: 'bad' };
  if (status === 'failed') return { text: 'Could not be read — please re-upload', tone: 'bad' };
  if (reviewedAt) return { text: 'Added to your record', tone: 'ok' };
  if (status === 'review') return { text: 'With your clinic', tone: 'neutral' };
  return { text: 'Being processed', tone: 'neutral' };
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  value: { fontSize: 28, fontWeight: '700', marginTop: space.sm },
  unit: { fontSize: 15, fontWeight: '500', color: color.slate },
  history: { marginTop: space.md, borderTopWidth: 1, borderTopColor: color.hairline, paddingTop: space.sm },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
});
