// Mobile-only application logic shared by both apps.
//
// Shared DOMAIN logic does NOT live here — it is synced into @jclinic-mobile/api-client so its
// relative imports keep resolving against api.ts. See scripts/sync-api-client.mjs.
export * from './bootstrap';
export * from './device';
export * from './session';
export * from './push';
export * from './query';
export * from './permissions';
