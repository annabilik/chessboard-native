import { Fragment, type ReactElement } from 'react';
import { StyleSheet, Text } from 'react-native';

const MAX_NOTATION_FONT_SIZE = 13;
const NOTATION_SCALE = 0.325;

interface NotationLayerProps {
  readonly cellHeight: number;
  readonly cellWidth: number;
  readonly color: string;
  readonly fileLabel: string | null;
  readonly rankLabel: string | null;
}

/** Decorative file/rank labels for one measured edge square. */
export function NotationLayer({
  cellHeight,
  cellWidth,
  color,
  fileLabel,
  rankLabel,
}: NotationLayerProps): ReactElement | null {
  if (fileLabel === null && rankLabel === null) {
    return null;
  }

  const fontSize = Math.min(
    MAX_NOTATION_FONT_SIZE,
    Math.min(cellHeight, cellWidth) * NOTATION_SCALE,
  );
  const cellSize = Math.min(cellHeight, cellWidth);
  const textStyle = { color, fontSize, lineHeight: fontSize };

  return (
    <Fragment>
      {rankLabel === null ? null : (
        <Text
          accessible={false}
          allowFontScaling={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[
            styles.label,
            {
              left: Math.min(2, cellSize * 0.08),
              top: Math.min(2, cellSize * 0.08),
            },
            textStyle,
          ]}
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
          style={[
            styles.label,
            {
              bottom: Math.min(1, cellSize * 0.04),
              right: Math.min(3, cellSize * 0.1),
            },
            textStyle,
          ]}
        >
          {fileLabel}
        </Text>
      )}
    </Fragment>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: '700',
    includeFontPadding: false,
    position: 'absolute',
  },
});
