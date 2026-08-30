import { memo, useLayoutEffect, useMemo, type ReactElement } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import type { NormalizedControlledValue } from '../internal/controlled-domain';
import type {
  PendingCommitHandoffDescriptor,
  PendingCommitTransitionAcknowledgement,
} from '../internal/pending-commit-handoff';
import {
  MAX_TRANSITION_PRESENTATION_RESIDUALS,
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
import { useTransitionHostRetirement } from './use-transition-host-retirement';

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
  /** Exact pending actor retained while its controlled target is prepared. */
  readonly pendingCommitPreparation?: Readonly<PendingCommitHandoffDescriptor> | null;
  readonly onPendingCommitCanonicalPrepared?: (
    acknowledgement: Readonly<PendingCommitTransitionAcknowledgement>,
    prepared: boolean,
  ) => void;
  readonly pendingCommitTransitionReady?: Readonly<PendingCommitTransitionAcknowledgement> | null;
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
    previous.pendingCommitPreparation === next.pendingCommitPreparation &&
    previous.onPendingCommitCanonicalPrepared ===
      next.onPendingCommitCanonicalPrepared &&
    previous.pendingCommitTransitionReady ===
      next.pendingCommitTransitionReady &&
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
  readonly isPendingCommitTarget: boolean;
  readonly isPendingSource: boolean;
  readonly layout: Readonly<BoardPieceLayout>;
  readonly progress: SharedValue<number> | null;
  readonly quiescent: boolean;
  /** This mounted native lifetime has owned Reanimated props. */
  readonly nativeDrain: boolean;
  readonly renderer: PieceRenderer;
  readonly style: Readonly<ViewStyle>;
  readonly transition: Readonly<PieceTransitionVisual> | null;
}

function boardPieceHostLayoutStyle(
  layout: Readonly<BoardPieceLayout>,
): Readonly<ViewStyle> {
  return {
    height: layout.rect.height,
    left: layout.rect.left,
    top: layout.rect.top,
    width: layout.rect.width,
  };
}

function BoardPieceHost({
  boardId,
  draggingPieceGhostStyle,
  isDragSource,
  isPendingCommitTarget,
  isPendingSource,
  layout,
  progress,
  quiescent,
  nativeDrain,
  renderer: Renderer,
  style,
  transition,
}: BoardPieceHostProps): ReactElement {
  const resolvedStyle = isDragSource ? draggingPieceGhostStyle : style;
  const resolvedOpacity =
    typeof resolvedStyle.opacity === 'number' ? resolvedStyle.opacity : 1;
  const canonicalOpacity =
    typeof style.opacity === 'number' ? style.opacity : 1;
  const dragSourceIsHardOccluded = isDragSource && resolvedOpacity === 0;
  const baseOpacity =
    isPendingSource && !isDragSource
      ? 0.45
      : dragSourceIsHardOccluded
        ? canonicalOpacity
        : resolvedOpacity;
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
      collapsable={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        resolvedStyle,
        PIECE_HOST_STRUCTURAL_RESET,
        boardPieceHostLayoutStyle(layout),
        quiescent
          ? styles.quiescent
          : nativeDrain
            ? animatedStyle
            : { opacity: baseOpacity },
      ]}
    >
      {quiescent ? null : (
        <View
          collapsable={false}
          style={[
            styles.pieceContent,
            isPendingCommitTarget || dragSourceIsHardOccluded
              ? styles.hardOcclusion
              : null,
          ]}
        >
          <Renderer {...rendererProps} />
        </View>
      )}
    </Animated.View>
  );
}

interface BoardPieceHostDescriptor {
  readonly canonical: boolean;
  readonly isDragSource: boolean;
  readonly isPendingCommitPreparationTarget: boolean;
  readonly isPendingCommitTarget: boolean;
  readonly isPendingSource: boolean;
  readonly key: string;
  readonly layout: Readonly<BoardPieceLayout>;
  readonly nativeDrainToken: string | null;
  readonly progress: SharedValue<number> | null;
  readonly renderer: PieceRenderer;
  readonly transition: Readonly<PieceTransitionVisual> | null;
}

/**
 * Maximum simultaneous registry-backed PieceLayer actors for one board.
 *
 * At most one current and one semantic detached actor can originate from each
 * cell, plus the library-wide bounded interruption residuals.
 */
export function pieceLayerNativeDrainHostBudget(cellCount: number): number {
  return cellCount * 2 + MAX_TRANSITION_PRESENTATION_RESIDUALS;
}

/** Board-owned decorative piece plane above squares and below annotations. */
export const PieceLayer = memo(function PieceLayer({
  boardId,
  dragSourceSquare = null,
  draggingPieceGhostStyle,
  layout,
  pendingCommitPreparation = null,
  onPendingCommitCanonicalPrepared,
  pendingCommitTransitionReady = null,
  pieceRenderers,
  pendingSourceSquare = null,
  position,
  style,
  transition = null,
}: PieceLayerProps): ReactElement {
  const pieces = useMemo(
    () => createBoardPieceLayouts(layout, position?.value ?? null),
    [layout, position?.value],
  );
  const transitionProjection = useMemo(
    () => createPieceTransitionProjection(layout, transition),
    [layout, transition],
  );
  const directPendingCommitTargetSquare =
    pendingCommitPreparation !== null &&
    pendingCommitPreparation.boardId === boardId &&
    pendingCommitPreparation.targetSquare !== null &&
    position?.revision === pendingCommitPreparation.toRevision
      ? pendingCommitPreparation.targetSquare
      : null;
  const pendingTransitionActor = transition?.presentation.pending.find(
    ({ kind }) => kind === 'pending-handoff',
  );
  const pendingTransitionIsReady =
    pendingTransitionActor !== undefined &&
    transition !== null &&
    pendingCommitTransitionReady?.actorKey ===
      pendingTransitionActor.actorKey &&
    pendingCommitTransitionReady.presentationEpoch ===
      transition.presentation.epoch;
  const transitionPendingCommitTargetSquare =
    pendingTransitionActor !== undefined && !pendingTransitionIsReady
      ? pendingTransitionActor.rendererSquare
      : null;
  const liveHosts = useMemo(() => {
    const hosts: Readonly<BoardPieceHostDescriptor>[] = [];
    const appendDetached = (
      pieceLayout: Readonly<DetachedReplacementLayout>,
      role: 'exit' | 'replacement',
    ): void => {
      const renderer = resolvePieceRenderer(
        pieceRenderers,
        pieceLayout.piece.pieceType,
      );
      if (renderer === null) {
        return;
      }
      hosts.push(
        Object.freeze({
          canonical: false,
          isDragSource: false,
          isPendingCommitPreparationTarget: false,
          isPendingCommitTarget: false,
          isPendingSource: false,
          key: `${role}:${pieceLayout.key}`,
          layout: pieceLayout,
          nativeDrainToken:
            transition === null
              ? null
              : `transition:${String(transition.presentation.epoch)}`,
          progress: transition?.progress ?? null,
          renderer,
          transition: pieceLayout.transition,
        }),
      );
    };
    for (const pieceLayout of transitionProjection.exits) {
      appendDetached(pieceLayout, 'exit');
    }
    for (const pieceLayout of transitionProjection.replacements) {
      appendDetached(pieceLayout, 'replacement');
    }
    for (const pieceLayout of pieces) {
      const renderer = resolvePieceRenderer(
        pieceRenderers,
        pieceLayout.piece.pieceType,
      );
      if (renderer === null) {
        continue;
      }
      const isDragSource = pieceLayout.square === dragSourceSquare;
      const isPendingSource = pieceLayout.square === pendingSourceSquare;
      const isPendingCommitPreparationTarget =
        pieceLayout.square === directPendingCommitTargetSquare;
      const isPendingCommitTarget =
        isPendingCommitPreparationTarget ||
        pieceLayout.square === transitionPendingCommitTargetSquare;
      hosts.push(
        Object.freeze({
          canonical: true,
          isDragSource,
          isPendingCommitPreparationTarget,
          isPendingCommitTarget,
          isPendingSource,
          key: `current:${pieceLayout.key}`,
          layout: pieceLayout,
          nativeDrainToken:
            transitionProjection.current.has(pieceLayout.square) &&
            transition !== null
              ? `transition:${String(transition.presentation.epoch)}`
              : isPendingCommitPreparationTarget &&
                  pendingCommitPreparation !== null
                ? `pending-commit:${String(pendingCommitPreparation.epoch)}:${pendingCommitPreparation.intentId}`
                : (isDragSource || isPendingSource) && position !== null
                  ? `interaction-source:${String(position.revision)}:${pieceLayout.square}`
                  : null,
          progress: transition?.progress ?? null,
          renderer,
          transition:
            transitionProjection.current.get(pieceLayout.square) ?? null,
        }),
      );
    }
    return Object.freeze(hosts);
  }, [
    dragSourceSquare,
    directPendingCommitTargetSquare,
    pendingCommitPreparation,
    pendingSourceSquare,
    pieceRenderers,
    pieces,
    position,
    transition?.progress,
    transitionPendingCommitTargetSquare,
    transitionProjection,
  ]);
  const displayedHosts = useTransitionHostRetirement(
    liveHosts,
    pieceLayerNativeDrainHostBudget(layout.cells.length),
  );
  const pendingCanonicalHostPrepared =
    pendingTransitionActor !== undefined &&
    displayedHosts.some(
      ({ descriptor, nativeDrain, quiescent }) =>
        nativeDrain &&
        !quiescent &&
        descriptor.canonical &&
        descriptor.layout.square === pendingTransitionActor.rendererSquare &&
        transitionProjection.current.has(descriptor.layout.square),
    );
  useLayoutEffect(() => {
    if (
      !pendingCanonicalHostPrepared ||
      transition === null ||
      onPendingCommitCanonicalPrepared === undefined
    ) {
      return;
    }
    const acknowledgement = Object.freeze({
      actorKey: pendingTransitionActor.actorKey,
      presentationEpoch: transition.presentation.epoch,
    });
    onPendingCommitCanonicalPrepared(acknowledgement, true);
    return () => {
      onPendingCommitCanonicalPrepared(acknowledgement, false);
    };
  }, [
    onPendingCommitCanonicalPrepared,
    pendingCanonicalHostPrepared,
    pendingTransitionActor?.actorKey,
    transition?.presentation.epoch,
  ]);

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.layer}
    >
      {displayedHosts.map(({ descriptor, nativeDrain, quiescent }) =>
        !nativeDrain && !descriptor.canonical ? null : (
          <BoardPieceHost
            boardId={boardId}
            draggingPieceGhostStyle={draggingPieceGhostStyle}
            isDragSource={descriptor.isDragSource}
            isPendingCommitTarget={descriptor.isPendingCommitTarget}
            isPendingSource={descriptor.isPendingSource}
            key={descriptor.key}
            layout={descriptor.layout}
            progress={nativeDrain ? descriptor.progress : null}
            quiescent={quiescent}
            nativeDrain={nativeDrain}
            renderer={descriptor.renderer}
            style={style}
            transition={nativeDrain ? descriptor.transition : null}
          />
        ),
      )}
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
  quiescent: {
    opacity: 0,
  },
  hardOcclusion: {
    opacity: 0,
  },
  pieceContent: {
    height: '100%',
    width: '100%',
  },
});
