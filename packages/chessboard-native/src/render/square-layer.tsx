import { memo, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import type { BoardSurfaceLayout } from './board-layout';
import { NotationLayer } from './notation-layer';

const DARK_SQUARE_COLOR = '#B58863';
const LIGHT_SQUARE_COLOR = '#F0D9B5';

interface SquareLayerProps {
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly showNotation: boolean;
}

/** Measured, visual-only background and notation layer. */
export const SquareLayer = memo(function SquareLayer({
  layout,
  showNotation,
}: SquareLayerProps): ReactElement {
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {layout.cells.map((cell) => {
        const squareColor = cell.isLight
          ? LIGHT_SQUARE_COLOR
          : DARK_SQUARE_COLOR;
        const notationColor = cell.isLight
          ? DARK_SQUARE_COLOR
          : LIGHT_SQUARE_COLOR;

        return (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            key={cell.square}
            pointerEvents="none"
            style={[styles.square, cell.rect, { backgroundColor: squareColor }]}
          >
            {showNotation &&
            (cell.fileLabel !== null || cell.rankLabel !== null) ? (
              <NotationLayer
                cellHeight={layout.cellHeight}
                cellWidth={layout.cellWidth}
                color={notationColor}
                fileLabel={cell.fileLabel}
                rankLabel={cell.rankLabel}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  square: {
    overflow: 'hidden',
    position: 'absolute',
  },
});
