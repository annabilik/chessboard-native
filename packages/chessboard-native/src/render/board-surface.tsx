import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type Ref,
} from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

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
import { createPieceInteractionContext } from '../internal/piece-interaction';
import type {
  InteractionInvalidationReason,
  MoveIntentLifecycle,
} from '../internal/interaction-reducer';
import { resetInteractionPresentationSharedValues } from '../internal/interaction-presentation';
import {
  derivePendingCommitHandoff,
  pendingCommitHandoffHasCanonicalSuccessor,
  type PendingCommitHandoffDescriptor,
  type PendingCommitMapperLease,
  type PendingCommitTransitionAcknowledgement,
} from '../internal/pending-commit-handoff';
import {
  planSquareActivation,
  type SquareActivationInput,
} from '../internal/square-activation';
import { useMoveRequestRuntime } from '../internal/use-move-request-runtime';
import { useChessboardActions } from '../internal/use-chessboard-actions';
import { useAnnotationOperation } from '../internal/use-annotation-operation';
import { useAnnotationInputRuntime } from '../internal/use-annotation-input-runtime';
import { useSquareActivation } from '../internal/use-square-activation';
import type { PieceInteractionCallbacks } from '../internal/use-piece-interaction';
import {
  usePositionTransitionRuntime,
  type PendingHandoffTransitionExitDisposition,
} from '../internal/use-position-transition-runtime';
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
  ChessboardActions,
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
  OnSquarePressIn,
  OnSquarePressOut,
  PieceInteractionContext,
  PieceRenderer,
  PieceRenderers,
  SquareActivationIntent,
  SquareId,
  SquareRenderer,
  SquareStyles,
  Revision,
} from '../public-types';
import {
  createBoardSurfaceLayout,
  type BoardSurfaceLayout,
} from './board-layout';
import { AnnotationLayer } from './annotation-layer';
import { computeAnnotationGeometry } from './annotation-geometry';
import {
  createBoardGeometryEpochMetadata,
  reconcileBoardGeometryEpoch,
  type BoardGeometryEpochMapping,
} from './board-geometry-epoch';
import {
  BoardInteractionController,
  type TerminalBoardDragAcknowledgement,
  type TerminalBoardDragLease,
} from './board-interaction-controller';
import type { BoardGestureGeometry } from './board-gesture-layer';
import { BoardNotationLayer } from './board-notation-layer';
import { PendingMoveLayer } from './pending-move-layer';
import { PieceLayer, resolvePieceRenderer } from './piece-layer';
import { SquareLayer } from './square-layer';
import {
  resolveBoardStyle,
  resolveDraggingPieceGhostStyle,
  resolveDraggingPieceStyle,
  resolvePieceStyle,
} from './style-resolution';

interface MeasuredBoardSize extends BoardSize {
  readonly aspectRatio: number;
}

interface BoardSurfaceProps {
  readonly activationDistance: number;
  readonly allowDragOffBoard?: boolean;
  readonly accessibility: ChessboardAccessibility | undefined;
  readonly actionsRef?: Ref<ChessboardActions> | undefined;
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
  readonly onSquarePressIn?: OnSquarePressIn | undefined;
  readonly onSquarePressOut?: OnSquarePressOut | undefined;
  readonly pieceInteraction: Readonly<PieceInteractionCallbacks>;
  readonly piecePressEnabled: boolean;
  readonly pieceRenderers: PieceRenderers;
  readonly providerGeometryRevision: Revision;
  readonly providerLifecycleRevision: Revision;
  readonly providerRegistration: Readonly<ProviderBoardRegistration> | null;
  readonly renderSquare?: SquareRenderer | undefined;
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

interface TerminalBoardDragHandoff extends TerminalBoardDragAcknowledgement {
  readonly restoreSource: boolean;
  readonly stage: 'leased' | 'released';
}

interface PendingCommitPreparationBarrier {
  readonly acknowledgement: Readonly<PendingCommitTransitionAcknowledgement> | null;
  readonly drainBaseOpacity: number | null;
  readonly drainGeometryEpoch: Revision | null;
  readonly drainRenderer: PieceRenderer | null;
  readonly handoff: Readonly<PendingCommitHandoffDescriptor>;
  readonly key: string;
  readonly mode: 'animated' | 'canonical-drain';
  readonly preparation: Readonly<PendingCommitHandoffDescriptor>;
  readonly stage: 'retained' | 'active' | 'running' | 'warming' | 'retired';
}

interface PendingCommitCanonicalDrainGeneration {
  readonly baseOpacity: number;
  readonly descriptor: Readonly<PendingCommitHandoffDescriptor>;
  readonly geometryEpoch: Revision;
  readonly renderer: PieceRenderer;
}

interface PendingCommitHostAcknowledgements {
  readonly canonical: Readonly<PreparedPendingCommitHost> | null;
  readonly pending: Readonly<PreparedPendingCommitHost> | null;
}

interface PendingCommitMapperEnvironment {
  readonly baseOpacity: number;
  readonly barrierKey: string;
  readonly canonicalRenderer: PieceRenderer;
  readonly geometryEpoch: Revision;
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly pendingRenderer: PieceRenderer;
  readonly pieceStyle: Readonly<ViewStyle>;
  readonly targetPiece: Readonly<{
    readonly id?: string;
    readonly pieceType: string;
  }>;
  readonly targetSquare: SquareId;
}

interface PreparedPendingCommitHost {
  readonly acknowledgement: Readonly<PendingCommitTransitionAcknowledgement>;
  readonly environment: Readonly<object>;
  readonly generation: number;
}

const EMPTY_PENDING_COMMIT_HOST_ACKNOWLEDGEMENTS: Readonly<PendingCommitHostAcknowledgements> =
  Object.freeze({ canonical: null, pending: null });

function pendingCommitAcknowledgementsMatch(
  left: Readonly<PendingCommitTransitionAcknowledgement> | null,
  right: Readonly<PendingCommitTransitionAcknowledgement> | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.actorKey === right.actorKey &&
    left.presentationEpoch === right.presentationEpoch
  );
}

function pendingCommitMapperLeasesMatch(
  left: Readonly<PendingCommitMapperLease> | null,
  right: Readonly<PendingCommitMapperLease> | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.actorKey === right.actorKey &&
    left.presentationEpoch === right.presentationEpoch &&
    left.canonicalHostGeneration === right.canonicalHostGeneration &&
    left.pendingHostGeneration === right.pendingHostGeneration &&
    left.serial === right.serial
  );
}

function pendingCommitPreparationKey(
  handoff: Readonly<PendingCommitHandoffDescriptor>,
): string {
  return JSON.stringify([
    handoff.boardId,
    handoff.epoch,
    handoff.intentId,
    handoff.fromRevision,
    handoff.toRevision,
    handoff.source.kind,
    handoff.source.kind === 'board'
      ? handoff.source.square
      : handoff.source.spareId,
    handoff.targetSquare,
    handoff.piece.id ?? null,
    handoff.piece.pieceType,
  ]);
}

function deriveCanonicalDrainPreparation(options: {
  readonly allowAnonymousTargetDrain: boolean;
  readonly handoff: Readonly<PendingCommitHandoffDescriptor>;
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly position: NonNullable<NormalizedBoardModel['position']>;
}): Readonly<PendingCommitHandoffDescriptor> | null {
  const { allowAnonymousTargetDrain, handoff, layout, position } = options;
  let canonicalSquare: SquareId | null = null;
  let canonicalPiece: (typeof position.value)[SquareId] | undefined;
  if (handoff.piece.id === undefined) {
    const targetSquare = handoff.targetSquare;
    const targetPiece =
      targetSquare === null ? undefined : position.value[targetSquare];
    // Anonymous pieces are square-keyed. Before an exact handoff barrier is
    // latched, a different target square mounts a fresh host. Once the barrier
    // exists, however, that target host has been admitted by direct prep (or a
    // mounted transition) and must be drained just like a stable-ID host.
    if (
      handoff.source.kind === 'board' &&
      (targetSquare === handoff.source.square || allowAnonymousTargetDrain) &&
      targetPiece?.id === undefined
    ) {
      canonicalSquare = targetSquare;
      canonicalPiece = targetPiece;
    }
  } else {
    for (const { square } of layout.cells) {
      const candidate = position.value[square];
      if (candidate?.id !== handoff.piece.id) {
        continue;
      }
      if (canonicalSquare !== null) {
        return null;
      }
      canonicalSquare = square;
      canonicalPiece = candidate;
    }
  }
  if (canonicalSquare === null || canonicalPiece === undefined) {
    return null;
  }
  return Object.freeze({
    boardId: handoff.boardId,
    epoch: handoff.epoch,
    fromRevision: position.revision,
    intentId: `${handoff.intentId}:canonical-drain:${String(position.revision)}`,
    piece: Object.freeze({
      ...(canonicalPiece.id === undefined ? {} : { id: canonicalPiece.id }),
      pieceType: canonicalPiece.pieceType,
    }),
    source: Object.freeze({
      kind: 'board' as const,
      square: canonicalSquare,
    }),
    targetSquare: canonicalSquare,
    toRevision: position.revision,
  });
}

function canonicalDrainBaseOpacity(options: {
  readonly dragSourceSquare: SquareId | null;
  readonly draggingPieceGhostStyle: Readonly<ViewStyle>;
  readonly pieceStyle: Readonly<ViewStyle>;
  readonly pendingSourceSquare: SquareId | null;
  readonly targetSquare: SquareId;
}): number {
  const {
    dragSourceSquare,
    draggingPieceGhostStyle,
    pendingSourceSquare,
    pieceStyle,
    targetSquare,
  } = options;
  const isDragSource = targetSquare === dragSourceSquare;
  const resolvedStyle = isDragSource ? draggingPieceGhostStyle : pieceStyle;
  const resolvedOpacity =
    typeof resolvedStyle.opacity === 'number' ? resolvedStyle.opacity : 1;
  const canonicalOpacity =
    typeof pieceStyle.opacity === 'number' ? pieceStyle.opacity : 1;
  if (targetSquare === pendingSourceSquare && !isDragSource) {
    return 0.45;
  }
  return isDragSource && resolvedOpacity === 0
    ? canonicalOpacity
    : resolvedOpacity;
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
  activationDistance,
  allowDragOffBoard = true,
  accessibility,
  actionsRef,
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
  onSquarePressIn,
  onSquarePressOut,
  pieceInteraction,
  piecePressEnabled,
  pieceRenderers,
  providerGeometryRevision,
  providerLifecycleRevision,
  providerRegistration,
  renderSquare,
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
  const providerDragSnapshot = useSyncExternalStore(
    providerRuntime.drag.subscribe,
    providerRuntime.drag.getSnapshot,
    providerRuntime.drag.getSnapshot,
  );
  const resolvedPermissions = useMemo(
    () => resolveInteractionPermissions(onMoveRequest, interactionPermissions),
    [interactionPermissions, onMoveRequest],
  );
  const providerRegistered = providerRegistration?.registered === true;
  const selectedSpare: Readonly<ProviderSpareSelectionDescriptor> | null =
    providerRegistered &&
    model.boardId !== null &&
    spareSelectionSnapshot.active?.targetBoardId === model.boardId
      ? spareSelectionSnapshot.active
      : null;
  const interactionReady =
    providerRegistered &&
    model.status === 'ready' &&
    model.boardId !== null &&
    model.position !== null;
  const providerActiveDragSourceSquare =
    providerRegistered &&
    model.boardId !== null &&
    providerDragSnapshot.active?.boardId === model.boardId &&
    providerDragSnapshot.active.source.kind === 'board'
      ? providerDragSnapshot.active.source.square
      : null;
  const normalizedAnnotationTool = useMemo(
    () => normalizeAnnotationTool(annotationTool),
    [annotationTool],
  );
  const annotationGestureEnabled =
    interactionReady &&
    model.annotations !== null &&
    selectedSpare === null &&
    normalizedAnnotationTool !== null &&
    typeof onAnnotationOperation === 'function';
  const moveRequestEnabled =
    interactionReady && typeof onMoveRequest === 'function';
  const accessibilityMoveEnabled =
    interactionReady && resolvedPermissions.accessibility;
  const dragEnabled = interactionReady && resolvedPermissions.drag;
  const squareActivationEnabled =
    interactionReady && typeof onSquareActivate === 'function';
  const currentPiecePressEnabled = interactionReady && piecePressEnabled;
  const squarePressCallbackEnabled =
    interactionReady &&
    (typeof onSquarePressIn === 'function' ||
      typeof onSquarePressOut === 'function');
  const annotationBoardPressEnabled =
    interactionReady &&
    annotationPolicies?.clearOnBoardPress === true &&
    typeof onAnnotationOperation === 'function' &&
    model.annotations !== null &&
    model.annotations.value.length > 0;
  const tapEnabled =
    (selectedSpare !== null && moveRequestEnabled) ||
    squareActivationEnabled ||
    currentPiecePressEnabled ||
    annotationBoardPressEnabled;
  const [terminalBoardDragHandoff, setTerminalBoardDragHandoff] =
    useState<Readonly<TerminalBoardDragHandoff> | null>(null);
  const [pendingCommitPreparationBarrier, setPendingCommitPreparationBarrier] =
    useState<Readonly<PendingCommitPreparationBarrier> | null>(null);
  const [
    pendingCommitHostAcknowledgements,
    setPendingCommitHostAcknowledgements,
  ] = useState<Readonly<PendingCommitHostAcknowledgements>>(
    EMPTY_PENDING_COMMIT_HOST_ACKNOWLEDGEMENTS,
  );
  const [
    pendingCommitCanonicalMapperReadyLease,
    setPendingCommitCanonicalMapperReadyLease,
  ] = useState<Readonly<PendingCommitMapperLease> | null>(null);
  const pendingCommitMapperMountedRef = useRef(true);
  useEffect(() => {
    pendingCommitMapperMountedRef.current = true;
    return () => {
      pendingCommitMapperMountedRef.current = false;
    };
  }, []);
  const nextPendingCommitHostGenerationRef = useRef(0);
  const allocatePendingCommitHostGeneration = useCallback((): number | null => {
    const current = nextPendingCommitHostGenerationRef.current;
    if (!Number.isSafeInteger(current) || current >= Number.MAX_SAFE_INTEGER) {
      return null;
    }
    const next = current + 1;
    nextPendingCommitHostGenerationRef.current = next;
    return next;
  }, []);
  const handlePendingHandoffExit = useCallback(
    (
      acknowledgement: Readonly<PendingCommitTransitionAcknowledgement>,
      disposition: PendingHandoffTransitionExitDisposition,
    ): void => {
      setPendingCommitPreparationBarrier((current) => {
        if (
          current?.acknowledgement === null ||
          current?.acknowledgement === undefined ||
          !pendingCommitAcknowledgementsMatch(
            current.acknowledgement,
            acknowledgement,
          ) ||
          (current.stage !== 'active' && current.stage !== 'running')
        ) {
          return current;
        }
        return Object.freeze({
          ...current,
          stage:
            disposition === 'aborted'
              ? ('warming' as const)
              : ('retired' as const),
        });
      });
    },
    [],
  );
  const handlePendingCommitCanonicalPrepared = useCallback(
    (
      acknowledgement: Readonly<PendingCommitTransitionAcknowledgement>,
      prepared: boolean,
      environment: Readonly<object>,
    ): void => {
      const generation = prepared
        ? allocatePendingCommitHostGeneration()
        : null;
      setPendingCommitHostAcknowledgements((current) =>
        prepared
          ? generation === null
            ? current.canonical === null
              ? current
              : Object.freeze({ ...current, canonical: null })
            : current.canonical?.environment === environment &&
                pendingCommitAcknowledgementsMatch(
                  current.canonical.acknowledgement,
                  acknowledgement,
                )
              ? current
              : Object.freeze({
                  ...current,
                  canonical: Object.freeze({
                    acknowledgement,
                    environment,
                    generation,
                  }),
                })
          : current.canonical?.environment === environment &&
              pendingCommitAcknowledgementsMatch(
                current.canonical.acknowledgement,
                acknowledgement,
              )
            ? Object.freeze({ ...current, canonical: null })
            : current,
      );
    },
    [allocatePendingCommitHostGeneration],
  );
  const handlePendingCommitActorPrepared = useCallback(
    (
      acknowledgement: Readonly<PendingCommitTransitionAcknowledgement>,
      prepared: boolean,
      environment: Readonly<object>,
    ): void => {
      const generation = prepared
        ? allocatePendingCommitHostGeneration()
        : null;
      setPendingCommitHostAcknowledgements((current) =>
        prepared
          ? generation === null
            ? current.pending === null
              ? current
              : Object.freeze({ ...current, pending: null })
            : current.pending?.environment === environment &&
                pendingCommitAcknowledgementsMatch(
                  current.pending.acknowledgement,
                  acknowledgement,
                )
              ? current
              : Object.freeze({
                  ...current,
                  pending: Object.freeze({
                    acknowledgement,
                    environment,
                    generation,
                  }),
                })
          : current.pending?.environment === environment &&
              pendingCommitAcknowledgementsMatch(
                current.pending.acknowledgement,
                acknowledgement,
              )
            ? Object.freeze({ ...current, pending: null })
            : current,
      );
    },
    [allocatePendingCommitHostGeneration],
  );
  const handlePendingCommitCanonicalMapperReady = useCallback(
    (lease: Readonly<PendingCommitMapperLease>): void => {
      if (!pendingCommitMapperMountedRef.current) {
        return;
      }
      setPendingCommitCanonicalMapperReadyLease((current) =>
        current !== null && current.serial >= lease.serial ? current : lease,
      );
    },
    [],
  );
  const activeProviderDrag = providerDragSnapshot.active;
  const restoresTerminalBoardDragSource =
    terminalBoardDragHandoff?.stage === 'leased' &&
    terminalBoardDragHandoff.restoreSource &&
    activeProviderDrag?.boardId === terminalBoardDragHandoff.boardId &&
    activeProviderDrag.gestureToken === terminalBoardDragHandoff.gestureToken &&
    activeProviderDrag.owner === terminalBoardDragHandoff.owner &&
    activeProviderDrag.presentation === terminalBoardDragHandoff.presentation &&
    activeProviderDrag.source.kind === 'board' &&
    activeProviderDrag.source.square === terminalBoardDragHandoff.sourceSquare;
  const activeDragSourceSquare = restoresTerminalBoardDragSource
    ? null
    : providerActiveDragSourceSquare;
  const [pressedSquare, setPressedSquare] = useState<SquareId | null>(null);
  const handlePressedSquareChange = useCallback(
    (square: SquareId | null): void => {
      if (square === null || renderSquare !== undefined) {
        setPressedSquare(square);
      }
    },
    [renderSquare],
  );
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
        activationEnabled: squareActivationEnabled || currentPiecePressEnabled,
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
        case 'emit-activation': {
          if (
            plan.request.action === 'activate' &&
            plan.request.piece !== null &&
            currentPiecePressEnabled
          ) {
            return pieceInteraction.press(
              createPieceInteractionContext({
                basePositionRevision: plan.request.basePositionRevision,
                boardId: plan.request.boardId,
                piece: plan.request.piece,
                source: Object.freeze({
                  kind: 'board' as const,
                  square: plan.request.square,
                }),
              }),
            );
          }
          return squareActivation.emit(plan.request) !== null;
        }
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
      currentPiecePressEnabled,
      pieceInteraction,
      squareActivation.emit,
      squareActivationEnabled,
    ],
  );
  const handlePieceDragStart = useCallback(
    (context: Readonly<PieceInteractionContext>): boolean => {
      // Run lifecycle cleanup at the accepted RN start boundary, before a
      // same-batch terminal signal can establish the replacement request.
      // Visual source state still comes only from the provider snapshot.
      setAccessibilitySourceResetRevision((current) => current + 1);
      moveInteraction.invalidate('user');
      return pieceInteraction.dragStart(context);
    },
    [moveInteraction.invalidate, pieceInteraction.dragStart],
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
        enabled:
          (squareActivationEnabled || currentPiecePressEnabled) &&
          activeDragSourceSquare === null,
      }),
    [
      activeDragSourceSquare,
      currentPiecePressEnabled,
      dispatchSquareActivation,
      squareActivationEnabled,
    ],
  );
  const cancelSelectedSpare = useCallback((): boolean => {
    const current = providerRuntime.spareSelection.getSnapshot().active;
    if (current !== null && current.targetBoardId === model.boardId) {
      return providerRuntime.spareSelection.clearOwner(
        current.owner,
        current.selectionToken,
      );
    }
    return false;
  }, [model.boardId, providerRuntime.spareSelection]);
  const placeSelectedSpare = useCallback(
    (
      square: SquareId,
      input: 'accessibility' | 'tap',
      expected: Readonly<ProviderSpareSelectionDescriptor>,
    ): boolean => {
      const boardId = model.boardId;
      const current = providerRuntime.spareSelection.getSnapshot().active;
      if (
        boardId === null ||
        current?.targetBoardId !== boardId ||
        current.owner !== expected.owner ||
        current.selectionToken !== expected.selectionToken
      ) {
        return false;
      }
      const requested = providerRuntime.registry.requestSelectedSpare(
        boardId,
        Object.freeze({
          input,
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
        place: (square: SquareId): boolean =>
          selectedSpare === null
            ? false
            : placeSelectedSpare(square, 'accessibility', selectedSpare),
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
  const draggingPieceStyle = useMemo(
    () => resolveDraggingPieceStyle(theme, styles),
    [styles, theme],
  );
  const draggingPieceGhostStyle = useMemo(
    () => resolveDraggingPieceGhostStyle(theme, styles),
    [styles, theme],
  );
  useLayoutEffect(() => {
    const active = providerRuntime.drag.getSnapshot().active;
    if (
      !providerRegistered ||
      active === null ||
      model.boardId === null ||
      active.boardId !== model.boardId ||
      (active.style === draggingPieceStyle &&
        active.sourceGhostStyle === draggingPieceGhostStyle)
    ) {
      return;
    }
    providerRuntime.drag.claim(
      Object.freeze({
        ...active,
        sourceGhostStyle: draggingPieceGhostStyle,
        style: draggingPieceStyle,
      }),
    );
  }, [
    draggingPieceGhostStyle,
    draggingPieceStyle,
    model.boardId,
    providerDragSnapshot.revision,
    providerRegistered,
    providerRuntime.drag,
  ]);

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
  const cancelMoveAction = useCallback((): boolean => {
    if (!providerRegistered || model.boardId === null) {
      return false;
    }
    const cancelledDrag = providerRegistration.cancelActiveDrag('user');
    const cancelledMove = accessibilityProps.cancelMove('user');
    const cancelledSpare = cancelSelectedSpare();
    return cancelledDrag || cancelledMove || cancelledSpare;
  }, [
    accessibilityProps.cancelMove,
    cancelSelectedSpare,
    model.boardId,
    providerRegistered,
    providerRegistration,
  ]);
  useChessboardActions(actionsRef, cancelMoveAction);
  const pendingLifecycle = currentPendingLifecycle(
    moveInteraction.lifecycle,
    model,
  );
  const pendingSourceSquare = restoresTerminalBoardDragSource
    ? null
    : pendingLifecycle?.intent.source.kind !== 'board'
      ? null
      : pendingLifecycle.intent.source.square;
  const currentPendingCommitHandoff = derivePendingCommitHandoff({
    boardId: model.boardId,
    lifecycle: moveInteraction.lifecycle,
    position: model.position,
  });
  const pendingCommitBarrierHandoff =
    currentPendingCommitHandoff ??
    (pendingCommitPreparationBarrier?.stage === 'retired'
      ? null
      : (pendingCommitPreparationBarrier?.handoff ?? null));
  const pendingCommitBarrierKey =
    pendingCommitBarrierHandoff === null
      ? null
      : pendingCommitPreparationKey(pendingCommitBarrierHandoff);
  const exactPendingCommitPreparationBarrier =
    pendingCommitBarrierKey !== null &&
    pendingCommitPreparationBarrier?.key === pendingCommitBarrierKey
      ? pendingCommitPreparationBarrier
      : null;
  const pendingCommitTargetSquare =
    pendingCommitBarrierHandoff?.targetSquare ?? null;
  const pendingCommitTargetPiece =
    pendingCommitTargetSquare === null
      ? null
      : (model.position?.value[pendingCommitTargetSquare] ?? null);
  const correlatedPendingCommitHandoff =
    pendingCommitBarrierHandoff !== null &&
    pendingCommitTargetSquare !== null &&
    pendingCommitTargetPiece !== null &&
    model.position !== null &&
    model.dimensions !== null &&
    layout !== null &&
    layout.cells.some(({ square }) => square === pendingCommitTargetSquare) &&
    pendingCommitHandoffHasCanonicalSuccessor({
      dimensions: model.dimensions,
      handoff: pendingCommitBarrierHandoff,
      position: model.position,
    })
      ? pendingCommitBarrierHandoff
      : null;
  const pendingCommitPendingRenderer =
    correlatedPendingCommitHandoff === null
      ? null
      : resolvePieceRenderer(
          pieceRenderers,
          correlatedPendingCommitHandoff.piece.pieceType,
        );
  const pendingCommitCanonicalRenderer =
    pendingCommitTargetPiece === null
      ? null
      : resolvePieceRenderer(
          pieceRenderers,
          pendingCommitTargetPiece.pieceType,
        );
  const renderablePendingCommitHandoff =
    correlatedPendingCommitHandoff !== null &&
    pendingCommitTargetPiece !== null &&
    pendingCommitPendingRenderer !== null &&
    pendingCommitCanonicalRenderer !== null
      ? correlatedPendingCommitHandoff
      : null;
  const canonicalDrainDescriptor = useMemo(
    () =>
      model.position === null ||
      layout === null ||
      pendingCommitBarrierHandoff === null
        ? null
        : deriveCanonicalDrainPreparation({
            allowAnonymousTargetDrain:
              exactPendingCommitPreparationBarrier !== null,
            handoff: pendingCommitBarrierHandoff,
            layout,
            position: model.position,
          }),
    [
      exactPendingCommitPreparationBarrier,
      layout,
      model.position,
      pendingCommitBarrierHandoff,
    ],
  );
  const canonicalDrainRenderer =
    canonicalDrainDescriptor === null
      ? null
      : resolvePieceRenderer(
          pieceRenderers,
          canonicalDrainDescriptor.piece.pieceType,
        );
  const canonicalDrainResolvedBaseOpacity =
    canonicalDrainDescriptor?.targetSquare === null ||
    canonicalDrainDescriptor?.targetSquare === undefined
      ? null
      : canonicalDrainBaseOpacity({
          dragSourceSquare: activeDragSourceSquare,
          draggingPieceGhostStyle,
          pendingSourceSquare,
          pieceStyle,
          targetSquare: canonicalDrainDescriptor.targetSquare,
        });
  const canonicalDrainGeneration =
    useMemo<Readonly<PendingCommitCanonicalDrainGeneration> | null>(
      () =>
        canonicalDrainDescriptor === null ||
        canonicalDrainRenderer === null ||
        canonicalDrainResolvedBaseOpacity === null ||
        nextGeometryEpochMetadata.revision === null
          ? null
          : Object.freeze({
              baseOpacity: canonicalDrainResolvedBaseOpacity,
              descriptor: canonicalDrainDescriptor,
              geometryEpoch: nextGeometryEpochMetadata.revision,
              renderer: canonicalDrainRenderer,
            }),
      [
        canonicalDrainDescriptor,
        canonicalDrainRenderer,
        canonicalDrainResolvedBaseOpacity,
        nextGeometryEpochMetadata.revision,
      ],
    );
  const pendingCommitAnimationEnabled =
    transitionDurationMs > 0 && !reducedMotion;
  const animatedPendingCommitHandoff = pendingCommitAnimationEnabled
    ? renderablePendingCommitHandoff
    : null;
  const initialPendingCommitMode =
    currentPendingCommitHandoff === null ||
    exactPendingCommitPreparationBarrier !== null
      ? null
      : animatedPendingCommitHandoff !== null
        ? ('animated' as const)
        : canonicalDrainGeneration !== null
          ? ('canonical-drain' as const)
          : null;
  const initialPendingCommitPreparation =
    initialPendingCommitMode === 'animated'
      ? animatedPendingCommitHandoff
      : initialPendingCommitMode === 'canonical-drain'
        ? (canonicalDrainGeneration?.descriptor ?? null)
        : null;
  const runtimePendingCommitHandoff =
    exactPendingCommitPreparationBarrier?.stage === 'retired' ||
    exactPendingCommitPreparationBarrier?.stage === 'warming' ||
    exactPendingCommitPreparationBarrier?.mode === 'canonical-drain'
      ? null
      : animatedPendingCommitHandoff;
  const pendingCommitMapperBaseOpacity =
    pendingCommitTargetSquare === null
      ? null
      : canonicalDrainBaseOpacity({
          dragSourceSquare: activeDragSourceSquare,
          draggingPieceGhostStyle,
          pendingSourceSquare,
          pieceStyle,
          targetSquare: pendingCommitTargetSquare,
        });
  const pendingCommitMapperEnvironment =
    useMemo<Readonly<PendingCommitMapperEnvironment> | null>(
      () =>
        pendingCommitBarrierKey === null ||
        pendingCommitMapperBaseOpacity === null ||
        pendingCommitCanonicalRenderer === null ||
        pendingCommitPendingRenderer === null ||
        pendingCommitTargetPiece === null ||
        pendingCommitTargetSquare === null ||
        nextGeometryEpochMetadata.revision === null ||
        layout === null
          ? null
          : Object.freeze({
              baseOpacity: pendingCommitMapperBaseOpacity,
              barrierKey: pendingCommitBarrierKey,
              canonicalRenderer: pendingCommitCanonicalRenderer,
              geometryEpoch: nextGeometryEpochMetadata.revision,
              layout,
              pendingRenderer: pendingCommitPendingRenderer,
              pieceStyle,
              targetPiece: pendingCommitTargetPiece,
              targetSquare: pendingCommitTargetSquare,
            }),
      [
        layout,
        nextGeometryEpochMetadata.revision,
        pendingCommitBarrierKey,
        pendingCommitCanonicalRenderer,
        pendingCommitMapperBaseOpacity,
        pendingCommitPendingRenderer,
        pendingCommitTargetPiece,
        pendingCommitTargetSquare,
        pieceStyle,
      ],
    );
  useLayoutEffect(() => {
    if (
      pendingCommitPreparationBarrier !== null &&
      pendingCommitPreparationBarrier.key !== pendingCommitBarrierKey
    ) {
      setPendingCommitPreparationBarrier(null);
    }
  }, [pendingCommitBarrierKey, pendingCommitPreparationBarrier]);
  useLayoutEffect(() => {
    if (
      currentPendingCommitHandoff === null ||
      initialPendingCommitMode === null ||
      initialPendingCommitPreparation === null ||
      pendingCommitBarrierKey === null
    ) {
      return;
    }
    if (pendingCommitPreparationBarrier?.key !== pendingCommitBarrierKey) {
      setPendingCommitHostAcknowledgements(
        EMPTY_PENDING_COMMIT_HOST_ACKNOWLEDGEMENTS,
      );
      setPendingCommitCanonicalMapperReadyLease(null);
    }
    setPendingCommitPreparationBarrier((current) =>
      current?.key === pendingCommitBarrierKey
        ? current
        : Object.freeze({
            acknowledgement: null,
            drainBaseOpacity:
              initialPendingCommitMode === 'canonical-drain'
                ? (canonicalDrainGeneration?.baseOpacity ?? null)
                : null,
            drainGeometryEpoch:
              initialPendingCommitMode === 'canonical-drain'
                ? (canonicalDrainGeneration?.geometryEpoch ?? null)
                : null,
            drainRenderer:
              initialPendingCommitMode === 'canonical-drain'
                ? (canonicalDrainGeneration?.renderer ?? null)
                : null,
            handoff: currentPendingCommitHandoff,
            key: pendingCommitBarrierKey,
            mode: initialPendingCommitMode,
            preparation: initialPendingCommitPreparation,
            stage: 'retained' as const,
          }),
    );
  }, [
    currentPendingCommitHandoff,
    canonicalDrainGeneration,
    initialPendingCommitMode,
    initialPendingCommitPreparation,
    pendingCommitBarrierKey,
    pendingCommitPreparationBarrier?.key,
  ]);
  const combinedPendingHandoffMapperLease =
    useMemo<Readonly<PendingCommitMapperLease> | null>(() => {
      const canonical = pendingCommitHostAcknowledgements.canonical;
      const pending = pendingCommitHostAcknowledgements.pending;
      if (
        canonical === null ||
        pending === null ||
        pendingCommitMapperEnvironment === null ||
        canonical.environment !== pendingCommitMapperEnvironment ||
        pending.environment !== pendingCommitMapperEnvironment ||
        !pendingCommitAcknowledgementsMatch(
          canonical.acknowledgement,
          pending.acknowledgement,
        )
      ) {
        return null;
      }
      return Object.freeze({
        actorKey: canonical.acknowledgement.actorKey,
        canonicalHostGeneration: canonical.generation,
        pendingHostGeneration: pending.generation,
        presentationEpoch: canonical.acknowledgement.presentationEpoch,
        serial: Math.max(canonical.generation, pending.generation),
      });
    }, [pendingCommitHostAcknowledgements, pendingCommitMapperEnvironment]);
  const runtimePendingHandoffAcknowledgement = pendingCommitMapperLeasesMatch(
    pendingCommitCanonicalMapperReadyLease,
    combinedPendingHandoffMapperLease,
  )
    ? pendingCommitCanonicalMapperReadyLease
    : null;
  const positionTransition = usePositionTransitionRuntime({
    development,
    dimensions: model.dimensions,
    durationMs: transitionDurationMs,
    geometryEpoch: layout === null ? null : nextGeometryEpochMetadata.revision,
    layout,
    ...(logTransitionWarning === undefined
      ? {}
      : { logWarning: logTransitionWarning }),
    onPendingHandoffExit: handlePendingHandoffExit,
    pendingHandoff: runtimePendingCommitHandoff,
    pendingHandoffAcknowledgement: runtimePendingHandoffAcknowledgement,
    pendingHandoffRequired: currentPendingCommitHandoff !== null,
    position: model.position,
    reducedMotion,
  });
  const activePendingHandoffActor =
    positionTransition?.presentation.pending.find(
      ({ kind }) => kind === 'pending-handoff',
    ) ?? null;
  const expectedPendingHandoffAcknowledgement = useMemo(
    () =>
      positionTransition === null || activePendingHandoffActor === null
        ? null
        : Object.freeze({
            actorKey: activePendingHandoffActor.actorKey,
            presentationEpoch: positionTransition.presentation.epoch,
          }),
    [
      activePendingHandoffActor?.actorKey,
      positionTransition?.presentation.epoch,
    ],
  );
  const exactBarrierNeedsCanonicalDrain =
    exactPendingCommitPreparationBarrier !== null &&
    exactPendingCommitPreparationBarrier.stage !== 'retired' &&
    (exactPendingCommitPreparationBarrier.mode === 'canonical-drain' ||
      exactPendingCommitPreparationBarrier.stage === 'warming' ||
      runtimePendingCommitHandoff === null ||
      positionTransition === null);
  const effectivePendingCommitMode =
    exactPendingCommitPreparationBarrier?.stage === 'retired'
      ? null
      : exactBarrierNeedsCanonicalDrain
        ? canonicalDrainGeneration === null
          ? null
          : ('canonical-drain' as const)
        : exactPendingCommitPreparationBarrier !== null
          ? ('animated' as const)
          : initialPendingCommitMode;
  const storedCanonicalDrainGenerationMatches =
    effectivePendingCommitMode === 'canonical-drain' &&
    canonicalDrainGeneration !== null &&
    exactPendingCommitPreparationBarrier?.mode === 'canonical-drain' &&
    exactPendingCommitPreparationBarrier.drainBaseOpacity ===
      canonicalDrainGeneration.baseOpacity &&
    exactPendingCommitPreparationBarrier.drainGeometryEpoch ===
      canonicalDrainGeneration.geometryEpoch &&
    exactPendingCommitPreparationBarrier.drainRenderer ===
      canonicalDrainGeneration.renderer &&
    pendingCommitPreparationKey(
      exactPendingCommitPreparationBarrier.preparation,
    ) === pendingCommitPreparationKey(canonicalDrainGeneration.descriptor);
  const effectivePendingCommitPreparation =
    effectivePendingCommitMode === 'canonical-drain'
      ? storedCanonicalDrainGenerationMatches
        ? exactPendingCommitPreparationBarrier.preparation
        : (canonicalDrainGeneration?.descriptor ?? null)
      : effectivePendingCommitMode === 'animated'
        ? (exactPendingCommitPreparationBarrier?.preparation ??
          initialPendingCommitPreparation)
        : null;
  const effectivePendingHandoffAcknowledgement =
    effectivePendingCommitMode === 'animated'
      ? expectedPendingHandoffAcknowledgement
      : null;
  const effectivePendingCommitMapperLease =
    combinedPendingHandoffMapperLease !== null &&
    effectivePendingHandoffAcknowledgement !== null &&
    combinedPendingHandoffMapperLease.actorKey ===
      effectivePendingHandoffAcknowledgement.actorKey &&
    combinedPendingHandoffMapperLease.presentationEpoch ===
      effectivePendingHandoffAcknowledgement.presentationEpoch
      ? combinedPendingHandoffMapperLease
      : null;
  const effectivePendingCommitStartAcknowledgement =
    pendingCommitMapperLeasesMatch(
      pendingCommitCanonicalMapperReadyLease,
      effectivePendingCommitMapperLease,
    )
      ? effectivePendingHandoffAcknowledgement
      : null;
  useLayoutEffect(() => {
    if (
      effectivePendingCommitMode !== 'canonical-drain' ||
      effectivePendingCommitPreparation === null ||
      canonicalDrainGeneration === null ||
      exactPendingCommitPreparationBarrier === null ||
      exactPendingCommitPreparationBarrier.stage === 'retired' ||
      (exactPendingCommitPreparationBarrier.mode === 'canonical-drain' &&
        storedCanonicalDrainGenerationMatches)
    ) {
      return;
    }
    const exactKey = exactPendingCommitPreparationBarrier.key;
    setPendingCommitPreparationBarrier((current) =>
      current?.key === exactKey && current.stage !== 'retired'
        ? Object.freeze({
            ...current,
            drainBaseOpacity: canonicalDrainGeneration.baseOpacity,
            drainGeometryEpoch: canonicalDrainGeneration.geometryEpoch,
            drainRenderer: canonicalDrainGeneration.renderer,
            mode: 'canonical-drain' as const,
            preparation: effectivePendingCommitPreparation,
          })
        : current,
    );
  }, [
    canonicalDrainGeneration,
    effectivePendingCommitMode,
    effectivePendingCommitPreparation,
    exactPendingCommitPreparationBarrier,
    storedCanonicalDrainGenerationMatches,
  ]);
  useLayoutEffect(() => {
    if (
      effectivePendingHandoffAcknowledgement === null ||
      pendingCommitBarrierKey === null ||
      exactPendingCommitPreparationBarrier?.stage !== 'retained'
    ) {
      return;
    }
    setPendingCommitPreparationBarrier((current) =>
      current?.key === pendingCommitBarrierKey && current.stage === 'retained'
        ? Object.freeze({
            ...current,
            acknowledgement: effectivePendingHandoffAcknowledgement,
            stage: 'active' as const,
          })
        : current,
    );
  }, [
    exactPendingCommitPreparationBarrier?.stage,
    effectivePendingHandoffAcknowledgement,
    pendingCommitBarrierKey,
  ]);
  useLayoutEffect(() => {
    if (
      exactPendingCommitPreparationBarrier?.mode !== 'canonical-drain' ||
      (exactPendingCommitPreparationBarrier.stage !== 'retained' &&
        exactPendingCommitPreparationBarrier.stage !== 'warming') ||
      positionTransition !== null ||
      canonicalDrainGeneration === null ||
      effectivePendingCommitPreparation === null ||
      !storedCanonicalDrainGenerationMatches
    ) {
      return;
    }
    let mounted = true;
    const exactKey = exactPendingCommitPreparationBarrier.key;
    const exactPreparationKey = pendingCommitPreparationKey(
      effectivePendingCommitPreparation,
    );
    const exactBaseOpacity = canonicalDrainGeneration.baseOpacity;
    const exactGeometryEpoch = canonicalDrainGeneration.geometryEpoch;
    const exactRenderer = canonicalDrainGeneration.renderer;
    const frame = requestAnimationFrame(() => {
      if (!mounted) {
        return;
      }
      setPendingCommitPreparationBarrier((current) =>
        current?.key === exactKey &&
        current.mode === 'canonical-drain' &&
        current.drainBaseOpacity === exactBaseOpacity &&
        current.drainGeometryEpoch === exactGeometryEpoch &&
        current.drainRenderer === exactRenderer &&
        pendingCommitPreparationKey(current.preparation) ===
          exactPreparationKey &&
        (current.stage === 'retained' || current.stage === 'warming')
          ? Object.freeze({ ...current, stage: 'retired' as const })
          : current,
      );
    });
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
    };
  }, [
    canonicalDrainGeneration,
    effectivePendingCommitPreparation,
    exactPendingCommitPreparationBarrier,
    positionTransition,
    storedCanonicalDrainGenerationMatches,
  ]);
  useLayoutEffect(() => {
    if (
      exactPendingCommitPreparationBarrier?.stage !== 'active' ||
      exactPendingCommitPreparationBarrier.acknowledgement === null ||
      effectivePendingHandoffAcknowledgement === null ||
      !pendingCommitAcknowledgementsMatch(
        exactPendingCommitPreparationBarrier.acknowledgement,
        effectivePendingHandoffAcknowledgement,
      ) ||
      !pendingCommitAcknowledgementsMatch(
        effectivePendingCommitStartAcknowledgement,
        effectivePendingHandoffAcknowledgement,
      )
    ) {
      return;
    }
    setPendingCommitPreparationBarrier((current) =>
      current?.key === pendingCommitBarrierKey &&
      current.stage === 'active' &&
      pendingCommitAcknowledgementsMatch(
        current.acknowledgement,
        effectivePendingHandoffAcknowledgement,
      )
        ? Object.freeze({ ...current, stage: 'running' as const })
        : current,
    );
  }, [
    exactPendingCommitPreparationBarrier?.acknowledgement,
    exactPendingCommitPreparationBarrier?.stage,
    effectivePendingCommitStartAcknowledgement,
    effectivePendingHandoffAcknowledgement,
    pendingCommitBarrierKey,
  ]);
  useLayoutEffect(() => {
    if (
      (exactPendingCommitPreparationBarrier?.stage !== 'active' &&
        exactPendingCommitPreparationBarrier?.stage !== 'running') ||
      positionTransition !== null
    ) {
      return;
    }
    // A preserved Offscreen/Suspense tree can tear down the runtime effect
    // before its ref-backed exact exit callback runs. Normal completion and
    // semantic supersession retire the barrier in the same callback batch as
    // the runtime clear, so only an unreported interrupted lifetime reaches
    // this committed fail-safe.
    setPendingCommitPreparationBarrier((current) =>
      current?.key === pendingCommitBarrierKey &&
      (current.stage === 'active' || current.stage === 'running')
        ? Object.freeze({ ...current, stage: 'warming' as const })
        : current,
    );
  }, [
    exactPendingCommitPreparationBarrier?.stage,
    pendingCommitBarrierKey,
    positionTransition,
  ]);
  const pendingCommitBarrierVisible =
    effectivePendingCommitPreparation !== null &&
    (exactPendingCommitPreparationBarrier === null
      ? initialPendingCommitMode !== null
      : exactPendingCommitPreparationBarrier.stage !== 'retired');
  const pendingCommitTransitionIsReady =
    effectivePendingCommitStartAcknowledgement !== null;
  // An animated handoff keeps the pending actor and canonical mask until both
  // mappers have survived the guarded host-ready frame. A canonical drain is
  // stronger: it immediately replaces any stale special actor with one static
  // canonical duplicate and keeps the reused host masked through its own exact
  // renderer/geometry generation's warm frame.
  const directPendingCommitPreparation =
    pendingCommitBarrierVisible &&
    (effectivePendingCommitMode === 'canonical-drain' ||
      !pendingCommitTransitionIsReady)
      ? effectivePendingCommitPreparation
      : null;
  const pendingCommitPreparation = directPendingCommitPreparation;
  const pendingMovePreparation = directPendingCommitPreparation;
  const pendingMovePreparationKind =
    effectivePendingCommitMode === 'canonical-drain'
      ? ('canonical-drain' as const)
      : ('pending' as const);
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

  const handleTerminalDragCancellation = useCallback(
    (lease: Readonly<TerminalBoardDragLease>): boolean => {
      const active = providerRuntime.drag.getSnapshot().active;
      if (
        model.boardId === null ||
        lease.boardId !== model.boardId ||
        active?.boardId !== lease.boardId ||
        active.gestureToken !== lease.gestureToken ||
        active.owner !== lease.owner ||
        active.presentation !== lease.presentation ||
        active.source.kind !== 'board' ||
        active.source.square !== lease.sourceSquare
      ) {
        return false;
      }
      setTerminalBoardDragHandoff(
        Object.freeze({
          ...lease,
          mountedResetPermit: { current: false },
          restoreSource: true,
          stage: 'leased' as const,
        }),
      );
      return true;
    },
    [model.boardId, providerRuntime.drag],
  );

  const handleGestureCandidate = useCallback(
    (candidate: Readonly<BoardGestureIntentCandidate>): boolean => {
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
          return false;
        }
        if (selectedSpare !== null) {
          const targetDisabled =
            model.selection?.value.disabledSquares?.includes(
              candidate.square,
            ) ?? false;
          return pendingLifecycle === null && !targetDisabled
            ? placeSelectedSpare(candidate.square, 'tap', selectedSpare)
            : false;
        }
        let handled = false;
        if (annotationBoardPressEnabled) {
          handled =
            annotationOperation.emit({
              annotationIdsAtBase: Object.freeze(
                model.annotations.value.map(({ id }) => id),
              ),
              baseAnnotationRevision: model.annotations.revision,
              input: 'touch',
              reason: 'board-press',
              type: 'clear',
            }) !== null;
        }
        if (squareActivationEnabled || currentPiecePressEnabled) {
          handled =
            dispatchSquareActivation(candidate.square, 'touch') || handled;
        }
        return handled;
      }
      const active = providerRuntime.drag.getSnapshot().active;
      if (
        active?.boardId !== candidate.boardId ||
        active.gestureToken !== candidate.token ||
        active.source.kind !== 'board' ||
        active.source.square !== candidate.source.square
      ) {
        return false;
      }
      let pendingSuccessorEstablished = false;
      if (
        dragEnabled &&
        boardId !== null &&
        position !== null &&
        geometry !== null &&
        candidate.boardId === boardId &&
        candidate.geometryEpoch === geometry.revision &&
        candidate.basePositionRevision === position.revision &&
        geometry.visualSquares.includes(candidate.source.square) &&
        (candidate.targetSquare === null ||
          geometry.visualSquares.includes(candidate.targetSquare))
      ) {
        const currentPiece = position.value[candidate.source.square] ?? null;
        const context = {
          basePositionRevision: position.revision,
          boardId,
          piece: candidate.piece,
          source: candidate.source,
        } as const;
        if (
          piecesMatch(currentPiece, candidate.piece) &&
          canDragCurrentPiece(canDragPiece, context)
        ) {
          const requested = moveInteraction.request({
            ...context,
            input: 'drag',
            targetSquare: candidate.targetSquare,
          });
          const currentMoveLifecycle = moveInteraction.getCurrentLifecycle();
          pendingSuccessorEstablished =
            requested &&
            currentMoveLifecycle !== null &&
            currentMoveLifecycle.phase !== 'idle';
        }
      }
      // Even an admission failure needs a React source-restoration commit
      // before the exact provider artwork can retire. Returning true means
      // BoardSurface owns this visual handoff, not that the move was accepted.
      setTerminalBoardDragHandoff(
        Object.freeze({
          boardId: candidate.boardId,
          gestureToken: candidate.token,
          mountedResetPermit: { current: false },
          owner: active.owner,
          presentation: active.presentation,
          restoreSource:
            !pendingSuccessorEstablished || candidate.targetSquare === null,
          sourceSquare: candidate.source.square,
          stage: 'leased',
        }),
      );
      return true;
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
      model.selection?.value.disabledSquares,
      moveInteraction.getCurrentLifecycle,
      moveInteraction.request,
      pendingLifecycle,
      placeSelectedSpare,
      providerRuntime.drag,
      selectedSpare,
      currentPiecePressEnabled,
      squareActivationEnabled,
      tapEnabled,
    ],
  );
  useLayoutEffect(() => {
    const handoff = terminalBoardDragHandoff;
    if (handoff === null) {
      return;
    }
    // Read the coordinator again at the layout barrier. A child layout effect
    // or synchronous consumer may have replaced the render-time snapshot.
    const active = providerRuntime.drag.getSnapshot().active;
    if (handoff.stage === 'leased') {
      if (
        active?.boardId === handoff.boardId &&
        active.gestureToken === handoff.gestureToken &&
        active.owner === handoff.owner &&
        active.presentation === handoff.presentation &&
        active.source.kind === 'board' &&
        active.source.square === handoff.sourceSquare
      ) {
        // This effect runs only after the latest pending/canonical target (or
        // rejected source restore) has committed. Publish the provider release
        // first so overlay and source ghost retire from one store snapshot.
        providerRuntime.drag.release(handoff.owner, handoff.gestureToken);
      }
      setTerminalBoardDragHandoff((current) =>
        current === handoff
          ? Object.freeze({ ...handoff, stage: 'released' as const })
          : current,
      );
      return;
    }

    // The release-triggered commit has now detached the animated style and
    // child from the retained provider host. Clear its shared values only at
    // this mounted quiescent barrier, never while a replacement gesture uses
    // the same board-local presentation object.
    if (
      handoff.mountedResetPermit.current &&
      active?.presentation !== handoff.presentation
    ) {
      resetInteractionPresentationSharedValues(handoff.presentation);
    }
    setTerminalBoardDragHandoff((current) =>
      current === handoff ? null : current,
    );
  }, [providerDragSnapshot, providerRuntime.drag, terminalBoardDragHandoff]);
  const pendingTargetSquare = pendingLifecycle?.intent.targetSquare ?? null;
  const providerDropTargetSquare =
    providerRegistered &&
    model.boardId !== null &&
    providerDragSnapshot.active?.boardId === model.boardId &&
    providerDragSnapshot.active.targetSquare !== null &&
    gestureGeometry?.visualSquares.includes(
      providerDragSnapshot.active.targetSquare,
    )
      ? providerDragSnapshot.active.targetSquare
      : null;
  const trackSquarePress =
    squarePressCallbackEnabled ||
    (renderSquare !== undefined &&
      (dragEnabled || tapEnabled || annotationGestureEnabled));

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
            boardId={model.boardId ?? ''}
            dropTargetSquare={providerDropTargetSquare}
            layout={layout}
            pendingSourceSquare={pendingSourceSquare}
            pendingTargetSquare={pendingTargetSquare}
            position={model.position}
            pressedSquare={pressedSquare}
            renderSquare={renderSquare}
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
              draggingPieceGhostStyle={draggingPieceGhostStyle}
              layout={layout}
              onPendingCommitCanonicalPrepared={
                handlePendingCommitCanonicalPrepared
              }
              onPendingCommitCanonicalMapperReady={
                handlePendingCommitCanonicalMapperReady
              }
              pendingCommitMapperEnvironment={pendingCommitMapperEnvironment}
              pendingCommitMapperLease={effectivePendingCommitMapperLease}
              pendingCommitPreparation={pendingCommitPreparation}
              pendingCommitTransitionReady={
                effectivePendingCommitStartAcknowledgement
              }
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
          <PendingMoveLayer
            boardId={pendingLifecycle?.boardId ?? model.boardId ?? ''}
            layout={layout}
            lifecycle={pendingLifecycle}
            onPendingCommitActorPrepared={handlePendingCommitActorPrepared}
            pendingCommitMapperEnvironment={pendingCommitMapperEnvironment}
            pendingCommitPreparation={pendingMovePreparation}
            pendingCommitPreparationKind={pendingMovePreparationKind}
            pieceRenderers={pieceRenderers}
            style={pieceStyle}
            transition={positionTransition}
          />
          {(!dragEnabled &&
            !tapEnabled &&
            !annotationGestureEnabled &&
            !trackSquarePress) ||
          gestureGeometry === null ? null : (
            <BoardInteractionController
              activationDistance={activationDistance}
              allowDragOffBoard={allowDragOffBoard}
              {...(annotationGestureEnabled
                ? {
                    annotationRuntime,
                  }
                : {})}
              boardId={model.boardId}
              {...(canDragPiece === undefined ? {} : { canDragPiece })}
              dragEnabled={dragEnabled}
              draggingPieceGhostStyle={draggingPieceGhostStyle}
              draggingPieceStyle={draggingPieceStyle}
              geometry={gestureGeometry}
              onCandidate={handleGestureCandidate}
              onPieceDragStart={handlePieceDragStart}
              onPressedSquareChange={handlePressedSquareChange}
              {...(onSquarePressIn === undefined ? {} : { onSquarePressIn })}
              {...(onSquarePressOut === undefined ? {} : { onSquarePressOut })}
              onTerminalDragCancellation={handleTerminalDragCancellation}
              pieceRenderers={pieceRenderers}
              pieceStyle={pieceStyle}
              position={model.position}
              selectionRevision={model.selection?.revision ?? null}
              spareSelectionRevision={
                selectedSpare === null ? 0 : spareSelectionSnapshot.revision
              }
              tapEnabled={tapEnabled}
              terminalDragAcknowledgement={
                terminalBoardDragHandoff?.stage === 'released'
                  ? terminalBoardDragHandoff
                  : null
              }
              trackPress={trackSquarePress}
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
