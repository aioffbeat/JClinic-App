import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { ApiError } from '@/src/api';

/**
 * The data layer.
 *
 * The web app has none — every one of its 40 pages hand-rolls useEffect + useState + setInterval
 * (three tickers in App.tsx, two more in Portal.tsx). That is survivable on a desktop on clinic
 * wifi and not on a phone, where the app is backgrounded constantly and the network comes and goes.
 * React Query replaces all of it and, persisted below, delivers the read-only offline cache in the
 * same stroke.
 */

/** How long cached data is served before a refetch is triggered in the background. */
const STALE_MS = 60_000;

/**
 * How long a cached response survives on disk.
 *
 * 24h, not longer, and this is a clinical-safety decision rather than a technical one: a
 * prescription or a lab result from last week must not silently present itself as current. Every
 * screen backed by this cache also stamps "as of <time>" so what the reader is looking at is never
 * ambiguous.
 */
const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_MS,
      gcTime: PERSIST_MAX_AGE_MS,
      // The app decides when to refetch on focus per-screen; a blanket refetch on every
      // foreground would hammer the API each time someone glances at their phone.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        // Never retry what will never succeed. A 401 is handled by the refresh flow, a 403 is a
        // permission the user does not have, a 404 is not coming back, and a 429 means we have
        // already been told to slow down — retrying it is precisely the wrong response.
        if (error instanceof ApiError) {
          if (error.status === 401 || error.status === 403 || error.status === 404 || error.status === 429) return false;
          if (error.status >= 400 && error.status < 500) return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      // Writes are never retried automatically. Everything the apps write is clinical or financial
      // — a dose tick, a booking, a vitals entry — and a duplicate is worse than a visible failure
      // the user can repeat deliberately.
      retry: false,
    },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'jclinic.queryCache',
  throttleTime: 2000,
});

export const persistOptions = {
  persister: queryPersister,
  maxAge: PERSIST_MAX_AGE_MS,
  /**
   * Bump when a cached shape changes so stale entries are discarded rather than deserialised into
   * a component that no longer understands them.
   */
  buster: 'v1',
  dehydrateOptions: {
    /**
     * Only successful queries are written to disk, and mutations never are.
     *
     * The filter is the important half: without it an errored query is persisted and replayed on
     * next launch, so the app opens showing a failure that has since resolved.
     */
    shouldDehydrateQuery: (query: { state: { status: string } }) => query.state.status === 'success',
    shouldDehydrateMutation: () => false,
  },
} as const;

/** Wipe cached clinical data. Call on sign-out — a shared handset must not leak the last user's records. */
export async function clearQueryCache() {
  queryClient.clear();
  await AsyncStorage.removeItem('jclinic.queryCache');
}
