import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiError } from '@jclinic-mobile/api-client';
import { Body, Button, Caption, Card, H1, Notice, color, space } from '@jclinic-mobile/ui';
import { useStaffSession } from '../src/session-context';

/** Staff sign-in: email + password, the same credentials as the web app. */
export default function Login() {
  const router = useRouter();
  const { signIn } = useStaffSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function explain(e: unknown): string {
    if (e instanceof ApiError) {
      // The login route is rate-limited per email address; its 429 body carries a real wait time,
      // and replacing that with a generic failure leaves someone retrying against a wall.
      if (e.status === 429) return e.body?.message ?? 'Too many attempts. Please wait and try again.';
      if (e.status === 401) return 'That email or password is not right.';
      return e.message;
    }
    return 'Something went wrong. Please check your connection and try again.';
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
      <View style={styles.inner}>
        <H1>JClinic Staff</H1>
        <Body muted>Sign in with your clinic account.</Body>

        <Card style={{ marginTop: space.xl }}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={color.slate}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="username"
            editable={!busy}
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={color.slate}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            editable={!busy}
          />
          <Button title="Sign in" onPress={onSubmit} loading={busy} disabled={!email.trim() || !password} />
        </Card>

        {!!error && <Notice title="Could not sign in" body={error} tone="bad" />}

        <Caption>This device stays signed in. Sign out from Settings if you share it.</Caption>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.mist },
  inner: { flex: 1, justifyContent: 'center', padding: space.xl },
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
