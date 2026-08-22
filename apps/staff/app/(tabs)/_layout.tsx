import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { color } from '@jclinic-mobile/ui';
import { useStaffSession } from '../../src/session-context';

/**
 * Tabs are driven by GRANTED PERMISSIONS, not role names.
 *
 * This mirrors apps/web/src/App.tsx, whose comments record that hand-kept role lists drifted from
 * the real permission matrix. `href: null` hides a tab from the bar while leaving the route
 * reachable — which matters because the API is the actual gate, and a hidden screen that someone
 * deep-links into will still be refused server-side rather than silently permitted.
 *
 * The result is that a doctor and a telecaller open the same binary and see different apps.
 */
export default function TabsLayout() {
  const { can } = useStaffSession();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.teal,
        tabBarInactiveTintColor: color.slate,
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.hairline },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: color.mist },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: () => <Text>📋</Text> }} />
      <Tabs.Screen
        name="patients"
        options={{ title: 'Patients', tabBarIcon: () => <Text>👤</Text>, href: can.patients ? undefined : null }}
      />
      <Tabs.Screen
        name="leads"
        options={{ title: 'Leads', tabBarIcon: () => <Text>🎯</Text>, href: can.leads ? undefined : null }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarIcon: () => <Text>💬</Text>, href: can.messages ? undefined : null }}
      />
    </Tabs>
  );
}
