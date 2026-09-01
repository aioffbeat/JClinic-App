# Publishing to the Play Store

The exact path from this repo to a listed app. Everything project-specific is already prepared:
the production build profile, the signing key (EAS holds it), the store graphics in `assets/`, and
the privacy policy at a live URL. What remains is Google-side setup that only the account owner
can do.

---

## 0. What is already done

| Requirement | State |
|---|---|
| Production build profile | `npm run build:play` → an `.aab` with package `in.drjoshis.jclinic.patient` |
| Signing key | Created and stored by EAS on the `drjoshi000s-team` account |
| Version codes | Auto-incremented by EAS (`appVersionSource: "remote"`) — never edit by hand |
| **Privacy policy URL** | **https://clinic.drjoshis.in/legal/privacy** — live as of 25 Aug 2026 |
| Store icon 512×512 | `assets/play-icon-512.png` |
| Feature graphic 1024×500 | `assets/play-feature-1024x500.png` |
| Target SDK | 36 — well above Play's current minimum |

Note the production build uses the REAL package name, not the `.dev` one sideloaded during
testing. They can coexist on a phone; the Play-installed app is the real identity.

---

## 1. The developer account — read this before paying

Register at https://play.google.com/console ($25, one-time).

**Choose ORGANIZATION, not personal, and this is not a style preference.** Personal accounts
created after November 2023 must run a closed test with **at least 12 testers enrolled for 14
consecutive days** before Google will even show the production track. An organization account has
no such gate. The cost of organization is verification: Google requires a **D-U-N-S number** for
the legal entity (free from Dun & Bradstreet, but allow days-to-weeks for issue/verification), a
website, and an organization email/phone it can verify.

For a clinic publishing a health app, organization is also the honest registration — the listed
developer name should be the clinic's legal entity, not an individual.

## 2. Create the app in Play Console

Create app → name **Dr. Joshi's** → App → Free → confirm the declarations.

Then work through **every task under "Set up your app"**. The ones that need real answers:

- **Privacy policy** → `https://clinic.drjoshis.in/legal/privacy`
- **App access** → the whole app requires login, so provide review credentials. Give Google the
  demo patient: sign-in number `+91 77100 01103`. **Problem: login is by SMS OTP, which a
  reviewer cannot receive.** See §6 — this must be solved before submitting for review.
- **Ads** → No ads.
- **Content rating** → questionnaire; a medical records app comes out "Everyone".
- **Target audience** → 18+, not designed for children.
- **News app** → No.
- **COVID-19 tracing** → No.
- **Data safety** — answer truthfully from what the app actually does:
  - Collects: name, phone number, email (optional), **health info** (medical records, symptoms,
    medications), **photos** (lab report uploads), app interactions.
  - All encrypted in transit (HTTPS). Data is not sold or shared with third parties.
  - Account creation exists → Google **requires a deletion path**, see §6.
- **Health apps declaration** → declare as a health app (medical/health management). This can add
  extra review steps; it is mandatory for what this app is, and misdeclaring is a suspension risk.
- **Government apps** → No.

## 3. Store listing

Main store listing →

- **App name**: Dr. Joshi's
- **Short description** (max 80 chars): e.g. *"Your clinic in your pocket — records, medicines,
  appointments and reminders."*
- **Full description**: what the app does — view your medical records and Ayurveda assessments,
  tick off medicines with reminders, see lab results and trends, book and manage appointments,
  message the clinic, share reports from other labs. Written for patients, no jargon.
- **App icon**: upload `assets/play-icon-512.png`
- **Feature graphic**: upload `assets/play-feature-1024x500.png`
- **Screenshots**: minimum 2 phone screenshots. Take them on the device from the installed app —
  Home, Medicines, a visit record, Chat are the strongest four. (The `.dev` build's UI is
  identical, so screenshots from it are fine.)

## 4. Build and upload

```bash
cd "JClinic App"
npm run verify          # sync + typecheck + import guard — do not skip
npm run build:play      # ~10-15 min in EAS cloud, produces an .aab
```

Download the `.aab` from the link EAS prints (or `eas build:list`).

Play Console → **Testing → Internal testing** → Create release → upload the `.aab`.
On this first upload, accept **Play App Signing** (Google wraps the EAS upload key — this is what
you want; it means a lost upload key is recoverable).

Add your own Google account as an internal tester, install via the opt-in link, and confirm login,
records, chat and the push notification all work on a Play-installed build.

> First release can stay at versionName 0.1.0 or be bumped — cosmetic either way. To bump, change
> `version` in `app.config.ts` and rebuild; the versionCode is EAS's job.

## 5. Promote to production

Internal → (closed testing if using a personal account — see §1) → **Production**.

Create a production release, reuse the same `.aab`, write release notes, and roll out. First
review of a new health app typically takes **several days**, sometimes longer. Do not submit
repeatedly while one review is pending.

### After it is live

Set the store URL and version floor on the VPS so the app's own upgrade nudge works
(`.env`, then restart api):

```
MOBILE_STORE_URL_ANDROID=https://play.google.com/store/apps/details?id=in.drjoshis.jclinic.patient
MOBILE_LATEST_VERSION=<the shipped version>
```

Later releases are: bump nothing, `npm run build:play`, upload to a new release. `eas submit` can
automate the upload once a Google Cloud service-account key is linked in Play Console — worth
doing from the second release on.

---

## 6. Reviewer access and account deletion — both DONE

**Reviewer access** — a server-side review bypass now exists, off by default. During review only,
set in the VPS `.env` and restart the api:

```
REVIEW_OTP_PHONE=+917710001103
REVIEW_OTP_CODE=<pick a 6+ digit code>
```

Then in Play Console → App access, give the reviewer: phone `+91 77100 01103`, code `<the code>`.
That one number signs in with that fixed code and receives no SMS; every other number is untouched
(constant-time compare, nothing written). **Unset both and restart the api when review finishes.**
Verified inert by default: with the vars unset, the demo number + any code returns 401.

**Account deletion** — live at **https://clinic.drjoshis.in/legal/deletion**: how to request, how
the request is verified (against the registered number), the 30-day completion window, and what
clinical/billing records medical-establishment and tax law require the clinic to retain. That URL
goes in the Data safety form. The app links to it from Home, next to Sign out, satisfying the
in-app-discoverability half of the policy.

One operational note: the page commits the clinic to acting on deletion requests sent to
care@drjoshis.in within 30 days. Make sure someone actually owns that inbox.
