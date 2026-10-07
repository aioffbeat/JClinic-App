import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiError } from '@/src/api';
import { Body, BrandLockup, Button, Caption, Card, Notice, color, space } from '@/src/ui';
import { usePatientSession } from '../src/session-context';

/**
 * Phone + OTP sign-in.
 *
 * Two steps in one screen rather than two routes: the code arrives in seconds and a navigation
 * push between entering the number and entering the code is a step backwards on a phone.
 */
export default function Login() {
  const router = useRouter();
  const { requestOtp, verifyOtp } = usePatientSession();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Surface the server's own message where it has one.
   *
   * 429 matters here: the OTP endpoint is rate-limited per phone number, and its body carries a
   * human-readable wait time. Replacing that with a generic failure would leave someone tapping
   * "Send code" against a wall with no idea why.
   */
  function explain(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.status === 429) return e.body?.message ?? 'Too many attempts. Please wait and try again.';
      if (e.status === 503) return 'We could not send the code right now. Please try again, or call the clinic.';
      if (e.status === 401) return 'That code is not right, or it has expired.';
      return e.message;
    }
    return 'Something went wrong. Please check your connection and try again.';
  }

  async function onSendCode() {
    setBusy(true);
    setError(null);
    try {
      await requestOtp(phone.trim());
      setStep('code');
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(phone.trim(), code.trim());
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
        <BrandLockup style={{ marginBottom: space.xl }} />
        <Body muted>
          {step === 'phone'
            ? 'Sign in with your registered mobile number.'
            : `Enter the 6-digit code we sent to ${phone}.`}
        </Body>

        <Card style={{ marginTop: space.xl }}>
          {step === 'phone' ? (
            <>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Mobile number"
                placeholderTextColor={color.slate}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={15}
                editable={!busy}
              />
              <Button title="Send code" onPress={onSendCode} loading={busy} disabled={phone.trim().length < 10} />
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor={color.slate}
                keyboardType="number-pad"
                // Lets iOS and Android offer the code straight from the SMS notification.
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                editable={!busy}
                autoFocus
              />
              <Button title="Sign in" onPress={onVerify} loading={busy} disabled={code.trim().length < 4} />
              <Button
                title="Use a different number"
                variant="secondary"
                onPress={() => { setStep('phone'); setCode(''); setError(null); }}
                style={{ marginTop: space.sm }}
              />
            </>
          )}
        </Card>

        {!!error && <Notice title="Could not sign in" body={error} tone="bad" />}

        <Button
          title="New here? Register"
          variant="secondary"
          onPress={() => router.push('/register')}
          style={{ marginTop: space.md }}
        />

        <Caption>
          Your records are private to you. We only ever send a code to a number already registered
          with the clinic.{' '}
          {/* Both stores want the privacy policy reachable inside the app, before sign-in too. */}
          <Text
            onPress={() => Linking.openURL('https://clinic.drjoshis.in/legal/privacy')}
            style={{ textDecorationLine: 'underline' }}
            accessibilityRole="link"
          >
            Privacy policy
          </Text>
        </Caption>
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
    // >=16 so iOS does not zoom the field on focus.
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.surface,
  },
});
