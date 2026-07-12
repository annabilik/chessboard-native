import { Fragment, memo, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import type {
  ChessboardStyles,
  ChessboardTheme,
  SquareStyles,
} from '../public-types';
import type { BoardSurfaceLayout } from './board-layout';
import { NotationLayer } from './notation-layer';
import { resolveSquareStyle } from './style-resolution';

interface SquareLayerProps {
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly showNotation: boolean;
  readonly squareStyles?: SquareStyles | undefined;
  readonly styles?: ChessboardStyles | undefined;
  readonly theme?: ChessboardTheme | undefined;
}

/** Measured, visual-only background and notation layer. */
export const SquareLayer = memo(function SquareLayer({
  layout,
  showNotation,
  squareStyles,
  styles,
  theme,
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
        const squareStyle = resolveSquareStyle({
          isLight: cell.isLight,
          square: cell.square,
          squareStyles,
          styles,
          theme,
        });

        return (
          <Fragment key={cell.square}>
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={[internalStyles.squareFrame, cell.rect]}
            >
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
                style={[squareStyle, internalStyles.squarePaint]}
              />
            </View>
            {showNotation &&
            (cell.fileLabel !== null || cell.rankLabel !== null) ? (
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
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
            ) : null}
          </Fragment>
        );
      })}
    </View>
  );
});

const internalStyles = StyleSheet.create({
  notationCell: {
    position: 'absolute',
  },
  squareFrame: {
    position: 'absolute',
  },
  squarePaint: {
    aspectRatio: undefined,
    bottom: 0,
    boxSizing: 'border-box',
    end: undefined,
    flex: undefined,
    flexBasis: undefined,
    flexGrow: 0,
    flexShrink: 0,
    height: undefined,
    inset: undefined,
    insetBlock: undefined,
    insetBlockEnd: undefined,
    insetBlockStart: undefined,
    insetInline: undefined,
    insetInlineEnd: undefined,
    insetInlineStart: undefined,
    left: 0,
    margin: 0,
    marginBlock: 0,
    marginBlockEnd: 0,
    marginBlockStart: 0,
    marginBottom: 0,
    marginEnd: 0,
    marginHorizontal: 0,
    marginInline: 0,
    marginInlineEnd: 0,
    marginInlineStart: 0,
    marginLeft: 0,
    marginRight: 0,
    marginStart: 0,
    marginTop: 0,
    marginVertical: 0,
    maxHeight: undefined,
    maxWidth: undefined,
    minHeight: undefined,
    minWidth: undefined,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    start: undefined,
    top: 0,
    width: undefined,
  },
});
