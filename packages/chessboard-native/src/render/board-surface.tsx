import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useAccessibilityAnnouncement } from '../accessibility/announcements';
import {
  useBoardAccessibility,
  type BoardAccessibilityMoveInteraction,
} from '../accessibility/board-accessibility';
import { announceMoveOutcome } from '../accessibility/move-outcome';
import { STANDARD_BOARD_DIMENSIONS } from '../core/dimensions';
import type { NormalizedBoardModel } from '../internal/board-model';
import type { BoardGestureIntentCandidate } from '../internal/board-gesture-adapter';
import {
  canDragCurrentPiece,
  resolveInteractionPermissions,
} from '../internal/interaction-permissions';
import type {
  InteractionInvalidationReason,
  MoveIntentLifecycle,
} from '../internal/interaction-reducer';
import { useMoveRequestRuntime } from '../internal/use-move-request-runtime';
import type {
  AnnotationStyle,
  BoardSize,
  CanDragPiece,
  ChessboardAccessibility,
  ChessboardStyles,
  ChessboardTheme,
  InteractionPermissions,
  MoveOutcomeAccessibilityContext,
  MoveRequestTimeouts,
  OnMoveRequest,
  PieceRenderers,
  SquareStyles,
} from '../public-types';
import { createBoardSurfaceLayout } from './board-layout';
import { AnnotationLayer } from './annotation-layer';
import { computeAnnotationGeometry } from './annotation-geometry';
import {
  createBoardGeometryEpochMetadata,
  reconcileBoardGeometryEpoch,
  type BoardGeometryEpochMapping,
} from './board-geometry-epoch';
import { BoardInteractionController } from './board-interaction-controller';
import type { BoardGestureGeometry } from './board-gesture-layer';
import { BoardNotationLayer } from './board-notation-layer';
import { PendingMoveLayer } from './pending-move-layer';
import { PieceLayer } from './piece-layer';
import { SquareLayer } from './square-layer';
import { resolveBoardStyle, resolvePieceStyle } from './style-resolution';

interface MeasuredBoardSize extends BoardSize {
  readonly aspectRatio: number;
}

interface BoardSurfaceProps {
  readonly accessibility: ChessboardAccessibility | undefined;
  readonly annotationStyle: Readonly<AnnotationStyle>;
  readonly canDragPiece: CanDragPiece | undefined;
  readonly interactionPermissions: InteractionPermissions | undefined;
  readonly model: NormalizedBoardModel;
  readonly moveRequestTimeouts: MoveRequestTimeouts | undefined;
  readonly onMoveRequest: OnMoveRequest | undefined;
  readonly pieceRenderers: PieceRenderers;
  readonly showNotation: boolean;
  readonly squareStyles: SquareStyles | undefined;
  readonly styles: ChessboardStyles | undefined;
  readonly theme: ChessboardTheme | undefined;
}

interface InteractionInvalidationSnapshot {
  readonly accessibilityEnabled: boolean;
  readonly columns: number | null;
  readonly dragEnabled: boolean;
  readonly geometryRevision: number | null;
  readonly orientation: NormalizedBoardModel['orientation'];
  readonly rows: number | null;
}

type PendingMoveLifecycle = Extract<
  MoveIntentLifecycle,
  { readonly phase: 'deciding' | 'awaiting-commit' }
>;

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function piecesMatch(
  left: Readonly<{ readonly id?: string; readonly pieceType: string }> | null,
  right: Readonly<{ readonly id?: string; readonly pieceType: string }>,
): boolean {
  return (
    left !== null && left.id === right.id && left.pieceType === right.pieceType
  );
}

function currentPendingLifecycle(
  lifecycle: Readonly<MoveIntentLifecycle> | null,
  model: NormalizedBoardModel,
): Readonly<PendingMoveLifecycle> | null {
  if (
    lifecycle === null ||
    (lifecycle.phase !== 'deciding' && lifecycle.phase !== 'awaiting-commit') ||
    model.boardId === null ||
    model.position === null ||
    lifecycle.boardId !== model.boardId ||
    lifecycle.positionRevision !== model.position.revision
  ) {
    return null;
  }
  const source = lifecycle.intent.source;
  if (source.kind !== 'board') {
    return lifecycle;
  }
  return piecesMatch(
    model.position.value[source.square] ?? null,
    lifecycle.intent.piece,
  )
    ? lifecycle
    : null;
}

function invalidationReason(
  previous: Readonly<InteractionInvalidationSnapshot>,
  current: Readonly<InteractionInvalidationSnapshot>,
): InteractionInvalidationReason | null {
  if (
    previous.accessibilityEnabled !== current.accessibilityEnabled ||
    previous.dragEnabled !== current.dragEnabled
  ) {
    return 'permissions-change';
  }
  if (previous.columns !== current.columns || previous.rows !== current.rows) {
    return 'dimensions-change';
  }
  if (previous.orientation !== current.orientation) {
    return 'orientation-change';
  }
  if (
    previous.geometryRevision !== null &&
    previous.geometryRevision !== current.geometryRevision
  ) {
    return 'geometry-change';
  }
  return null;
}

/** Responsive native host for measured visual board layers. */
export function BoardSurface({
  accessibility,
  annotationStyle,
  canDragPiece,
  interactionPermissions,
  model,
  moveRequestTimeouts,
  onMoveRequest,
  pieceRenderers,
  showNotation,
  squareStyles,
  styles,
  theme,
}: BoardSurfaceProps): ReactElement {
  useAccessibilityAnnouncement(accessibility?.announcement);
  const resolvedPermissions = useMemo(
    () => resolveInteractionPermissions(onMoveRequest, interactionPermissions),
    [interactionPermissions, onMoveRequest],
  );
  const interactionReady =
    model.status === 'ready' &&
    model.boardId !== null &&
    model.position !== null;
  const accessibilityMoveEnabled =
    interactionReady && resolvedPermissions.accessibility;
  const dragEnabled = interactionReady && resolvedPermissions.drag;
  const [activeDragSourceSquare, setActiveDragSourceSquare] = useState<
    string | null
  >(null);
  const [
    accessibilitySourceResetRevision,
    setAccessibilitySourceResetRevision,
  ] = useState(0);
  const formatMoveOutcome = accessibility?.formatMoveOutcome;
  const handleMoveOutcome = useCallback(
    (context: Readonly<MoveOutcomeAccessibilityContext>): void => {
      announceMoveOutcome(context, formatMoveOutcome);
    },
    [formatMoveOutcome],
  );
  const moveInteraction = useMoveRequestRuntime({
    boardId: model.boardId,
    onMoveRequest: accessibilityMoveEnabled ? onMoveRequest : undefined,
    onOutcome: handleMoveOutcome,
    position: model.position,
    timeouts: moveRequestTimeouts,
  });
  const handleDragSourceChange = useCallback(
    (sourceSquare: string | null): void => {
      setActiveDragSourceSquare((current) =>
        current === sourceSquare ? current : sourceSquare,
      );
      if (sourceSquare !== null) {
        setAccessibilitySourceResetRevision((current) => current + 1);
        moveInteraction.invalidate('user');
      }
    },
    [moveInteraction.invalidate],
  );
  const accessibilityMoveInteraction = useMemo<
    Readonly<BoardAccessibilityMoveInteraction>
  >(
    () =>
      Object.freeze({
        cancel: moveInteraction.cancel,
        enabled: accessibilityMoveEnabled && activeDragSourceSquare === null,
        lifecycle: moveInteraction.lifecycle,
        request: moveInteraction.request,
        sourceResetRevision: accessibilitySourceResetRevision,
      }),
    [
      accessibilityMoveEnabled,
      accessibilitySourceResetRevision,
      activeDragSourceSquare,
      moveInteraction.cancel,
      moveInteraction.lifecycle,
      moveInteraction.request,
    ],
  );
  const accessibilityProps = useBoardAccessibility(
    model,
    accessibility,
    accessibilityMoveInteraction,
  );
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
  const geometryEpochMapping =
    useMemo<Readonly<BoardGeometryEpochMapping> | null>(() => {
      if (layout === null) {
        return null;
      }
      return Object.freeze({
        columns: layout.dimensions.columns,
        height: layout.size.height,
        orientation: layout.orientation,
        rows: layout.dimensions.rows,
        width: layout.size.width,
      });
    }, [layout]);
  const [geometryEpochMetadata, setGeometryEpochMetadata] = useState(
    createBoardGeometryEpochMetadata,
  );
  const nextGeometryEpochMetadata = reconcileBoardGeometryEpoch(
    geometryEpochMetadata,
    geometryEpochMapping,
  );
  if (nextGeometryEpochMetadata !== geometryEpochMetadata) {
    setGeometryEpochMetadata(nextGeometryEpochMetadata);
  }
  const annotationGeometry = useMemo(() => {
    if (layout === null || model.annotations === null) {
      return null;
    }
    return computeAnnotationGeometry({
      annotations: model.annotations.value,
      dimensions: layout.dimensions,
      orientation: layout.orientation,
      style: annotationStyle,
    });
  }, [annotationStyle, layout, model.annotations]);
  const gestureGeometry = useMemo<Readonly<BoardGestureGeometry> | null>(() => {
    if (layout === null || nextGeometryEpochMetadata.revision === null) {
      return null;
    }
    return Object.freeze({
      columns: layout.dimensions.columns,
      height: layout.size.height,
      revision: nextGeometryEpochMetadata.revision,
      rows: layout.dimensions.rows,
      visualSquares: Object.freeze(layout.cells.map(({ square }) => square)),
      width: layout.size.width,
    });
  }, [layout, nextGeometryEpochMetadata.revision]);
  const invalidationSnapshot = useMemo<
    Readonly<InteractionInvalidationSnapshot>
  >(
    () =>
      Object.freeze({
        accessibilityEnabled: accessibilityMoveEnabled,
        columns: model.dimensions?.columns ?? null,
        dragEnabled,
        geometryRevision: gestureGeometry?.revision ?? null,
        orientation: model.orientation,
        rows: model.dimensions?.rows ?? null,
      }),
    [
      accessibilityMoveEnabled,
      dragEnabled,
      gestureGeometry?.revision,
      model.dimensions?.columns,
      model.dimensions?.rows,
      model.orientation,
    ],
  );
  const previousInvalidationSnapshot =
    useRef<Readonly<InteractionInvalidationSnapshot> | null>(null);
  useLayoutEffect(() => {
    const previous = previousInvalidationSnapshot.current;
    previousInvalidationSnapshot.current = invalidationSnapshot;
    if (previous === null) {
      return;
    }
    const reason = invalidationReason(previous, invalidationSnapshot);
    if (reason !== null) {
      moveInteraction.invalidate(reason);
    }
  }, [invalidationSnapshot, moveInteraction.invalidate]);

  const pendingLifecycle = currentPendingLifecycle(
    moveInteraction.lifecycle,
    model,
  );
  useLayoutEffect(() => {
    if (
      pendingLifecycle?.intent.input !== 'drag' ||
      pendingLifecycle.intent.source.kind !== 'board'
    ) {
      return;
    }
    if (
      !dragEnabled ||
      !canDragCurrentPiece(canDragPiece, {
        basePositionRevision: pendingLifecycle.intent.basePositionRevision,
        boardId: pendingLifecycle.intent.boardId,
        piece: pendingLifecycle.intent.piece,
        source: pendingLifecycle.intent.source,
      })
    ) {
      moveInteraction.invalidate('permissions-change');
    }
  }, [canDragPiece, dragEnabled, moveInteraction.invalidate, pendingLifecycle]);

  const handleGestureCandidate = useCallback(
    (candidate: Readonly<BoardGestureIntentCandidate>): void => {
      const boardId = model.boardId;
      const position = model.position;
      const geometry = gestureGeometry;
      if (
        !dragEnabled ||
        candidate.input !== 'drag' ||
        boardId === null ||
        position === null ||
        geometry === null ||
        candidate.boardId !== boardId ||
        candidate.geometryEpoch !== geometry.revision ||
        candidate.basePositionRevision !== position.revision ||
        !geometry.visualSquares.includes(candidate.source.square) ||
        (candidate.targetSquare !== null &&
          !geometry.visualSquares.includes(candidate.targetSquare))
      ) {
        return;
      }
      const currentPiece = position.value[candidate.source.square] ?? null;
      const context = {
        basePositionRevision: position.revision,
        boardId,
        piece: candidate.piece,
        source: candidate.source,
      } as const;
      if (
        !piecesMatch(currentPiece, candidate.piece) ||
        !canDragCurrentPiece(canDragPiece, context)
      ) {
        return;
      }
      moveInteraction.request({
        ...context,
        input: 'drag',
        targetSquare: candidate.targetSquare,
      });
    },
    [
      canDragPiece,
      dragEnabled,
      gestureGeometry,
      model.boardId,
      model.position,
      moveInteraction.request,
    ],
  );
  const pendingSourceSquare =
    pendingLifecycle?.intent.source.kind !== 'board'
      ? null
      : pendingLifecycle.intent.source.square;

  return (
    <View
      accessibilityActions={accessibilityProps.accessibilityActions}
      accessibilityHint={accessibilityProps.accessibilityHint}
      accessibilityLabel={accessibilityProps.accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityState={{ disabled: model.status === 'disabled' }}
      accessibilityValue={accessibilityProps.accessibilityValue}
      accessible
      collapsable={false}
      importantForAccessibility="yes"
      onLayout={handleLayout}
      onAccessibilityAction={accessibilityProps.onAccessibilityAction}
      pointerEvents="box-none"
      style={[
        internalStyles.host,
        boardStyle,
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
          pointerEvents: 'box-none',
        },
      ]}
    >
      {layout === null ? null : (
        <>
          <SquareLayer
            layout={layout}
            squareStyles={squareStyles}
            styles={styles}
            theme={theme}
          />
          {annotationGeometry === null ? null : (
            <AnnotationLayer
              geometry={annotationGeometry}
              layer="belowPieces"
            />
          )}
          {model.position === null || model.boardId === null ? null : (
            <PieceLayer
              boardId={model.boardId}
              dragSourceSquare={activeDragSourceSquare}
              layout={layout}
              pendingSourceSquare={pendingSourceSquare}
              pieceRenderers={pieceRenderers}
              position={model.position}
              style={pieceStyle}
            />
          )}
          {annotationGeometry === null ? null : (
            <AnnotationLayer
              geometry={annotationGeometry}
              layer="abovePieces"
            />
          )}
          {showNotation ? (
            <BoardNotationLayer layout={layout} styles={styles} theme={theme} />
          ) : null}
          {pendingLifecycle === null ? null : (
            <PendingMoveLayer
              boardId={pendingLifecycle.boardId}
              layout={layout}
              lifecycle={pendingLifecycle}
              pieceRenderers={pieceRenderers}
              style={pieceStyle}
            />
          )}
          {!dragEnabled || gestureGeometry === null ? null : (
            <BoardInteractionController
              boardId={model.boardId}
              {...(canDragPiece === undefined ? {} : { canDragPiece })}
              dragEnabled
              geometry={gestureGeometry}
              onCandidate={handleGestureCandidate}
              onDragSourceChange={handleDragSourceChange}
              pieceRenderers={pieceRenderers}
              pieceStyle={pieceStyle}
              position={model.position}
              tapEnabled={false}
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
