import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '@/src/api';
import { Body, Button, Caption, Card, H1, Loading, Notice, Screen, color, space } from '@/src/ui';

/**
 * In-app messaging.
 *
 * The clinic's only patient channel. WhatsApp and email were removed from the web app because they
 * opened the operator's own client — nothing came back into the thread, and nobody could tell
 * whether a message had actually been sent (see common/message-channels.ts).
 *
 * A message's author is `sender: 'patient' | 'staff'`. This screen previously read a `fromStaff`
 * boolean that does not exist, so every message rendered as though the patient had written it.
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

  // A closed conversation stays readable but accepts nothing further — server-enforced both ways,
  // so the composer has to go rather than fail on send.
  const conversation = useQuery({
    queryKey: ['portal', 'conversation'],
    queryFn: () => portalApi.conversation(),
  });

  const send = useMutation({
    mutationFn: (body: string) => portalApi.send(body),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['portal', 'messages'] });
    },
  });

  const messages = thread.data ?? [];
  const closed = !!conversation.data?.closedAt;

  return (
    <Screen refreshing={thread.isRefetching} onRefresh={() => thread.refetch()}>
      <H1>Chat</H1>
      {thread.isLoading && <Loading />}

      {thread.isError && !messages.length && (
        <Notice title="Cannot load messages" body="You may be offline. Try again once you reconnect." tone="bad" />
      )}

      {!thread.isLoading && !messages.length && !thread.isError && (
        <Notice title="No messages yet" body="Ask your clinic a question — they usually reply within a working day." />
      )}

      {messages.map((m) => {
        const fromStaff = m.sender === 'staff';
        return (
          <Card key={m.id} style={fromStaff ? undefined : styles.mine}>
            <Body>{m.body}</Body>
            <Caption>
              {`${fromStaff ? m.senderName ?? 'Clinic' : 'You'} · ${new Date(m.createdAt).toLocaleString()}`}
            </Caption>
          </Card>
        );
      })}

      {closed ? (
        <Notice
          title="This conversation is closed"
          body={
            conversation.data?.reason
              ? `${conversation.data.reason} — start a new one by calling the clinic.`
              : 'Please call the clinic if you need anything further.'
          }
        />
      ) : (
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
          <Button
            title="Send"
            onPress={() => send.mutate(draft.trim())}
            loading={send.isPending}
            disabled={!draft.trim()}
          />
        </View>
      )}
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
