import type { ExpoConfig } from 'expo/config';

/**
 * The patient app.
 *
 * A separate binary from the staff app, not a role switch inside one. Patients must never see a
 * staff login, the two need different permission manifests (staff asks for the phone dialer for
 * Ozonetel click-to-call; a patient app asking for that would be rejected and rightly so), and
 * Apple reviews a consumer health app very differently from an internal clinical tool. A rejection
 * of one must not block the other.
 */
const config: ExpoConfig = {
  name: "Dr. Joshi's",
  slug: 'jclinic-patient',
  version: '0.1.0',
  orientation: 'portrait',
  // Deep-link scheme. Push payloads carry a target so tapping a dose reminder opens Medicines
  // rather than the home screen.
  scheme: 'drjoshis',
  userInterfaceStyle: 'light',


  ios: {
    bundleIdentifier: 'in.drjoshis.jclinic.patient',
    supportsTablet: false,
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
    package: 'in.drjoshis.jclinic.patient',
    adaptiveIcon: { backgroundColor: '#F2F7F6' },
    // Deliberately minimal. CAMERA is requested by expo-image-picker at the point of use; nothing
    // here asks for contacts, location or storage, and nothing should — Play's Data safety form
    // has to be answered for every permission listed.
    permissions: ['CAMERA', 'POST_NOTIFICATIONS', 'USE_BIOMETRIC', 'USE_FINGERPRINT'],
  },

  plugins: [
    'expo-router',
    // SDK 57 moved splash out of the top-level config and into this plugin.
    ['expo-splash-screen', { backgroundColor: '#F2F7F6', resizeMode: 'contain' }], // Mist, per BRAND.md

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
