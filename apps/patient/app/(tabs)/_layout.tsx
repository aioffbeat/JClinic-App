import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { color } from '@jclinic-mobile/ui';

/**
 * Five bottom tabs, condensed from the web portal's eight side-nav items (Portal.tsx:7).
 *
 * Home · Health · Medicines · Chat · Book. The three that did not survive as tabs are not gone:
 * "Check-in & vitals" is a prompt on Home (it is a periodic task, not a place), and "My plan"
 * lives inside Health next to the care plan it describes. Five is the practical ceiling before
 * labels start truncating on a 360pt-wide phone.
 *
 * Icons are text glyphs for now — react-native-svg is installed, and these should become the same
 * inline SVG set the web uses (PIcon in Portal.tsx) so the two surfaces match.
 */
export default function TabsLayout() {
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
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: () => <Text>🏠</Text> }} />
      <Tabs.Screen name="health" options={{ title: 'Health', tabBarIcon: () => <Text>📈</Text> }} />
      <Tabs.Screen name="medicines" options={{ title: 'Medicines', tabBarIcon: () => <Text>💊</Text> }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: () => <Text>💬</Text> }} />
      <Tabs.Screen name="book" options={{ title: 'Book', tabBarIcon: () => <Text>📅</Text> }} />
    </Tabs>
  );
}
