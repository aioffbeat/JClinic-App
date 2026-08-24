import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { dmy, portalApi, type PortalVisit } from '@/src/api';
import { AsOf, Body, Caption, Card, H1, Label, Loading, Notice, Pill, Screen, color, space } from '@/src/ui';

/**
 * Health — the patient's own clinical record.
 *
 * A list of visits; the detail lives on its own route because PortalVisit is deeply nested (vitals,
 * diagnoses, the SOAP note, the Ayurveda assessment, treatment and diet plans, tests advised, files)
 * and none of that belongs in a list row.
 *
 * The fields here are the real ones: `date`, `diagnoses[]`, and `note` — which is an OBJECT of
 * subjective/objective/assessment/plan, not a string. This screen previously read `visitAt`,
 * `diagnosis` and rendered `note` directly, which would have printed "[object Object]".
 */
export default function Health() {
  const router = useRouter();
  const history = useQuery({ queryKey: ['portal', 'medical-history'], queryFn: () => portalApi.medicalHistory() });
  const visits = history.data ?? [];

  return (
    <Screen refreshing={history.isRefetching} onRefresh={() => history.refetch()}>
      <H1>Health</H1>

      {/* The record is more than visits. These are separate routes rather than sections because
          each is a list of its own, and burying labs under a scroll of consultations is how
          patients end up phoning the clinic to ask for a result they already have. */}
      <View style={styles.shortcuts}>
        <Shortcut label="Lab results" onPress={() => router.push('/labs')} />
        <Shortcut label="Prescriptions" onPress={() => router.push('/prescriptions')} />
        <Shortcut label="Tests due" onPress={() => router.push('/due-tests')} />
        <Shortcut label="My plan" onPress={() => router.push('/plan')} />
        <Shortcut label="Daily log" onPress={() => router.push('/lifestyle')} />
      </View>

      <Text style={styles.section}>Visits</Text>
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

      {visits.map((v) => (
        <Pressable key={v.id} onPress={() => router.push(`/visit/${v.id}`)}>
          {({ pressed }) => (
            <Card style={pressed ? { opacity: 0.7 } : undefined}>
              <View style={styles.head}>
                <Label>{dmy(v.date)}</Label>
                {!!v.doctor && <Caption>{v.doctor}</Caption>}
              </View>

              {!!v.clinic && <Caption>{v.clinic}</Caption>}

              {!!v.complaints.length && (
                <Body>{v.complaints.map((c) => c.name).join(', ')}</Body>
              )}

              {!!v.diagnoses.length && (
                <View style={styles.pills}>
                  {v.diagnoses.map((d, i) => (
                    <Pill key={`${d.description}-${i}`} text={d.description} tone={d.isPrimary ? 'info' : 'neutral'} />
                  ))}
                </View>
              )}

              {!!summarise(v) && <Caption>{summarise(v)}</Caption>}

              <Text style={styles.more}>View full record ›</Text>
            </Card>
          )}
        </Pressable>
      ))}

      <AsOf at={history.dataUpdatedAt || null} />
    </Screen>
  );
}

/**
 * A one-line preview for the list row.
 *
 * The plan the doctor wrote is the most useful single line — what happens next. Falls back to the
 * assessment. Deliberately never the subjective note, which is the patient's own words read back
 * at them.
 */
function summarise(v: PortalVisit): string | null {
  const text = v.note?.plan ?? v.note?.assessment ?? null;
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 119)}…` : flat;
}

function Shortcut({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <Text style={styles.shortcutText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  shortcut: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: color.teal,
    backgroundColor: color.surface,
  },
  shortcutText: { fontSize: 14, fontWeight: '600', color: color.teal },
  section: { fontSize: 13, fontWeight: '700', color: color.slate, marginBottom: space.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  more: { fontSize: 13, fontWeight: '600', color: color.teal, marginTop: space.md },
});
