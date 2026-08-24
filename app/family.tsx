import { Stack } from 'expo-router';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalApi } from '@/src/api';
import { Body, Button, Caption, Card, H1, H2, Label, Loading, Notice, Pill, Screen, color, space } from '@/src/ui';
import { usePatientSession } from '@/src/session-context';

/**
 * Family and caregiver access.
 *
 * Two different things share this screen because they are the same idea from opposite ends:
 *   - the charts THIS phone can already open (self plus any grants made to it), and
 *   - the people this patient has given access to.
 *
 * One number legitimately covers several charts — an elderly parent whose child manages their care
 * is the common case, and the server treats the verified phone, not the chart, as the identity.
 */
export default function Family() {
  const qc = useQueryClient();
  const { patient, accessible, switchPatient } = usePatientSession();

  const granted = useQuery({ queryKey: ['portal', 'access', 'granted'], queryFn: () => portalApi.grantedList() });

  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [signature, setSignature] = useState('');

  const grant = useMutation({
    mutationFn: () =>
      portalApi.grantAccess({ caregiverPhone: phone.trim(), relationship: relationship.trim() || undefined, signature: signature.trim() }),
    onSuccess: () => {
      setPhone('');
      setRelationship('');
      setSignature('');
      qc.invalidateQueries({ queryKey: ['portal', 'access', 'granted'] });
    },
    onError: () => Alert.alert('Could not grant access', 'Please check the number and try again.'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => portalApi.revokeAccess(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'access', 'granted'] }),
  });

  const rows = granted.data ?? [];

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Family', headerTintColor: color.petrolInk }} />
      <Screen refreshing={granted.isRefetching} onRefresh={() => granted.refetch()}>
        <H1>Family</H1>

        <Card>
          <H2>Whose records to show</H2>
          {accessible.map((a) => (
            <Button
              key={a.patientId}
              title={`${a.name}${a.patientId === patient?.id ? '  (viewing)' : ''}`}
              variant="secondary"
              disabled={a.patientId === patient?.id}
              onPress={() => switchPatient(a.patientId)}
              style={{ marginTop: space.sm }}
            />
          ))}
          {accessible.length < 2 && <Caption>Only your own records are linked to this number.</Caption>}
        </Card>

        <Card>
          <H2>People you have given access to</H2>
          {granted.isLoading && <Loading />}
          {!granted.isLoading && !rows.length && (
            <Body muted>Nobody else can see your records.</Body>
          )}
          {rows.map((g) => (
            <View key={g.id} style={styles.grantRow}>
              <View style={{ flex: 1 }}>
                <Label>{g.caregiverPhone}</Label>
                {!!g.relationship && <Pill text={g.relationship} />}
                <Caption>{`Since ${new Date(g.grantedAt).toLocaleDateString()}`}</Caption>
              </View>
              <Button
                title="Revoke"
                variant="danger"
                onPress={() =>
                  Alert.alert('Revoke access?', `${g.caregiverPhone} will no longer be able to see your records.`, [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Revoke', style: 'destructive', onPress: () => revoke.mutate(g.id) },
                  ])
                }
              />
            </View>
          ))}
        </Card>

        <Card>
          <H2>Give someone access</H2>
          <Body muted>
            They sign in with their own mobile number and can see your records and act for you until
            you revoke it.
          </Body>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Their mobile number"
            placeholderTextColor={color.slate}
            keyboardType="phone-pad"
            maxLength={15}
          />
          <TextInput
            style={styles.input}
            value={relationship}
            onChangeText={setRelationship}
            placeholder="Relationship (optional) — e.g. daughter"
            placeholderTextColor={color.slate}
          />
          {/* The typed name IS the consent signature — the server records it as one. */}
          <TextInput
            style={styles.input}
            value={signature}
            onChangeText={setSignature}
            placeholder="Type your full name to consent"
            placeholderTextColor={color.slate}
          />
          <Button
            title="Grant access"
            onPress={() => grant.mutate()}
            loading={grant.isPending}
            disabled={phone.trim().length < 10 || signature.trim().length < 2}
          />
        </Card>

        {granted.isError && (
          <Notice title="Cannot load access list" body="You may be offline." tone="bad" />
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  grantRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: 10,
    paddingHorizontal: space.md,
    marginTop: space.sm,
    marginBottom: space.sm,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.surface,
  },
});
