import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, portalApi, type PublicClinic } from '@/src/api';
import { describeDevice } from '@/src/lib';
import { usePatientSession } from '@/src/session-context';
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

type Step = 'clinic' | 'phone' | 'code' | 'when' | 'details';

/** Local YYYY-MM-DD. The server reads the date as IST, which is also the phone's clock here. */
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** The DTOs take digits with an optional +, and a phone keypad offers spaces, dashes and brackets. */
function digits(v: string) {
  return v.replace(/[^\d+]/g, '');
}
function dayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function Register() {
  const router = useRouter();
  const { establish } = usePatientSession();
  const [step, setStep] = useState<Step>('clinic');
  const [clinic, setClinic] = useState<PublicClinic | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState({ fullName: '', sex: 'female', dob: '', email: '', relation: 'self', signature: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  /**
   * Checked here because both fields are optional free text against @IsDateString / @IsEmail, and
   * the server's refusal arrives as class-validator's own wording — after the patient has already
   * spent an OTP and picked a slot. "01/01/1990" is the common one.
   */
  const dobOk = !f.dob.trim() || (/^\d{4}-\d{2}-\d{2}$/.test(f.dob.trim()) && !Number.isNaN(Date.parse(f.dob.trim())));
  const emailOk = !f.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim());

  // The first visit is booked by this call, so it needs a real slot. Sending "same time tomorrow"
  // was refused by the server with `outside_hours` for everyone whose tomorrow-at-this-minute did
  // not happen to land on the grid — which is nearly everyone.
  const [date, setDate] = useState(() => isoDate(addDays(new Date(), 1)));
  const [slot, setSlot] = useState<string | null>(null);

  const clinics = useQuery({ queryKey: ['portal', 'clinics'], queryFn: () => portalApi.publicClinics() });

  const slots = useQuery({
    queryKey: ['portal', 'public-slots', clinic?.id, date],
    queryFn: () => portalApi.publicSlots(clinic!.id, date),
    enabled: step === 'when' && !!clinic,
  });

  // publicSlots returns only the free ones — a stranger is told what they can book, never what is
  // taken. The horizon is the clinic's own, so no date is offered that the server would refuse.
  const free = slots.data?.slots ?? [];
  const days = Array.from(
    { length: Math.min(slots.data?.horizonDays ?? 14, 14) },
    (_, i) => isoDate(addDays(new Date(), i + 1)),
  );

  function explain(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.status === 429) return e.body?.message ?? 'Too many attempts. Please wait and try again.';
      // 409 is the slot race now, not a duplicate number: the server books an existing patient onto
      // their own record rather than refusing them.
      if (e.status === 409) return e.body?.message ?? 'That time was just taken — please pick another.';
      // outside_hours / closed / bad_clinic all arrive as 422 and each says what to do.
      if (e.status === 422) return e.body?.message ?? 'Please check the details and try again.';
      if (e.status === 503) return 'We could not send the code right now. Please try again, or call the clinic.';
      if (e.status === 401) return 'That code is not right, or it has expired.';
      // class-validator sends `message` as an ARRAY of sentences. Left alone it stringifies into
      // one comma-run of server jargon; the first line is the one the patient can act on.
      if (e.status === 400) {
        const m = (e.body as { message?: unknown } | undefined)?.message;
        if (Array.isArray(m) && m.length) return `${String(m[0])}. Please check that field and try again.`;
      }
      return e.message;
    }
    return 'Something went wrong. Please check your connection and try again.';
  }

  const sendCode = useMutation({
    mutationFn: () => portalApi.registerRequestOtp(digits(phone)),
    onSuccess: () => { setError(null); setStep('code'); },
    onError: (e) => setError(explain(e)),
  });

  const checkCode = useMutation({
    mutationFn: () => portalApi.registerVerifyOtp(digits(phone), code.trim()),
    onSuccess: () => { setError(null); setStep('when'); },
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
        phone: digits(phone),
        code: code.trim(),
        fullName: f.fullName.trim(),
        sex: f.sex,
        dob: f.dob.trim() || undefined,
        email: f.email.trim() || undefined,
        clinicId: clinic!.id,
        consentName: f.signature.trim(),
        consentRelation: f.relation,
        // A slot the server itself offered, never a time computed here.
        visitAt: slot!,
        ...device,
      });
    },
    onSuccess: async (res) => {
      // The same session setup sign-in does — name, cached id, signedIn, and push registration.
      // Doing only the token here left a new patient with no dose reminders at all.
      await establish(res);
      router.replace('/pay');
    },
    onError: (e) => {
      setError(explain(e));
      // Someone else took the slot between the picker and this call. Send them back to choose
      // again with fresh availability, rather than leaving a dead "Create my account" button.
      if (e instanceof ApiError && (e.status === 409 || e.body?.error === 'outside_hours')) {
        setSlot(null);
        setStep('when');
        slots.refetch();
      }
    },
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

          {step === 'when' && (
            <>
              <Card>
                <H2>When would you like to come?</H2>
                <Label>Which day?</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
                  <View style={styles.row}>
                    {days.map((d) => (
                      <Choice
                        key={d}
                        text={dayLabel(d)}
                        on={date === d}
                        onPress={() => { setDate(d); setSlot(null); }}
                      />
                    ))}
                  </View>
                </ScrollView>
              </Card>

              <Card>
                <Label>What time?</Label>
                {slots.isLoading && <Loading />}
                {slots.data?.closed && <Body muted>The clinic is closed on this day.</Body>}
                {!slots.isLoading && !slots.data?.closed && !free.length && (
                  <Body muted>No free times left on this day — try another.</Body>
                )}
                <View style={[styles.row, { marginTop: space.md }]}>
                  {free.map((s) => (
                    <Choice key={s.start} text={timeLabel(s.start)} on={slot === s.start} onPress={() => setSlot(s.start)} />
                  ))}
                </View>
                {slots.isError && (
                  <Notice title="Cannot load times" body="You may be offline. Try again once you reconnect." tone="bad" />
                )}
                <Button title="Continue" onPress={() => setStep('details')} disabled={!slot} />
              </Card>
            </>
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

                <Label>{dobOk ? 'Date of birth (optional)' : 'Date of birth — use YYYY-MM-DD, e.g. 1990-01-31'}</Label>
                <TextInput
                  style={styles.input}
                  value={f.dob}
                  onChangeText={set('dob')}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={color.slate}
                />

                <Label>{emailOk ? 'Email (optional)' : 'Email — that does not look like an email address'}</Label>
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
                  disabled={f.fullName.trim().length < 2 || f.signature.trim().length < 2 || !dobOk || !emailOk}
                />
                <Caption>
                  {slot ? `Your visit: ${dayLabel(date)} at ${timeLabel(slot)}. ` : ''}
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
