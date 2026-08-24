import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Alert, Linking, StyleSheet, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { portalApi } from '@/src/api';
import { Body, Button, Caption, Card, H1, H2, Label, Loading, Notice, Pill, Screen, color, space } from '@/src/ui';
import { RazorpayCheckout } from '@/src/razorpay-checkout';

/**
 * The visiting charge.
 *
 * This is what confirms a self-registered patient's first appointment, so an unpaid registration
 * must never be a dead end — it stays reachable from Home until it is settled.
 *
 * UPI is the primary path and is genuinely better here than on the web: a phone can deep-link
 * straight into GPay or PhonePe with the amount pre-filled, where the website can only show a QR
 * and ask the patient to type the reference back. The reference still has to be captured, because
 * a UPI intent gives the app no callback — the clinic reconciles against the UTR.
 */
export default function Pay() {
  const router = useRouter();
  const [reference, setReference] = useState('');
  const [showRazorpay, setShowRazorpay] = useState(false);

  const status = useQuery({ queryKey: ['portal', 'registration', 'status'], queryFn: () => portalApi.registrationStatus() });

  const payUpi = useMutation({
    mutationFn: () => portalApi.payUpi(reference.trim()),
    onSuccess: () => {
      Alert.alert('Thank you', 'Your clinic will confirm your appointment shortly.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    },
    onError: () => Alert.alert('Could not record', 'Please check the reference and try again.'),
  });

  const s = status.data;
  const amount = s?.amount ?? s?.outstanding ?? 0;
  const paid = s?.payState === 'paid';

  function openUpi() {
    if (!s?.upiId) return;
    // The standard UPI intent. Android hands it to whichever app the user has; on iOS the scheme
    // opens the default handler. `tr` carries our bill number so the clinic can match the payment.
    const url =
      `upi://pay?pa=${encodeURIComponent(s.upiId)}` +
      `&pn=${encodeURIComponent(s.upiName ?? 'Dr. Joshi’s')}` +
      `&am=${encodeURIComponent(String(amount))}` +
      `&cu=INR` +
      `&tn=${encodeURIComponent(`Visiting charge ${s.billNumber ?? ''}`.trim())}` +
      (s.billNumber ? `&tr=${encodeURIComponent(s.billNumber)}` : '');

    Linking.openURL(url).catch(() =>
      Alert.alert('No UPI app found', `Pay ${s.upiId} manually, then enter the reference below.`),
    );
  }

  if (showRazorpay) {
    return (
      <RazorpayCheckout
        onDone={() => {
          setShowRazorpay(false);
          status.refetch();
          router.replace('/(tabs)');
        }}
        onCancel={() => setShowRazorpay(false)}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Payment', headerTintColor: color.petrolInk }} />
      <Screen refreshing={status.isRefetching} onRefresh={() => status.refetch()}>
        <H1>Visiting charge</H1>
        {status.isLoading && <Loading />}

        {paid && (
          <Notice title="Paid" body="Your appointment is confirmed. Nothing further to do." />
        )}

        {!paid && !!s && (
          <>
            <Card>
              <Label>Amount due</Label>
              <H2>{`₹${Number(amount).toLocaleString('en-IN')}`}</H2>
              {!!s.clinic?.name && <Caption>{s.clinic.name}</Caption>}
              {!!s.visitAt && <Caption>{`Visit on ${new Date(s.visitAt).toLocaleDateString()}`}</Caption>}
              {!!s.status && <Pill text={s.status} tone="neutral" />}
            </Card>

            <Card>
              <H2>Pay by UPI</H2>
              <Body muted>Opens GPay, PhonePe or whichever UPI app you use, with the amount filled in.</Body>
              <Button title="Open UPI app" onPress={openUpi} style={{ marginTop: space.md }} />
              {!!s.upiId && <Caption>{`Or pay ${s.upiId} manually.`}</Caption>}

              <View style={{ marginTop: space.lg }}>
                <Label>Then enter the reference (UTR)</Label>
                <Body muted>Your UPI app shows this after paying. It is how the clinic matches your payment.</Body>
                <TextInput
                  style={styles.input}
                  value={reference}
                  onChangeText={setReference}
                  placeholder="UTR / transaction reference"
                  placeholderTextColor={color.slate}
                  autoCapitalize="characters"
                />
                <Button
                  title="I have paid"
                  onPress={() => payUpi.mutate()}
                  loading={payUpi.isPending}
                  disabled={reference.trim().length < 6}
                />
              </View>
            </Card>

            {/* Razorpay is switched on per clinic on the server, not by a build flag here. */}
            {s.razorpayEnabled && (
              <Card>
                <H2>Or pay by card / netbanking</H2>
                <Body muted>You will be taken to a secure checkout.</Body>
                <Button
                  title="Pay online"
                  variant="secondary"
                  onPress={() => setShowRazorpay(true)}
                  style={{ marginTop: space.md }}
                />
              </Card>
            )}

            <Caption>
              You can also pay at the clinic — your appointment is confirmed once payment is
              received either way.
            </Caption>
          </>
        )}

        {status.isError && (
          <Notice title="Cannot load your bill" body="You may be offline. Try again once you reconnect." tone="bad" />
        )}

        <Button title="Later" variant="secondary" onPress={() => router.replace('/(tabs)')} style={{ marginTop: space.lg }} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: 10,
    paddingHorizontal: space.md,
    marginTop: space.sm,
    marginBottom: space.md,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.surface,
  },
});
