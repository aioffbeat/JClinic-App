import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { patientsApi } from '@jclinic-mobile/api-client';
import { Body, Caption, Card, H1, Label, Loading, Notice, Screen, color, space } from '@jclinic-mobile/ui';
import { useStaffSession } from '../../src/session-context';

/**
 * Patient lookup.
 *
 * Search-first, with no browsable directory. The web page opens on a paginated list because a
 * desk has room for one; on a phone the only realistic entry point is "I have a name or a number
 * in front of me", and loading thousands of rows to scroll past would be slower and no more useful.
 */
export default function Patients() {
  const { clinicId, can } = useStaffSession();
  const [q, setQ] = useState('');
  const term = q.trim();

  const results = useQuery({
    queryKey: ['patients', 'search', term, clinicId],
    queryFn: () => patientsApi.search(term, 25),
    // Two characters is the floor: one letter matches most of the database and is never what
    // someone meant to search for.
    enabled: !!clinicId && can.patients && term.length >= 2,
  });

  const rows = results.data ?? [];

  return (
    <Screen refreshing={results.isRefetching} onRefresh={() => results.refetch()}>
      <H1>Patients</H1>

      <TextInput
        style={styles.input}
        value={q}
        onChangeText={setQ}
        placeholder="Name, phone or MRN"
        placeholderTextColor={color.slate}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />

      {results.isLoading && term.length >= 2 && <Loading />}

      {term.length < 2 && <Caption>Type at least two characters to search.</Caption>}

      {term.length >= 2 && !results.isLoading && !rows.length && (
        <Notice title="No matches" body={`Nothing found for “${term}”.`} />
      )}

      {rows.map((p: any) => (
        <Card key={p.id}>
          <Label>{p.fullName}</Label>
          {!!p.mrn && <Body muted>{p.mrn}</Body>}
          {!!p.phone && <Caption>{p.phone}</Caption>}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: 10,
    paddingHorizontal: space.md,
    marginBottom: space.md,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.surface,
  },
});
