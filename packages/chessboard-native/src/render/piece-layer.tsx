import { memo, type ReactElement } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import type { NormalizedControlledValue } from '../internal/controlled-domain';
import type {
  PieceData,
  PieceRenderer,
  PieceRendererProps,
  PieceRenderers,
  PieceVisualState,
  PositionObject,
  SquareId,
} from '../public-types';
import type { BoardCellRect, BoardSurfaceLayout } from './board-layout';

/** One current controlled piece projected into measured board-local geometry. */
export interface BoardPieceLayout {
  readonly key: string;
  readonly piece: Readonly<PieceData>;
  readonly rect: Readonly<BoardCellRect>;
  readonly size: number;
  readonly square: SquareId;
}

interface PieceLayerProps {
  readonly boardId: string;
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly pieceRenderers: PieceRenderers;
  readonly position: NormalizedControlledValue<PositionObject> | null;
  readonly style: Readonly<ViewStyle>;
}

const EMPTY_PIECE_LAYOUTS: readonly Readonly<BoardPieceLayout>[] =
  Object.freeze([]);

const STATIC_PIECE_STATE: Readonly<PieceVisualState> = Object.freeze({
  isDragging: false,
  isGhost: false,
  isPending: false,
  isPressed: false,
  isTransitioning: false,
});

/**
 * Project only the latest normalized controlled position into measured cells.
 *
 * Iterating visual cells avoids parsing square IDs, keeps paint order stable,
 * and guarantees that orientation uses the same geometry as every other layer.
 */
export function createBoardPieceLayouts(
  layout: Readonly<BoardSurfaceLayout>,
  position: PositionObject | null,
): readonly Readonly<BoardPieceLayout>[] {
  if (position === null) {
    return EMPTY_PIECE_LAYOUTS;
  }

  const pieces: Readonly<BoardPieceLayout>[] = [];

  for (const cell of layout.cells) {
    const piece = position[cell.square];
    if (piece === undefined) {
      continue;
    }

    const size = Math.min(cell.rect.width, cell.rect.height);
    const left = cell.rect.left + (cell.rect.width - size) / 2;
    const top = cell.rect.top + (cell.rect.height - size) / 2;

    pieces.push(
      Object.freeze({
        key:
          piece.id === undefined ? `square:${cell.square}` : `id:${piece.id}`,
        piece,
        rect: Object.freeze({ height: size, left, top, width: size }),
        size,
        square: cell.square,
      }),
    );
  }

  return pieces.length === 0 ? EMPTY_PIECE_LAYOUTS : Object.freeze(pieces);
}

/** Exact own-key renderer lookup for the deliberately open piece vocabulary. */
export function resolvePieceRenderer(
  pieceRenderers: PieceRenderers,
  pieceType: string,
): PieceRenderer | null {
  try {
    if (!Object.hasOwn(pieceRenderers, pieceType)) {
      return null;
    }

    const renderer: unknown = (
      pieceRenderers as Readonly<Record<string, unknown>>
    )[pieceType];
    if (typeof renderer === 'function') {
      return renderer as PieceRenderer;
    }
    if (typeof renderer !== 'object' || renderer === null) {
      return null;
    }

    const componentType = (renderer as Readonly<{ $$typeof?: unknown }>)
      .$$typeof;
    return componentType === Symbol.for('react.forward_ref') ||
      componentType === Symbol.for('react.lazy') ||
      componentType === Symbol.for('react.memo')
      ? (renderer as PieceRenderer)
      : null;
  } catch {
    return null;
  }
}

function samePositionRevision(
  previous: NormalizedControlledValue<PositionObject> | null,
  next: NormalizedControlledValue<PositionObject> | null,
): boolean {
  if (previous === null || next === null) {
    return previous === next;
  }
  return previous.revision === next.revision && previous.tier === next.tier;
}

function pieceLayerPropsAreEqual(
  previous: PieceLayerProps,
  next: PieceLayerProps,
): boolean {
  return (
    previous.boardId === next.boardId &&
    previous.layout === next.layout &&
    previous.pieceRenderers === next.pieceRenderers &&
    previous.style === next.style &&
    samePositionRevision(previous.position, next.position)
  );
}

/** Board-owned decorative piece plane above squares and below annotations. */
export const PieceLayer = memo(function PieceLayer({
  boardId,
  layout,
  pieceRenderers,
  position,
  style,
}: PieceLayerProps): ReactElement {
  const pieces = createBoardPieceLayouts(layout, position?.value ?? null);

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.layer}
    >
      {pieces.map((pieceLayout) => {
        const Renderer = resolvePieceRenderer(
          pieceRenderers,
          pieceLayout.piece.pieceType,
        );
        if (Renderer === null) {
          return null;
        }

        const rendererProps: PieceRendererProps = {
          boardId,
          piece: pieceLayout.piece,
          size: pieceLayout.size,
          square: pieceLayout.square,
          state: STATIC_PIECE_STATE,
          style,
        };

        return (
          <View
            accessibilityElementsHidden
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            key={pieceLayout.key}
            pointerEvents="none"
            style={[
              style,
              styles.piece,
              {
                aspectRatio: undefined,
                bottom: undefined,
                boxSizing: 'border-box',
                display: 'flex',
                end: undefined,
                flex: undefined,
                flexBasis: undefined,
                flexGrow: 0,
                flexShrink: 0,
                height: pieceLayout.rect.height,
                inset: undefined,
                insetBlock: undefined,
                insetBlockEnd: undefined,
                insetBlockStart: undefined,
                insetInline: undefined,
                insetInlineEnd: undefined,
                insetInlineStart: undefined,
                left: pieceLayout.rect.left,
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
                right: undefined,
                start: undefined,
                top: pieceLayout.rect.top,
                width: pieceLayout.rect.width,
              },
            ]}
          >
            <Renderer {...rendererProps} />
          </View>
        );
      })}
    </View>
  );
}, pieceLayerPropsAreEqual);

const styles = StyleSheet.create({
  layer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
  piece: {
    position: 'absolute',
  },
});
