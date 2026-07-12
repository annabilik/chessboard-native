import { Fragment, type ReactElement } from 'react';
import { Text } from 'react-native';

import type { ChessboardStyles, ChessboardTheme } from '../public-types';
import { resolveNotationStyle } from './style-resolution';

interface NotationLayerProps {
  readonly cellHeight: number;
  readonly cellWidth: number;
  readonly fileLabel: string | null;
  readonly isLight: boolean;
  readonly rankLabel: string | null;
  readonly styles?: ChessboardStyles | undefined;
  readonly theme?: ChessboardTheme | undefined;
}

/** Decorative file/rank labels for one measured edge square. */
export function NotationLayer({
  cellHeight,
  cellWidth,
  fileLabel,
  isLight,
  rankLabel,
  styles,
  theme,
}: NotationLayerProps): ReactElement | null {
  if (fileLabel === null && rankLabel === null) {
    return null;
  }

  const rankStyle = resolveNotationStyle({
    axis: 'rank',
    cellHeight,
    cellWidth,
    isLight,
    styles,
    theme,
  });
  const fileStyle = resolveNotationStyle({
    axis: 'file',
    cellHeight,
    cellWidth,
    isLight,
    styles,
    theme,
  });

  return (
    <Fragment>
      {rankLabel === null ? null : (
        <Text
          accessible={false}
          allowFontScaling={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={rankStyle}
        >
          {rankLabel}
        </Text>
      )}
      {fileLabel === null ? null : (
        <Text
          accessible={false}
          allowFontScaling={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={fileStyle}
        >
          {fileLabel}
        </Text>
      )}
    </Fragment>
  );
}
