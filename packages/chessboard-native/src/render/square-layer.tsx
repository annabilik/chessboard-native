import { memo, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import type { NormalizedControlledValue } from '../internal/controlled-domain';
import type {
  ChessboardStyles,
  ChessboardTheme,
  PlainSelection,
  PositionObject,
  SquareId,
  SquareRenderer,
  SquareRendererProps,
  SquareStyles,
  SquareVisualState,
} from '../public-types';
import type { BoardSurfaceLayout } from './board-layout';
import { resolveSquareStyle } from './style-resolution';

interface SquareLayerProps {
  readonly boardId: string;
  readonly dropTargetSquare?: SquareId | null | undefined;
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly pendingSourceSquare?: SquareId | null | undefined;
  readonly pendingTargetSquare?: SquareId | null | undefined;
  readonly position: NormalizedControlledValue<PositionObject> | null;
  readonly pressedSquare?: SquareId | null | undefined;
  readonly renderSquare?: SquareRenderer | undefined;
  readonly selection: NormalizedControlledValue<
    Readonly<PlainSelection>
  > | null;
  readonly squareStyles?: SquareStyles | undefined;
  readonly styles?: ChessboardStyles | undefined;
  readonly theme?: ChessboardTheme | undefined;
}

/** Measured, visual-only canonical square paint and custom content layer. */
export const SquareLayer = memo(function SquareLayer({
  boardId,
  dropTargetSquare = null,
  layout,
  pendingSourceSquare = null,
  pendingTargetSquare = null,
  position,
  pressedSquare = null,
  renderSquare,
  selection,
  squareStyles,
  styles,
  theme,
}: SquareLayerProps): ReactElement {
  const controlledSelection = selection?.value;
  const destinationSquares = new Set(controlledSelection?.destinationSquares);
  const disabledSquares = new Set(controlledSelection?.disabledSquares);
  const Renderer = renderSquare;

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {layout.cells.map((cell) => {
        const state: Readonly<SquareVisualState> = Object.freeze({
          isDestination: destinationSquares.has(cell.square),
          isDisabled: disabledSquares.has(cell.square),
          isDropTarget: dropTargetSquare === cell.square,
          isPendingSource: pendingSourceSquare === cell.square,
          isPendingTarget: pendingTargetSquare === cell.square,
          isPressed: pressedSquare === cell.square,
          isSelected: controlledSelection?.selectedSquare === cell.square,
        });
        const squareStyle = resolveSquareStyle({
          isLight: cell.isLight,
          square: cell.square,
          squareStyles,
          state,
          styles,
          theme,
        });
        const rendererProps: Readonly<SquareRendererProps> | null =
          Renderer === undefined
            ? null
            : Object.freeze({
                boardId,
                piece: position?.value[cell.square] ?? null,
                size: Math.min(cell.rect.height, cell.rect.width),
                square: cell.square,
                state,
                style: squareStyle,
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
            >
              {Renderer === undefined || rendererProps === null ? null : (
                <Renderer {...rendererProps} />
              )}
            </View>
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
