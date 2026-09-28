# Publishing to the Play Store — the full walkthrough

Written for the state as of **28 Sep 2026**: the organization account
**Dr Joshi's HHRC Pvt. Ltd.** (ID 6181526182455822857) is verified, and **Create app** is
unlocked. Everything below is what remains, in the order to do it.

Listing text and the Data safety answers live in `STORE-LISTING.md`. The iOS counterpart is
`APPSTORE.md`.

---

## 0. Where things stand

| Piece | State |
|---|---|
| Play Console organization account | **Done** — verified 28 Sep 2026 |
| Signing key | Held by EAS on `drjoshi000s-team`; nothing to do |
| Package name | `in.drjoshis.jclinic.patient` (the `.dev` suffix is only for sideloaded test builds) |
| Target SDK | 36 — above Play's current minimum of 35 |
| Privacy policy | https://clinic.drjoshis.in/legal/privacy — live |
| Deletion page | https://clinic.drjoshis.in/legal/deletion — live, linked from Home |
| Reviewer sign-in bypass | Exists in the API, **off** until the env vars are set (§4) |
| Icon 512×512 | `assets/play-icon-512.png` |
| Feature graphic 1024×500 | `assets/play-feature-1024x500.png` |
| Listing text + Data safety answers | `STORE-LISTING.md` |
| **Production `.aab`** | **Never built** — step 1 |
| **Screenshots** | **Missing** — step 8 |

---

## 1. Build the `.aab`

Start this first; it runs in EAS's cloud while you fill in the console.

```bash
git status                # expect the API-client sync and the doc files
git add -A && git commit -m "Sync the API client, add App Store build path and store listing copy"
```

EAS builds from your git state, so uncommitted work either prompts or gets left out. Commit first.

```bash
npm run verify            # sync check + typecheck — do not skip
npm run build:play
```

What to expect:

- EAS asks nothing about signing — the keystore already exists on the account.
- 10–15 minutes. It prints a build page URL and, when finished, a download link.
- `npx eas build:list --platform android --limit 3` shows the link again later.
- The version name comes from `version` in `app.config.ts` (0.1.0). The **versionCode is EAS's** —
  never set it by hand. `appVersionSource: "remote"` alone does NOT increment it: without
  `autoIncrement` in the profile every build comes out as code 1, and Play refuses the second
  upload because that code is already used. Both are set now; `eas build:version:get --platform
  android` says what the next build will carry.

**This is the first release build this project has ever made.** Preview APKs have succeeded, but a
release build links Android resources more strictly — this repo already lost one build to a
dangling splash-screen drawable. If it fails, the EAS log names the failing Gradle task; fix it and
rebuild before touching the console.

Download the `.aab` to your machine when it finishes.

## 2. Create the app

Play Console → **Create app**:

| Field | Value |
|---|---|
| App name | `Dr. Joshi's` (max 30 chars — shown on the store) |
| Default language | English (India) — or English (United States) |
| App or game | **App** |
| Free or paid | **Free** — permanent for this app; a free app can never be switched to paid |
| Declarations | Tick both: developer programme policies, and US export laws |

→ **Create app.** You land on the app dashboard with a **"Set up your app"** checklist.

## 3. The dashboard checklist, in order

Do them in this order; the short ones clear the list fast and the long one (Data safety) benefits
from having the rest decided.

1. App access → §4
2. Ads → **No, my app does not contain ads**
3. Content rating → §5
4. Target audience and content → §6
5. News apps → **No**
6. Health apps → §7
7. Government apps → **No**
8. Financial features → **My app doesn't provide any financial features**
9. Data safety → §8
10. Privacy policy → `https://clinic.drjoshis.in/legal/privacy`
11. Store listing → §9

## 4. App access (and the reviewer sign-in)

The whole app is behind an OTP login, and a reviewer cannot receive your SMS. The API has a
bypass for exactly one number. **Set it up and test it before you fill this form in.**

On the VPS `.env`, then restart the api:

```
REVIEW_OTP_PHONE=+917710001103
REVIEW_OTP_CODE=<pick a 6+ digit code, e.g. 481902>
```

Now **test it yourself** on a phone or the website: sign in as `7710001103` with that code. If it
does not work, stop — a reviewer who cannot log in is an automatic rejection worth several days.

Then in Play Console → **App access** → *All or some functionality is restricted*:

| Field | Value |
|---|---|
| Name | `Patient login` |
| Username | `7710001103` |
| Password | `<the code you chose>` |
| Any other instructions | *Enter the phone number on the sign-in screen and tap "Send code". Enter the password above as the 6-digit code — this demo number is accepted without an SMS. The account shows a demo patient's records.* |

→ Add → Save.

**Unset both env vars and restart the api once the app is published.**

## 5. Content rating

→ Start questionnaire. Email address, then category **Utility, Productivity, Communication or
Other**. Answer the questions honestly — for this app they are all **No**:

- violence, sexuality, language, controlled substances, gambling, horror: **No**
- Does the app allow users to interact or exchange content with other users? **No** — patients
  message clinic staff, never each other
- Does it share the user's location, or personal information with third parties? **No**
- Does it allow purchases of digital goods? **No**

→ Save → Submit. Comes out **Everyone** / **3+**.

## 6. Target audience and content

- Target age groups: **18 and over** only
- Appeals to children: **No**
- (Because no age group under 18 is selected, the Families policy section disappears.)

## 7. Health apps declaration

- **Yes**, this is a health app.
- Type: **health records / health management** by a registered healthcare provider.
- You may be asked to confirm the clinic is a licensed healthcare provider and that the developer
  name matches it. It does: Dr Joshi's HHRC Pvt. Ltd.
- This can add review time. Declaring it is mandatory; misdeclaring risks suspension.

## 8. Data safety

Three preliminary questions:

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data is deleted? | **Yes** → `https://clinic.drjoshis.in/legal/deletion` |

Then tick these data types and nothing else. Every one is **collected, not shared**, **not
processed ephemerally**, and purpose **App functionality** (plus Account management where noted):

| Category | Type | Required/Optional | Extra purpose |
|---|---|---|---|
| Personal info | Name | Required | Account management |
| Personal info | Email address | Optional | — |
| Personal info | Phone number | Required | Account management |
| Personal info | User IDs | Required | Account management |
| Financial info | Purchase history | Required | — (the visiting charge) |
| Health and fitness | **Health info** | Required | — |
| Messages | Other in-app messages | Optional | — |
| Photos and videos | Photos | Optional | — (lab report uploads) |
| App activity | App interactions | Required | — |
| Device or other IDs | Device or other IDs | Required | — (the push token) |

Do **not** tick: Location, Payment info (Razorpay and the UPI app handle the card/UPI details —
this app never sees them), Contacts, Calendar, Files and docs, Web browsing, Installed apps,
Advertising ID, Crash logs or Diagnostics.

Sharing with third parties: **none**. Data used for advertising or tracking: **no**.
Independent security review: **No** — it has not had one, and this answer is optional and visible.

## 9. Store listing

**Main store listing** — text is in `STORE-LISTING.md`, paste it:

| Field | Source |
|---|---|
| App name | `Dr. Joshi's` |
| Short description (80) | STORE-LISTING.md |
| Full description (4000) | STORE-LISTING.md |
| App icon | `assets/play-icon-512.png` |
| Feature graphic | `assets/play-feature-1024x500.png` |
| Phone screenshots | see below — **2 minimum, upload 5** |
| App category | **Medical** |
| Tags | health records, medicine reminder, appointments |
| Contact email | `contact@drjoshis.in` |
| Website | `https://clinic.drjoshis.in` |

### Taking the screenshots

Install the app on an Android phone (the sideloaded `.dev` APK is fine — the UI is identical), sign
in as a **demo patient with invented data**, and capture five portrait screens: Home, Medicines, a
visit record, Chat, Book.

- Never screenshot a real patient's record.
- PNG or JPEG, portrait, each side between 320 px and 3840 px. A modern phone's native screenshot
  is already the right size — do not resize or add frames.
- Pull them off the phone and upload in that order; the first is what most people see.

## 10. Internal testing

**Testing → Internal testing → Create new release.**

1. Upload the `.aab`. On this first upload Play asks about **Play App Signing** — **accept it.**
   Google then holds the real signing key and your EAS key becomes an upload key, which means a
   lost key is recoverable instead of fatal.
2. Release name fills in as `1 (0.1.0)`. Release notes: *"First release."*
3. Save → Review release → **Start rollout to Internal testing**.
4. **Testers** tab → create an email list with your own Google account (and clinic staff) → save →
   copy the **opt-in link** → open it on the phone → Become a tester → install from Play.

Check on that Play-installed build, not the sideloaded one:

- OTP login, including the reviewer number and code
- a visit record and the Ayurveda assessment
- ticking a dose
- chat with the clinic
- the payment screen (UPI deep link opens a UPI app)
- a lab photo upload
- **a push notification actually arriving**
- "Delete my account & data" opens the deletion page

## 11. Production

**Production → Create new release** → **Add from library** and pick the same `.aab` (do not
rebuild — the reviewed binary should be the tested one).

- Countries: India, or all — your choice.
- Release notes: same text.
- Save → Review release → **Start rollout to Production**. Staged rollout is optional; at this
  scale 100% is fine.

Then **Publishing overview → Send for review**. The first review of a new health app usually takes
several days and sometimes longer. **Do not submit again while a review is pending** — it resets
the queue. Watch **Policy status** and the account email for questions.

## 12. After it goes live

On the VPS `.env`, then restart the api — this drives the app's own "update available" nudge
(`apps/api/src/common/mobile-config.controller.ts`):

```
MOBILE_STORE_URL_ANDROID=https://play.google.com/store/apps/details?id=in.drjoshis.jclinic.patient
MOBILE_LATEST_VERSION=0.1.0
```

And **remove** `REVIEW_OTP_PHONE` / `REVIEW_OTP_CODE`, then restart again.

### Later releases

1. Bump `version` in `app.config.ts` if you want a new public version number.
2. `npm run verify && npm run build:play`
3. Upload to Internal testing, check it, then promote the same build to Production.

From the second release on, linking a Google Cloud service-account key in Play Console lets
`eas submit --platform android` upload for you.

---

## Appendix — the two mechanisms this depends on

**The reviewer bypass** (`apps/api/src/portal/portal.service.ts`): with `REVIEW_OTP_PHONE` and
`REVIEW_OTP_CODE` set, that one number signs in with that fixed code and receives no SMS. Every
other number is untouched, the compare is constant-time, and nothing is written. With the vars
unset the demo number plus any code returns 401 — verified inert.

**Account deletion**: https://clinic.drjoshis.in/legal/deletion explains how to request deletion,
how the request is verified against the registered number, the 30-day window, and which clinical
and billing records medical-establishment and tax law require the clinic to keep. The app links to
it from Home, beside Sign out, which satisfies the in-app-discoverability half of the policy.

Operationally: that page commits the clinic to acting on requests to **contact@drjoshis.in** within
30 days. Someone has to own that inbox.

## Known gaps worth closing before the first upload

Changing either after submission means a new build and another review.

1. `USE_BIOMETRIC` and `USE_FINGERPRINT` are declared in `app.config.ts`, but no biometric unlock
   exists. They appear on the listing as permissions the app cannot justify.
2. Account deletion is a link out to a web page that asks the patient to email. Play accepts this;
   an in-app request button is sturdier and Apple is likely to require it.
