import { memo, type ReactElement } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import type { NormalizedControlledValue } from '../internal/controlled-domain';
import {
  projectTransitionPresentationActor,
  type ProjectedTransitionPresentationActor,
  type TransitionPresentationActorKind,
} from '../internal/transition-presentation';
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
  readonly draggingPieceGhostStyle: Readonly<ViewStyle>;
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly pieceRenderers: PieceRenderers;
  readonly pendingSourceSquare?: SquareId | null;
  readonly position: NormalizedControlledValue<PositionObject> | null;
  readonly style: Readonly<ViewStyle>;
  readonly transition?: Readonly<MountedPositionTransition> | null;
}

const EMPTY_PIECE_LAYOUTS: readonly Readonly<BoardPieceLayout>[] =
  Object.freeze([]);

export type PieceTransitionVisual = Readonly<
  ProjectedTransitionPresentationActor & {
    readonly kind: TransitionPresentationActorKind;
  }
>;

export interface DetachedReplacementLayout extends BoardPieceLayout {
  readonly transition: Readonly<PieceTransitionVisual>;
}

export interface PieceTransitionProjection {
  readonly current: ReadonlyMap<SquareId, Readonly<PieceTransitionVisual>>;
  readonly exits: readonly Readonly<DetachedReplacementLayout>[];
  readonly replacements: readonly Readonly<DetachedReplacementLayout>[];
}

const EMPTY_DETACHED_LAYOUTS: readonly Readonly<DetachedReplacementLayout>[] =
  Object.freeze([]);

const EMPTY_TRANSITION_PROJECTION: Readonly<PieceTransitionProjection> =
  Object.freeze({
    current: new Map(),
    exits: EMPTY_DETACHED_LAYOUTS,
    replacements: EMPTY_DETACHED_LAYOUTS,
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
  for (const actor of transition.presentation.current) {
    const projected = projectTransitionPresentationActor(actor, layout);
    if (projected !== null) {
      current.set(
        actor.currentSquare,
        Object.freeze({ ...projected, kind: actor.kind }),
      );
    }
  }

  const replacements: Readonly<DetachedReplacementLayout>[] = [];
  const exits: Readonly<DetachedReplacementLayout>[] = [];
  for (const actor of transition.presentation.detached) {
    const actorProjection = projectTransitionPresentationActor(actor, layout);
    if (actorProjection === null) {
      continue;
    }
    const pieceLayout = boardPieceLayoutAtSquare(
      layout,
      actor.rendererSquare,
      actor.piece,
      actor.actorKey,
    );
    if (pieceLayout === null) {
      continue;
    }
    const projected = Object.freeze({
      ...pieceLayout,
      transition: Object.freeze({ ...actorProjection, kind: actor.kind }),
    });
    if (actor.kind === 'replace-exit') {
      replacements.push(projected);
    } else {
      exits.push(projected);
    }
  }

  return Object.freeze({
    current,
    exits: exits.length === 0 ? EMPTY_DETACHED_LAYOUTS : Object.freeze(exits),
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
    previous.draggingPieceGhostStyle === next.draggingPieceGhostStyle &&
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
  const opacity =
    transition.startOpacity +
    (transition.endOpacity - transition.startOpacity) * amount;
  const translateX =
    transition.startTranslateX +
    (transition.endTranslateX - transition.startTranslateX) * amount;
  const translateY =
    transition.startTranslateY +
    (transition.endTranslateY - transition.startTranslateY) * amount;
  const hasTranslation =
    transition.startTranslateX !== 0 ||
    transition.startTranslateY !== 0 ||
    transition.endTranslateX !== 0 ||
    transition.endTranslateY !== 0;
  return {
    opacity: baseOpacity * opacity,
    transform: hasTranslation ? [{ translateX }, { translateY }] : undefined,
  };
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
  readonly draggingPieceGhostStyle: Readonly<ViewStyle>;
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
  draggingPieceGhostStyle,
  isDragSource,
  isPendingSource,
  layout,
  progress,
  renderer: Renderer,
  style,
  transition,
}: BoardPieceHostProps): ReactElement {
  const resolvedStyle = isDragSource ? draggingPieceGhostStyle : style;
  const baseOpacity =
    isPendingSource && !isDragSource
      ? 0.45
      : typeof resolvedStyle.opacity === 'number'
        ? resolvedStyle.opacity
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
    style: resolvedStyle,
  };

  return (
    <Animated.View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        resolvedStyle,
        PIECE_HOST_STRUCTURAL_RESET,
        {
          height: layout.rect.height,
          left: layout.rect.left,
          top: layout.rect.top,
          width: layout.rect.width,
        },
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
  draggingPieceGhostStyle,
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
            draggingPieceGhostStyle={draggingPieceGhostStyle}
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
      {transitionProjection.replacements.map((pieceLayout) => {
        const Renderer = resolvePieceRenderer(
          pieceRenderers,
          pieceLayout.piece.pieceType,
        );
        return Renderer === null ? null : (
          <BoardPieceHost
            boardId={boardId}
            draggingPieceGhostStyle={draggingPieceGhostStyle}
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
            draggingPieceGhostStyle={draggingPieceGhostStyle}
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
});
