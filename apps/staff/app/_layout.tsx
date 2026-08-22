import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { bootstrapApi, configureNotificationHandler, persistOptions, queryClient } from '@jclinic-mobile/core';
import { color, space, type } from '@jclinic-mobile/ui';
import { StaffSessionProvider, useOnUnauthorized } from '../src/session-context';

configureNotificationHandler();

/**
 * Root layout. Same shape as the patient app's: nothing real renders until the API client is
 * configured and any stored session has been hydrated, because the shared client reads its token
 * synchronously and would otherwise fire the first request unauthenticated.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <StaffSessionProvider>
          <Boot />
        </StaffSessionProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

function Boot() {
  const onUnauthorized = useOnUnauthorized();
  const [state, setState] = useState<'loading' | 'ready' | { error: string }>('loading');

  useEffect(() => {
    let cancelled = false;
    bootstrapApi(onUnauthorized)
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

  if (typeof state === 'object') {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorTitle}>Cannot start</Text>
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
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.mist, padding: space.xl },
  errorTitle: { ...type.title, marginBottom: space.sm },
  errorBody: { ...type.body, color: color.slate, textAlign: 'center' },
});
