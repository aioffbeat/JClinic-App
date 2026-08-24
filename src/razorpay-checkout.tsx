import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useMutation, useQuery } from '@tanstack/react-query';
import { portalApi } from '@/src/api';
import { Body, Button, H2, Loading, Notice, Screen, color, space } from '@/src/ui';

/**
 * Razorpay checkout, in a WebView.
 *
 * Razorpay's checkout is a browser script — `checkout.js` opens its own modal and cannot run in
 * React Native. The official RN SDK is an alternative, but it is another native dependency to
 * maintain for a payment path that is currently switched OFF on the server (see the dormant flag
 * in portal.service.ts). A WebView needs no native module and works the moment the flag flips.
 *
 * The flow is unchanged from the web:
 *   1. the server creates an order and returns the public key + order id;
 *   2. checkout runs here and hands back payment id + signature;
 *   3. the SERVER verifies the signature — an HMAC over the order and payment ids. That check is
 *      the whole security model, and it is why nothing here is trusted: a message from the WebView
 *      is only ever forwarded for verification, never treated as proof of payment.
 */
export function RazorpayCheckout({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [failed, setFailed] = useState<string | null>(null);

  const order = useQuery({
    queryKey: ['portal', 'razorpay', 'order'],
    queryFn: () => portalApi.razorpayOrder(),
    // One order per attempt: retrying would create a second order for the same bill.
    retry: false,
    refetchOnMount: 'always',
    gcTime: 0,
  });

  const verify = useMutation({
    mutationFn: (v: { orderId: string; paymentId: string; signature: string }) => portalApi.razorpayVerify(v),
    onSuccess: onDone,
    onError: () => setFailed('We could not confirm that payment. If money has left your account, call the clinic — do not pay again.'),
  });

  const html = useMemo(() => (order.data ? checkoutHtml(order.data) : null), [order.data]);

  function onMessage(e: WebViewMessageEvent) {
    let msg: { event?: string; orderId?: string; paymentId?: string; signature?: string; reason?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.event === 'success' && msg.orderId && msg.paymentId && msg.signature) {
      verify.mutate({ orderId: msg.orderId, paymentId: msg.paymentId, signature: msg.signature });
      return;
    }
    if (msg.event === 'dismissed') onCancel();
    if (msg.event === 'failed') setFailed(msg.reason ?? 'The payment did not go through.');
  }

  if (order.isLoading) {
    return (
      <Screen scroll={false} style={styles.centre}>
        <ActivityIndicator color={color.teal} />
      </Screen>
    );
  }

  if (order.isError || !html) {
    return (
      <Screen>
        <Notice title="Cannot start payment" body="Please try again, or pay by UPI instead." tone="bad" />
        <Button title="Back" onPress={onCancel} style={{ marginTop: space.md }} />
      </Screen>
    );
  }

  if (verify.isPending) {
    return (
      <Screen>
        <H2>Confirming your payment…</H2>
        <Body muted>Please do not close the app.</Body>
        <Loading />
      </Screen>
    );
  }

  if (failed) {
    return (
      <Screen>
        <Notice title="Payment not completed" body={failed} tone="bad" />
        <Button title="Back" onPress={onCancel} style={{ marginTop: space.md }} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.mist }}>
      <WebView
        source={{ html, baseUrl: 'https://checkout.razorpay.com' }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        // Razorpay opens bank and UPI pages during a payment; blocking navigation would break them.
        originWhitelist={['*']}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.centre}>
            <ActivityIndicator color={color.teal} />
          </View>
        )}
      />
    </View>
  );
}

/**
 * The checkout page.
 *
 * Every value is injected as JSON so a name with a quote in it cannot break out of the script — the
 * prefill comes from patient data and is not ours to trust blindly, even in our own WebView.
 */
function checkoutHtml(o: {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; contact?: string };
}) {
  const options = JSON.stringify({
    key: o.keyId,
    order_id: o.orderId,
    amount: o.amount,
    currency: o.currency,
    name: o.name,
    description: o.description,
    prefill: o.prefill ?? {},
    theme: { color: '#119DA4' },
  });

  return `<!doctype html>
<html>
  <head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" /></head>
  <body style="margin:0;background:#F2F7F6">
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      var post = function (payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      };
      var options = ${options};
      options.handler = function (res) {
        post({
          event: 'success',
          orderId: res.razorpay_order_id,
          paymentId: res.razorpay_payment_id,
          signature: res.razorpay_signature
        });
      };
      options.modal = { ondismiss: function () { post({ event: 'dismissed' }); } };
      try {
        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function (res) {
          post({ event: 'failed', reason: (res && res.error && res.error.description) || '' });
        });
        rzp.open();
      } catch (e) {
        post({ event: 'failed', reason: String(e) });
      }
    </script>
  </body>
</html>`;
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.mist },
});
