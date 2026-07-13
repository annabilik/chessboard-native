import { memo, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import type { NormalizedControlledValue } from '../internal/controlled-domain';
import type {
  ChessboardStyles,
  ChessboardTheme,
  PlainSelection,
  SquareStyles,
} from '../public-types';
import type { BoardSurfaceLayout } from './board-layout';
import { resolveSquareStyle } from './style-resolution';

interface SquareLayerProps {
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly selection: NormalizedControlledValue<
    Readonly<PlainSelection>
  > | null;
  readonly squareStyles?: SquareStyles | undefined;
  readonly styles?: ChessboardStyles | undefined;
  readonly theme?: ChessboardTheme | undefined;
}

/** Measured, visual-only background and notation layer. */
export const SquareLayer = memo(function SquareLayer({
  layout,
  selection,
  squareStyles,
  styles,
  theme,
}: SquareLayerProps): ReactElement {
  const controlledSelection = selection?.value;
  const destinationSquares = new Set(controlledSelection?.destinationSquares);
  const disabledSquares = new Set(controlledSelection?.disabledSquares);

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
          state: {
            isDestination: destinationSquares.has(cell.square),
            isDisabled: disabledSquares.has(cell.square),
            isSelected: controlledSelection?.selectedSquare === cell.square,
          },
          styles,
          theme,
        });

        return (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            key={cell.square}
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
        );
      })}
    </View>
  );
});

const internalStyles = StyleSheet.create({
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
