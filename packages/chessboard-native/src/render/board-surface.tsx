import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { STANDARD_BOARD_DIMENSIONS } from '../core/dimensions';
import type { NormalizedBoardModel } from '../internal/board-model';
import type {
  BoardSize,
  ChessboardStyles,
  ChessboardTheme,
  PieceRenderers,
  SquareStyles,
} from '../public-types';
import { createBoardSurfaceLayout } from './board-layout';
import { PieceLayer } from './piece-layer';
import { SquareLayer } from './square-layer';
import { resolveBoardStyle, resolvePieceStyle } from './style-resolution';

interface MeasuredBoardSize extends BoardSize {
  readonly aspectRatio: number;
}

interface BoardSurfaceProps {
  readonly model: NormalizedBoardModel;
  readonly pieceRenderers: PieceRenderers;
  readonly showNotation: boolean;
  readonly squareStyles: SquareStyles | undefined;
  readonly styles: ChessboardStyles | undefined;
  readonly theme: ChessboardTheme | undefined;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Responsive native host for measured visual board layers. */
export function BoardSurface({
  model,
  pieceRenderers,
  showNotation,
  squareStyles,
  styles,
  theme,
}: BoardSurfaceProps): ReactElement {
  const fallbackDimensions = model.dimensions ?? STANDARD_BOARD_DIMENSIONS;
  const modelColumns = model.dimensions?.columns ?? null;
  const modelRows = model.dimensions?.rows ?? null;
  const currentAspectRatio =
    fallbackDimensions.columns / fallbackDimensions.rows;
  const [measuredSize, setMeasuredSize] =
    useState<Readonly<MeasuredBoardSize> | null>(null);
  const boardStyle = useMemo(
    () => resolveBoardStyle(theme, styles),
    [styles, theme],
  );
  const pieceStyle = useMemo(
    () => resolvePieceStyle(theme, styles),
    [styles, theme],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent): void => {
      const { height, width } = event.nativeEvent.layout;
      if (!isPositiveFinite(width) || !isPositiveFinite(height)) {
        setMeasuredSize((previous) => (previous === null ? previous : null));
        return;
      }

      setMeasuredSize((previous) => {
        if (
          previous?.aspectRatio === currentAspectRatio &&
          previous.width === width &&
          previous.height === height
        ) {
          return previous;
        }
        return Object.freeze({
          aspectRatio: currentAspectRatio,
          height,
          width,
        });
      });
    },
    [currentAspectRatio],
  );

  const activeSize =
    measuredSize?.aspectRatio === currentAspectRatio ? measuredSize : null;
  const layout = useMemo(() => {
    if (
      activeSize === null ||
      modelColumns === null ||
      modelRows === null ||
      model.orientation === null
    ) {
      return null;
    }
    return createBoardSurfaceLayout(
      activeSize,
      { columns: modelColumns, rows: modelRows },
      model.orientation,
    );
  }, [activeSize, modelColumns, model.orientation, modelRows]);

  return (
    <View
      accessibilityState={{ disabled: model.status === 'disabled' }}
      accessible={false}
      collapsable={false}
      onLayout={handleLayout}
      pointerEvents="none"
      style={[
        boardStyle,
        internalStyles.host,
        {
          aspectRatio: currentAspectRatio,
          flexBasis: undefined,
          flexGrow: 0,
          flexShrink: 0,
          height: undefined,
          maxHeight: undefined,
          maxWidth: undefined,
          minHeight: undefined,
          minWidth: undefined,
          padding: 0,
        },
      ]}
    >
      {layout === null ? null : (
        <>
          <SquareLayer
            layout={layout}
            showNotation={showNotation}
            squareStyles={squareStyles}
            styles={styles}
            theme={theme}
          />
          {model.position === null || model.boardId === null ? null : (
            <PieceLayer
              boardId={model.boardId}
              layout={layout}
              pieceRenderers={pieceRenderers}
              position={model.position}
              style={pieceStyle}
            />
          )}
        </>
      )}
    </View>
  );
}

const internalStyles = StyleSheet.create({
  host: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
});
