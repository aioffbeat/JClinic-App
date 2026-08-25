import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/src/api';
import { Icon, color, type IconName } from '@/src/ui';

/**
 * Five bottom tabs, condensed from the web portal's eight side-nav items (Portal.tsx:7).
 *
 * Home · Health · Medicines · Chat · Book. The three that did not survive as tabs are not gone:
 * "Check-in & vitals" is a prompt on Home (it is a periodic task, not a place) and "My plan" sits
 * inside Health next to the care plan it describes. Five is the practical ceiling before labels
 * start truncating on a 360pt-wide phone.
 *
 * Icons are the portal's own glyphs rather than emoji, which render as a different typeface on
 * every Android skin and never match a brand.
 */
export default function TabsLayout() {
  // Drives the unread dot. Polled here rather than inside Chat so the badge is right whichever tab
  // the patient is looking at.
  const unread = useQuery({
    queryKey: ['portal', 'unread'],
    queryFn: () => portalApi.unread(),
    refetchInterval: 60_000,
  });

  const icon = (name: IconName) =>
    ({ focused }: { focused: boolean }) => (
      <Icon name={name} size={23} tint={focused ? color.teal : color.slate} strokeWidth={focused ? 2.2 : 1.8} />
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.teal,
        tabBarInactiveTintColor: color.slate,
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopColor: color.hairline,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarBadgeStyle: { backgroundColor: color.danger, fontSize: 10, fontWeight: '700' },
        sceneStyle: { backgroundColor: color.mist },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="health" options={{ title: 'Health', tabBarIcon: icon('activity') }} />
      <Tabs.Screen name="medicines" options={{ title: 'Medicines', tabBarIcon: icon('pill') }} />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: icon('chat'),
          tabBarBadge: unread.data?.unread ? unread.data.unread : undefined,
        }}
      />
      <Tabs.Screen name="book" options={{ title: 'Book', tabBarIcon: icon('calendar') }} />
    </Tabs>
  );
}
