// The JClinic API surface and shared domain logic, kept identical to the web app.
//
// Everything re-exported below except native-platform is GENERATED — copied verbatim from
// apps/web/src/ by scripts/sync-api-client.mjs. Never edit those files here; edit them in the
// jclinic repo and re-run the sync. CI runs `npm run sync:check`, so a local-only edit fails.
export * from './api';
export * from './encounter-gaps';
export * from './amendments';
export * from './clinical-forms';
export * from './due-test-ui';
export * from './dial-help';
export * from './lib/datetime';

// Mobile-only, hand-written: the ApiPlatform implementation api.ts expects at startup.
export {
  createNativePlatform,
  hydrateApiStorage,
  isApiStorageHydrated,
  flushApiStorage,
  setUnauthorizedHandler,
} from './native-platform';
