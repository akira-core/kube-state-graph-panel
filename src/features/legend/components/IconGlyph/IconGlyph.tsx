import { useTheme2 } from '@grafana/ui';
import React from 'react';

import { iconSvgForKind } from '../../../../shared/constants/iconSvgByKind';
import { tintSvgToDataUri } from '../../../../shared/icon/tintSvgToDataUri';

export interface IconGlyphProps {
  /** Backend node kind; unknown kinds resolve to the fallback glyph. */
  kind: string;
  /** Rendered px (the glyph is square, so this is both width and height). */
  size?: number;
}

// Legend key for a node kind: the same per-kind icon the canvas draws, tinted to
// the theme's secondary text colour so the legend reads as a true key. Rendered
// as an <img> with the inline data-URI (reusing tintSvgToDataUri) so no
// dangerouslySetInnerHTML is needed and the glyph stays crisp.
export function IconGlyph({ kind, size = 22 }: Readonly<IconGlyphProps>): React.JSX.Element {
  const theme = useTheme2();
  // @grafana/data marks this optional but Grafana always populates it at runtime.
  // Primary text colour so the legend glyph reads as a true key to the canvas icon.
  const colors = theme.colors as unknown as { text: { primary: string } };
  const src = tintSvgToDataUri(iconSvgForKind(kind), colors.text.primary);
  return <img src={src} width={size} height={size} alt={`${kind} icon`} data-testid={`icon-glyph-${kind}`} />;
}
