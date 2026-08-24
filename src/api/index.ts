// The JClinic API surface and shared domain logic, kept identical to the web app.
//
// Every file re-exported here is GENERATED — copied verbatim from apps/web/src/ by
// scripts/sync-api-client.mjs. Never edit them here; edit them in the jclinic repo and re-run the
// sync. CI runs `npm run sync:check`, so a local-only edit fails the build.
export * from './api';
export * from './encounter-gaps';
export * from './amendments';
export * from './clinical-forms';
export * from './due-test-ui';
export * from './dial-help';
export * from './lib/datetime';
