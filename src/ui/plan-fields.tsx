import { Fragment } from 'react';
import { View } from 'react-native';
import { Body, Caption, Label } from './components';
import { space } from './theme';

/**
 * Rendering clinical plan fields without trusting their shape.
 *
 * The EMR stores these as Prisma `Json?` columns written by free-form clinical templates, so the
 * same field is a string array on one visit and an object on the next: `apathya` is
 * { history, future }, `dinacharyaPlan` is { existing, changes }, and the treatment plan's
 * exercise / yoga / panchkarma are arrays OF OBJECTS. Two screens crashed on exactly this —
 * `.map` on an object, and an object handed to <Text> — so the defence lives in one place rather
 * than being re-derived per screen.
 *
 * The rule throughout: show whatever strings can be found, never "[object Object]", and never
 * throw. A patient losing a line of advice is bad; a patient losing the whole screen is worse.
 */

/** Any value at all, reduced to a readable line. Objects contribute their string values. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    // The shapes the templates actually use, in the order a patient would read them.
    const named = rec.name ?? rec.label ?? rec.title;
    if (typeof named === 'string' && named.trim()) {
      const detail = [rec.minutesPerDay && `${rec.minutesPerDay} min/day`, rec.daysPerWeek && `${rec.daysPerWeek} days/week`,
        rec.sittings && `${rec.sittings} sittings`].filter(Boolean).join(' · ');
      return detail ? `${named.trim()} (${detail})` : named.trim();
    }
    return Object.values(rec).map(textOf).filter(Boolean).join(' · ');
  }
  return '';
}

/**
 * A labelled plan field of unknown shape. Renders nothing when there is nothing to say, so a
 * screen can list every possible field without producing a page of empty headings.
 *
 * `{ history, future }` and `{ existing, changes }` are split into two lines, because those pairs
 * mean "what you have been doing" and "what to change" — collapsing them loses the distinction.
 */
export function PlanField({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;

  if (!Array.isArray(value) && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const before = textOf(rec.history ?? rec.existing);
    const after = textOf(rec.future ?? rec.changes ?? rec.text);
    if (before || after) {
      return (
        <View style={{ marginBottom: space.sm }}>
          <Label>{label}</Label>
          {!!before && <Body muted>{`So far: ${before}`}</Body>}
          {!!after && <Body muted>{`From now: ${after}`}</Body>}
        </View>
      );
    }
  }

  const text = textOf(value);
  if (!text) return null;
  return (
    <View style={{ marginBottom: space.sm }}>
      <Label>{label}</Label>
      <Body muted>{text}</Body>
    </View>
  );
}

/** Several plan fields in a row, skipping the empty ones. */
export function PlanFields({ fields }: { fields: { label: string; value: unknown }[] }) {
  return (
    <>
      {fields.map((f) => (
        <Fragment key={f.label}>
          <PlanField label={f.label} value={f.value} />
        </Fragment>
      ))}
    </>
  );
}

/** A caption shown when a card would otherwise be an empty heading. */
export function NothingYet({ text }: { text: string }) {
  return <Caption>{text}</Caption>;
}
