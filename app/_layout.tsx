import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { bootstrapApi, configureNotificationHandler, persistOptions, queryClient, useNotificationRouting } from '@/src/lib';
import { color, space, type } from '@/src/ui';
import { PatientSessionProvider, hydratePatientId, useOnUnauthorized, usePatientSession } from '@/src/session-context';

// Must run before the first notification arrives, and it is not React state, so it belongs at
// module scope rather than in an effect that may not have run yet.
configureNotificationHandler();

/**
 * Root layout.
 *
 * The only job here is to not render anything real until the API client is configured and any
 * stored session has been hydrated into memory. The shared api.ts reads its token SYNCHRONOUSLY
 * (see native-platform.ts), so rendering a screen before hydration finishes means the first
 * request goes out unauthenticated and bounces a perfectly good session to the login screen.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <PatientSessionProvider>
          <Boot />
        </PatientSessionProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

function Boot() {
  const onUnauthorized = useOnUnauthorized();
  const { signedIn } = usePatientSession();
  // Only once there is a session: a tap that lands on a patient screen before sign-in would bounce
  // straight back to login and lose where the patient was trying to go.
  useNotificationRouting(signedIn);
  const [state, setState] = useState<'loading' | 'ready' | { error: string }>('loading');

  useEffect(() => {
    let cancelled = false;
    // hydratePatientId runs alongside: the provider reads it synchronously on first render.
    Promise.all([bootstrapApi(onUnauthorized), hydratePatientId()])
      .then(() => !cancelled && setState('ready'))
      .catch((e: Error) => !cancelled && setState({ error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [onUnauthorized]);

  if (state === 'loading') {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={color.teal} />
      </View>
    );
  }

  // Almost always a missing EXPO_PUBLIC_API_BASE. Showing the real reason beats a blank screen or
  // a wall of failed requests against a URL that means nothing on a device.
  if (typeof state === 'object') {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorTitle}>Can’t start</Text>
        <Text style={styles.errorBody}>{state.error}</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.mist } }} />
    </>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.mist,
    padding: space.xl,
  },
  errorTitle: { ...type.title, marginBottom: space.sm },
  errorBody: { ...type.body, color: color.slate, textAlign: 'center' },
});
