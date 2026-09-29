import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '@/src/api';
import { Button, Empty, H1, Loading, Notice, Screen, color, space } from '@/src/ui';

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

  /**
   * Poll only while this tab is actually on screen.
   *
   * React Navigation keeps a visited tab mounted, and React Query on React Native has no window to
   * lose focus, so this poll went on running from behind Home — and GET /portal/messages marks
   * every unread staff message read as a side effect of being fetched. A reply was therefore read
   * within 30 seconds of arriving, without the patient seeing it, and the unread count on Home was
   * permanently 0. Fixing it here rather than on the server keeps "opening the thread marks it
   * read", which is the behaviour the web relies on.
   */
  const [onScreen, setOnScreen] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setOnScreen(true);
      return () => setOnScreen(false);
    }, []),
  );

  const thread = useQuery({
    queryKey: ['portal', 'messages'],
    queryFn: () => portalApi.messages(),
    // A staff reply also fires a push; this only keeps an open thread current while it is being read.
    refetchInterval: onScreen ? 30_000 : false,
    enabled: onScreen,
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
        <Empty
          icon="chat"
          title="No messages yet"
          body="Ask your clinic a question — they usually reply within a working day."
        />
      )}

      {/* Bubbles, not cards. A conversation read as a column of identical white rectangles gave no
          sense of who said what; sides and colour do that work without a label on every line. */}
      {messages.map((m) => {
        const fromStaff = m.sender === 'staff';
        return (
          <View key={m.id} style={[styles.bubbleRow, fromStaff ? styles.rowStaff : styles.rowMine]}>
            <View style={[styles.bubble, fromStaff ? styles.bubbleStaff : styles.bubbleMine]}>
              <Text style={[styles.bubbleText, !fromStaff && { color: '#FFFFFF' }]}>{m.body}</Text>
              <Text style={[styles.bubbleMeta, !fromStaff && { color: 'rgba(255,255,255,0.75)' }]}>
                {`${fromStaff ? m.senderName ?? 'Clinic' : 'You'} · ${time(m.createdAt)}`}
              </Text>
            </View>
          </View>
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

function time(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row', marginBottom: space.sm },
  rowStaff: { justifyContent: 'flex-start' },
  rowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '84%', paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: 18 },
  bubbleStaff: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
    borderBottomLeftRadius: 6,
  },
  bubbleMine: { backgroundColor: color.teal, borderBottomRightRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: color.ink },
  bubbleMeta: { fontSize: 11, color: color.slate, marginTop: 5 },
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
