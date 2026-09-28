import type { ExpoConfig } from 'expo/config';

/**
 * The patient app.
 *
 * Patients only — there is no staff mode. A clinic-facing app briefly shared this repo and was
 * removed; it lives on the two-app-archive branch.
 */
/**
 * Diagnostic escape hatch: JCLINIC_PACKAGE_SUFFIX changes the applicationId so a build cannot
 * collide with anything already installed under the real package name. Unset in every normal
 * build, so the shipped identity is untouched.
 */
const SUFFIX = process.env.JCLINIC_PACKAGE_SUFFIX ?? '';

const config: ExpoConfig = {
  name: SUFFIX ? `Dr. Joshi's${SUFFIX}` : "Dr. Joshi's",
  slug: 'jclinic-patient',
  version: '0.1.0',
  orientation: 'portrait',
  // Deep-link scheme. Push payloads carry a target so tapping a dose reminder opens Medicines
  // rather than the home screen.
  scheme: 'drjoshis',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',


  ios: {
    bundleIdentifier: `in.drjoshis.jclinic.patient${SUFFIX}`,
    supportsTablet: false,
    // The app only uses HTTPS/TLS from the OS, which is exempt. Declaring it here answers App Store
    // Connect's export-compliance question once, instead of on every uploaded build.
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      // Every string here is shown verbatim in the OS permission dialog, and App Review reads them.
      // Say what the app does with the data, not what the API is called.
      NSCameraUsageDescription:
        'Take a photo of a lab report or prescription to share it with your clinic.',
      NSPhotoLibraryUsageDescription:
        'Attach a lab report you already have saved on your phone.',
      NSFaceIDUsageDescription:
        'Unlock the app with Face ID so your medical records stay private if your phone is left unlocked.',
    },
  },

  android: {
    package: `in.drjoshis.jclinic.patient${SUFFIX}`,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1b3a8f' },
    // Deliberately minimal. CAMERA is requested by expo-image-picker at the point of use; nothing
    // here asks for contacts, location or storage, and nothing should — Play's Data safety form
    // has to be answered for every permission listed.
    permissions: ['CAMERA', 'POST_NOTIFICATIONS', 'USE_BIOMETRIC', 'USE_FINGERPRINT'],
  },

  plugins: [
    'expo-router',
    /**
     * Splash art now exists, so the plugin can be configured again. It was removed earlier because
     * setting a backgroundColor with no image made it emit a reference to a splashscreen_logo
     * drawable it never generated, and Android resource linking failed the release build on the
     * dangling reference. Colour and image go back together, never one without the other.
     */
    [
      'expo-splash-screen',
      { image: './assets/splash.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#F2F7F6' },
    ],

    'expo-secure-store',
    [
      'expo-notifications',
      {
        color: '#119DA4', // Holistic Teal — the notification accent on Android
      },
    ],
  ],

  experiments: { typedRoutes: true },

  // The EAS account that owns the builds and the push credentials.
  owner: 'drjoshi000s-team',

  extra: {
    /**
     * The EAS project. `eas init` normally writes this itself, but it cannot edit a dynamic
     * app.config.ts, so it lives here by hand — the id is stable for the life of the project.
     *
     * It is not decoration: expo-notifications needs it to mint a push token
     * (getExpoPushTokenAsync in src/lib/push.ts), so a missing id means push registration returns
     * `no_project_id` and every reminder silently fails to arrive.
     */
    eas: { projectId: process.env.EAS_PROJECT_ID_PATIENT ?? '64f3b013-d9b0-46b2-8593-e9d923873166' },
  },
};

export default config;
