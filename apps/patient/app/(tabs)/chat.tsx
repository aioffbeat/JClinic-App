import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi, type ChatMessage } from '@jclinic-mobile/api-client';
import { Body, Button, Caption, Card, H1, Loading, Notice, Screen, color, space } from '@jclinic-mobile/ui';

/**
 * In-app messaging.
 *
 * The clinic's only patient channel. WhatsApp and email were removed from the web app because they
 * opened the operator's own client — nothing came back into the thread and nobody could tell
 * whether a message had actually been sent (see common/message-channels.ts).
 */
export default function Chat() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  const thread = useQuery({
    queryKey: ['portal', 'messages'],
    queryFn: () => portalApi.messages(),
    // Polled, not pushed: a staff reply also fires a push notification. This only keeps an open
    // thread current while the patient is sitting on it.
    refetchInterval: 30_000,
  });

  const send = useMutation({
    mutationFn: (body: string) => portalApi.send(body),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['portal', 'messages'] });
    },
  });

  const messages = (thread.data ?? []) as ChatMessage[];

  return (
    <Screen refreshing={thread.isRefetching} onRefresh={() => thread.refetch()}>
      <H1>Chat</H1>
      {thread.isLoading && <Loading />}

      {!thread.isLoading && !messages.length && (
        <Notice
          title="No messages yet"
          body="Ask your clinic a question — they usually reply within a working day."
        />
      )}

      {(messages as any[]).map((m, i) => (
        <Card key={m.id ?? i} style={m.fromStaff ? undefined : styles.mine}>
          <Body>{m.body}</Body>
          <Caption>
            {`${m.fromStaff ? 'Clinic' : 'You'} · ${m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}`}
          </Caption>
        </Card>
      ))}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message"
          placeholderTextColor={color.slate}
          multiline
          maxLength={2000}
        />
        <Button title="Send" onPress={() => send.mutate(draft.trim())} loading={send.isPending} disabled={!draft.trim()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mine: { backgroundColor: '#E8F4F4' },
  composer: { marginTop: space.md },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: 10,
    padding: space.md,
    marginBottom: space.sm,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.surface,
    textAlignVertical: 'top',
  },
});
