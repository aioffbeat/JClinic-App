/**
 * Dr. Joshi's design tokens for the mobile apps.
 *
 * Transcribed from BRAND.md in the jclinic repo, which is also the source of the CSS variables in
 * apps/web/src/styles.css. Kept as a hand-maintained copy rather than synced: styles.css is CSS
 * custom properties that React Native cannot read, so there is nothing to share mechanically.
 * If a brand colour changes, it changes in BRAND.md first and then here.
 */

export const color = {
  // --- core ---
  /** Primary dark — headers, headings, deep surfaces. The wordmark colour. */
  petrolInk: '#10333A',
  /** Primary brand — buttons, links, active states, focus rings. */
  teal: '#119DA4',
  /** Gradient end, highlights, pressed states. */
  tealBright: '#16B5AE',

  // --- specialty accents (also the chart series palette) ---
  leafGreen: '#3FA34D',
  lime: '#BFD23F',
  royalBlue: '#2D6CDF',
  plumViolet: '#7C4DBC',
  marigold: '#E0A93B',
  coral: '#E2725B',

  // --- neutrals ---
  /** App background — mint-tinted off-white. */
  mist: '#F2F7F6',
  surface: '#FFFFFF',
  hairline: '#E4EDEB',
  ink: '#15303A',
  slate: '#5E7480',

  // --- semantic ---
  success: '#2E9E5B',
  warning: '#D98A1F',
  /** Soft coral-red, deliberately not a harsh alarm red. */
  danger: '#D75A54',
  info: '#2D6CDF',
} as const;

/**
 * Chart / category series order.
 *
 * Same order as PALETTE in apps/web/src/charts.tsx so a patient's biomarker line is the same colour
 * on the phone as on the doctor's screen. That consistency is the whole point of fixing an order.
 */
export const series = [
  color.teal,
  color.royalBlue,
  color.leafGreen,
  color.plumViolet,
  color.marigold,
  color.coral,
  color.lime,
] as const;

/** Biomarker flag colours — must match the web's FLAG map in Portal.tsx. */
export const flag = {
  normal: color.success,
  low: color.warning,
  high: color.warning,
  abnormal: color.warning,
  critical_low: color.danger,
  critical_high: color.danger,
} as const;

/** 4pt scale. Every margin and padding in the apps should come from here. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  /** Inputs and buttons. */
  control: 10,
  /** Cards. */
  card: 16,
  /** Pills and chips. */
  pill: 999,
} as const;

/**
 * Card elevation.
 *
 * iOS takes the shadow* properties, Android only reads `elevation` — both are set so a card does
 * not silently render flat on one platform. The values approximate BRAND.md's
 * `0 1px 2px rgba(16,51,58,.04), 0 10px 28px -14px rgba(16,51,58,.12)`; RN supports a single
 * shadow, so this is the large soft one, which is the part that reads.
 */
export const shadow = {
  card: {
    shadowColor: color.petrolInk,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
} as const;

/**
 * Type scale.
 *
 * No custom font is loaded: Inter is the brand face on the web, but shipping it here would add a
 * bundled font file and a load-blocking step at launch for a difference few will notice on a phone.
 * The system face (San Francisco / Roboto) is what users already read everything else in.
 */
export const type = {
  display: { fontSize: 28, fontWeight: '700', letterSpacing: -0.3, color: color.petrolInk },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2, color: color.petrolInk },
  heading: { fontSize: 17, fontWeight: '600', color: color.ink },
  body: { fontSize: 15, fontWeight: '400', color: color.ink },
  label: { fontSize: 13, fontWeight: '600', color: color.slate },
  caption: { fontSize: 12, fontWeight: '400', color: color.slate },
} as const;

/**
 * Minimum touch target.
 *
 * 44pt is Apple's HIG floor and what styles.css already enforces at its 860px breakpoint. Inputs
 * additionally need a >=16px font on iOS or Safari zooms on focus — irrelevant natively, but the
 * sizing is kept the same so the two surfaces feel alike.
 */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 44;

export const theme = { color, series, flag, space, radius, shadow, type, MIN_TOUCH, HIT_SLOP } as const;
export type Theme = typeof theme;
