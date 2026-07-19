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
import type { NormalizedControlledValue } from '../internal/controlled-domain';
import type { AnnotationGestureCorrelation } from '../internal/annotation-gesture-adapter';
import { canDragCurrentPiece } from '../internal/interaction-permissions';
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
  useInteractionPresentationSharedValues,
} from '../internal/interaction-presentation';
import {
  useChessboardProvider,
  useOptionalChessboardProvider,
} from '../internal/provider-context';
import type {
  ProviderDragCancellationReason,
  ProviderDragOwner,
} from '../internal/provider-drag-coordinator';
import type { AnnotationInputRuntime } from '../internal/use-annotation-input-runtime';
import type {
  CanDragPiece,
  PieceRenderers,
  PositionObject,
  Revision,
  SquareId,
} from '../public-types';
import {
  BoardGestureLayer,
  type BoardGestureGeometry,
  type BoardGestureSignal,
} from './board-gesture-layer';
import { resolvePieceRenderer } from './piece-layer';

interface BoardInteractionControllerProps {
  readonly annotationRuntime?: Readonly<AnnotationInputRuntime>;
  readonly boardId: string;
  readonly canDragPiece?: CanDragPiece;
  readonly dragEnabled?: boolean;
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly onCandidate?: (
    candidate: Readonly<BoardGestureIntentCandidate>,
  ) => void;
  readonly onDragSourceChange?: (sourceSquare: SquareId | null) => void;
  readonly pieceRenderers: PieceRenderers;
  readonly pieceStyle: Readonly<ViewStyle>;
  readonly position: NormalizedControlledValue<PositionObject>;
  readonly selectionRevision?: Revision | null;
  readonly tapEnabled?: boolean;
}

const EMPTY_OCCUPIED_SQUARES: readonly SquareId[] = Object.freeze([]);

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

/**
 * Board-private glue between native gesture boundaries and the pure lifecycle.
 *
 * It emits correlated candidates to the current controlled interaction
 * executor, but cannot mutate position or retain a semantic snapshot.
 */
function BoardInteractionControllerContent({
  annotationRuntime,
  boardId,
  canDragPiece,
  dragEnabled = false,
  geometry,
  onCandidate,
  onDragSourceChange,
  pieceRenderers,
  pieceStyle,
  position,
  selectionRevision = null,
  tapEnabled = false,
}: BoardInteractionControllerProps): ReactElement {
  const {
    geometryRevision: providerGeometryRevision,
    lifecycleRevision: providerLifecycleRevision,
    runtime: providerRuntime,
  } = useChessboardProvider();
  const providerTransientRevision = providerRuntime.getTransientRevision();
  const reducedMotion = useReducedMotion();
  const presentation = useInteractionPresentationSharedValues();
  const [providerResetRevision, setProviderResetRevision] = useState(0);
  const providerOwner = useRef<ProviderDragOwner>({});
  const cancelFromProviderAtCommit = useRef<
    (reason: ProviderDragCancellationReason) => void
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
  const adapter = useRef<Readonly<BoardGestureAdapterState>>(
    createBoardGestureAdapterState({
      boardId,
      geometryEpoch: geometry.revision,
      positionRevision: position.revision,
    }),
  );
  const activeNativeAnnotationSignal =
    useRef<Readonly<ActiveNativeAnnotationSignal> | null>(null);
  const annotationRuntimeAtCommit = useRef(annotationRuntime);
  const acceptingSignals = useRef(true);
  const annotationEnabledAtCommit = useRef(annotationSnapshot !== null);
  const annotationSnapshotAtCommit = useRef(annotationSnapshot);
  const dragEnabledAtCommit = useRef(dragEnabled);
  const draggableSquaresAtCommit = useRef(draggableSquares);
  const interactionEnabledAtCommit = useRef(
    dragEnabled || tapEnabled || annotationSnapshot !== null,
  );
  const tapEnabledAtCommit = useRef(tapEnabled);
  const onCandidateAtCommit = useRef(onCandidate);
  const onDragSourceChangeAtCommit = useRef(onDragSourceChange);
  const snapshotAtCommit = useRef(snapshot);
  const pieceSize = Math.min(
    geometry.width / geometry.columns,
    geometry.height / geometry.rows,
  );

  const applyReduction = useCallback(
    (reduction: Readonly<BoardGestureAdapterReduction>): void => {
      adapter.current = reduction.state;
      syncInteractionPresentationSharedValues(
        presentation,
        projectInteractionPresentation(reduction.state.lifecycle),
      );
      const lifecycle = reduction.state.lifecycle;
      if (
        lifecycle.phase === 'drag' &&
        lifecycle.context.source.kind === 'board'
      ) {
        const active = reduction.state.active;
        if (active !== null) {
          const piece = lifecycle.context.piece;
          const sourceSquare = lifecycle.context.source.square;
          providerRuntime.drag.claim(
            Object.freeze({
              boardId,
              gestureToken: active.correlation.token,
              onCancel: (reason: ProviderDragCancellationReason): void => {
                cancelFromProviderAtCommit.current(reason);
              },
              owner: providerOwner.current,
              piece,
              presentation,
              reducedMotion,
              renderer: resolvePieceRenderer(pieceRenderers, piece.pieceType),
              size: pieceSize,
              source: Object.freeze({
                kind: 'board' as const,
                square: sourceSquare,
              }),
              square: sourceSquare,
              style: pieceStyle,
            }),
          );
          onDragSourceChangeAtCommit.current?.(sourceSquare);
        }
      } else {
        const active = providerRuntime.drag.getSnapshot().active;
        if (active?.owner === providerOwner.current) {
          providerRuntime.drag.release(
            providerOwner.current,
            active.gestureToken,
          );
        }
        onDragSourceChangeAtCommit.current?.(null);
      }
      if (reduction.candidate !== null) {
        onCandidateAtCommit.current?.(reduction.candidate);
      }
    },
    [
      boardId,
      pieceRenderers,
      pieceSize,
      pieceStyle,
      presentation,
      providerRuntime,
      reducedMotion,
    ],
  );

  const cancelAnnotation = useCallback((): void => {
    annotationRuntimeAtCommit.current?.cancel();
  }, []);

  const cancelFromProvider = useCallback(
    (reason: ProviderDragCancellationReason): void => {
      const correlation = adapter.current.active?.correlation;
      if (correlation === undefined) {
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
      applyReduction(
        reduceBoardGestureAdapter(adapter.current, {
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
        }),
      );
    },
    [applyReduction],
  );

  const handleSignal = useCallback(
    (signal: Readonly<BoardGestureSignal>): void => {
      if (
        !acceptingSignals.current ||
        !interactionEnabledAtCommit.current ||
        providerRuntime.getGeometryRevision() !== providerGeometryRevision ||
        providerRuntime.getTransientRevision() !== providerTransientRevision ||
        signal.boardId !== boardId
      ) {
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
            return;
          }
          const correlation = adapter.current.active?.correlation;
          if (correlation === undefined) {
            return;
          }
          applyReduction(
            reduceBoardGestureAdapter(adapter.current, {
              correlation,
              snapshot: currentSnapshot,
              targetSquare: signal.targetSquare,
              type: 'drag-finalize',
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
          applyReduction(
            reduceBoardGestureAdapter(adapter.current, {
              correlation: createCorrelation(
                signal,
                currentSnapshot.selectionRevision,
              ),
              endSquare: signal.targetSquare,
              snapshot: currentSnapshot,
              startSquare: signal.sourceSquare,
              type: 'tap',
            }),
          );
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
      providerGeometryRevision,
      providerRuntime,
      providerTransientRevision,
    ],
  );

  useLayoutEffect(() => {
    annotationRuntimeAtCommit.current = annotationRuntime;
    cancelFromProviderAtCommit.current = cancelFromProvider;
    onCandidateAtCommit.current = onCandidate;
    onDragSourceChangeAtCommit.current = onDragSourceChange;
  }, [annotationRuntime, cancelFromProvider, onCandidate, onDragSourceChange]);

  useLayoutEffect(() => {
    snapshotAtCommit.current = snapshot;
    annotationEnabledAtCommit.current = annotationSnapshot !== null;
    annotationSnapshotAtCommit.current = annotationSnapshot;
    dragEnabledAtCommit.current = dragEnabled;
    draggableSquaresAtCommit.current = draggableSquares;
    interactionEnabledAtCommit.current =
      dragEnabled || tapEnabled || annotationSnapshot !== null;
    tapEnabledAtCommit.current = tapEnabled;
    let reduction = reduceBoardGestureAdapter(adapter.current, {
      snapshot,
      type: 'synchronize',
    });
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
      (!(dragEnabled || tapEnabled) || !activeInputAllowed)
    ) {
      reduction = reduceBoardGestureAdapter(reduction.state, {
        correlation: activeCorrelation,
        reason: 'permissions-change',
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
  ]);

  useLayoutEffect(() => {
    acceptingSignals.current = true;
    return () => {
      acceptingSignals.current = false;
      annotationEnabledAtCommit.current = false;
      annotationSnapshotAtCommit.current = null;
      dragEnabledAtCommit.current = false;
      interactionEnabledAtCommit.current = false;
      tapEnabledAtCommit.current = false;
      const correlation = adapter.current.active?.correlation;
      if (correlation !== undefined) {
        adapter.current = reduceBoardGestureAdapter(adapter.current, {
          correlation,
          reason: 'unmount',
          type: 'cancel',
        }).state;
      }
      activeNativeAnnotationSignal.current = null;
      annotationRuntimeAtCommit.current?.cancel();
      const active = providerRuntime.drag.getSnapshot().active;
      if (active?.owner === providerOwner.current) {
        providerRuntime.drag.release(
          providerOwner.current,
          active.gestureToken,
        );
      }
      onDragSourceChangeAtCommit.current?.(null);
      resetInteractionPresentationSharedValues(presentation);
    };
  }, [presentation, providerRuntime]);

  return (
    <BoardGestureLayer
      annotationEnabled={annotationSnapshot !== null}
      annotationRevision={annotationSnapshot?.annotationRevision ?? null}
      boardId={boardId}
      dragEnabled={dragEnabled}
      draggableSquares={draggableSquares}
      geometry={geometry}
      onSignal={handleSignal}
      positionRevision={position.revision}
      presentation={presentation}
      resetKey={JSON.stringify([
        providerGeometryRevision,
        providerLifecycleRevision,
        providerResetRevision,
        providerTransientRevision,
      ])}
      selectionRevision={selectionRevision}
      tapEnabled={tapEnabled || annotationSnapshot !== null}
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
