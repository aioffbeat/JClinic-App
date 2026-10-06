# Publishing to the App Store

The iOS counterpart of `PLAYSTORE.md`. Same app, same bundle id (`in.drjoshis.jclinic.patient`),
same EAS project. No Mac is needed: EAS builds, signs, and uploads in the cloud.

---

## 0. What is already done

| Requirement | State |
|---|---|
| Bundle identifier | `in.drjoshis.jclinic.patient` (`app.config.ts`) |
| Store build | `npm run build:appstore` → store-signed `.ipa` (the `production` profile) |
| Upload | `npm run submit:appstore` → sends the latest build to App Store Connect |
| Build numbers | EAS holds them (`appVersionSource: "remote"` + `autoIncrement` on the profile) |
| Export compliance | `usesNonExemptEncryption: false` (HTTPS only), so there's no per-build question |
| Permission strings | Camera / Photos / Face ID strings in `ios.infoPlist` |
| iPhone only | `supportsTablet: false`, so **no iPad screenshots are required** |
| Privacy policy | https://clinic.drjoshis.in/legal/privacy |
| Account deletion page | https://clinic.drjoshis.in/legal/deletion, linked from Home |
| Reviewer login | `REVIEW_OTP_PHONE` / `REVIEW_OTP_CODE` bypass (see `PLAYSTORE.md` §6) |

---

## 1. Apple Developer Program as an Organization ($99/year)

Apple requires healthcare apps to be published by a legal entity (guideline 5.1.1(ix)), so you
**must** use an organization account. An individual account would be rejected.

Before you start, check these. Most enrolment delays come from them:

1. **The D-U-N-S record matches exactly.** Look up the number at
   https://developer.apple.com/enroll/duns-lookup/. The legal name and address Apple shows must
   match what you type into the enrolment form, character for character. If they differ, correct
   them with D&B first. Apple can take up to about 14 days to pick up a D&B change.
2. **An Apple Account with two-factor authentication.** Use a clinic-owned address such as
   `apps@drjoshis.in`, not a personal Gmail. This account becomes the **Account Holder**.
3. **A company website on the same domain as that email** (`drjoshis.in`).
4. **You have legal authority to bind the company.** Apple usually phones the contact to verify.
   Answer that call, or the enrolment stalls.

Enrol at https://developer.apple.com/programs/enroll/. The **Apple Developer app** on an iPhone is
usually the fastest route, and in India it lets you pay in INR. Choose **Company / Organization**,
enter the D-U-N-S, pay, and wait for approval (typically 2 days to 2 weeks).

After approval, go to App Store Connect → **Business** and sign the **Free Apps agreement**. Tax
and banking details are only needed for paid apps or in-app purchase; this app has neither.

## 2. Register the app

At https://appstoreconnect.apple.com, go to **Apps → + → New App**:

- Platform **iOS**, Name **Dr. Joshi's**, primary language **English (India)** or English (U.S.)
- Bundle ID: pick `in.drjoshis.jclinic.patient`. If it is not listed, create it first under
  developer.apple.com → Identifiers, or let step 3 create it.
- SKU: `jclinic-patient` (internal, never shown)
- User access: Full

Note the numeric **Apple ID** of the app (App Information page). It goes into `eas.json` in step 4.

## 3. First build: credentials and push

```bash
cd "JClinic App"
npm run verify
eas login                   # the drjoshi000s-team account
npm run build:appstore
```

The first iOS store build is interactive. Sign in with the Apple Account from step 1 when EAS asks,
and answer **yes** to each of these prompts:
- create/register the **bundle identifier**,
- generate a **Distribution Certificate** and **App Store provisioning profile**,
- generate an **Apple Push Notifications key** (APNs). **This one is essential.** Without it, dose
  reminders never reach iPhones. EAS stores the key and Expo's push service uses it automatically.

Later builds reuse all of it and are non-interactive. `eas credentials` shows or rotates them.

## 4. Upload

Add the App Store Connect app id to `eas.json` once:

```json
"submit": {
  "production": {
    "ios": { "ascAppId": "<the numeric Apple ID from step 2>" }
  }
}
```

Then:

```bash
npm run submit:appstore
```

The build appears in App Store Connect → **TestFlight** after about 10–30 minutes of processing.

## 5. TestFlight

Add yourself and clinic staff as **Internal Testers** (up to 100, no review needed). Install
through the TestFlight app and check the following on a real iPhone:

- the OTP login,
- records, medicines, and chat,
- a lab photo upload (camera permission prompt),
- the UPI button (opens GPay/PhonePe) and Razorpay,
- a **push notification actually arrives**,
- "Delete my account & data" opens the page.

## 6. The App Store listing (version page)

| Field | Value |
|---|---|
| Category | Primary **Medical**, secondary Health & Fitness |
| Subtitle (30) | e.g. *Records, medicines & visits* |
| Promotional text / Description | same substance as the Play listing, written for patients |
| Keywords (100) | e.g. `clinic,ayurveda,medicine reminder,prescription,lab report,appointment` |
| Support URL | a page with clinic contact details (e.g. https://clinic.drjoshis.in) |
| Privacy Policy URL | https://clinic.drjoshis.in/legal/privacy |
| Copyright | `2026 <legal entity name exactly as on D-U-N-S>` |
| Price | Free |
| Availability | **India only**, unless you have a reason to go wider (see the EU note below) |

**Screenshots:** at least one set for the **6.9" iPhone** (1320×2868 or 1290×2796 portrait). You
can take them on an iPhone 15/16 Pro Max or in any simulator of that size. Apple scales them down
for smaller phones, so no other sizes are required. Upload 3 to 10: Home, Medicines, a visit
record, Chat, Book.

**App icon:** taken from the build. You don't upload one separately.

**Age rating:** fill in the questionnaire honestly. "Medical or treatment information" is present.
It will likely come out 13+ or so; accept whatever it gives.

**EU (Digital Services Act):** if the app is offered in any EU country, Apple requires you to
declare **trader status** and publish an address, phone, and email on the listing. Limiting
availability to India avoids this.

## 7. App Privacy ("nutrition labels")

App Store Connect → **App Privacy**. Answer from what the app actually does. The answers are the
same as Play's Data safety form:

| Data type | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| Contact info: name, phone, email | Yes | Yes | No | App functionality |
| **Health & fitness: health** | Yes | Yes | No | App functionality |
| Photos (lab report uploads) | Yes | Yes | No | App functionality |
| User content: messages to the clinic | Yes | Yes | No | App functionality |
| Identifiers: device / push token | Yes | Yes | No | App functionality |
| Purchases (visiting-charge payment) | Yes | Yes | No | App functionality |

The app has **no tracking**, so no App Tracking Transparency prompt is needed.

## 8. Submit for review

On the version page: select the build, then fill in **App Review Information**:

- **Sign-in required: yes.** Enable the review bypass on the VPS first (`PLAYSTORE.md` §6), then
  give the reviewer the demo number and fixed code set in `REVIEW_OTP_PHONE` / `REVIEW_OTP_CODE`
  on the server. Neither is written down in this repository: while the bypass is armed the pair is
  a working login to a real patient's record.
- **Notes:** paste something like this:

  > Dr. Joshi's is the patient app of a registered clinic (<legal entity>). Patients view their own
  > medical records, medicine schedules, lab results, and appointments, and message the clinic.
  > Login is by SMS OTP; the demo number above accepts the fixed code without an SMS. The app gives
  > no diagnosis. All clinical content is entered by the clinic's own doctors. The payment screen
  > collects the clinic's in-person visiting charge (a physical service) via UPI/Razorpay, so
  > in-app purchase does not apply (guideline 3.1.3(e)). Account deletion: Home → "Delete my
  > account & data".

- Contact name, phone, email: someone who will answer during the review.

Click **Add for Review → Submit**. A first review usually takes 1–3 days. If you're rejected, reply
in the Resolution Center rather than resubmitting blindly. Turn the OTP bypass back off once the
app is approved.

### After it is live

```
MOBILE_STORE_URL_IOS=https://apps.apple.com/app/id<app id>
```

(on the VPS, next to the Android URL), then restart the api.

Updates: bump `version` in `app.config.ts` when you want a new public version number, run
`npm run build:appstore && npm run submit:appstore`, then create a new version in App Store
Connect and submit it.

---

## Review risks to fix or be ready for

1. **Account deletion (guideline 5.1.1(v)).** Apple wants deletion to be *initiated in the app*. A
   button that opens a page telling people to email care@ is the weakest acceptable form and is
   sometimes rejected. Healthcare apps may keep a human verification step, but the lowest-risk
   version is an in-app "Request deletion" button that files the request through the API (or a web
   form), followed by a confirmation.
2. **Unused permission strings.** `NSFaceIDUsageDescription` (and Android's `USE_BIOMETRIC` /
   `USE_FINGERPRINT`) are declared, but no biometric unlock exists in the code, and the photo
   library is never opened (lab upload uses the camera only). Either implement those features or
   remove the declarations. A reviewer who reads "unlock with Face ID" and finds no such feature
   can reject under 2.1 or 5.1.1.
3. **Medical app scrutiny (1.4.1).** Be ready to show that the clinic is a real, registered entity,
   for example with a registration certificate. The developer name on the store will be the
   D-U-N-S legal name.
