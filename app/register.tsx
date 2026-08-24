import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, portalApi, setPortalSession, type PublicClinic } from '@/src/api';
import { describeDevice, setRefreshToken } from '@/src/lib';
import { Body, Button, Caption, Card, H1, H2, Label, Loading, Notice, Screen, color, space } from '@/src/ui';

/**
 * Public self-registration.
 *
 * Four steps in one screen: clinic → phone/OTP → details and consent → done. Separate routes would
 * mean a back-swipe halfway through losing an OTP that has already been sent and paid for.
 *
 * The consent is the legally meaningful part. The typed name IS the signature — the server stores
 * it as one, along with the relationship of whoever signed, because a consent signed by someone
 * other than the patient must say so.
 */
const RELATIONS = ['self', 'parent', 'spouse', 'child', 'sibling', 'guardian'] as const;
const SEXES = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
] as const;

type Step = 'clinic' | 'phone' | 'code' | 'details';

export default function Register() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('clinic');
  const [clinic, setClinic] = useState<PublicClinic | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState({ fullName: '', sex: 'female', dob: '', email: '', relation: 'self', signature: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const clinics = useQuery({ queryKey: ['portal', 'clinics'], queryFn: () => portalApi.publicClinics() });

  function explain(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.status === 429) return e.body?.message ?? 'Too many attempts. Please wait and try again.';
      if (e.status === 409) return 'This number is already registered — please sign in instead.';
      if (e.status === 503) return 'We could not send the code right now. Please try again, or call the clinic.';
      if (e.status === 401) return 'That code is not right, or it has expired.';
      return e.message;
    }
    return 'Something went wrong. Please check your connection and try again.';
  }

  const sendCode = useMutation({
    mutationFn: () => portalApi.registerRequestOtp(phone.trim()),
    onSuccess: () => { setError(null); setStep('code'); },
    onError: (e) => setError(explain(e)),
  });

  const checkCode = useMutation({
    mutationFn: () => portalApi.registerVerifyOtp(phone.trim(), code.trim()),
    onSuccess: () => { setError(null); setStep('details'); },
    onError: (e) => setError(explain(e)),
  });

  /**
   * Creates the patient, books the first visit and raises the visiting-charge bill in one call.
   * The visit shows CONFIRMED only once that bill is paid, which is why this lands on the payment
   * screen rather than the app.
   */
  const submit = useMutation({
    mutationFn: async () => {
      const device = await describeDevice();
      return portalApi.register({
        phone: phone.trim(),
        code: code.trim(),
        fullName: f.fullName.trim(),
        sex: f.sex,
        dob: f.dob.trim() || undefined,
        email: f.email.trim() || undefined,
        clinicId: clinic!.id,
        consentName: f.signature.trim(),
        consentRelation: f.relation,
        // The clinic confirms the actual time; this is the requested day.
        visitAt: new Date(Date.now() + 86400_000).toISOString(),
        ...device,
      });
    },
    onSuccess: async (res) => {
      setPortalSession(res.access_token, res.patient.name);
      const withRefresh = res as { refresh_token?: string };
      if (withRefresh.refresh_token) await setRefreshToken(withRefresh.refresh_token);
      router.replace('/pay');
    },
    onError: (e) => setError(explain(e)),
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Register', headerTintColor: color.petrolInk }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Screen>
          <H1>Register</H1>

          {step === 'clinic' && (
            <Card>
              <H2>Which clinic?</H2>
              {clinics.isLoading && <Loading />}
              {clinics.isError && <Notice title="Cannot load clinics" body="Please check your connection." tone="bad" />}
              {(clinics.data ?? []).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => { setClinic(c); setStep('phone'); }}
                  style={({ pressed }) => [styles.clinic, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.clinicName}>{c.name}</Text>
                  {!!c.address && <Caption>{c.address}</Caption>}
                  <Caption>{`Visiting charge ₹${c.visitingCharge}`}</Caption>
                </Pressable>
              ))}
            </Card>
          )}

          {step === 'phone' && (
            <Card>
              <H2>Your mobile number</H2>
              <Body muted>{`Registering at ${clinic?.name}. We will send a code to confirm this number.`}</Body>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Mobile number"
                placeholderTextColor={color.slate}
                keyboardType="phone-pad"
                autoComplete="tel"
                maxLength={15}
              />
              <Button
                title="Send code"
                onPress={() => sendCode.mutate()}
                loading={sendCode.isPending}
                disabled={phone.trim().length < 10}
              />
            </Card>
          )}

          {step === 'code' && (
            <Card>
              <H2>Enter the code</H2>
              <Body muted>{`Sent to ${phone}.`}</Body>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor={color.slate}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
              />
              <Button title="Continue" onPress={() => checkCode.mutate()} loading={checkCode.isPending} disabled={code.trim().length < 4} />
            </Card>
          )}

          {step === 'details' && (
            <>
              <Card>
                <H2>About you</H2>
                <Label>Full name</Label>
                <TextInput style={styles.input} value={f.fullName} onChangeText={set('fullName')} placeholderTextColor={color.slate} />

                <Label>Sex</Label>
                <View style={styles.row}>
                  {SEXES.map((s) => (
                    <Choice key={s.value} text={s.label} on={f.sex === s.value} onPress={() => set('sex')(s.value)} />
                  ))}
                </View>

                <Label>Date of birth (optional)</Label>
                <TextInput
                  style={styles.input}
                  value={f.dob}
                  onChangeText={set('dob')}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={color.slate}
                />

                <Label>Email (optional)</Label>
                <TextInput
                  style={styles.input}
                  value={f.email}
                  onChangeText={set('email')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={color.slate}
                />
              </Card>

              <Card>
                <H2>Consent</H2>
                <Body muted>
                  I agree to Dr. Joshi&apos;s treating me and holding my medical records. I can
                  withdraw this at any time.
                </Body>

                <Label>Who is signing?</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.row}>
                    {RELATIONS.map((r) => (
                      <Choice key={r} text={r} on={f.relation === r} onPress={() => set('relation')(r)} />
                    ))}
                  </View>
                </ScrollView>

                <Label>Type your full name to sign</Label>
                <TextInput style={styles.input} value={f.signature} onChangeText={set('signature')} placeholderTextColor={color.slate} />

                <Button
                  title="Create my account"
                  onPress={() => submit.mutate()}
                  loading={submit.isPending}
                  disabled={f.fullName.trim().length < 2 || f.signature.trim().length < 2}
                />
                <Caption>
                  {`A visiting charge of ₹${clinic?.visitingCharge ?? ''} confirms your first appointment. You pay on the next screen.`}
                </Caption>
              </Card>
            </>
          )}

          {!!error && <Notice title="Could not continue" body={error} tone="bad" />}
        </Screen>
      </KeyboardAvoidingView>
    </>
  );
}

function Choice({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && !on && { opacity: 0.7 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: 10,
    paddingHorizontal: space.md,
    marginTop: space.xs,
    marginBottom: space.md,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.surface,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, marginBottom: space.md },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.surface,
  },
  choiceOn: { backgroundColor: color.teal, borderColor: color.teal },
  choiceText: { fontSize: 15, fontWeight: '600', color: color.ink, textTransform: 'capitalize' },
  choiceTextOn: { color: '#FFFFFF' },
  clinic: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.hairline },
  clinicName: { fontSize: 16, fontWeight: '600', color: color.ink },
});
