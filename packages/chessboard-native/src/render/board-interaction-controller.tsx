import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { ViewStyle } from 'react-native';

import { useReducedMotion } from '../accessibility/reduced-motion';
import { ChessboardProvider } from '../ChessboardProvider';
import { createBoardGestureDetectorKey } from '../internal/board-gesture-detector-key';
import type { NormalizedControlledValue } from '../internal/controlled-domain';
import type { AnnotationGestureCorrelation } from '../internal/annotation-gesture-adapter';
import { canDragCurrentPiece } from '../internal/interaction-permissions';
import { DEFAULT_DRAG_ACTIVATION_DISTANCE } from '../internal/gesture-options';
import type { DragOverlayBounds } from '../internal/drag-overlay-bounds';
import {
  createSquarePressContext,
  emitSquarePress,
} from '../internal/square-press';
import {
  createBoardGestureAdapterState,
  reduceBoardGestureAdapter,
  type BoardGestureAdapterReduction,
  type BoardGestureAdapterState,
  type BoardGestureCorrelation,
  type BoardGestureIntentCandidate,
  type BoardGestureSnapshot,
} from '../internal/board-gesture-adapter';
import {
  projectInteractionPresentation,
  resetInteractionPresentationSharedValues,
  syncInteractionPresentationSharedValues,
  type InteractionPresentationSharedValues,
  useInteractionPresentationSharedValues,
} from '../internal/interaction-presentation';
import {
  useChessboardProvider,
  useOptionalChessboardProvider,
} from '../internal/provider-context';
import type {
  ProviderDragCancellationReason,
  ProviderDragOverlayDescriptor,
  ProviderDragOwner,
} from '../internal/provider-drag-coordinator';
import type { AnnotationInputRuntime } from '../internal/use-annotation-input-runtime';
import type {
  CanDragPiece,
  OnSquarePressIn,
  OnSquarePressOut,
  PieceInteractionContext,
  PieceRenderers,
  PositionObject,
  Revision,
  SquareId,
  SquarePressContext,
} from '../public-types';
import {
  BoardGestureLayer,
  type BoardGestureGeometry,
  type BoardGestureSignal,
} from './board-gesture-layer';
import { resolvePieceRenderer } from './piece-layer';

interface BoardInteractionControllerProps {
  readonly activationDistance?: number;
  readonly allowDragOffBoard?: boolean;
  readonly annotationRuntime?: Readonly<AnnotationInputRuntime>;
  readonly boardId: string;
  readonly canDragPiece?: CanDragPiece;
  readonly dragEnabled?: boolean;
  readonly draggingPieceGhostStyle?: Readonly<ViewStyle>;
  readonly draggingPieceStyle?: Readonly<ViewStyle>;
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly onCandidate?: (
    candidate: Readonly<BoardGestureIntentCandidate>,
  ) => boolean;
  readonly onPieceDragStart?: (
    context: Readonly<PieceInteractionContext>,
  ) => boolean;
  readonly onPressedSquareChange?: (square: SquareId | null) => void;
  readonly onSquarePressIn?: OnSquarePressIn;
  readonly onSquarePressOut?: OnSquarePressOut;
  readonly pieceRenderers: PieceRenderers;
  readonly pieceStyle: Readonly<ViewStyle>;
  readonly position: NormalizedControlledValue<PositionObject>;
  readonly selectionRevision?: Revision | null;
  /** Invalidates retained taps when the provider's selected spare changes. */
  readonly spareSelectionRevision?: Revision;
  readonly tapEnabled?: boolean;
  /** Exact provider lease retired by BoardSurface after its commit barrier. */
  readonly terminalDragAcknowledgement?: Readonly<TerminalBoardDragAcknowledgement> | null;
  readonly trackPress?: boolean;
}

/** Exact identity retained between native drag-end and BoardSurface retirement. */
export interface TerminalBoardDragLease {
  readonly boardId: string;
  readonly gestureToken: number;
  readonly owner: ProviderDragOwner;
  readonly presentation: Readonly<InteractionPresentationSharedValues>;
  readonly sourceSquare: SquareId;
}

/** Mounted-controller permit for BoardSurface's post-detach shared reset. */
export interface TerminalBoardDragAcknowledgement extends TerminalBoardDragLease {
  readonly mountedResetPermit: { current: boolean };
}

function terminalDragLeaseMatches(
  left: Readonly<TerminalBoardDragLease> | null,
  right: Readonly<TerminalBoardDragLease>,
): left is Readonly<TerminalBoardDragLease> {
  return (
    left !== null &&
    left.boardId === right.boardId &&
    left.gestureToken === right.gestureToken &&
    left.owner === right.owner &&
    left.presentation === right.presentation &&
    left.sourceSquare === right.sourceSquare
  );
}

function providerDragMatchesLease(
  active: Readonly<ProviderDragOverlayDescriptor> | null,
  lease: Readonly<TerminalBoardDragLease>,
): active is Readonly<ProviderDragOverlayDescriptor> {
  return (
    active !== null &&
    active.boardId === lease.boardId &&
    active.gestureToken === lease.gestureToken &&
    active.owner === lease.owner &&
    active.presentation === lease.presentation &&
    active.source.kind === 'board' &&
    active.source.square === lease.sourceSquare
  );
}

const EMPTY_OCCUPIED_SQUARES: readonly SquareId[] = Object.freeze([]);
const REJECTED_SIGNAL_GENERATION: Readonly<object> = Object.freeze({});

interface DragOverlayPolicyGeneration {
  readonly allowDragOffBoard: boolean;
  readonly generation: number;
}

function useDragOverlayPolicyGeneration(
  allowDragOffBoard: boolean,
): Readonly<DragOverlayPolicyGeneration> {
  const [policy, setPolicy] = useState<Readonly<DragOverlayPolicyGeneration>>(
    () => Object.freeze({ allowDragOffBoard, generation: 0 }),
  );
  if (policy.allowDragOffBoard === allowDragOffBoard) {
    return policy;
  }
  if (policy.generation === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Board drag overlay policy generation exhausted.');
  }
  const next = Object.freeze({
    allowDragOffBoard,
    generation: policy.generation + 1,
  });
  setPolicy(next);
  return next;
}

function createSnapshot(options: {
  readonly boardId: string;
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly position: NormalizedControlledValue<PositionObject>;
  readonly selectionRevision: Revision | null;
}): Readonly<BoardGestureSnapshot> {
  return Object.freeze({
    boardId: options.boardId,
    geometryEpoch: options.geometry.revision,
    position: options.position.value,
    positionRevision: options.position.revision,
    selectionRevision: options.selectionRevision,
  });
}

function createCorrelation(
  signal: Readonly<BoardGestureSignal>,
  selectionRevision: Revision | null,
): Readonly<BoardGestureCorrelation> {
  return Object.freeze({
    boardId: signal.boardId,
    geometryEpoch: signal.geometryRevision,
    positionRevision: signal.positionRevision,
    selectionRevision:
      signal.type === 'tap' ? signal.selectionRevision : selectionRevision,
    token: signal.gestureToken,
  });
}

type NativeAnnotationSignal = Extract<
  BoardGestureSignal,
  {
    readonly type:
      | 'annotation-start'
      | 'annotation-update'
      | 'annotation-end'
      | 'annotation-cancel';
  }
>;

interface ActiveNativeAnnotationSignal {
  readonly annotationRevision: Revision;
  readonly boardId: string;
  readonly correlation: Readonly<AnnotationGestureCorrelation>;
  readonly geometryRevision: Revision;
  readonly gestureToken: number;
  readonly positionRevision: Revision;
  readonly sourceSquare: SquareId;
}

interface ActiveNativePressSignal {
  readonly boardId: string;
  readonly context: Readonly<SquarePressContext>;
  readonly geometryRevision: Revision;
  readonly gestureToken: number;
  readonly positionRevision: Revision;
  readonly providerGeometryRevision: Revision;
  readonly providerLifecycleRevision: Revision;
  readonly providerTransientRevision: Revision;
  readonly sourceSquare: SquareId;
}

function nativePressSignalMatches(
  active: Readonly<ActiveNativePressSignal> | null,
  signal: Readonly<BoardGestureSignal>,
): active is Readonly<ActiveNativePressSignal> {
  return (
    active !== null &&
    active.boardId === signal.boardId &&
    active.geometryRevision === signal.geometryRevision &&
    active.gestureToken === signal.gestureToken &&
    active.positionRevision === signal.positionRevision &&
    active.sourceSquare === signal.sourceSquare
  );
}

function nativeAnnotationSignalMatches(
  active: Readonly<ActiveNativeAnnotationSignal> | null,
  signal: Readonly<NativeAnnotationSignal>,
): active is Readonly<ActiveNativeAnnotationSignal> {
  return (
    active !== null &&
    active.annotationRevision === signal.annotationRevision &&
    active.boardId === signal.boardId &&
    active.geometryRevision === signal.geometryRevision &&
    active.gestureToken === signal.gestureToken &&
    active.positionRevision === signal.positionRevision &&
    active.sourceSquare === signal.sourceSquare
  );
}

function signalMatchesActive(
  state: Readonly<BoardGestureAdapterState>,
  signal: Readonly<BoardGestureSignal>,
): boolean {
  const active = state.active;
  return (
    active !== null &&
    active.correlation.boardId === signal.boardId &&
    active.correlation.geometryEpoch === signal.geometryRevision &&
    active.correlation.token === signal.gestureToken &&
    active.correlation.positionRevision === signal.positionRevision &&
    active.sourceSquare === signal.sourceSquare
  );
}

function isNativeDragSignal(
  signal: Readonly<BoardGestureSignal>,
): signal is Extract<BoardGestureSignal, { readonly type: `drag-${string}` }> {
  return signal.type.startsWith('drag-');
}

/**
 * Board-private glue between native gesture boundaries and the pure lifecycle.
 *
 * It emits correlated candidates to the current controlled interaction
 * executor, but cannot mutate position or retain a semantic snapshot.
 */
function BoardInteractionControllerContent({
  activationDistance = DEFAULT_DRAG_ACTIVATION_DISTANCE,
  allowDragOffBoard = true,
  annotationRuntime,
  boardId,
  canDragPiece,
  dragEnabled = false,
  draggingPieceGhostStyle: draggingPieceGhostStyleProp,
  draggingPieceStyle: draggingPieceStyleProp,
  geometry,
  onCandidate,
  onPieceDragStart,
  onPressedSquareChange,
  onSquarePressIn,
  onSquarePressOut,
  pieceRenderers,
  pieceStyle,
  position,
  selectionRevision = null,
  spareSelectionRevision = 0,
  tapEnabled = false,
  terminalDragAcknowledgement = null,
  trackPress = false,
}: BoardInteractionControllerProps): ReactElement {
  const draggingPieceStyle = draggingPieceStyleProp ?? pieceStyle;
  const draggingPieceGhostStyle = draggingPieceGhostStyleProp ?? pieceStyle;
  const {
    geometryRevision: providerGeometryRevision,
    lifecycleRevision: providerLifecycleRevision,
    runtime: providerRuntime,
  } = useChessboardProvider();
  const providerTransientRevision = providerRuntime.getTransientRevision();
  const reducedMotion = useReducedMotion();
  const presentation = useInteractionPresentationSharedValues();
  const [providerResetRevision, setProviderResetRevision] = useState(0);
  const [terminalResetLease, setTerminalResetLease] =
    useState<Readonly<TerminalBoardDragLease> | null>(null);
  const providerOwner = useRef<ProviderDragOwner>({});
  const pendingTerminalReset = useRef<Readonly<TerminalBoardDragLease> | null>(
    null,
  );
  const retainedTerminalDrag = useRef<Readonly<TerminalBoardDragLease> | null>(
    null,
  );
  const dragOverlayPolicy = useDragOverlayPolicyGeneration(allowDragOffBoard);
  const dragOverlayPolicyAtCommit = useRef(dragOverlayPolicy);
  const cancelFromProviderAtCommit = useRef<
    (
      reason: ProviderDragCancellationReason,
      lease: Readonly<TerminalBoardDragLease>,
    ) => void
  >(() => undefined);
  const snapshot = useMemo(
    () => createSnapshot({ boardId, geometry, position, selectionRevision }),
    [boardId, geometry, position, selectionRevision],
  );
  const annotationSnapshot = annotationRuntime?.snapshot ?? null;
  const occupiedSquares = useMemo(() => {
    const occupied = geometry.visualSquares.filter((square) =>
      Object.hasOwn(position.value, square),
    );
    return occupied.length === 0
      ? EMPTY_OCCUPIED_SQUARES
      : Object.freeze(occupied);
  }, [geometry.visualSquares, position]);
  const draggableSquares = useMemo(() => {
    if (!dragEnabled) {
      return EMPTY_OCCUPIED_SQUARES;
    }
    const draggable = occupiedSquares.filter((square) => {
      const piece = position.value[square];
      return (
        piece !== undefined &&
        canDragCurrentPiece(canDragPiece, {
          basePositionRevision: position.revision,
          boardId,
          piece,
          source: { kind: 'board', square },
        })
      );
    });
    return draggable.length === 0
      ? EMPTY_OCCUPIED_SQUARES
      : Object.freeze(draggable);
  }, [boardId, canDragPiece, dragEnabled, occupiedSquares, position]);
  const providerGestureResetKey = JSON.stringify([
    providerGeometryRevision,
    providerLifecycleRevision,
    providerResetRevision,
    spareSelectionRevision,
    providerTransientRevision,
  ]);
  const gestureDetectorKey = createBoardGestureDetectorKey({
    activationDistance,
    annotationEnabled: annotationSnapshot !== null,
    boardId,
    dragEnabled,
    draggableSquares,
    geometryRevision: geometry.revision,
    positionRevision: position.revision,
    resetKey: providerGestureResetKey,
    selectionRevision,
    tapEnabled: tapEnabled || annotationSnapshot !== null,
    trackDragTarget: dragEnabled,
    trackPress,
  });
  const signalGeneration = useMemo<Readonly<object>>(
    () => Object.freeze({}),
    [gestureDetectorKey],
  );
  const signalGenerationAtCommit = useRef(signalGeneration);
  const adapter = useRef<Readonly<BoardGestureAdapterState>>(
    createBoardGestureAdapterState({
      boardId,
      geometryEpoch: geometry.revision,
      positionRevision: position.revision,
    }),
  );
  const activeNativeAnnotationSignal =
    useRef<Readonly<ActiveNativeAnnotationSignal> | null>(null);
  const activeNativePressSignal =
    useRef<Readonly<ActiveNativePressSignal> | null>(null);
  const annotationRuntimeAtCommit = useRef(annotationRuntime);
  const acceptingSignals = useRef(true);
  const annotationEnabledAtCommit = useRef(annotationSnapshot !== null);
  const annotationSnapshotAtCommit = useRef(annotationSnapshot);
  const dragEnabledAtCommit = useRef(dragEnabled);
  const draggableSquaresAtCommit = useRef(draggableSquares);
  const interactionEnabledAtCommit = useRef(
    dragEnabled || tapEnabled || trackPress || annotationSnapshot !== null,
  );
  const tapEnabledAtCommit = useRef(tapEnabled);
  const onCandidateAtCommit = useRef(onCandidate);
  const onPieceDragStartAtCommit = useRef(onPieceDragStart);
  const onPressedSquareChangeAtCommit = useRef(onPressedSquareChange);
  const onSquarePressInAtCommit = useRef(onSquarePressIn);
  const onSquarePressOutAtCommit = useRef(onSquarePressOut);
  const snapshotAtCommit = useRef(snapshot);
  const pieceSize = Math.min(
    geometry.width / geometry.columns,
    geometry.height / geometry.rows,
  );
  const dragOverlayBounds = useMemo<Readonly<DragOverlayBounds>>(
    () =>
      Object.freeze({
        height: geometry.height,
        kind: 'gesture' as const,
        width: geometry.width,
      }),
    [geometry.height, geometry.width],
  );

  const finishNativePress = useCallback(
    (signal?: Readonly<BoardGestureSignal>): boolean => {
      const active = activeNativePressSignal.current;
      if (
        active === null ||
        (signal !== undefined && !nativePressSignalMatches(active, signal))
      ) {
        return false;
      }
      activeNativePressSignal.current = null;
      onPressedSquareChangeAtCommit.current?.(null);
      emitSquarePress(onSquarePressOutAtCommit.current, active.context);
      return true;
    },
    [],
  );

  const applyReduction = useCallback(
    (reduction: Readonly<BoardGestureAdapterReduction>): void => {
      const previousState = adapter.current;
      const previousDragToken =
        previousState.lifecycle.phase === 'drag'
          ? previousState.active?.correlation.token
          : undefined;
      const previousDragSourceSquare =
        previousState.lifecycle.phase === 'drag'
          ? previousState.active?.sourceSquare
          : undefined;
      // A reentrant/new native start supersedes an older terminal handoff.
      // Its provider claim below reuses this controller's presentation, so
      // the old BoardSurface ACK must not clear or reset the successor.
      if (
        retainedTerminalDrag.current !== null &&
        reduction.state.lifecycle.phase === 'drag'
      ) {
        retainedTerminalDrag.current = null;
      }
      if (
        pendingTerminalReset.current !== null &&
        reduction.state.lifecycle.phase === 'drag'
      ) {
        pendingTerminalReset.current = null;
        setTerminalResetLease(null);
      }
      adapter.current = reduction.state;
      const retainsTerminalPresentation = retainedTerminalDrag.current !== null;
      const providerActiveBeforeSync =
        providerRuntime.drag.getSnapshot().active;
      const providerDescriptorBelongsToPreviousDrag =
        previousState.lifecycle.phase === 'drag' &&
        previousDragToken !== undefined &&
        previousDragSourceSquare !== undefined &&
        providerActiveBeforeSync?.boardId === boardId &&
        providerActiveBeforeSync.gestureToken === previousDragToken &&
        providerActiveBeforeSync.owner === providerOwner.current &&
        providerActiveBeforeSync.presentation === presentation &&
        providerActiveBeforeSync.source.kind === 'board' &&
        providerActiveBeforeSync.source.square === previousDragSourceSquare;
      const unrelatedProviderUsesPresentation =
        providerActiveBeforeSync?.presentation === presentation &&
        !providerDescriptorBelongsToPreviousDrag;
      if (!retainsTerminalPresentation && !unrelatedProviderUsesPresentation) {
        syncInteractionPresentationSharedValues(
          presentation,
          projectInteractionPresentation(reduction.state.lifecycle),
        );
      }
      const lifecycle = reduction.state.lifecycle;
      if (
        lifecycle.phase === 'drag' &&
        lifecycle.context.source.kind === 'board'
      ) {
        const active = reduction.state.active;
        if (active !== null) {
          const piece = lifecycle.context.piece;
          const sourceSquare = lifecycle.context.source.square;
          const lease: Readonly<TerminalBoardDragLease> = Object.freeze({
            boardId,
            gestureToken: active.correlation.token,
            owner: providerOwner.current,
            presentation,
            sourceSquare,
          });
          providerRuntime.drag.claim(
            Object.freeze({
              boardId,
              bounds: dragOverlayPolicyAtCommit.current.allowDragOffBoard
                ? null
                : dragOverlayBounds,
              gestureToken: active.correlation.token,
              onCancel: (reason: ProviderDragCancellationReason): void => {
                cancelFromProviderAtCommit.current(reason, lease);
              },
              owner: providerOwner.current,
              piece,
              presentation,
              reducedMotion,
              renderer: resolvePieceRenderer(pieceRenderers, piece.pieceType),
              size: pieceSize,
              sourceGhostStyle: draggingPieceGhostStyle,
              source: Object.freeze({
                kind: 'board' as const,
                square: sourceSquare,
              }),
              square: sourceSquare,
              style: draggingPieceStyle,
              targetSquare: lifecycle.targetSquare,
            }),
          );
          if (
            !retainsTerminalPresentation &&
            unrelatedProviderUsesPresentation
          ) {
            // The claim above atomically replaced the foreign descriptor. Only
            // now is it safe for this controller to synchronize its values.
            syncInteractionPresentationSharedValues(
              presentation,
              projectInteractionPresentation(reduction.state.lifecycle),
            );
          }
          if (previousDragToken !== active.correlation.token) {
            onPieceDragStartAtCommit.current?.(lifecycle.context);
          }
        }
      } else if (
        !retainsTerminalPresentation &&
        providerDescriptorBelongsToPreviousDrag
      ) {
        const active = providerRuntime.drag.getSnapshot().active;
        if (
          active?.boardId === boardId &&
          active.gestureToken === previousDragToken &&
          active.owner === providerOwner.current &&
          active.presentation === presentation &&
          active.source.kind === 'board' &&
          active.source.square === previousDragSourceSquare
        ) {
          providerRuntime.drag.release(
            providerOwner.current,
            active.gestureToken,
          );
        }
      }
    },
    [
      boardId,
      dragOverlayBounds,
      draggingPieceGhostStyle,
      draggingPieceStyle,
      pieceRenderers,
      pieceSize,
      presentation,
      providerRuntime,
      reducedMotion,
    ],
  );

  const queueTerminalPresentationReset = useCallback(
    (lease: Readonly<TerminalBoardDragLease>): void => {
      if (!acceptingSignals.current) {
        return;
      }
      pendingTerminalReset.current = lease;
      setTerminalResetLease(lease);
    },
    [],
  );

  const retireTerminalDrag = useCallback(
    (lease: Readonly<TerminalBoardDragLease>): void => {
      if (terminalDragLeaseMatches(retainedTerminalDrag.current, lease)) {
        retainedTerminalDrag.current = null;
      }
      if (!acceptingSignals.current) {
        return;
      }
      const active = providerRuntime.drag.getSnapshot().active;
      if (providerDragMatchesLease(active, lease)) {
        providerRuntime.drag.release(lease.owner, lease.gestureToken);
      }
      queueTerminalPresentationReset(lease);
    },
    [providerRuntime.drag, queueTerminalPresentationReset],
  );

  const cancelAnnotation = useCallback((): void => {
    annotationRuntimeAtCommit.current?.cancel();
  }, []);

  const cancelFromProvider = useCallback(
    (
      reason: ProviderDragCancellationReason,
      lease: Readonly<TerminalBoardDragLease>,
    ): void => {
      const activeGesture = adapter.current.active;
      const correlation = activeGesture?.correlation;
      if (
        correlation?.boardId !== lease.boardId ||
        correlation.token !== lease.gestureToken ||
        activeGesture?.sourceSquare !== lease.sourceSquare
      ) {
        return;
      }
      signalGenerationAtCommit.current = REJECTED_SIGNAL_GENERATION;
      const reduction = reduceBoardGestureAdapter(adapter.current, {
        correlation,
        reason:
          reason === 'app-background'
            ? 'app-background'
            : reason === 'geometry-change'
              ? 'geometry-change'
              : reason === 'unmount'
                ? 'unmount'
                : 'user',
        type: 'cancel',
      });
      if (reason === 'unmount') {
        // The provider already revoked the lease. Keep reducer correlation
        // correct, but do not queue presentation writes or React state while
        // Fabric is deleting this controller's native subtree.
        adapter.current = reduction.state;
        return;
      }
      if (acceptingSignals.current) {
        setProviderResetRevision((revision) => {
          if (revision === Number.MAX_SAFE_INTEGER) {
            throw new RangeError(
              'Board interaction provider reset revision exhausted.',
            );
          }
          return revision + 1;
        });
      }
      if (reason === 'replacement') {
        // The coordinator has revoked this lease but has not published the
        // replacement yet. It may intentionally reuse the same presentation,
        // so advance semantics without any shared write or provider release.
        adapter.current = reduction.state;
        return;
      }
      applyReduction(reduction);
    },
    [applyReduction],
  );

  const cleanRejectedTerminalSignal = useCallback(
    (signal: Readonly<BoardGestureSignal>): void => {
      if (
        signal.type !== 'drag-end' ||
        !acceptingSignals.current ||
        terminalDragLeaseMatches(retainedTerminalDrag.current, {
          boardId: signal.boardId,
          gestureToken: signal.gestureToken,
          owner: providerOwner.current,
          presentation,
          sourceSquare: signal.sourceSquare,
        })
      ) {
        return;
      }
      retireTerminalDrag(
        Object.freeze({
          boardId: signal.boardId,
          gestureToken: signal.gestureToken,
          owner: providerOwner.current,
          presentation,
          sourceSquare: signal.sourceSquare,
        }),
      );
    },
    [presentation, retireTerminalDrag],
  );

  const handleSignal = useCallback(
    (signal: Readonly<BoardGestureSignal>): void => {
      if (
        !acceptingSignals.current ||
        signalGenerationAtCommit.current !== signalGeneration ||
        !interactionEnabledAtCommit.current ||
        providerRuntime.getGeometryRevision() !== providerGeometryRevision ||
        providerRuntime.getTransientRevision() !== providerTransientRevision ||
        signal.boardId !== boardId
      ) {
        cleanRejectedTerminalSignal(signal);
        return;
      }
      if (
        isNativeDragSignal(signal) &&
        (signal.allowDragOffBoard !==
          dragOverlayPolicyAtCommit.current.allowDragOffBoard ||
          signal.allowDragOffBoardGeneration !==
            dragOverlayPolicyAtCommit.current.generation)
      ) {
        cleanRejectedTerminalSignal(signal);
        return;
      }
      const currentSnapshot = snapshotAtCommit.current;

      switch (signal.type) {
        case 'drag-start': {
          if (
            !dragEnabledAtCommit.current ||
            !draggableSquaresAtCommit.current.includes(signal.sourceSquare)
          ) {
            return;
          }
          finishNativePress();
          cancelAnnotation();
          const correlation = createCorrelation(
            signal,
            currentSnapshot.selectionRevision,
          );
          let reduction = reduceBoardGestureAdapter(adapter.current, {
            correlation,
            snapshot: currentSnapshot,
            sourceSquare: signal.sourceSquare,
            type: 'drag-start',
          });
          if (
            reduction.state.active !== null &&
            signal.targetSquare !== signal.sourceSquare
          ) {
            reduction = reduceBoardGestureAdapter(reduction.state, {
              correlation,
              targetSquare: signal.targetSquare,
              type: 'drag-update',
            });
          }
          applyReduction(reduction);
          return;
        }
        case 'drag-end': {
          if (!signalMatchesActive(adapter.current, signal)) {
            cleanRejectedTerminalSignal(signal);
            return;
          }
          const correlation = adapter.current.active?.correlation;
          if (correlation === undefined) {
            cleanRejectedTerminalSignal(signal);
            return;
          }
          const reduction = reduceBoardGestureAdapter(adapter.current, {
            correlation,
            snapshot: currentSnapshot,
            targetSquare: signal.targetSquare,
            type: 'drag-finalize',
          });
          const terminalCandidate = reduction.candidate;
          const active = providerRuntime.drag.getSnapshot().active;
          const terminalLease: Readonly<TerminalBoardDragLease> | null =
            active?.boardId === boardId &&
            active.gestureToken === signal.gestureToken &&
            active.owner === providerOwner.current &&
            active.presentation === presentation &&
            active.source.kind === 'board' &&
            active.source.square === signal.sourceSquare
              ? Object.freeze({
                  boardId,
                  gestureToken: signal.gestureToken,
                  owner: providerOwner.current,
                  presentation,
                  sourceSquare: signal.sourceSquare,
                })
              : null;
          if (terminalCandidate?.input !== 'drag' || terminalLease === null) {
            if (terminalLease !== null) {
              adapter.current = reduction.state;
              retireTerminalDrag(terminalLease);
              return;
            }
            applyReduction(reduction);
            return;
          }
          // Advance the semantic adapter and establish exact terminal
          // ownership before invoking app code. A synchronous controlled
          // commit, replacement, permission change, or unmount therefore
          // cannot observe the old gesture as active or retire a foreign one.
          adapter.current = reduction.state;
          retainedTerminalDrag.current = terminalLease;
          let accepted = false;
          try {
            accepted =
              onCandidateAtCommit.current?.(terminalCandidate) === true;
          } catch {
            // A consumer exception rejects the exact terminal lease below.
          }
          if (!accepted) {
            retireTerminalDrag(terminalLease);
          }
          return;
        }
        case 'drag-target': {
          if (!signalMatchesActive(adapter.current, signal)) {
            return;
          }
          const correlation = adapter.current.active?.correlation;
          if (correlation === undefined) {
            return;
          }
          applyReduction(
            reduceBoardGestureAdapter(adapter.current, {
              correlation,
              targetSquare: signal.targetSquare,
              type: 'drag-update',
            }),
          );
          return;
        }
        case 'drag-cancel': {
          if (!signalMatchesActive(adapter.current, signal)) {
            return;
          }
          const correlation = adapter.current.active?.correlation;
          if (correlation === undefined) {
            return;
          }
          applyReduction(
            reduceBoardGestureAdapter(adapter.current, {
              correlation,
              reason: signal.reason,
              type: 'cancel',
            }),
          );
          return;
        }
        case 'tap': {
          finishNativePress(signal);
          const currentAnnotationSnapshot = annotationSnapshotAtCommit.current;
          if (currentAnnotationSnapshot !== null) {
            if (
              !annotationEnabledAtCommit.current ||
              signal.annotationRevision === null ||
              signal.annotationRevision !==
                currentAnnotationSnapshot.annotationRevision ||
              signal.geometryRevision !==
                currentAnnotationSnapshot.geometryEpoch ||
              signal.positionRevision !==
                currentAnnotationSnapshot.positionRevision
            ) {
              return;
            }
            activeNativeAnnotationSignal.current = null;
            annotationRuntimeAtCommit.current?.activate(
              'touch',
              signal.targetSquare,
            );
            return;
          }
          if (!tapEnabledAtCommit.current) {
            return;
          }
          const reduction = reduceBoardGestureAdapter(adapter.current, {
            correlation: createCorrelation(
              signal,
              currentSnapshot.selectionRevision,
            ),
            endSquare: signal.targetSquare,
            snapshot: currentSnapshot,
            startSquare: signal.sourceSquare,
            type: 'tap',
          });
          applyReduction(reduction);
          if (reduction.candidate !== null) {
            onCandidateAtCommit.current?.(reduction.candidate);
          }
          return;
        }
        case 'press-start': {
          if (
            !trackPress ||
            currentSnapshot.position === null ||
            signal.geometryRevision !== currentSnapshot.geometryEpoch ||
            signal.positionRevision !== currentSnapshot.positionRevision ||
            !geometry.visualSquares.includes(signal.sourceSquare)
          ) {
            return;
          }
          if (
            nativePressSignalMatches(activeNativePressSignal.current, signal)
          ) {
            return;
          }
          finishNativePress();
          const context = createSquarePressContext({
            basePositionRevision: currentSnapshot.positionRevision,
            boardId,
            piece: currentSnapshot.position[signal.sourceSquare] ?? null,
            square: signal.sourceSquare,
          });
          activeNativePressSignal.current = Object.freeze({
            boardId: signal.boardId,
            context,
            geometryRevision: signal.geometryRevision,
            gestureToken: signal.gestureToken,
            positionRevision: signal.positionRevision,
            providerGeometryRevision,
            providerLifecycleRevision,
            providerTransientRevision,
            sourceSquare: signal.sourceSquare,
          });
          onPressedSquareChangeAtCommit.current?.(signal.sourceSquare);
          emitSquarePress(onSquarePressInAtCommit.current, context);
          return;
        }
        case 'press-end': {
          finishNativePress(signal);
          return;
        }
        case 'annotation-start': {
          const currentAnnotationSnapshot = annotationSnapshotAtCommit.current;
          if (
            currentAnnotationSnapshot === null ||
            !annotationEnabledAtCommit.current ||
            signal.annotationRevision !==
              currentAnnotationSnapshot.annotationRevision ||
            signal.geometryRevision !==
              currentAnnotationSnapshot.geometryEpoch ||
            signal.positionRevision !==
              currentAnnotationSnapshot.positionRevision
          ) {
            return;
          }
          finishNativePress();
          const activeCorrelation = adapter.current.active?.correlation;
          if (activeCorrelation !== undefined) {
            applyReduction(
              reduceBoardGestureAdapter(adapter.current, {
                correlation: activeCorrelation,
                reason: 'user',
                type: 'cancel',
              }),
            );
          }
          const correlation = annotationRuntimeAtCommit.current?.start(
            'touch',
            signal.gestureKind,
            signal.sourceSquare,
            signal.targetSquare,
          );
          activeNativeAnnotationSignal.current =
            correlation === null || correlation === undefined
              ? null
              : Object.freeze({
                  annotationRevision: signal.annotationRevision,
                  boardId: signal.boardId,
                  correlation,
                  geometryRevision: signal.geometryRevision,
                  gestureToken: signal.gestureToken,
                  positionRevision: signal.positionRevision,
                  sourceSquare: signal.sourceSquare,
                });
          return;
        }
        case 'annotation-update': {
          const active = activeNativeAnnotationSignal.current;
          if (!nativeAnnotationSignalMatches(active, signal)) {
            return;
          }
          annotationRuntimeAtCommit.current?.update(
            active.correlation,
            signal.targetSquare,
          );
          return;
        }
        case 'annotation-end': {
          const active = activeNativeAnnotationSignal.current;
          if (!nativeAnnotationSignalMatches(active, signal)) {
            return;
          }
          activeNativeAnnotationSignal.current = null;
          annotationRuntimeAtCommit.current?.finalize(
            active.correlation,
            signal.targetSquare,
          );
          return;
        }
        case 'annotation-cancel': {
          const active = activeNativeAnnotationSignal.current;
          if (!nativeAnnotationSignalMatches(active, signal)) {
            return;
          }
          activeNativeAnnotationSignal.current = null;
          annotationRuntimeAtCommit.current?.cancel(active.correlation);
        }
      }
    },
    [
      applyReduction,
      boardId,
      cancelAnnotation,
      cleanRejectedTerminalSignal,
      providerGeometryRevision,
      providerRuntime,
      providerTransientRevision,
      retireTerminalDrag,
      signalGeneration,
      finishNativePress,
      geometry.visualSquares,
      presentation,
      trackPress,
    ],
  );

  useLayoutEffect(() => {
    annotationRuntimeAtCommit.current = annotationRuntime;
    cancelFromProviderAtCommit.current = cancelFromProvider;
    onCandidateAtCommit.current = onCandidate;
    onPieceDragStartAtCommit.current = onPieceDragStart;
    onPressedSquareChangeAtCommit.current = onPressedSquareChange;
    onSquarePressInAtCommit.current = onSquarePressIn;
    onSquarePressOutAtCommit.current = onSquarePressOut;
  }, [
    annotationRuntime,
    cancelFromProvider,
    onCandidate,
    onPieceDragStart,
    onPressedSquareChange,
    onSquarePressIn,
    onSquarePressOut,
  ]);

  useLayoutEffect(() => {
    const changed =
      dragOverlayPolicyAtCommit.current.generation !==
      dragOverlayPolicy.generation;
    dragOverlayPolicyAtCommit.current = dragOverlayPolicy;
    if (!changed || adapter.current.lifecycle.phase !== 'drag') {
      return;
    }
    const currentActive = adapter.current.active;
    if (currentActive === null) {
      return;
    }
    const active = providerRuntime.drag.getSnapshot().active;
    if (
      active?.boardId === boardId &&
      active.gestureToken === currentActive.correlation.token &&
      active.owner === providerOwner.current &&
      active.presentation === presentation &&
      active.source.kind === 'board' &&
      active.source.square === currentActive.sourceSquare
    ) {
      providerRuntime.drag.cancel(
        providerOwner.current,
        active.gestureToken,
        'user',
      );
      return;
    }
    cancelFromProviderAtCommit.current(
      'user',
      Object.freeze({
        boardId,
        gestureToken: currentActive.correlation.token,
        owner: providerOwner.current,
        presentation,
        sourceSquare: currentActive.sourceSquare,
      }),
    );
  }, [boardId, dragOverlayPolicy, presentation, providerRuntime]);

  useLayoutEffect(() => {
    const signalGenerationChanged =
      signalGenerationAtCommit.current !== signalGeneration;
    signalGenerationAtCommit.current = signalGeneration;
    snapshotAtCommit.current = snapshot;
    annotationEnabledAtCommit.current = annotationSnapshot !== null;
    annotationSnapshotAtCommit.current = annotationSnapshot;
    dragEnabledAtCommit.current = dragEnabled;
    draggableSquaresAtCommit.current = draggableSquares;
    interactionEnabledAtCommit.current =
      dragEnabled || tapEnabled || trackPress || annotationSnapshot !== null;
    tapEnabledAtCommit.current = tapEnabled;
    const activePress = activeNativePressSignal.current;
    if (
      activePress !== null &&
      (!trackPress ||
        activePress.boardId !== snapshot.boardId ||
        activePress.geometryRevision !== snapshot.geometryEpoch ||
        activePress.positionRevision !== snapshot.positionRevision ||
        activePress.providerGeometryRevision !== providerGeometryRevision ||
        activePress.providerLifecycleRevision !== providerLifecycleRevision ||
        activePress.providerTransientRevision !== providerTransientRevision)
    ) {
      finishNativePress();
    }
    let reduction = reduceBoardGestureAdapter(adapter.current, {
      snapshot,
      type: 'synchronize',
    });
    if (signalGenerationChanged) {
      activeNativeAnnotationSignal.current = null;
      annotationRuntimeAtCommit.current?.cancel();
      finishNativePress();
    }
    const activeCorrelation = reduction.state.active?.correlation;
    const activeSource = reduction.state.active?.sourceSquare;
    const activeInput = reduction.state.lifecycle.phase;
    const activeInputAllowed =
      activeInput === 'drag'
        ? activeSource !== undefined && draggableSquares.includes(activeSource)
        : activeInput === 'tap'
          ? tapEnabled
          : true;
    if (
      activeCorrelation !== undefined &&
      (signalGenerationChanged ||
        !(dragEnabled || tapEnabled) ||
        !activeInputAllowed)
    ) {
      reduction = reduceBoardGestureAdapter(reduction.state, {
        correlation: activeCorrelation,
        reason: signalGenerationChanged ? 'user' : 'permissions-change',
        type: 'cancel',
      });
    }
    applyReduction(reduction);
  }, [
    annotationSnapshot,
    applyReduction,
    dragEnabled,
    draggableSquares,
    snapshot,
    tapEnabled,
    trackPress,
    providerGeometryRevision,
    providerLifecycleRevision,
    providerTransientRevision,
    signalGeneration,
    finishNativePress,
  ]);

  useLayoutEffect(() => {
    const lease = terminalResetLease;
    if (
      lease === null ||
      pendingTerminalReset.current !== lease ||
      lease.boardId !== boardId ||
      lease.owner !== providerOwner.current ||
      lease.presentation !== presentation
    ) {
      return;
    }
    const active = providerRuntime.drag.getSnapshot().active;
    if (active?.presentation !== lease.presentation) {
      // The provider release has now committed the restored source and a
      // quiescent overlay host. This mounted controller may safely clear the
      // detached presentation; a same-presentation replacement blocks it.
      resetInteractionPresentationSharedValues(lease.presentation);
    }
    pendingTerminalReset.current = null;
    setTerminalResetLease((current) => (current === lease ? null : current));
  }, [boardId, presentation, providerRuntime.drag, terminalResetLease]);

  useLayoutEffect(() => {
    if (
      terminalDragAcknowledgement?.boardId !== boardId ||
      terminalDragAcknowledgement.owner !== providerOwner.current ||
      terminalDragAcknowledgement.presentation !== presentation
    ) {
      return;
    }
    if (
      terminalDragLeaseMatches(
        retainedTerminalDrag.current,
        terminalDragAcknowledgement,
      )
    ) {
      // BoardSurface has already committed the pending/canonical successor
      // and detached this exact provider overlay. It owns the following
      // quiescent presentation reset; this ACK only retires controller state.
      retainedTerminalDrag.current = null;
    }
    // The child is still mounted in this quiescent commit, so the parent may
    // safely clear this presentation after all child layout effects finish.
    terminalDragAcknowledgement.mountedResetPermit.current = true;
  }, [boardId, presentation, terminalDragAcknowledgement]);

  useLayoutEffect(() => {
    acceptingSignals.current = true;
    return () => {
      acceptingSignals.current = false;
      signalGenerationAtCommit.current = REJECTED_SIGNAL_GENERATION;
      annotationEnabledAtCommit.current = false;
      annotationSnapshotAtCommit.current = null;
      dragEnabledAtCommit.current = false;
      interactionEnabledAtCommit.current = false;
      tapEnabledAtCommit.current = false;
      const terminalLease = retainedTerminalDrag.current;
      retainedTerminalDrag.current = null;
      pendingTerminalReset.current = null;
      const correlation = adapter.current.active?.correlation;
      const sourceSquare = adapter.current.active?.sourceSquare;
      if (correlation !== undefined) {
        adapter.current = reduceBoardGestureAdapter(adapter.current, {
          correlation,
          reason: 'unmount',
          type: 'cancel',
        }).state;
      }
      activeNativeAnnotationSignal.current = null;
      activeNativePressSignal.current = null;
      onPressedSquareChangeAtCommit.current?.(null);
      annotationRuntimeAtCommit.current?.cancel();
      const active = providerRuntime.drag.getSnapshot().active;
      if (
        terminalLease !== null &&
        providerDragMatchesLease(active, terminalLease)
      ) {
        providerRuntime.drag.release(
          terminalLease.owner,
          terminalLease.gestureToken,
        );
      } else if (
        correlation !== undefined &&
        active?.boardId === boardId &&
        active.gestureToken === correlation.token &&
        active.owner === providerOwner.current &&
        active.presentation === presentation &&
        active.source.kind === 'board' &&
        active.source.square === sourceSquare
      ) {
        providerRuntime.drag.release(providerOwner.current, correlation.token);
      }
      // Do not mutate UI-thread presentation values during teardown. Their
      // consumers are being removed in the same Fabric commit, so queued
      // Reanimated writes could otherwise target an already-deleted host.
    };
  }, [boardId, presentation, providerRuntime]);

  const shouldResetPresentation = useCallback((): boolean => {
    const active = providerRuntime.drag.getSnapshot().active;
    if (active?.presentation !== presentation) {
      return true;
    }
    const current = adapter.current;
    return (
      current.lifecycle.phase === 'drag' &&
      current.active !== null &&
      active.boardId === boardId &&
      active.gestureToken === current.active.correlation.token &&
      active.owner === providerOwner.current &&
      active.source.kind === 'board' &&
      active.source.square === current.active.sourceSquare
    );
  }, [boardId, presentation, providerRuntime.drag]);

  return (
    <BoardGestureLayer
      activationDistance={activationDistance}
      allowDragOffBoard={dragOverlayPolicy.allowDragOffBoard}
      allowDragOffBoardGeneration={dragOverlayPolicy.generation}
      annotationEnabled={annotationSnapshot !== null}
      annotationRevision={annotationSnapshot?.annotationRevision ?? null}
      boardId={boardId}
      dragEnabled={dragEnabled}
      draggableSquares={draggableSquares}
      geometry={geometry}
      onSignal={handleSignal}
      positionRevision={position.revision}
      presentation={presentation}
      resetKey={providerGestureResetKey}
      selectionRevision={selectionRevision}
      shouldResetPresentation={shouldResetPresentation}
      tapEnabled={tapEnabled || annotationSnapshot !== null}
      trackDragTarget={dragEnabled}
      trackPress={trackPress}
    />
  );
}

export function BoardInteractionController(
  props: BoardInteractionControllerProps,
): ReactElement {
  const provider = useOptionalChessboardProvider();
  if (provider === null) {
    return (
      <ChessboardProvider>
        <BoardInteractionControllerContent {...props} />
      </ChessboardProvider>
    );
  }
  return <BoardInteractionControllerContent {...props} />;
}
