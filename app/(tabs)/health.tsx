import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { dmy, portalApi, type PortalVisit } from '@/src/api';
import {
  AsOf, Card, Empty, H1, Icon, Loading, Notice, Pill, Row, Screen, SectionTitle,
  color, space, type IconName,
} from '@/src/ui';

/**
 * Health — the patient's own clinical record.
 *
 * A list of visits; the detail lives on its own route because PortalVisit is deeply nested (vitals,
 * diagnoses, the SOAP note, the Ayurveda assessment, treatment and diet plans, tests advised, files)
 * and none of that belongs in a list row.
 *
 * Fields are the real ones: `date`, `diagnoses[]`, and `note` — which is an OBJECT of
 * subjective/objective/assessment/plan, not a string.
 */
const SHORTCUTS: { label: string; icon: IconName; route: string; tone: string }[] = [
  { label: 'Lab results', icon: 'droplet', route: '/labs', tone: color.royalBlue },
  { label: 'Prescriptions', icon: 'file', route: '/prescriptions', tone: color.leafGreen },
  { label: 'Tests due', icon: 'flask', route: '/due-tests', tone: color.marigold },
  { label: 'My plan', icon: 'clipboard', route: '/plan', tone: color.plumViolet },
  { label: 'Daily log', icon: 'heart', route: '/lifestyle', tone: color.coral },
];

export default function Health() {
  const router = useRouter();
  const history = useQuery({ queryKey: ['portal', 'medical-history'], queryFn: () => portalApi.medicalHistory() });
  const visits = history.data ?? [];

  return (
    <Screen refreshing={history.isRefetching} onRefresh={() => history.refetch()}>
      <H1>Health</H1>

      {/* Horizontal chips rather than a wrapped block: five destinations in a row keeps the visit
          list — the thing patients actually came for — above the fold. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.md }}>
        <View style={styles.chips}>
          {SHORTCUTS.map((sc) => (
            <Pressable
              key={sc.route}
              onPress={() => router.push(sc.route as never)}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Icon name={sc.icon} size={17} tint={sc.tone} strokeWidth={2} />
              <Text style={styles.chipText}>{sc.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <SectionTitle>Your visits</SectionTitle>
      {history.isLoading && <Loading />}

      {history.isError && !visits.length && (
        <Notice
          title="Cannot load your history"
          body="You may be offline. It will appear once you reconnect."
          tone="bad"
        />
      )}

      {!history.isLoading && !visits.length && !history.isError && (
        <Empty
          icon="clipboard"
          title="No visits yet"
          body="Your consultations will appear here once you have seen a doctor."
        />
      )}

      {visits.map((v) => (
        <Card key={v.id}>
          <View style={styles.head}>
            <Text style={styles.date}>{dmy(v.date)}</Text>
            {!!v.doctor && <Text style={styles.doctor}>{v.doctor}</Text>}
          </View>

          {!!v.diagnoses.length && (
            <View style={styles.pills}>
              {v.diagnoses.map((d, i) => (
                <Pill key={`${d.description}-${i}`} text={d.description} tone={d.isPrimary ? 'info' : 'neutral'} />
              ))}
            </View>
          )}

          <View style={{ marginTop: space.sm }}>
            {!!v.complaints.length && (
              <Row icon="heart" title="Why you came" subtitle={v.complaints.map((c) => c.name).join(', ')} first />
            )}
            {!!summarise(v) && <Row icon="clipboard" title="The plan" subtitle={summarise(v)!} first={!v.complaints.length} />}
            <Row
              icon="file"
              title="Full record"
              subtitle="Vitals, diagnosis, notes, diet and treatment plan"
              onPress={() => router.push(`/visit/${v.id}` as never)}
            />
          </View>
        </Card>
      ))}

      <AsOf at={history.dataUpdatedAt || null} />
    </Screen>
  );
}

/**
 * A one-line preview.
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

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: 999,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  chipText: { fontSize: 13.5, fontWeight: '600', color: color.ink },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  date: { fontSize: 16, fontWeight: '700', color: color.petrolInk },
  doctor: { fontSize: 13, color: color.slate },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
});
