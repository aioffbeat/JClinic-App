import { Redirect } from 'expo-router';
import { usePatientSession } from '../src/session-context';

/**
 * Entry gate. Everything below /(tabs) assumes a session, so the decision is made once here
 * rather than being re-checked on every screen.
 */
export default function Index() {
  const { signedIn } = usePatientSession();
  return <Redirect href={signedIn ? '/(tabs)' : '/login'} />;
}
