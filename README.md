# Dr. Joshi's — patient app

The patient app for the JClinic patient portal. Expo (SDK 57), iOS and Android, talking to the same
`/v1` API as the web app at `clinic.drjoshis.in`, which is unchanged and remains the desktop surface.

**Patients only.** There is no staff mode and no staff login. A clinic-facing app existed briefly in
this repo and was removed; it is preserved on the `two-app-archive` branch if it is ever wanted back.

```
app/          Expo Router routes — the screens
src/api/      GENERATED. The JClinic API surface, copied verbatim from the web app.
src/lib/      API bootstrap, device identity, sessions, push, query client, platform adapter
src/ui/       design tokens from BRAND.md, plus the shared primitives
scripts/      sync-api-client.mjs
```

## Getting started

```bash
npm install
cp .env.example .env
npm start
```

`EXPO_PUBLIC_API_BASE` needs an API origin with **no trailing slash and no `/v1`** — the client
appends that itself. From a real device against a local API use the machine's LAN IP
(`http://192.168.1.x:3000`); `localhost` on a phone means the phone.

```bash
npm run verify   # sync check + typecheck
npm run bundle   # what actually proves it works — see below
```

---

## The shared client

`src/api/` is **copied verbatim** from the JClinic web app: `api.ts` (2,800+ lines, 39 typed API
namespaces, 246 exported types) plus six pure-logic modules. It is the entire backend contract,
already proven in production, and it is shared rather than reimplemented.

```bash
npm run sync          # copy from the jclinic repo
npm run sync:check    # exit 1 on drift, browser globals, or `any` — run this in CI
```

Three rules follow:

1. **Never edit anything under `src/api/`.** Edit it in `jclinic/apps/web/src/`, then `npm run sync`.
   Every generated file carries a banner saying so, and `sync:check` fails if a local edit exists.
2. **The layout mirrors `apps/web/src/` exactly** — which is why `datetime.ts` keeps its `lib/`
   folder. Those files import each other by relative path, so flattening them would force the sync
   script to rewrite imports, and a transformed copy cannot be byte-compared. The drift guard is the
   whole point.
3. **No browser globals in the shared layer.** The sync script refuses to copy a file containing
   `localStorage`, `document`, `location`, `window`, `navigator` or `URL.createObjectURL`, naming the
   file and line. Everything host-specific is injected through `ApiPlatform` — the browser
   implementation lives in `jclinic/apps/web/src/platform.ts`, the React Native one in
   `src/lib/native-platform.ts`.

`ApiPlatform.storage.get` is deliberately **synchronous**: `api()` reads the token on every request,
and making it async would force all 39 namespaces to change shape. The native adapter hydrates an
in-memory map at boot and mirrors writes out in the background — which is why `bootstrapApi()` must
be awaited before any screen renders.

Tokens live in **SecureStore**; the cached display name and patient id live in AsyncStorage, because
they are not credentials and the server re-validates every request regardless.

## No `any` in hand-written code

`sync:check` fails the build on `as any`, `: any` or `<any>` anywhere outside `src/api/`.

This is not style policing. Four screens shipped reading fields that do not exist —
`bill.outstanding`, `visit.visitAt`, `message.fromStaff`, and an appointments *object* iterated as an
array — and every one of them typechecked, because a cast had switched TypeScript off at exactly the
point it was about to help. The client carries 246 accurate interfaces; the only way to get them
wrong is to opt out.

For a genuine platform boundary whose types we do not own, put `// any-ok: <reason>` on the line
before. Requiring a stated reason keeps a deliberate exception cheap and a lazy one visible.

## Sessions

Refresh tokens, added to the API for this app (see `MOBILE.md` in the jclinic repo). Stored hashed
server-side, **rotated on every use**, and replaying a consumed one revokes the whole session as
suspected theft. Two consequences the code handles, and which are easy to reintroduce:

- **Refresh calls are de-duplicated.** Several screens can 401 at once on resume; because the server
  rotates every call, a second concurrent refresh would present an already-consumed token and the
  server would correctly read a routine resume as theft. `refreshAccessToken()` collapses concurrent
  callers into one in-flight promise.
- **Renewal happens on resume, not only on failure.** The access token lives about an hour and a
  phone is backgrounded for far longer.

One phone can hold several charts — a parent and child, or a caregiver with a grant. Switching
re-mints the token server-side (the active patient is the token's subject, never a parameter), so the
query cache is dropped on switch.

## Push

`expo-notifications` via Expo's push service, which forwards to FCM and APNs. Registration runs on
**every** launch, not just the first: Expo reissues tokens on OS updates, reinstalls and backup
restores, and a stale token is indistinguishable from a working one until a send silently fails.

Push is a *transport* for notification rows the API already writes, not a separate channel. The dose
reminders that fire at 08:00 / 14:00 / 20:00 IST are why this app exists — before push they only
became a row nobody saw unless they happened to open the website.

## Offline

Read-only. TanStack Query persisted to AsyncStorage with a **24-hour** ceiling, and only successful
queries are written — persisting an errored one would reopen the app showing a failure that has since
resolved. Writes are never queued or retried: everything here is clinical or financial, and a
duplicate dose tick or booking is worse than a visible failure the user can repeat deliberately.
Cached screens carry an "as of" stamp.

---

## Notes for whoever picks this up

- **Single app, stock Metro config.** This was a two-app npm workspace, and nearly every build
  failure came from hoisting: `disableHierarchicalLookup` hiding `expo-modules-core`, an internal
  `^0.87.0` peer pinning React Native against the SDK, `async-storage` 3.x beside the SDK's 2.2.0,
  `babel-preset-expo` nested where the app could not see it. Flattening deleted that entire class of
  problem — `metro.config.js` is now `getDefaultConfig(__dirname)` and nothing else. Keep it that way.
- **Pin native modules to the SDK.** `npx expo install --check` is the authority.
- **`npm run bundle` is the check that matters.** Typecheck did not catch a single one of those four
  Metro failures; bundling caught all of them.

## Still to build

Roughly half the portal is surfaced. Remaining, all with endpoints and types already in place:

- **Onboarding** — public self-registration (clinic choice, consent, first visit) and the visiting
  charge: UPI deep-link into GPay/PhonePe, plus Razorpay in a WebView (their web checkout script
  cannot run in RN; it stays behind the server's existing dormant flag).
- **Health** — labs, lab report camera upload, prescriptions, due tests and lab-partner booking,
  care plan, packages and recommendations.
- **Book** — the booking flow itself: slots, services, reschedule requests.
- **Medicines** — outside medications and refill requests.
- **Lifestyle** — daily logging, and symptom-report history.
- Icons and splash artwork; EAS project id, build profiles, store listings.
- **Blocker:** route `apps/web/src/pages/Legal.tsx` in the web app — it is exported but imported by
  nothing, so the Terms / Privacy pages are unreachable, and both stores require a live privacy
  policy URL for a health app.
