import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { dmy, portalApi, type PortalVisit } from '@/src/api';
import { Body, Caption, Card, H1, H2, Label, Loading, Notice, Pill, Screen, color, space } from '@/src/ui';

/**
 * One visit, as the doctor recorded it.
 *
 * Served from the medical-history list already in cache rather than its own endpoint — the portal
 * returns every visit in full, so a detail fetch would re-download the lot to show one of them.
 *
 * PortalVisit is deeply nested and almost every branch is nullable: a consultation may have no
 * Ayurveda assessment, no diet plan, no vitals. Each section renders only when it has content, so
 * a short visit reads as a short record rather than a page of empty headings.
 */
export default function VisitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const history = useQuery({ queryKey: ['portal', 'medical-history'], queryFn: () => portalApi.medicalHistory() });

  const visit = (history.data ?? []).find((v) => v.id === id);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Visit', headerTintColor: color.petrolInk }} />
      <Screen>
        {history.isLoading && <Loading />}
        {!history.isLoading && !visit && (
          <Notice title="Visit not found" body="It may have been removed, or you may be offline." tone="bad" />
        )}
        {!!visit && <VisitBody visit={visit} />}
      </Screen>
    </>
  );
}

function VisitBody({ visit: v }: { visit: PortalVisit }) {
  return (
    <>
      <H1>{dmy(v.date)}</H1>
      {!!v.doctor && <Caption>{v.doctor}</Caption>}
      {!!v.clinic && <Caption>{v.clinic}</Caption>}

      <Section title="Why you came" show={!!v.complaints.length}>
        {v.complaints.map((c, i) => (
          <Row key={`${c.name}-${i}`} k={c.name} v={c.severity ?? ''} />
        ))}
      </Section>

      <Section title="How you were feeling" show={!!v.wellbeing}>
        <Row k="Energy" v={v.wellbeing?.energy ?? '—'} />
        <Row k="Sleep" v={v.wellbeing?.sleep ?? '—'} />
        <Row k="Overall" v={v.wellbeing?.generalCondition ?? '—'} />
      </Section>

      <Section title="Vitals" show={!!v.vitals.length}>
        {v.vitals.map((m) => (
          <Row key={m.code} k={m.label} v={`${m.value ?? '—'}${m.unit ? ` ${m.unit}` : ''}`} />
        ))}
      </Section>

      <Section title="Diagnosis" show={!!v.diagnoses.length}>
        <View style={styles.pills}>
          {v.diagnoses.map((d, i) => (
            <Pill key={`${d.description}-${i}`} text={d.description} tone={d.isPrimary ? 'info' : 'neutral'} />
          ))}
        </View>
      </Section>

      {/* The clinical note in full. It is the patient's own record and they are entitled to it. */}
      <Section title="The doctor's note" show={!!v.note}>
        <Prose label="What you described" text={v.note?.subjective} />
        <Prose label="What was observed" text={v.note?.objective} />
        <Prose label="Assessment" text={v.note?.assessment} />
        <Prose label="Plan" text={v.note?.plan} />
      </Section>

      {/*
        The Ayurveda assessment is the part of this record patients most want to see and the part a
        generic EMR app would drop. Percentages are shown as a simple readout rather than a chart —
        three numbers do not need one.
      */}
      <Section title="Ayurveda assessment" show={!!v.ayurveda}>
        <Row k="Prakriti" v={v.ayurveda?.prakriti ?? '—'} />
        {(v.ayurveda?.vataPct != null || v.ayurveda?.pittaPct != null || v.ayurveda?.kaphaPct != null) && (
          <Row
            k="Vata / Pitta / Kapha"
            v={`${pct(v.ayurveda?.vataPct)} · ${pct(v.ayurveda?.pittaPct)} · ${pct(v.ayurveda?.kaphaPct)}`}
          />
        )}
        <Row k="Agni" v={v.ayurveda?.agni ?? '—'} />
        <Row k="Koshtha" v={v.ayurveda?.koshtha ?? '—'} />
        <Row k="Bala" v={v.ayurveda?.bala ?? '—'} />
        <Row k="Satva" v={v.ayurveda?.satva ?? '—'} />
        {v.ayurveda?.ama != null && <Row k="Ama" v={v.ayurveda.ama ? 'Present' : 'Absent'} />}
        {!!v.ayurveda?.srotas.length && <Row k="Srotas" v={v.ayurveda.srotas.join(', ')} />}
        {!!v.ayurveda?.summary && <Body muted>{v.ayurveda.summary}</Body>}
      </Section>

      <Section title="Treatment plan" show={!!v.treatmentPlan}>
        {v.treatmentPlan?.medicationDays != null && (
          <Row k="Medication for" v={`${v.treatmentPlan.medicationDays} days`} />
        )}
        <ListRow label="Exercise" items={v.treatmentPlan?.exercise} />
        <ListRow label="Yoga" items={v.treatmentPlan?.yoga} />
        <ListRow label="Panchakarma" items={v.treatmentPlan?.panchkarma} />
      </Section>

      <Section title="Diet & routine" show={!!v.dietPlan}>
        <ListRow label="Pathya (helpful)" items={v.dietPlan?.pathya} />
        <ListRow label="Apathya (avoid)" items={v.dietPlan?.apathya} />
        <ListRow label="Daily routine" items={v.dietPlan?.dinacharya} />
        <ListRow label="Yoga asanas" items={v.dietPlan?.yogaAsanas} />
        <ListRow label="Pranayama" items={v.dietPlan?.pranayama} />
        {!!v.dietPlan?.lifestyleNotes && <Body muted>{v.dietPlan.lifestyleNotes}</Body>}
      </Section>

      <Section title="Tests advised" show={!!v.testsAdvised.length}>
        {v.testsAdvised.map((t, i) => (
          <Row key={`${t.label}-${i}`} k={t.label} v={t.done ? 'Done' : 'Pending'} />
        ))}
      </Section>
    </>
  );
}

/* --------------------------------------------------------------------------------------------- */

function Section({ title, show, children }: { title: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <Card>
      <H2>{title}</H2>
      <View style={{ marginTop: space.sm }}>{children}</View>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  if (!v || v === '—') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal}>{v}</Text>
    </View>
  );
}

function Prose({ label, text }: { label: string; text?: string | null }) {
  if (!text) return null;
  return (
    <View style={{ marginBottom: space.md }}>
      <Label>{label}</Label>
      <Body>{text}</Body>
    </View>
  );
}

/**
 * The plan arrays are stored as free-form JSON by the clinical templates, so an entry may be a
 * plain string or an object with a name. Both are rendered; anything else is skipped rather than
 * stringified into "[object Object]".
 */
function ListRow({ label, items }: { label: string; items?: unknown[] | null }) {
  const text = (items ?? [])
    .map((it) => {
      if (typeof it === 'string') return it;
      if (it && typeof it === 'object') {
        const rec = it as Record<string, unknown>;
        const name = rec.name ?? rec.label ?? rec.title;
        return typeof name === 'string' ? name : null;
      }
      return null;
    })
    .filter((s): s is string => !!s);
  if (!text.length) return null;
  return <Row k={label} v={text.join(', ')} />;
}

const pct = (n?: number | null) => (n == null ? '—' : `${n}%`);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, marginBottom: space.sm },
  rowKey: { flex: 1, fontSize: 14, color: color.slate },
  rowVal: { flex: 1.4, fontSize: 14, color: color.ink, fontWeight: '500' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
