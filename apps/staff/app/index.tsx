import { Redirect } from 'expo-router';
import { useStaffSession } from '../src/session-context';

/** Entry gate — everything under /(tabs) assumes a session and a chosen clinic. */
export default function Index() {
  const { signedIn } = useStaffSession();
  return <Redirect href={signedIn ? '/(tabs)' : '/login'} />;
}
