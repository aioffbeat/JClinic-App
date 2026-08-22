# JClinic Mobile

Native iOS and Android apps for **Dr. Joshi's**, built on Expo (SDK 57) against the same `/v1` API
the web app uses. The web app at `clinic.drjoshis.in` is unchanged and remains the desktop surface.

Two apps, one codebase:

| App | Who | Bundle id |
|---|---|---|
| `apps/patient` — *Dr. Joshi's* | Patients and their caregivers | `in.drjoshis.jclinic.patient` |
| `apps/staff` — *JClinic Staff* | Doctors, front desk, telecallers | `in.drjoshis.jclinic.staff` |

They are separate binaries rather than one app with a role switch. Patients must never see a staff
login; the two need different permission manifests (staff asks for `CALL_PHONE` for Ozonetel
click-to-dial, which a patient app must never request); and Apple reviews a consumer health app very
differently from an internal clinical tool. A rejection of one must not block the other.

---

## Layout

```
apps/patient          Expo app — 5 tabs: Home · Health · Medicines · Chat · Book
apps/staff            Expo app — tabs driven by the signed-in user's granted permissions
packages/api-client   The JClinic API surface. MOSTLY GENERATED — see "The shared client" below.
packages/core         Mobile-only: bootstrap, device identity, sessions, push, query client, permissions
packages/ui           Design tokens from BRAND.md, plus the shared primitives
scripts/              sync-api-client.mjs
```

## Getting started

```bash
npm install
cp .env.example apps/patient/.env   # and apps/staff/.env
npm run patient                     # or: npm run staff
```

`EXPO_PUBLIC_API_BASE` must point at an API origin with **no trailing slash and no `/v1`** — the
client appends that itself. From a real device against a local API, use the machine's LAN IP
(`http://192.168.1.x:3000`), not `localhost`, which on a phone means the phone.

---

## The shared client

`packages/api-client/src/` is **copied verbatim** from the JClinic web app — `api.ts` (2,745 lines,
39 typed API namespaces, 246 exported types) plus six pure-logic modules. It is the entire backend
contract, already proven in production, and it is shared rather than reimplemented.

```bash
npm run sync          # copy from the jclinic repo
npm run sync:check    # exit 1 if the two have drifted — run this in CI
```

Three rules follow from that:

1. **Never edit anything under `packages/api-client/src/` directly.** Edit it in
   `jclinic/apps/web/src/`, then run `npm run sync`. Every generated file carries a banner saying so,
   and `sync:check` fails the build if a local edit exists.
2. **The destination layout mirrors `apps/web/src/` exactly.** Those files import each other by
   relative path (`due-test-ui.ts` does `from './api'` and `from './lib/datetime'`), so flattening
   them would force the sync script to rewrite imports — and a transformed copy cannot be
   byte-compared, which would cost the drift guard entirely.
3. **No browser globals may enter the shared layer.** The sync script refuses to copy a file
   containing `localStorage`, `document`, `location`, `window`, `navigator` or
   `URL.createObjectURL`, naming the file and line. Everything host-specific is injected through
   `ApiPlatform` — implemented for the browser in `jclinic/apps/web/src/platform.ts` and for React
   Native in `packages/api-client/src/native-platform.ts`.

`ApiPlatform.storage.get` is deliberately **synchronous**: `api()` reads the token on every request,
and making it async would force all 39 namespaces to change shape. The native adapter therefore
hydrates an in-memory map at boot and mirrors writes to storage in the background — which is why
`bootstrapApi()` must be awaited before any screen renders.

Tokens live in **SecureStore** (hardware-backed keystore); the cached user snapshot lives in
AsyncStorage, because it routinely exceeds SecureStore's 2 KB comfort limit and is not a credential —
the server re-validates every request against its own permission cache regardless.

---

## Sessions

Both apps use refresh tokens, added to the API for this purpose (see `MOBILE.md` in the jclinic
repo). The refresh token is stored hashed server-side, **rotated on every use**, and replaying a
consumed one revokes the whole session as suspected theft.

Two consequences the code takes care of, and which are easy to reintroduce:

- **Refresh calls must be de-duplicated.** Several screens can 401 at once on app resume. Because
  the server rotates on every call, a second concurrent refresh would present a token the first has
  already consumed — and the server would correctly treat a routine resume as theft and sign the
  user out. `refreshAccessToken()` collapses concurrent calls into one in-flight promise.
- **Renew on resume, not only on failure.** The access token lives about an hour and a phone is
  backgrounded for far longer, so both apps refresh when `AppState` goes active.

The patient app also handles caregiver access: one phone legitimately holds several charts in a
family. Switching re-mints the token server-side — the active patient is always the token's subject,
never a header — so the query cache is dropped on switch.

## Push

`expo-notifications` + Expo's push service, which forwards to FCM and APNs. Registration happens on
**every** launch, not just the first: Expo reissues tokens on OS updates, reinstalls and backup
restores, and a stale token is indistinguishable from a working one until a send silently fails.

Push is a *transport* for notification rows the API already writes, not a separate message channel.
The medication reminders that fire at 08:00 / 14:00 / 20:00 IST are the reason this app exists —
before push they only ever became a row nobody saw unless they happened to open the website.

## Offline

Read-only. TanStack Query is persisted to AsyncStorage with a **24-hour** ceiling, and only
successful queries are written — persisting an errored query would reopen the app showing a failure
that has since resolved. Writes are never queued and never retried: everything these apps write is
clinical or financial, and a duplicate dose tick or booking is worse than a visible failure the user
can repeat deliberately. Every cached screen carries an "as of" stamp.

---

## Notes for whoever picks this up

- **npm workspaces, not pnpm.** pnpm 11 requires Node ≥ 22.13 and this project was set up on Node
  20; npm also avoids pnpm's symlink friction with Metro.
- **`metro.config.js` keeps hierarchical lookup ON**, which is npm-specific and deliberate — npm
  nests `expo-modules-core` under `expo/node_modules`, and disabling the walk (as the Expo docs
  suggest for pnpm) makes it invisible and the bundle fails. The comment in the file explains it.
- **`babel-preset-expo` and `expo-splash-screen` are explicit dependencies** even though they arrive
  transitively: Babel resolves presets from the app directory, and the config-plugin resolver needs
  the plugin locally resolvable. npm nests both.
- **Pin native modules to the SDK.** `npx expo install --check` in either app is the authority; a
  wildcard peer range in an internal package will quietly hoist the wrong major (that is how
  `async-storage` 3.x once landed next to the SDK's 2.2.0). The internal packages therefore declare
  their peers as `optional`.

## Still to do

- Icons and splash assets (the configs reference brand colours but no artwork yet).
- Booking flow, lab upload from the camera, and the ePRO check-in are routed but not built.
- Staff app: visit detail, vitals capture, attachment upload, and proper Ozonetel click-to-dial —
  the leads screen currently uses a plain `tel:` link, which does not record the call against the
  lead. Doing it properly needs the agent-Ready state handling the web app has.
- EAS project ids, build profiles, and store listings.
- Route the jclinic web app's `Legal.tsx` (currently dead code) — both stores require a live,
  public privacy-policy URL for a health app.
