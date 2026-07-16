import { memo, type ReactElement } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import type { NormalizedControlledValue } from '../internal/controlled-domain';
import type { MountedPositionTransition } from '../internal/use-position-transition-runtime';
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
import { PIECE_HOST_STRUCTURAL_RESET } from './piece-host-style';

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
  readonly dragSourceSquare?: SquareId | null;
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly pieceRenderers: PieceRenderers;
  readonly pendingSourceSquare?: SquareId | null;
  readonly position: NormalizedControlledValue<PositionObject> | null;
  readonly style: Readonly<ViewStyle>;
  readonly transition?: Readonly<MountedPositionTransition> | null;
}

const EMPTY_PIECE_LAYOUTS: readonly Readonly<BoardPieceLayout>[] =
  Object.freeze([]);

export type PieceTransitionVisual =
  | Readonly<{
      kind: 'move';
      translateX: number;
      translateY: number;
    }>
  | Readonly<{
      kind: 'replace-enter' | 'replace-exit';
      translateX: number;
      translateY: number;
    }>
  | Readonly<{ kind: 'enter' | 'exit' }>;

export interface DetachedReplacementLayout extends BoardPieceLayout {
  readonly transition: Readonly<PieceTransitionVisual>;
}

export interface PieceTransitionProjection {
  readonly current: ReadonlyMap<SquareId, Readonly<PieceTransitionVisual>>;
  readonly exits: readonly Readonly<BoardPieceLayout>[];
  readonly replacements: readonly Readonly<DetachedReplacementLayout>[];
}

const EMPTY_TRANSITION_PROJECTION: Readonly<PieceTransitionProjection> =
  Object.freeze({
    current: new Map(),
    exits: EMPTY_PIECE_LAYOUTS,
    replacements: Object.freeze([]),
  });

const STATIC_PIECE_STATE: Readonly<PieceVisualState> = Object.freeze({
  isDragging: false,
  isGhost: false,
  isPending: false,
  isPressed: false,
  isTransitioning: false,
});

const PENDING_SOURCE_STATE: Readonly<PieceVisualState> = Object.freeze({
  isDragging: false,
  isGhost: true,
  isPending: true,
  isPressed: false,
  isTransitioning: false,
});

const DRAG_SOURCE_STATE: Readonly<PieceVisualState> = Object.freeze({
  isDragging: false,
  isGhost: true,
  isPending: false,
  isPressed: false,
  isTransitioning: false,
});

const TRANSITIONING_PIECE_STATE: Readonly<PieceVisualState> = Object.freeze({
  isDragging: false,
  isGhost: false,
  isPending: false,
  isPressed: false,
  isTransitioning: true,
});

const TRANSITIONING_PENDING_SOURCE_STATE: Readonly<PieceVisualState> =
  Object.freeze({
    isDragging: false,
    isGhost: true,
    isPending: true,
    isPressed: false,
    isTransitioning: true,
  });

const TRANSITIONING_DRAG_SOURCE_STATE: Readonly<PieceVisualState> =
  Object.freeze({
    isDragging: false,
    isGhost: true,
    isPending: false,
    isPressed: false,
    isTransitioning: true,
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

function boardPieceLayoutAtSquare(
  layout: Readonly<BoardSurfaceLayout>,
  square: SquareId,
  piece: Readonly<PieceData>,
  key: string,
): Readonly<BoardPieceLayout> | null {
  const cell = layout.cells.find((candidate) => candidate.square === square);
  if (cell === undefined) {
    return null;
  }
  const size = Math.min(cell.rect.width, cell.rect.height);
  return Object.freeze({
    key,
    piece,
    rect: Object.freeze({
      height: size,
      left: cell.rect.left + (cell.rect.width - size) / 2,
      top: cell.rect.top + (cell.rect.height - size) / 2,
      width: size,
    }),
    size,
    square,
  });
}

/**
 * Project detached plan operations into the current measured coordinate plane.
 *
 * Current semantic actors always come from the latest position. A detached
 * replacement-before actor may accompany them for presentation only.
 */
export function createPieceTransitionProjection(
  layout: Readonly<BoardSurfaceLayout>,
  transition: Readonly<MountedPositionTransition> | null,
): Readonly<PieceTransitionProjection> {
  if (transition === null) {
    return EMPTY_TRANSITION_PROJECTION;
  }

  const current = new Map<SquareId, Readonly<PieceTransitionVisual>>();
  const cellsBySquare = new Map(
    layout.cells.map((cell) => [cell.square, cell] as const),
  );
  for (const move of transition.plan.moves) {
    const from = cellsBySquare.get(move.from);
    const to = cellsBySquare.get(move.to);
    if (from === undefined || to === undefined) {
      continue;
    }
    current.set(
      move.to,
      Object.freeze({
        kind: 'move' as const,
        translateX: from.rect.left - to.rect.left,
        translateY: from.rect.top - to.rect.top,
      }),
    );
  }
  for (const enter of transition.plan.enters) {
    if (cellsBySquare.has(enter.to)) {
      current.set(enter.to, Object.freeze({ kind: 'enter' as const }));
    }
  }

  const replacements: Readonly<DetachedReplacementLayout>[] = [];
  for (const replacement of transition.plan.replacements) {
    const from = cellsBySquare.get(replacement.from);
    const to = cellsBySquare.get(replacement.to);
    if (from === undefined || to === undefined) {
      continue;
    }
    current.set(
      replacement.to,
      Object.freeze({
        kind: 'replace-enter' as const,
        translateX: from.rect.left - to.rect.left,
        translateY: from.rect.top - to.rect.top,
      }),
    );
    const projected = boardPieceLayoutAtSquare(
      layout,
      replacement.from,
      replacement.before,
      `transition-replace:${String(transition.plan.epoch)}:${replacement.from}:${replacement.to}:${replacement.before.id ?? replacement.before.pieceType}`,
    );
    if (projected !== null) {
      replacements.push(
        Object.freeze({
          ...projected,
          transition: Object.freeze({
            kind: 'replace-exit' as const,
            translateX: to.rect.left - from.rect.left,
            translateY: to.rect.top - from.rect.top,
          }),
        }),
      );
    }
  }

  const exits: Readonly<BoardPieceLayout>[] = [];
  for (const exit of transition.plan.exits) {
    const projected = boardPieceLayoutAtSquare(
      layout,
      exit.from,
      exit.piece,
      `transition-exit:${String(transition.plan.epoch)}:${exit.from}:${exit.piece.id ?? exit.piece.pieceType}`,
    );
    if (projected !== null) {
      exits.push(projected);
    }
  }

  return Object.freeze({
    current,
    exits: exits.length === 0 ? EMPTY_PIECE_LAYOUTS : Object.freeze(exits),
    replacements: Object.freeze(replacements),
  });
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
    previous.dragSourceSquare === next.dragSourceSquare &&
    previous.layout === next.layout &&
    previous.pieceRenderers === next.pieceRenderers &&
    previous.pendingSourceSquare === next.pendingSourceSquare &&
    previous.style === next.style &&
    previous.transition === next.transition &&
    samePositionRevision(previous.position, next.position)
  );
}

function clampProgress(progress: number): number {
  'worklet';
  if (progress <= 0) {
    return 0;
  }
  if (progress >= 1) {
    return 1;
  }
  return progress;
}

/** Pure style resolver shared by Reanimated worklets and deterministic tests. */
export function resolvePieceTransitionAnimatedStyle(
  transition: Readonly<PieceTransitionVisual> | null,
  progress: number,
  baseOpacity: number,
): Readonly<ViewStyle> {
  'worklet';
  const amount = clampProgress(progress);
  if (transition === null) {
    return { opacity: baseOpacity, transform: undefined };
  }
  switch (transition.kind) {
    case 'move':
      return {
        opacity: baseOpacity,
        transform: [
          { translateX: transition.translateX * (1 - amount) },
          { translateY: transition.translateY * (1 - amount) },
        ],
      };
    case 'replace-enter':
      return {
        opacity: baseOpacity * amount,
        transform: [
          { translateX: transition.translateX * (1 - amount) },
          { translateY: transition.translateY * (1 - amount) },
        ],
      };
    case 'replace-exit':
      return {
        opacity: baseOpacity * (1 - amount),
        transform: [
          { translateX: transition.translateX * amount },
          { translateY: transition.translateY * amount },
        ],
      };
    case 'enter':
      return {
        opacity: baseOpacity * amount,
        transform: undefined,
      };
    case 'exit':
      return {
        opacity: baseOpacity * (1 - amount),
        transform: undefined,
      };
  }
}

function visualState(
  isDragSource: boolean,
  isPendingSource: boolean,
  isTransitioning: boolean,
): Readonly<PieceVisualState> {
  if (isDragSource) {
    return isTransitioning
      ? TRANSITIONING_DRAG_SOURCE_STATE
      : DRAG_SOURCE_STATE;
  }
  if (isPendingSource) {
    return isTransitioning
      ? TRANSITIONING_PENDING_SOURCE_STATE
      : PENDING_SOURCE_STATE;
  }
  return isTransitioning ? TRANSITIONING_PIECE_STATE : STATIC_PIECE_STATE;
}

interface BoardPieceHostProps {
  readonly boardId: string;
  readonly isDragSource: boolean;
  readonly isPendingSource: boolean;
  readonly layout: Readonly<BoardPieceLayout>;
  readonly progress: SharedValue<number> | null;
  readonly renderer: PieceRenderer;
  readonly style: Readonly<ViewStyle>;
  readonly transition: Readonly<PieceTransitionVisual> | null;
}

function BoardPieceHost({
  boardId,
  isDragSource,
  isPendingSource,
  layout,
  progress,
  renderer: Renderer,
  style,
  transition,
}: BoardPieceHostProps): ReactElement {
  const baseOpacity =
    isDragSource || isPendingSource
      ? 0.45
      : typeof style.opacity === 'number'
        ? style.opacity
        : 1;
  const animatedStyle = useAnimatedStyle(
    () =>
      resolvePieceTransitionAnimatedStyle(
        transition,
        progress?.value ?? 1,
        baseOpacity,
      ),
    [baseOpacity, progress, transition],
  );
  const rendererProps: PieceRendererProps = {
    boardId,
    piece: layout.piece,
    size: layout.size,
    source: Object.freeze({
      kind: 'board' as const,
      square: layout.square,
    }),
    square: layout.square,
    state: visualState(isDragSource, isPendingSource, transition !== null),
    style,
  };

  return (
    <Animated.View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        style,
        PIECE_HOST_STRUCTURAL_RESET,
        {
          height: layout.rect.height,
          left: layout.rect.left,
          top: layout.rect.top,
          width: layout.rect.width,
        },
        isDragSource || isPendingSource ? styles.sourceGhost : undefined,
        animatedStyle,
      ]}
    >
      <Renderer {...rendererProps} />
    </Animated.View>
  );
}

/** Board-owned decorative piece plane above squares and below annotations. */
export const PieceLayer = memo(function PieceLayer({
  boardId,
  dragSourceSquare = null,
  layout,
  pieceRenderers,
  pendingSourceSquare = null,
  position,
  style,
  transition = null,
}: PieceLayerProps): ReactElement {
  const pieces = createBoardPieceLayouts(layout, position?.value ?? null);
  const transitionProjection = createPieceTransitionProjection(
    layout,
    transition,
  );

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.layer}
    >
      {transitionProjection.exits.map((pieceLayout) => {
        const Renderer = resolvePieceRenderer(
          pieceRenderers,
          pieceLayout.piece.pieceType,
        );
        return Renderer === null ? null : (
          <BoardPieceHost
            boardId={boardId}
            isDragSource={false}
            isPendingSource={false}
            key={pieceLayout.key}
            layout={pieceLayout}
            progress={transition?.progress ?? null}
            renderer={Renderer}
            style={style}
            transition={Object.freeze({ kind: 'exit' as const })}
          />
        );
      })}
      {transitionProjection.replacements.map((pieceLayout) => {
        const Renderer = resolvePieceRenderer(
          pieceRenderers,
          pieceLayout.piece.pieceType,
        );
        return Renderer === null ? null : (
          <BoardPieceHost
            boardId={boardId}
            isDragSource={false}
            isPendingSource={false}
            key={pieceLayout.key}
            layout={pieceLayout}
            progress={transition?.progress ?? null}
            renderer={Renderer}
            style={style}
            transition={pieceLayout.transition}
          />
        );
      })}
      {pieces.map((pieceLayout) => {
        const Renderer = resolvePieceRenderer(
          pieceRenderers,
          pieceLayout.piece.pieceType,
        );
        if (Renderer === null) {
          return null;
        }

        const isDragSource = pieceLayout.square === dragSourceSquare;
        const isPendingSource = pieceLayout.square === pendingSourceSquare;

        return (
          <BoardPieceHost
            boardId={boardId}
            isDragSource={isDragSource}
            isPendingSource={isPendingSource}
            key={pieceLayout.key}
            layout={pieceLayout}
            progress={transition?.progress ?? null}
            renderer={Renderer}
            style={style}
            transition={
              transitionProjection.current.get(pieceLayout.square) ?? null
            }
          />
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
  sourceGhost: {
    opacity: 0.45,
  },
});
