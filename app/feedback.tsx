import { useState } from 'react';
import { Stack } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '@/src/api';
import { Body, Button, Caption, Card, H1, H2, Label, Loading, Notice, Pill, Screen, color, space } from '@/src/ui';

/**
 * Feedback.
 *
 * Two paths, deliberately distinct. A REQUESTED feedback answers something the clinic asked after a
 * visit and stays private to them. A SHARED experience is volunteered and can be published to the
 * public website — which is a different act, so it asks for consent separately and can be withdrawn
 * afterwards.
 */
export default function Feedback() {
  const qc = useQueryClient();
  const pending = useQuery({ queryKey: ['portal', 'feedback', 'pending'], queryFn: () => portalApi.feedbackPending() });
  const history = useQuery({ queryKey: ['portal', 'feedback', 'history'], queryFn: () => portalApi.feedbackHistory() });

  const [ratings, setRatings] = useState<{ overall: number; reception: number; doctor: number }>({
    overall: 0,
    reception: 0,
    doctor: 0,
  });
  const [comment, setComment] = useState('');
  const [publish, setPublish] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['portal', 'feedback', 'pending'] });
    qc.invalidateQueries({ queryKey: ['portal', 'feedback', 'history'] });
  };
  const reset = () => {
    setRatings({ overall: 0, reception: 0, doctor: 0 });
    setComment('');
    setPublish(false);
  };

  const answer = useMutation({
    mutationFn: (id: string) =>
      portalApi.submitFeedback(id, {
        overallRating: ratings.overall || undefined,
        receptionRating: ratings.reception || undefined,
        doctorRating: ratings.doctor || undefined,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => { reset(); invalidate(); },
  });

  const share = useMutation({
    mutationFn: () =>
      portalApi.shareExperience({
        overallRating: ratings.overall,
        receptionRating: ratings.reception || undefined,
        doctorRating: ratings.doctor || undefined,
        comment: comment.trim() || undefined,
        publishConsent: publish,
      }),
    onSuccess: () => { reset(); invalidate(); },
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => portalApi.withdrawFeedback(id),
    onSuccess: invalidate,
  });

  const requested = pending.data ?? [];
  const rows = history.data ?? [];
  const target = requested[0];

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Feedback', headerTintColor: color.petrolInk }} />
      <Screen refreshing={pending.isRefetching} onRefresh={() => { pending.refetch(); history.refetch(); }}>
        <H1>Feedback</H1>
        {(pending.isLoading || history.isLoading) && <Loading />}

        <Card>
          <H2>{target ? 'Your clinic asked how it went' : 'Share your experience'}</H2>
          <Body muted>
            {target
              ? 'This stays between you and your clinic.'
              : 'Tell your clinic how you found your care.'}
          </Body>

          <Stars label="Overall" value={ratings.overall} onChange={(v) => setRatings((r) => ({ ...r, overall: v }))} />
          <Stars label="Front desk" value={ratings.reception} onChange={(v) => setRatings((r) => ({ ...r, reception: v }))} />
          <Stars label="Doctor" value={ratings.doctor} onChange={(v) => setRatings((r) => ({ ...r, doctor: v }))} />

          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder="Anything you would like to add (optional)"
            placeholderTextColor={color.slate}
            multiline
            maxLength={1000}
          />

          {/* Publishing puts a patient's words and name on a public marketing page. It is a separate
              decision from giving feedback, so it is asked separately and never pre-ticked. */}
          {!target && (
            <Pressable onPress={() => setPublish((p) => !p)} style={styles.consent} accessibilityRole="checkbox" accessibilityState={{ checked: publish }}>
              <View style={[styles.box, publish && styles.boxOn]}>{publish && <Text style={styles.tick}>✓</Text>}</View>
              <Text style={styles.consentText}>
                My clinic may publish this on their website. I can withdraw it later.
              </Text>
            </Pressable>
          )}

          <Button
            title={target ? 'Send feedback' : 'Share experience'}
            onPress={() => (target ? answer.mutate(target.id) : share.mutate())}
            loading={answer.isPending || share.isPending}
            disabled={!ratings.overall}
            style={{ marginTop: space.md }}
          />
        </Card>

        {!!rows.length && (
          <Card>
            <H2>What you have sent</H2>
            {rows.map((f) => (
              <View key={f.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Label>{f.at ? new Date(f.at).toLocaleDateString() : 'Feedback'}</Label>
                  {!!f.overallRating && <Caption>{'★'.repeat(f.overallRating)}</Caption>}
                  {!!f.comment && <Body muted>{f.comment}</Body>}
                  <Pill text={publicationLabel(f.publication)} tone={f.publication === 'live' ? 'ok' : 'neutral'} />
                </View>
                {f.canWithdraw && (
                  <Button
                    title="Withdraw"
                    variant="secondary"
                    onPress={() =>
                      Alert.alert('Withdraw this?', 'It will be removed from the public website.', [
                        { text: 'Keep', style: 'cancel' },
                        { text: 'Withdraw', style: 'destructive', onPress: () => withdraw.mutate(f.id) },
                      ])
                    }
                  />
                )}
              </View>
            ))}
          </Card>
        )}

        {(answer.isError || share.isError) && (
          <Notice title="Could not send" body="Please try again once you have a connection." tone="bad" />
        )}
      </Screen>
    </>
  );
}

function publicationLabel(p: 'live' | 'in_review' | 'withdrawn' | 'private') {
  return p === 'live' ? 'Published' : p === 'in_review' ? 'Awaiting review' : p === 'withdrawn' ? 'Withdrawn' : 'Private';
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ marginTop: space.md }}>
      <Label>{label}</Label>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            style={styles.star}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === n }}
            accessibilityLabel={`${n} out of 5 for ${label}`}
          >
            <Text style={[styles.starText, n <= value && styles.starOn]}>★</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', marginTop: space.xs },
  // 44pt each: five targets in a row is exactly where taps go astray if they are any smaller.
  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  starText: { fontSize: 28, color: color.hairline },
  starOn: { color: color.marigold },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: 10,
    padding: space.md,
    marginTop: space.md,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.surface,
    textAlignVertical: 'top',
  },
  consent: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md, minHeight: 44 },
  box: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 1,
    borderColor: color.hairline, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface,
  },
  boxOn: { backgroundColor: color.teal, borderColor: color.teal },
  tick: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  consentText: { flex: 1, fontSize: 13, color: color.slate },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
});
