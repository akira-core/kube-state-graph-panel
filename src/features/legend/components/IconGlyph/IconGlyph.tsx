import { useTheme2 } from '@grafana/ui';
import React from 'react';

import { iconSvgForKind } from '../../../../shared/constants/iconSvgByKind';
import { tintSvgToDataUri } from '../../../../shared/icon/tintSvgToDataUri';
import { themeColors } from '../../../../shared/theme/themeColors';

export interface IconGlyphProps {
  /** Backend node kind; unknown kinds resolve to the fallback glyph. */
  kind: string;
  /** Rendered px (the glyph is square, so this is both width and height). */
  size?: number;
}

// Default legend glyph size (≈1.2× the original 22px for better legibility).
const DEFAULT_SIZE = 26;

// Legend key for a node kind: the same per-kind icon the canvas draws, tinted to
// the theme's secondary text colour so the legend reads as a true key. Rendered
// as an <img> with the inline data-URI (reusing tintSvgToDataUri) so no
// dangerouslySetInnerHTML is needed and the glyph stays crisp.
export function IconGlyph({ kind, size = DEFAULT_SIZE }: Readonly<IconGlyphProps>): React.JSX.Element {
  const theme = useTheme2();
  // Primary text colour so the legend glyph reads as a true key to the canvas icon.
  const src = tintSvgToDataUri(iconSvgForKind(kind), themeColors(theme).text.primary);
  return <img src={src} width={size} height={size} alt={`${kind} icon`} data-testid={`icon-glyph-${kind}`} />;
}
