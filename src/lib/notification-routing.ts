import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

/**
 * Where a tapped notification takes the patient.
 *
 * The API sends a `target` in the push payload rather than a route path, so the server never has to
 * know the app's navigation structure — renaming a screen here cannot break a notification sent by
 * a version of the API that shipped months earlier.
 */
const TARGETS: Record<string, string> = {
  chat: '/(tabs)/chat',
  medicines: '/(tabs)/medicines',
  health: '/(tabs)/health',
  appointments: '/(tabs)/book',
  labs: '/labs',
  checkin: '/checkin',
  feedback: '/feedback',
  bills: '/(tabs)',
};

/** Fallbacks for payloads that predate `target`, keyed on the notification kind the API sets. */
const BY_KIND: Record<string, string> = {
  portal_message: '/(tabs)/chat',
  med_reminder_morning: '/(tabs)/medicines',
  med_reminder_afternoon: '/(tabs)/medicines',
  med_reminder_night: '/(tabs)/medicines',
  test_recall: '/due-tests',
  followup: '/(tabs)/book',
  appointment_reminder: '/(tabs)/book',
};

function routeFor(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const target = typeof data.target === 'string' ? data.target : null;
  if (target && TARGETS[target]) return TARGETS[target];
  const kind = typeof data.kind === 'string' ? data.kind : null;
  if (kind) {
    if (BY_KIND[kind]) return BY_KIND[kind];
    // Dose reminders are per-slot, so match the family rather than listing every one.
    if (kind.startsWith('med_reminder')) return '/(tabs)/medicines';
  }
  return null;
}

/**
 * Route notification taps.
 *
 * Handles both entry points, and they are genuinely different: `addNotificationResponseReceived`
 * fires when the app is running or backgrounded, while `getLastNotificationResponse` covers the
 * case where the tap COLD-STARTED the app — the listener is registered too late to have seen it,
 * so without this second path a reminder that launches the app just lands on the home screen.
 */
export function useNotificationRouting(enabled: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const go = (data: Record<string, unknown> | undefined) => {
      const route = routeFor(data);
      if (route) router.push(route as never);
    };

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      go(response.notification.request.content.data as Record<string, unknown>);
    });

    // The tap that launched the app. Read once, after the router exists.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) go(response.notification.request.content.data as Record<string, unknown>);
    });

    return () => sub.remove();
  }, [enabled, router]);
}
