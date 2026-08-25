import Svg, { Path, Rect } from 'react-native-svg';
import { color } from './theme';

/**
 * The portal's icon set, ported from PIcon in apps/web/src/pages/Portal.tsx.
 *
 * The same path data, so a tab in the app is the same glyph as the nav item on the web — and
 * stroked vectors rather than emoji, which render as a different typeface on every Android skin
 * and never match a brand.
 */
export type IconName =
  | 'home' | 'heart' | 'droplet' | 'pill' | 'activity' | 'clipboard' | 'chat' | 'calendar'
  | 'flask' | 'file' | 'users' | 'star' | 'bell' | 'chevron' | 'plus' | 'check';

export function Icon({
  name,
  size = 22,
  tint = color.slate,
  strokeWidth = 1.9,
}: {
  name: IconName;
  size?: number;
  tint?: string;
  strokeWidth?: number;
}) {
  const p = {
    stroke: tint,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {glyph(name, p)}
    </Svg>
  );
}

type P = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: 'none';
};

function glyph(name: IconName, p: P) {
  switch (name) {
    case 'home':
      return (
        <>
          <Path {...p} d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <Path {...p} d="M9 22V12h6v10" />
        </>
      );
    case 'heart':
      return <Path {...p} d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />;
    case 'droplet':
      return <Path {...p} d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />;
    case 'pill':
      return (
        <>
          <Rect {...p} x={2.5} y={8.5} width={19} height={7} rx={3.5} transform="rotate(45 12 12)" />
          <Path {...p} d="M8.5 8.5l7 7" />
        </>
      );
    case 'activity':
      return <Path {...p} d="M22 12h-4l-3 9L9 3l-3 9H2" />;
    case 'clipboard':
      return (
        <>
          <Rect {...p} x={8} y={2} width={8} height={4} rx={1} />
          <Path {...p} d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <Path {...p} d="M9 12h6M9 16h6" />
        </>
      );
    case 'chat':
      return <Path {...p} d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />;
    case 'calendar':
      return (
        <>
          <Rect {...p} x={3} y={4} width={18} height={18} rx={2} />
          <Path {...p} d="M16 2v4M8 2v4M3 10h18" />
        </>
      );
    // Drawn in the same stroked style for screens the web reaches by other means.
    case 'flask':
      return <Path {...p} d="M9 2v6L4 19a2 2 0 0 0 1.8 3h12.4A2 2 0 0 0 20 19L15 8V2M8 2h8M7.5 14h9" />;
    case 'file':
      return (
        <>
          <Path {...p} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Path {...p} d="M14 2v6h6M9 13h6M9 17h6" />
        </>
      );
    case 'users':
      return (
        <>
          <Path {...p} d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <Path {...p} d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      );
    case 'star':
      return <Path {...p} d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21.1 7 14.2 2 9.3l6.9-1z" />;
    case 'bell':
      return (
        <>
          <Path {...p} d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <Path {...p} d="M13.7 21a2 2 0 0 1-3.4 0" />
        </>
      );
    case 'chevron':
      return <Path {...p} d="M9 18l6-6-6-6" />;
    case 'plus':
      return <Path {...p} d="M12 5v14M5 12h14" />;
    case 'check':
      return <Path {...p} d="M20 6L9 17l-5-5" />;
  }
}
