import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useAccessibilityAnnouncement } from '../accessibility/announcements';
import { useReducedMotion } from '../accessibility/reduced-motion';
import {
  useBoardAccessibility,
  type BoardAccessibilityAnnotationInteraction,
  type BoardAccessibilityMoveInteraction,
  type BoardAccessibilitySpareInteraction,
  type BoardAccessibilitySquareInteraction,
} from '../accessibility/board-accessibility';
import { announceMoveOutcome } from '../accessibility/move-outcome';
import { STANDARD_BOARD_DIMENSIONS } from '../core/dimensions';
import { findMatchingAnnotationIds } from '../core/annotation-operations';
import {
  normalizeAnnotationTool,
  type AnnotationGestureCandidate,
  type AnnotationGestureSnapshot,
} from '../internal/annotation-gesture-adapter';
import type { NormalizedBoardModel } from '../internal/board-model';
import {
  projectCurrentAnnotationDraft,
  type CorrelatedAnnotationDraft,
} from '../internal/annotation-draft-presentation';
import type { BoardGestureIntentCandidate } from '../internal/board-gesture-adapter';
import {
  canDragCurrentPiece,
  resolveInteractionPermissions,
} from '../internal/interaction-permissions';
import type {
  InteractionInvalidationReason,
  MoveIntentLifecycle,
} from '../internal/interaction-reducer';
import { derivePendingCommitHandoff } from '../internal/pending-commit-handoff';
import {
  planSquareActivation,
  type SquareActivationInput,
} from '../internal/square-activation';
import { useMoveRequestRuntime } from '../internal/use-move-request-runtime';
import { useAnnotationOperation } from '../internal/use-annotation-operation';
import { useAnnotationInputRuntime } from '../internal/use-annotation-input-runtime';
import { useSquareActivation } from '../internal/use-square-activation';
import { usePositionTransitionRuntime } from '../internal/use-position-transition-runtime';
import type { ProviderBoardRegistration } from '../internal/provider-board-registration';
import type {
  CanStartProviderSpareDrag,
  ProviderSpareMove,
  RequestProviderSpareMove,
} from '../internal/board-layout-registry';
import { useChessboardProvider } from '../internal/provider-context';
import type { ProviderSpareSelectionDescriptor } from '../internal/provider-spare-selection';
import type {
  AnnotationStyle,
  AnnotationPolicies,
  AnnotationTool,
  BoardSize,
  CanDragPiece,
  ChessboardAccessibility,
  ChessboardStyles,
  ChessboardTheme,
  InteractionPermissions,
  MoveIntent,
  MoveOutcomeAccessibilityContext,
  MoveRequestTimeouts,
  OnMoveRequest,
  OnAnnotationOperation,
  OnSquareActivate,
  PieceRenderers,
  SquareActivationIntent,
  SquareId,
  SquareStyles,
  Revision,
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
  readonly annotationDraft?: Readonly<CorrelatedAnnotationDraft> | null;
  readonly annotationPolicies: AnnotationPolicies | undefined;
  readonly annotationStyle: Readonly<AnnotationStyle>;
  readonly annotationTool?: AnnotationTool | undefined;
  readonly canDragPiece: CanDragPiece | undefined;
  readonly development: boolean;
  readonly interactionPermissions: InteractionPermissions | undefined;
  readonly logTransitionWarning?: (message: string) => void;
  readonly model: NormalizedBoardModel;
  readonly moveRequestTimeouts: MoveRequestTimeouts | undefined;
  readonly onAnnotationOperation: OnAnnotationOperation | undefined;
  readonly onMoveRequest: OnMoveRequest | undefined;
  readonly onSquareActivate: OnSquareActivate | undefined;
  readonly pieceRenderers: PieceRenderers;
  readonly providerGeometryRevision: Revision;
  readonly providerLifecycleRevision: Revision;
  readonly providerRegistration: Readonly<ProviderBoardRegistration> | null;
  readonly showNotation: boolean;
  readonly squareStyles: SquareStyles | undefined;
  readonly styles: ChessboardStyles | undefined;
  readonly theme: ChessboardTheme | undefined;
  readonly transitionDurationMs: number;
}

interface InteractionInvalidationSnapshot {
  readonly accessibilityEnabled: boolean;
  readonly columns: number | null;
  readonly dragEnabled: boolean;
  readonly geometryRevision: number | null;
  readonly orientation: NormalizedBoardModel['orientation'];
  readonly providerGeometryRevision: Revision;
  readonly providerLifecycleRevision: Revision;
  readonly rows: number | null;
  readonly squareActivationEnabled: boolean;
}

interface ExternalMoveCommitSnapshot {
  readonly accessibilityEnabled: boolean;
  readonly boardId: string;
  readonly canDragPiece: CanDragPiece | undefined;
  readonly dragEnabled: boolean;
  readonly positionRevision: Revision;
  readonly request: (draft: Readonly<Omit<MoveIntent, 'intentId'>>) => boolean;
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
    previous.providerLifecycleRevision !== current.providerLifecycleRevision
  ) {
    return 'app-background';
  }
  if (
    previous.accessibilityEnabled !== current.accessibilityEnabled ||
    previous.dragEnabled !== current.dragEnabled ||
    previous.squareActivationEnabled !== current.squareActivationEnabled
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
  if (previous.providerGeometryRevision !== current.providerGeometryRevision) {
    return 'geometry-change';
  }
  return null;
}

/** Responsive native host for measured visual board layers. */
export function BoardSurface({
  accessibility,
  annotationDraft = null,
  annotationPolicies,
  annotationStyle,
  annotationTool,
  canDragPiece,
  development,
  interactionPermissions,
  logTransitionWarning,
  model,
  moveRequestTimeouts,
  onAnnotationOperation,
  onMoveRequest,
  onSquareActivate,
  pieceRenderers,
  providerGeometryRevision,
  providerLifecycleRevision,
  providerRegistration,
  showNotation,
  squareStyles,
  styles,
  theme,
  transitionDurationMs,
}: BoardSurfaceProps): ReactElement {
  useAccessibilityAnnouncement(accessibility?.announcement);
  const reducedMotion = useReducedMotion();
  const { runtime: providerRuntime } = useChessboardProvider();
  const spareSelectionSnapshot = useSyncExternalStore(
    providerRuntime.spareSelection.subscribe,
    providerRuntime.spareSelection.getSnapshot,
    providerRuntime.spareSelection.getSnapshot,
  );
  const resolvedPermissions = useMemo(
    () => resolveInteractionPermissions(onMoveRequest, interactionPermissions),
    [interactionPermissions, onMoveRequest],
  );
  const providerRegistered = providerRegistration?.registered === true;
  const interactionReady =
    providerRegistered &&
    model.status === 'ready' &&
    model.boardId !== null &&
    model.position !== null;
  const normalizedAnnotationTool = useMemo(
    () => normalizeAnnotationTool(annotationTool),
    [annotationTool],
  );
  const annotationGestureEnabled =
    interactionReady &&
    model.annotations !== null &&
    normalizedAnnotationTool !== null &&
    typeof onAnnotationOperation === 'function';
  const moveRequestEnabled =
    interactionReady && typeof onMoveRequest === 'function';
  const accessibilityMoveEnabled =
    interactionReady && resolvedPermissions.accessibility;
  const dragEnabled = interactionReady && resolvedPermissions.drag;
  const squareActivationEnabled =
    interactionReady && typeof onSquareActivate === 'function';
  const annotationBoardPressEnabled =
    interactionReady &&
    annotationPolicies?.clearOnBoardPress === true &&
    typeof onAnnotationOperation === 'function' &&
    model.annotations !== null &&
    model.annotations.value.length > 0;
  const tapEnabled = squareActivationEnabled || annotationBoardPressEnabled;
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
    onMoveRequest: moveRequestEnabled ? onMoveRequest : undefined,
    onOutcome: handleMoveOutcome,
    position: model.position,
    timeouts: moveRequestTimeouts,
  });
  const externalMoveAtCommit =
    useRef<Readonly<ExternalMoveCommitSnapshot> | null>(null);
  const requestProviderSpareMove = useCallback<RequestProviderSpareMove>(
    (move: Readonly<ProviderSpareMove>): boolean => {
      const current = externalMoveAtCommit.current;
      if (current === null) {
        return false;
      }
      if (
        (move.input === 'drag' && !current.dragEnabled) ||
        (move.input === 'accessibility' && !current.accessibilityEnabled)
      ) {
        return false;
      }
      const context = Object.freeze({
        basePositionRevision: current.positionRevision,
        boardId: current.boardId,
        piece: move.piece,
        source: move.source,
      });
      if (
        move.input === 'drag' &&
        !canDragCurrentPiece(current.canDragPiece, context)
      ) {
        return false;
      }
      return current.request({
        ...context,
        input: move.input,
        targetSquare: move.targetSquare,
      });
    },
    [],
  );
  const readProviderSpareMove = useCallback(
    (): RequestProviderSpareMove | null =>
      externalMoveAtCommit.current === null ? null : requestProviderSpareMove,
    [requestProviderSpareMove],
  );
  const canStartProviderSpareDrag = useCallback<CanStartProviderSpareDrag>(
    (source, piece): boolean => {
      const current = externalMoveAtCommit.current;
      return (
        current !== null &&
        current.dragEnabled &&
        canDragCurrentPiece(current.canDragPiece, {
          basePositionRevision: current.positionRevision,
          boardId: current.boardId,
          piece,
          source,
        })
      );
    },
    [],
  );
  const readSpareDragPermission = useCallback(
    (): CanStartProviderSpareDrag | null =>
      externalMoveAtCommit.current === null ? null : canStartProviderSpareDrag,
    [canStartProviderSpareDrag],
  );
  useLayoutEffect(() => {
    if (
      model.boardId === null ||
      model.position === null ||
      !moveRequestEnabled
    ) {
      externalMoveAtCommit.current = null;
      return;
    }
    const snapshot: Readonly<ExternalMoveCommitSnapshot> = Object.freeze({
      accessibilityEnabled: accessibilityMoveEnabled,
      boardId: model.boardId,
      canDragPiece,
      dragEnabled,
      positionRevision: model.position.revision,
      request: moveInteraction.request,
    });
    externalMoveAtCommit.current = snapshot;
    return () => {
      if (externalMoveAtCommit.current === snapshot) {
        externalMoveAtCommit.current = null;
      }
    };
  }, [
    accessibilityMoveEnabled,
    canDragPiece,
    dragEnabled,
    model.boardId,
    model.position,
    moveInteraction.request,
    moveRequestEnabled,
  ]);
  useLayoutEffect(() => {
    if (providerRegistration?.registered !== true) {
      return;
    }
    providerRegistration.registry.update(
      providerRegistration.boardId,
      providerRegistration.owner,
      {
        readMoveRequest: readProviderSpareMove,
        readSpareDragPermission,
      },
    );
  }, [providerRegistration, readProviderSpareMove, readSpareDragPermission]);
  const squareActivation = useSquareActivation({
    boardId: model.boardId,
    onSquareActivate: squareActivationEnabled ? onSquareActivate : undefined,
  });
  const annotationOperation = useAnnotationOperation({
    boardId: model.boardId,
    onAnnotationOperation,
  });
  const previousPositionForAnnotationPolicy = useRef<Readonly<{
    readonly boardId: string;
    readonly revision: Revision;
  }> | null>(null);
  useEffect(() => {
    const boardId = model.boardId;
    const position = model.position;
    if (!interactionReady || boardId === null || position === null) {
      previousPositionForAnnotationPolicy.current = null;
      return;
    }
    const previous = previousPositionForAnnotationPolicy.current;
    previousPositionForAnnotationPolicy.current = Object.freeze({
      boardId,
      revision: position.revision,
    });
    if (
      previous?.boardId !== boardId ||
      previous.revision === position.revision ||
      annotationPolicies?.clearOnPositionChange !== true ||
      typeof onAnnotationOperation !== 'function' ||
      model.annotations === null ||
      model.annotations.value.length === 0
    ) {
      return;
    }
    annotationOperation.emit({
      annotationIdsAtBase: Object.freeze(
        model.annotations.value.map(({ id }) => id),
      ),
      baseAnnotationRevision: model.annotations.revision,
      input: 'policy',
      reason: 'position-change',
      type: 'clear',
    });
  }, [
    annotationOperation.emit,
    annotationPolicies?.clearOnPositionChange,
    interactionReady,
    model.annotations,
    model.boardId,
    model.position,
    onAnnotationOperation,
  ]);
  const dispatchSquareActivation = useCallback(
    (
      square: SquareId,
      input: SquareActivationInput,
      action: SquareActivationIntent['action'] = 'activate',
    ): boolean => {
      const plan = planSquareActivation({
        action,
        activationEnabled: squareActivationEnabled,
        input,
        model,
        moveEnabled:
          input === 'accessibility'
            ? accessibilityMoveEnabled
            : moveRequestEnabled,
        square,
      });
      switch (plan.type) {
        case 'request-move':
          return moveInteraction.request(plan.request);
        case 'emit-activation':
          return squareActivation.emit(plan.request) !== null;
        case 'blocked':
        case 'fallback':
          return false;
      }
    },
    [
      accessibilityMoveEnabled,
      model,
      moveRequestEnabled,
      moveInteraction.request,
      squareActivation.emit,
      squareActivationEnabled,
    ],
  );
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
  const accessibilitySquareInteraction = useMemo<
    Readonly<BoardAccessibilitySquareInteraction>
  >(
    () =>
      Object.freeze({
        activate: (square: SquareId): boolean =>
          dispatchSquareActivation(square, 'accessibility'),
        clearSelection: (square: SquareId): boolean =>
          dispatchSquareActivation(square, 'accessibility', 'clear-selection'),
        enabled: squareActivationEnabled && activeDragSourceSquare === null,
      }),
    [activeDragSourceSquare, dispatchSquareActivation, squareActivationEnabled],
  );
  const selectedSpare: Readonly<ProviderSpareSelectionDescriptor> | null =
    providerRegistered &&
    model.boardId !== null &&
    spareSelectionSnapshot.active?.targetBoardId === model.boardId
      ? spareSelectionSnapshot.active
      : null;
  const cancelSelectedSpare = useCallback((): void => {
    const current = providerRuntime.spareSelection.getSnapshot().active;
    if (current !== null && current.targetBoardId === model.boardId) {
      providerRuntime.spareSelection.clearOwner(
        current.owner,
        current.selectionToken,
      );
    }
  }, [model.boardId, providerRuntime.spareSelection]);
  const placeSelectedSpare = useCallback(
    (square: SquareId): boolean => {
      const boardId = model.boardId;
      const current = providerRuntime.spareSelection.getSnapshot().active;
      if (boardId === null || current?.targetBoardId !== boardId) {
        return false;
      }
      const requested = providerRuntime.registry.requestAccessibleSpare(
        boardId,
        Object.freeze({
          input: 'accessibility',
          piece: current.piece,
          source: Object.freeze({
            kind: 'spare' as const,
            spareId: current.spareId,
          }),
          targetSquare: square,
        }),
      );
      if (requested) {
        providerRuntime.spareSelection.clearOwner(
          current.owner,
          current.selectionToken,
        );
      }
      return requested;
    },
    [model.boardId, providerRuntime],
  );
  const accessibilitySpareInteraction = useMemo<
    Readonly<BoardAccessibilitySpareInteraction>
  >(
    () =>
      Object.freeze({
        cancel: cancelSelectedSpare,
        enabled: accessibilityMoveEnabled && activeDragSourceSquare === null,
        place: placeSelectedSpare,
        selection: selectedSpare,
      }),
    [
      accessibilityMoveEnabled,
      activeDragSourceSquare,
      cancelSelectedSpare,
      placeSelectedSpare,
      selectedSpare,
    ],
  );
  const fallbackDimensions = model.dimensions ?? STANDARD_BOARD_DIMENSIONS;
  const modelColumns = model.dimensions?.columns ?? null;
  const modelRows = model.dimensions?.rows ?? null;
  const currentAspectRatio =
    fallbackDimensions.columns / fallbackDimensions.rows;
  const [measuredSize, setMeasuredSize] =
    useState<Readonly<MeasuredBoardSize> | null>(null);
  const [providerLayoutRevision, setProviderLayoutRevision] = useState(0);
  const providerLayoutRevisionRef = useRef(0);
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
      const hasPositiveSize =
        isPositiveFinite(width) && isPositiveFinite(height);
      const nextLayoutRevision =
        providerLayoutRevisionRef.current === Number.MAX_SAFE_INTEGER
          ? Number.MAX_SAFE_INTEGER
          : providerLayoutRevisionRef.current + 1;
      providerLayoutRevisionRef.current = nextLayoutRevision;
      if (providerRegistration?.registered === true) {
        providerRegistration.cancelActiveDrag('geometry-change');
        const snapshot = providerRegistration.registry.getBoardSnapshot(
          providerRegistration.boardId,
        );
        if (snapshot !== null) {
          providerRegistration.registry.update(
            providerRegistration.boardId,
            providerRegistration.owner,
            hasPositiveSize
              ? {
                  geometry: {
                    ...snapshot.geometry,
                    layoutRevision: nextLayoutRevision,
                  },
                }
              : {
                  available: false,
                  geometry: {
                    ...snapshot.geometry,
                    layoutRevision: nextLayoutRevision,
                  },
                },
          );
        }
      }
      setProviderLayoutRevision(nextLayoutRevision);
      if (!hasPositiveSize) {
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
    [currentAspectRatio, providerRegistration],
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
  const annotationInputSnapshot =
    useMemo<Readonly<AnnotationGestureSnapshot> | null>(() => {
      if (!annotationGestureEnabled || gestureGeometry === null) {
        return null;
      }
      return Object.freeze({
        annotationRevision: model.annotations.revision,
        boardId: model.boardId,
        geometryEpoch: gestureGeometry.revision,
        positionRevision: model.position.revision,
        providerGeometryRevision,
        providerLifecycleRevision,
        tool: normalizedAnnotationTool,
      });
    }, [
      annotationGestureEnabled,
      gestureGeometry,
      model.annotations,
      model.boardId,
      model.position,
      normalizedAnnotationTool,
      providerGeometryRevision,
      providerLifecycleRevision,
    ]);
  const handleAnnotationCandidate = useCallback(
    (candidate: Readonly<AnnotationGestureCandidate>): void => {
      const boardId = model.boardId;
      const position = model.position;
      const annotations = model.annotations;
      const geometry = gestureGeometry;
      const annotation = candidate.annotation;
      const annotationSquaresAreCurrent =
        annotation.type === 'arrow'
          ? geometry?.visualSquares.includes(annotation.from) === true &&
            geometry.visualSquares.includes(annotation.to)
          : geometry?.visualSquares.includes(annotation.square) === true;
      if (
        !annotationGestureEnabled ||
        boardId === null ||
        position === null ||
        annotations === null ||
        geometry === null ||
        candidate.boardId !== boardId ||
        candidate.geometryEpoch !== geometry.revision ||
        candidate.basePositionRevision !== position.revision ||
        candidate.baseAnnotationRevision !== annotations.revision ||
        candidate.providerGeometryRevision !== providerGeometryRevision ||
        candidate.providerLifecycleRevision !== providerLifecycleRevision ||
        !annotationSquaresAreCurrent
      ) {
        return;
      }
      annotationOperation.emit({
        annotation,
        baseAnnotationRevision: annotations.revision,
        input: candidate.input,
        matchingIdsAtBase: findMatchingAnnotationIds(
          annotations.value,
          annotation,
        ),
        type: 'toggle',
      });
    },
    [
      annotationGestureEnabled,
      annotationOperation.emit,
      gestureGeometry,
      model.annotations,
      model.boardId,
      model.position,
      providerGeometryRevision,
      providerLifecycleRevision,
    ],
  );
  const annotationRuntime = useAnnotationInputRuntime({
    onCandidate: handleAnnotationCandidate,
    snapshot: annotationInputSnapshot,
  });
  useLayoutEffect(() => {
    if (selectedSpare !== null) {
      annotationRuntime.cancel();
    }
  }, [annotationRuntime.cancel, selectedSpare]);
  const currentAnnotationDraft = projectCurrentAnnotationDraft(
    annotationRuntime.presentation ?? annotationDraft,
    Object.freeze({
      annotationRevision: model.annotations?.revision ?? null,
      boardId: model.boardId,
      geometryEpoch:
        layout === null ? null : nextGeometryEpochMetadata.revision,
      positionRevision: model.position?.revision ?? null,
      providerGeometryRevision,
      providerLifecycleRevision,
    }),
  );
  const annotationGeometry = useMemo(() => {
    if (layout === null || model.annotations === null) {
      return null;
    }
    return computeAnnotationGeometry({
      annotations: model.annotations.value,
      dimensions: layout.dimensions,
      draft: currentAnnotationDraft,
      orientation: layout.orientation,
      style: annotationStyle,
    });
  }, [annotationStyle, currentAnnotationDraft, layout, model.annotations]);
  const accessibilityAnnotationInteraction = useMemo<
    Readonly<BoardAccessibilityAnnotationInteraction>
  >(
    () =>
      Object.freeze({
        activate: (
          action: 'start-arrow' | 'finish-arrow' | 'toggle-square-annotation',
          square: SquareId,
        ): boolean =>
          annotationRuntime.snapshot === null
            ? false
            : annotationRuntime.activate('accessibility', square, {
                mode: action === 'finish-arrow' ? 'armed-arrow' : 'idle',
                snapshot: annotationRuntime.snapshot,
                sourceSquare:
                  action === 'finish-arrow'
                    ? annotationRuntime.sourceSquare
                    : null,
                token: annotationRuntime.token,
              }),
        cancel: (): boolean => {
          const snapshot = annotationRuntime.snapshot;
          if (snapshot === null) {
            return false;
          }
          return annotationRuntime.cancel(undefined, {
            mode: annotationRuntime.mode,
            snapshot,
            sourceSquare: annotationRuntime.sourceSquare,
            token: annotationRuntime.token,
          });
        },
        enabled:
          annotationRuntime.snapshot !== null &&
          activeDragSourceSquare === null,
        mode: annotationRuntime.mode,
        sourceSquare: annotationRuntime.sourceSquare,
        tool: annotationRuntime.snapshot?.tool.type ?? null,
      }),
    [activeDragSourceSquare, annotationRuntime],
  );
  const accessibilityProps = useBoardAccessibility(
    model,
    accessibility,
    accessibilityMoveInteraction,
    accessibilitySquareInteraction,
    accessibilitySpareInteraction,
    accessibilityAnnotationInteraction,
  );
  const positionTransition = usePositionTransitionRuntime({
    development,
    dimensions: model.dimensions,
    durationMs: transitionDurationMs,
    geometryEpoch: layout === null ? null : nextGeometryEpochMetadata.revision,
    layout,
    ...(logTransitionWarning === undefined
      ? {}
      : { logWarning: logTransitionWarning }),
    pendingHandoff: derivePendingCommitHandoff({
      boardId: model.boardId,
      lifecycle: moveInteraction.lifecycle,
      position: model.position,
    }),
    position: model.position,
    reducedMotion,
  });
  const providerDropAvailable =
    layout !== null &&
    model.status === 'ready' &&
    model.position !== null &&
    model.dimensions !== null &&
    model.orientation !== null &&
    nextGeometryEpochMetadata.revision !== null;
  useLayoutEffect(() => {
    if (providerRegistration?.registered !== true) {
      return;
    }
    if (!providerDropAvailable) {
      providerRegistration.cancelActiveDrag('geometry-change');
      providerRegistration.registry.update(
        providerRegistration.boardId,
        providerRegistration.owner,
        { available: false },
      );
      return;
    }
    const nextProviderGeometry = {
      dimensions: model.dimensions,
      geometryEpoch: nextGeometryEpochMetadata.revision,
      layoutRevision: providerLayoutRevision,
      orientation: model.orientation,
    } as const;
    const currentProviderGeometry =
      providerRegistration.registry.getBoardSnapshot(
        providerRegistration.boardId,
      )?.geometry ?? null;
    if (
      currentProviderGeometry !== null &&
      (currentProviderGeometry.dimensions.columns !==
        nextProviderGeometry.dimensions.columns ||
        currentProviderGeometry.dimensions.rows !==
          nextProviderGeometry.dimensions.rows ||
        currentProviderGeometry.geometryEpoch !==
          nextProviderGeometry.geometryEpoch ||
        currentProviderGeometry.layoutRevision !==
          nextProviderGeometry.layoutRevision ||
        currentProviderGeometry.orientation !==
          nextProviderGeometry.orientation)
    ) {
      providerRegistration.cancelActiveDrag('geometry-change');
    }
    const updated = providerRegistration.registry.update(
      providerRegistration.boardId,
      providerRegistration.owner,
      {
        available: true,
        geometry: nextProviderGeometry,
      },
    );
    if (updated) {
      void providerRegistration.registry.refreshCachedBounds(
        providerRegistration.boardId,
        providerRegistration.owner,
      );
    }
  }, [
    layout,
    model.dimensions,
    model.orientation,
    nextGeometryEpochMetadata.revision,
    providerDropAvailable,
    providerLayoutRevision,
    providerRegistration,
  ]);
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
        providerGeometryRevision,
        providerLifecycleRevision,
        rows: model.dimensions?.rows ?? null,
        squareActivationEnabled,
      }),
    [
      accessibilityMoveEnabled,
      dragEnabled,
      gestureGeometry?.revision,
      model.dimensions?.columns,
      model.dimensions?.rows,
      model.orientation,
      providerGeometryRevision,
      providerLifecycleRevision,
      squareActivationEnabled,
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
    if (pendingLifecycle === null) {
      return;
    }
    const intent = pendingLifecycle.intent;
    const inputDisabled =
      (intent.input === 'drag' && !dragEnabled) ||
      (intent.input === 'accessibility' && !accessibilityMoveEnabled);
    const dragDenied =
      intent.input === 'drag' &&
      !canDragCurrentPiece(
        canDragPiece,
        intent.source.kind === 'board'
          ? {
              basePositionRevision: intent.basePositionRevision,
              boardId: intent.boardId,
              piece: intent.piece,
              source: intent.source,
            }
          : {
              basePositionRevision: intent.basePositionRevision,
              boardId: intent.boardId,
              piece: intent.piece,
              source: intent.source,
            },
      );
    if (inputDisabled || dragDenied) {
      moveInteraction.invalidate('permissions-change');
    }
  }, [
    accessibilityMoveEnabled,
    canDragPiece,
    dragEnabled,
    moveInteraction.invalidate,
    pendingLifecycle,
  ]);

  const handleGestureCandidate = useCallback(
    (candidate: Readonly<BoardGestureIntentCandidate>): void => {
      const boardId = model.boardId;
      const position = model.position;
      const geometry = gestureGeometry;
      if (candidate.input === 'tap') {
        if (
          !tapEnabled ||
          boardId === null ||
          position === null ||
          geometry === null ||
          candidate.boardId !== boardId ||
          candidate.geometryEpoch !== geometry.revision ||
          candidate.basePositionRevision !== position.revision ||
          candidate.baseSelectionRevision !==
            (model.selection?.revision ?? null) ||
          !geometry.visualSquares.includes(candidate.square)
        ) {
          return;
        }
        if (annotationBoardPressEnabled) {
          annotationOperation.emit({
            annotationIdsAtBase: Object.freeze(
              model.annotations.value.map(({ id }) => id),
            ),
            baseAnnotationRevision: model.annotations.revision,
            input: 'touch',
            reason: 'board-press',
            type: 'clear',
          });
        }
        if (squareActivationEnabled) {
          dispatchSquareActivation(candidate.square, 'touch');
        }
        return;
      }
      if (
        !dragEnabled ||
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
      annotationBoardPressEnabled,
      annotationOperation.emit,
      dispatchSquareActivation,
      dragEnabled,
      gestureGeometry,
      model.annotations,
      model.boardId,
      model.position,
      model.selection?.revision,
      moveInteraction.request,
      squareActivationEnabled,
      tapEnabled,
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
      accessibilityState={{
        disabled: !providerRegistered || model.status === 'disabled',
      }}
      accessibilityValue={accessibilityProps.accessibilityValue}
      accessible
      collapsable={false}
      importantForAccessibility="yes"
      onLayout={handleLayout}
      onAccessibilityAction={accessibilityProps.onAccessibilityAction}
      pointerEvents="box-none"
      ref={providerRegistration?.hostRef}
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
            selection={model.selection}
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
              transition={positionTransition}
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
          {pendingLifecycle === null &&
          (positionTransition?.presentation.pending.length ?? 0) ===
            0 ? null : (
            <PendingMoveLayer
              boardId={pendingLifecycle?.boardId ?? model.boardId ?? ''}
              layout={layout}
              lifecycle={pendingLifecycle}
              pieceRenderers={pieceRenderers}
              style={pieceStyle}
              transition={positionTransition}
            />
          )}
          {(!dragEnabled && !tapEnabled && !annotationGestureEnabled) ||
          gestureGeometry === null ? null : (
            <BoardInteractionController
              {...(annotationGestureEnabled
                ? {
                    annotationRuntime,
                  }
                : {})}
              boardId={model.boardId}
              {...(canDragPiece === undefined ? {} : { canDragPiece })}
              dragEnabled={dragEnabled}
              geometry={gestureGeometry}
              onCandidate={handleGestureCandidate}
              onDragSourceChange={handleDragSourceChange}
              pieceRenderers={pieceRenderers}
              pieceStyle={pieceStyle}
              position={model.position}
              selectionRevision={model.selection?.revision ?? null}
              tapEnabled={tapEnabled}
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
