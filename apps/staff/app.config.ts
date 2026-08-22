import type { ExpoConfig } from 'expo/config';

/**
 * The staff app — doctors, front desk, telecallers.
 *
 * Separate from the patient app for the reasons set out in apps/patient/app.config.ts. The two
 * differences that matter operationally are here: this one asks for CALL_PHONE (Ozonetel
 * click-to-dial falls back to the agent's own handset) and it is distributed to clinic staff, not
 * to the public.
 */
const config: ExpoConfig = {
  name: 'JClinic Staff',
  slug: 'jclinic-staff',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'jclinicstaff',
  userInterfaceStyle: 'light',


  ios: {
    bundleIdentifier: 'in.drjoshis.jclinic.staff',
    supportsTablet: true, // consulting rooms use iPads; the patient app does not need this
    infoPlist: {
      NSCameraUsageDescription:
        'Attach a photo or scan to a patient visit record.',
      NSPhotoLibraryUsageDescription:
        'Attach an existing photo or document to a patient visit record.',
      NSFaceIDUsageDescription:
        'Unlock the app so patient records are not exposed if this device is left on a counter.',
    },
  },

  android: {
    package: 'in.drjoshis.jclinic.staff',
    adaptiveIcon: { backgroundColor: '#10333A' },
    // CALL_PHONE is the one permission the patient app must never have: it is what lets a
    // telecaller place an Ozonetel click-to-dial from the lead worklist.
    permissions: ['CAMERA', 'POST_NOTIFICATIONS', 'CALL_PHONE', 'USE_BIOMETRIC', 'USE_FINGERPRINT'],
  },

  plugins: [
    'expo-router',
    // SDK 57 moved splash out of the top-level config and into this plugin.
    ['expo-splash-screen', { backgroundColor: '#10333A', resizeMode: 'contain' }], // Petrol Ink — the staff app leads with the dark brand colour

    'expo-secure-store',
    [
      'expo-notifications',
      {
        color: '#119DA4',
      },
    ],
  ],

  experiments: { typedRoutes: true },

  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID_STAFF ?? undefined },
  },
};

export default config;
