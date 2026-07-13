import { memo, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ChessboardStyles, ChessboardTheme } from '../public-types';
import type { BoardSurfaceLayout } from './board-layout';
import { NotationLayer } from './notation-layer';

interface BoardNotationLayerProps {
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly styles?: ChessboardStyles | undefined;
  readonly theme?: ChessboardTheme | undefined;
}

/** Decorative notation plane above every board-owned annotation. */
export const BoardNotationLayer = memo(function BoardNotationLayer({
  layout,
  styles,
  theme,
}: BoardNotationLayerProps): ReactElement {
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={internalStyles.layer}
    >
      {layout.cells.map((cell) =>
        cell.fileLabel === null && cell.rankLabel === null ? null : (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            key={cell.square}
            pointerEvents="none"
            style={[internalStyles.notationCell, cell.rect]}
          >
            <NotationLayer
              cellHeight={layout.cellHeight}
              cellWidth={layout.cellWidth}
              fileLabel={cell.fileLabel}
              isLight={cell.isLight}
              rankLabel={cell.rankLabel}
              styles={styles}
              theme={theme}
            />
          </View>
        ),
      )}
    </View>
  );
});

const internalStyles = StyleSheet.create({
  layer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 40,
  },
  notationCell: {
    position: 'absolute',
  },
});
