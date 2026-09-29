# Publishing to the Play Store — from here to live

Written for the state on **29 Sep 2026**: the organization account is verified, the app entry
exists, internal testing has been done, and build **0.3.0 / versionCode 5** is tested on a real
handset. What remains is console work.

Listing text and the Data safety answers are in `STORE-LISTING.md`. iOS is `APPSTORE.md`.

---

## 0. Where things stand

| Piece | State |
|---|---|
| Play Console organization account | **Done** — Dr Joshi's HHRC Pvt. Ltd., ID 6181526182455822857 |
| App entry, package `in.drjoshis.jclinic.patient` | **Done** |
| Play App Signing | **Accepted** on the first upload |
| Build | **0.3.0 / code 5**, tested from Play on a real device |
| Internal testing | **Done** |
| Reviewer sign-in | **Live and verified** — see §2 |
| Privacy / Terms / Deletion pages | **Live**, rendering, and linked from the site footer |
| Screenshots | **Taken** |
| Store listing text + Data safety answers | Written in `STORE-LISTING.md` |
| **Store listing graphics** | **Still the old lotus — must be replaced (§3)** |
| Production release | Not yet created |

Useful links:

- Play Console — https://play.google.com/console
- Builds — https://expo.dev/accounts/drjoshi000s-team/projects/jclinic-patient/builds
- Play policy centre — https://play.google.com/about/developer-content-policy/
- Developer help centre — https://support.google.com/googleplay/android-developer
- Your pages — https://clinic.drjoshis.in/legal/privacy · /legal/terms · /legal/deletion

---

## 1. Finish "Set up your app"

Play Console → your app → **Dashboard** → the *Set up your app* list. Production will not accept a
release until every item here is green. Menu paths below are from the app's left-hand nav.

| Task | Where | Answer |
|---|---|---|
| Privacy policy | Policy → App content | `https://clinic.drjoshis.in/legal/privacy` |
| App access | Policy → App content | §2 below |
| Ads | Policy → App content | **No, my app does not contain ads** |
| Content rating | Policy → App content | §4 below |
| Target audience and content | Policy → App content | **18 and over** only; appeals to children **No** |
| News apps | Policy → App content | **No** |
| Health apps | Policy → App content | **Yes** — §5 below |
| Government apps | Policy → App content | **No** |
| Financial features | Policy → App content | **My app doesn't provide any financial features** |
| Data safety | Policy → App content | §6 below |
| Store listing | Grow → Store presence → Main store listing | §3 below |

## 2. App access — the reviewer sign-in

The whole app is behind an OTP login, and a reviewer cannot receive your SMS. The API has a bypass
for exactly one number. **It is already configured and verified on the server**: the right code on
that one number returns a token, a wrong code fails, and no other number accepts it.

Policy → App content → **App access** → *All or some functionality is restricted* → Add new
instructions:

| Field | Value |
|---|---|
| Name | `Patient login` |
| Username | the demo number set in `REVIEW_OTP_PHONE` on the VPS |
| Password | the code set in `REVIEW_OTP_CODE` on the VPS |

The pair is deliberately NOT written down here. While the bypass is armed it is a working login to
a real patient's medical record, and this repository is not the place for that. Read the live
values from `~/jclinic/.env` on the server, or set your own and restart the api.

Any other instructions:

> Enter the phone number in the Username field on the sign-in screen and tap "Send code". Enter the
> password above as the 6-digit code — this demo number is accepted without an SMS and shows a
> patient's records.

**Remove `REVIEW_OTP_PHONE` and `REVIEW_OTP_CODE` from the VPS `.env` once the app is approved**
(§9). A fixed-code login must not outlive the review.

## 3. Store listing

Grow → Store presence → **Main store listing**.

| Field | Value |
|---|---|
| App name | `Dr. Joshi's` |
| Short description | `STORE-LISTING.md` — 74 chars, paste as-is |
| Full description | `STORE-LISTING.md` |
| App icon 512×512 | **`assets/play-icon-512.png`** |
| Feature graphic 1024×500 | **`assets/play-feature-1024x500.png`** |
| Phone screenshots | the ones you took — at least 2, ideally 5 |
| App category | **Medical** |
| Contact email | `contact@drjoshis.in` |
| Website | `https://clinic.drjoshis.in` |
| Contact phone | `+91 90753 90753` (optional, and public if set) |

**The icon and feature graphic must be re-uploaded.** The listing keeps its own copies, separate
from the build, and it still carries the lotus placeholder the app no longer uses. The two files
above are the real mark, regenerated from the clinic's logo.

## 4. Content rating

Policy → App content → **Content rating** → Start questionnaire.

- Email address, then category **Utility, Productivity, Communication or Other**
- Violence, sexuality, language, controlled substances, gambling, horror — **No** to all
- *Does the app allow users to interact or exchange content with other users?* — **No**. Patients
  message clinic staff, never each other.
- Shares location, or personal information with third parties — **No**
- Allows purchases of digital goods — **No**

Submit. It comes out **Everyone / 3+**.

## 5. Health apps declaration

Policy → App content → **Health apps**.

- Yes, this is a health app → **health records / health management**
- Declared by a registered healthcare provider; the developer name matches the clinic's legal
  entity, Dr Joshi's HHRC Pvt. Ltd.
- You may be asked to confirm the clinic is a licensed provider. Have the registration certificate
  to hand.

This can add review time. It is mandatory for what this app is, and misdeclaring risks suspension.

## 6. Data safety

Policy → App content → **Data safety**. Three opening questions:

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data is deleted? | **Yes** → `https://clinic.drjoshis.in/legal/deletion` |

Then tick exactly these ten types and nothing else. Every one is **collected, not shared**, **not
processed ephemerally**, purpose **App functionality** (plus Account management where noted):

| Category | Type | Required/Optional | Extra purpose |
|---|---|---|---|
| Personal info | Name | Required | Account management |
| Personal info | Email address | Optional | — |
| Personal info | Phone number | Required | Account management |
| Personal info | User IDs | Required | Account management |
| Financial info | Purchase history | Required | — |
| Health and fitness | **Health info** | Required | — |
| Messages | Other in-app messages | Optional | — |
| Photos and videos | Photos | Optional | — |
| App activity | App interactions | Required | — |
| Device or other IDs | Device or other IDs | Required | — |

Do **not** tick Location, **Payment info** (Razorpay and the UPI app handle those — this app never
sees them), Contacts, Calendar, Files and docs, Web browsing, Installed apps, Advertising ID,
Crash logs or Diagnostics.

Sold or shared with third parties: **No**. Used for advertising or tracking: **No**. Independent
security review: **No** — it has not had one, and the answer is visible.

## 7. The production release

Test and release → Production → **Create new release**.

1. **Add from library** and select build **5 (0.3.0)** — the one you tested. Do not rebuild; the
   binary that gets reviewed should be the binary that was tested.
2. Countries: India, or wider if you want it.
3. Release notes (`<en-IN>`): *"First release."*
4. Save → **Review release** → **Start rollout to Production**. A staged rollout is available; at
   this scale 100% is fine.

Warnings you can expect and ignore: no tablet optimisation (deliberate — this is a phone app), and
possibly missing deobfuscation files.

## 8. Send for review

**Publishing overview** → check everything is listed as ready → **Send for review**.

- First review of a new health app usually takes several days, sometimes longer.
- **Do not submit again while one is pending** — it resets the queue.
- Watch **Policy status** and the account email. If Google asks a question, answer it in the
  console rather than resubmitting.

## 9. The day it goes live

On the VPS `.env`, then restart the api:

```
MOBILE_STORE_URL_ANDROID=https://play.google.com/store/apps/details?id=in.drjoshis.jclinic.patient
MOBILE_LATEST_VERSION=0.3.0
```

That drives the app's own "update available" nudge
(`apps/api/src/common/mobile-config.controller.ts`).

And **remove the review bypass**:

```
REVIEW_OTP_PHONE=...
REVIEW_OTP_CODE=...
```

Delete both lines and restart. With them unset the demo number plus any code returns 401 — verify
it, do not assume it. A timestamped backup of `.env` from before they were added sits beside it on
the server.

## 10. Later releases

1. Bump `version` in `app.config.ts` when you want a new public version number.
2. `npm run verify && npm run build:play` — versionCode increments itself.
3. Upload to Internal testing, check it on a device, then promote the same build to Production.

From the second release on, linking a Google Cloud service-account key in Play Console lets
`eas submit --platform android` upload for you.

---

## Appendix — the two mechanisms this depends on

**The reviewer bypass** (`apps/api/src/portal/portal.service.ts`): with `REVIEW_OTP_PHONE` and
`REVIEW_OTP_CODE` set, that one number signs in with that fixed code and receives no SMS. Every
other number is untouched, the compare is constant-time, and nothing is written. It covers
**sign-in only, not registration** — which is correct, since a reviewer signs in.

**Account deletion**: https://clinic.drjoshis.in/legal/deletion states how to request deletion, how
it is verified against the registered number, the 30-day window, and which clinical and billing
records medical-establishment and tax law require the clinic to keep. The app links to it from
Home, beside Sign out, which satisfies the in-app-discoverability half of the policy. The site
footer and both portal cards link to it as well, so a reviewer crawling the site finds it.

Operationally: that page commits the clinic to acting on requests to **contact@drjoshis.in** within
30 days, and names **+91 90753 90753** as the phone route. Someone has to own both.
