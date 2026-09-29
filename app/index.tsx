import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { color } from '../src/ui';
import { usePatientSession } from '../src/session-context';

/**
 * Entry gate. Everything below /(tabs) assumes a session, so the decision is made once here
 * rather than being re-checked on every screen.
 */
export default function Index() {
  const { signedIn, booting } = usePatientSession();
  // Deciding takes a round trip when the stored access token has expired. Redirecting on a
  // not-yet-known answer is what put a signed-in patient on the login screen every launch.
  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.mist }}>
        <ActivityIndicator color={color.teal} />
      </View>
    );
  }
  return <Redirect href={signedIn ? '/(tabs)' : '/login'} />;
}
