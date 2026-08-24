import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { portalApi } from '@/src/api';
import { Body, Button, Caption, Card, H1, Label, Loading, Notice, Screen, color, space } from '@/src/ui';

/**
 * The ePRO symptom check-in.
 *
 * The question set is chosen by the SERVER from the patient's diagnosed conditions — DSI for CKD,
 * ESAS-r for oncology, WHO-PEN for lifestyle — along with the red-flag threshold for each answer.
 * Nothing is scored here. The response carries a `flag`, and an urgent one raises an alert to the
 * clinical team server-side.
 *
 * That last point drives the wording: this screen must say plainly that the clinic has been told,
 * and must never look like the app is triaging. It is a questionnaire, not a diagnosis.
 */
export default function CheckIn() {
  const router = useRouter();
  const form = useQuery({ queryKey: ['portal', 'symptom-form'], queryFn: () => portalApi.symptomForm() });

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');

  const submit = useMutation({
    mutationFn: () => {
      const questions = form.data?.questions ?? [];
      return portalApi.submitSymptom({
        context: form.data?.context ?? 'general',
        answers: questions
          .filter((q) => answers[q.code] != null)
          .map((q) => ({ code: q.code, label: q.label, value: answers[q.code] })),
        note: note.trim() || undefined,
      });
    },
  });

  const questions = form.data?.questions ?? [];
  const answered = questions.filter((q) => answers[q.code] != null).length;
  const complete = questions.length > 0 && answered === questions.length;

  if (submit.isSuccess) {
    const urgent = submit.data.flag === 'urgent';
    const attention = submit.data.flag === 'attention';
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: 'Check-in', headerTintColor: color.petrolInk }} />
        <Screen>
          <H1>Thank you</H1>
          <Notice
            title={urgent ? 'Your clinic has been alerted' : attention ? 'Your clinic will review this' : 'Recorded'}
            body={
              urgent
                ? 'Someone from the clinical team will contact you. If you feel unwell or this is an emergency, call your clinic or go to hospital now — do not wait for us.'
                : attention
                  ? 'Your answers have been sent to your care team, who will look at them.'
                  : 'Your answers are saved and your doctor will see them at your next visit.'
            }
            tone={urgent ? 'bad' : 'neutral'}
          />
          <Button title="Done" onPress={() => router.back()} style={{ marginTop: space.md }} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Check-in', headerTintColor: color.petrolInk }} />
      <Screen>
        <H1>How are you feeling?</H1>
        <Caption>Your answers go to your care team. This is not a diagnosis.</Caption>

        {form.isLoading && <Loading />}
        {form.isError && (
          <Notice title="Cannot load the check-in" body="You may be offline. Try again once you reconnect." tone="bad" />
        )}

        {questions.map((q) => (
          <Card key={q.code}>
            <Label>{q.label}</Label>
            <View style={styles.options}>
              {optionsFor(q.type, q.options).map((opt, value) => {
                const selected = answers[q.code] === value;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setAnswers((prev) => ({ ...prev, [q.code]: value }))}
                    style={({ pressed }) => [
                      styles.option,
                      selected && styles.optionOn,
                      pressed && !selected && { opacity: 0.7 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextOn]}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>
            {!!q.std && <Caption>{q.std}</Caption>}
          </Card>
        ))}

        {!!questions.length && (
          <Card>
            <Label>Anything else?</Label>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="Optional — anything you want your doctor to know"
              placeholderTextColor={color.slate}
              multiline
              maxLength={1000}
            />
          </Card>
        )}

        {!!questions.length && (
          <>
            <Body muted>{`${answered} of ${questions.length} answered`}</Body>
            <Button
              title="Send to my clinic"
              onPress={() => submit.mutate()}
              loading={submit.isPending}
              disabled={!complete}
              style={{ marginTop: space.sm }}
            />
          </>
        )}

        {submit.isError && (
          <Notice title="Could not send" body="Please try again once you have a connection." tone="bad" />
        )}
      </Screen>
    </>
  );
}

/** Answer values are option INDEXES for a scale, and 0/1 for yes-no — the server grades on those. */
function optionsFor(type: 'scale' | 'yesno', options?: string[]) {
  if (type === 'yesno') return ['No', 'Yes'];
  return options ?? ['None', 'Mild', 'Moderate', 'Severe'];
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.surface,
  },
  optionOn: { backgroundColor: color.teal, borderColor: color.teal },
  optionText: { fontSize: 15, fontWeight: '600', color: color.ink },
  optionTextOn: { color: '#FFFFFF' },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: 10,
    padding: space.md,
    marginTop: space.sm,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.surface,
    textAlignVertical: 'top',
  },
});
