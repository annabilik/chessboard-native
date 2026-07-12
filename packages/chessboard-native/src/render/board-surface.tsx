import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { STANDARD_BOARD_DIMENSIONS } from '../core/dimensions';
import type { NormalizedBoardModel } from '../internal/board-model';
import type { BoardSize } from '../public-types';
import { createBoardSurfaceLayout } from './board-layout';
import { SquareLayer } from './square-layer';

interface MeasuredBoardSize extends BoardSize {
  readonly aspectRatio: number;
}

interface BoardSurfaceProps {
  readonly model: NormalizedBoardModel;
  readonly showNotation: boolean;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Responsive native host for measured visual board layers. */
export function BoardSurface({
  model,
  showNotation,
}: BoardSurfaceProps): ReactElement {
  const fallbackDimensions = model.dimensions ?? STANDARD_BOARD_DIMENSIONS;
  const modelColumns = model.dimensions?.columns ?? null;
  const modelRows = model.dimensions?.rows ?? null;
  const currentAspectRatio =
    fallbackDimensions.columns / fallbackDimensions.rows;
  const [measuredSize, setMeasuredSize] =
    useState<Readonly<MeasuredBoardSize> | null>(null);

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
        styles.host,
        {
          aspectRatio: currentAspectRatio,
        },
      ]}
    >
      {layout === null ? null : (
        <SquareLayer layout={layout} showNotation={showNotation} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    alignSelf: 'flex-start',
    backgroundColor: '#e7e0d2',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
});
