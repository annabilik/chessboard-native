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
import {
  createAnnotationGestureAdapterState,
  normalizeAnnotationTool,
  reduceAnnotationGestureAdapter,
  type AnnotationGestureAdapterReduction,
  type AnnotationGestureAdapterState,
  type AnnotationGestureCandidate,
  type AnnotationGestureCorrelation,
  type AnnotationGestureSnapshot,
} from '../internal/annotation-gesture-adapter';
import type { CorrelatedAnnotationDraft } from '../internal/annotation-draft-presentation';
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
import type {
  CanDragPiece,
  BoardAnnotation,
  AnnotationTool,
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
  readonly annotations?: NormalizedControlledValue<
    readonly Readonly<BoardAnnotation>[]
  > | null;
  readonly annotationTool?: AnnotationTool | undefined;
  readonly boardId: string;
  readonly canDragPiece?: CanDragPiece;
  readonly dragEnabled?: boolean;
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly onCandidate?: (
    candidate: Readonly<BoardGestureIntentCandidate>,
  ) => void;
  readonly onAnnotationCandidate?: (
    candidate: Readonly<AnnotationGestureCandidate>,
  ) => void;
  readonly onAnnotationDraftChange?: (
    draft: Readonly<CorrelatedAnnotationDraft> | null,
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

function createAnnotationCorrelation(
  signal: Readonly<
    Extract<
      BoardGestureSignal,
      {
        readonly type:
          | 'annotation-start'
          | 'annotation-update'
          | 'annotation-end'
          | 'annotation-cancel';
      }
    >
  >,
  snapshot: Readonly<AnnotationGestureSnapshot>,
): Readonly<AnnotationGestureCorrelation> {
  return Object.freeze({
    annotationRevision: signal.annotationRevision,
    boardId: signal.boardId,
    geometryEpoch: signal.geometryRevision,
    positionRevision: signal.positionRevision,
    providerGeometryRevision: snapshot.providerGeometryRevision,
    providerLifecycleRevision: snapshot.providerLifecycleRevision,
    token: signal.gestureToken,
  });
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
  annotations = null,
  annotationTool = null,
  boardId,
  canDragPiece,
  dragEnabled = false,
  geometry,
  onAnnotationCandidate,
  onAnnotationDraftChange,
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
  const normalizedAnnotationTool = useMemo(
    () => normalizeAnnotationTool(annotationTool),
    [annotationTool],
  );
  const annotationSnapshot =
    useMemo<Readonly<AnnotationGestureSnapshot> | null>(() => {
      if (
        annotations === null ||
        normalizedAnnotationTool === null ||
        typeof onAnnotationCandidate !== 'function'
      ) {
        return null;
      }
      return Object.freeze({
        annotationRevision: annotations.revision,
        boardId,
        geometryEpoch: geometry.revision,
        positionRevision: position.revision,
        providerGeometryRevision,
        providerLifecycleRevision,
        tool: normalizedAnnotationTool,
      });
    }, [
      annotations,
      boardId,
      geometry.revision,
      normalizedAnnotationTool,
      onAnnotationCandidate,
      position.revision,
      providerGeometryRevision,
      providerLifecycleRevision,
    ]);
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
  const annotationAdapter = useRef<Readonly<AnnotationGestureAdapterState>>(
    createAnnotationGestureAdapterState({ boardId }),
  );
  const acceptingSignals = useRef(true);
  const annotationEnabledAtCommit = useRef(annotationSnapshot !== null);
  const annotationSnapshotAtCommit = useRef(annotationSnapshot);
  const dragEnabledAtCommit = useRef(dragEnabled);
  const draggableSquaresAtCommit = useRef(draggableSquares);
  const interactionEnabledAtCommit = useRef(
    dragEnabled || tapEnabled || annotationSnapshot !== null,
  );
  const onAnnotationCandidateAtCommit = useRef(onAnnotationCandidate);
  const onAnnotationDraftChangeAtCommit = useRef(onAnnotationDraftChange);
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

  const applyAnnotationReduction = useCallback(
    (reduction: Readonly<AnnotationGestureAdapterReduction>): void => {
      const previousPresentation = annotationAdapter.current.presentation;
      annotationAdapter.current = reduction.state;
      if (reduction.state.presentation !== previousPresentation) {
        onAnnotationDraftChangeAtCommit.current?.(reduction.state.presentation);
      }
      if (reduction.candidate !== null) {
        onAnnotationCandidateAtCommit.current?.(reduction.candidate);
      }
    },
    [],
  );

  const cancelAnnotation = useCallback((): void => {
    applyAnnotationReduction(
      reduceAnnotationGestureAdapter(annotationAdapter.current, {
        type: 'cancel',
      }),
    );
  }, [applyAnnotationReduction]);

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
            applyAnnotationReduction(
              reduceAnnotationGestureAdapter(annotationAdapter.current, {
                correlation: Object.freeze({
                  annotationRevision: signal.annotationRevision,
                  boardId: signal.boardId,
                  geometryEpoch: signal.geometryRevision,
                  positionRevision: signal.positionRevision,
                  providerGeometryRevision:
                    currentAnnotationSnapshot.providerGeometryRevision,
                  providerLifecycleRevision:
                    currentAnnotationSnapshot.providerLifecycleRevision,
                  token: signal.gestureToken,
                }),
                input: 'touch',
                snapshot: currentAnnotationSnapshot,
                square: signal.targetSquare,
                type: 'activate',
              }),
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
          applyAnnotationReduction(
            reduceAnnotationGestureAdapter(annotationAdapter.current, {
              correlation: createAnnotationCorrelation(
                signal,
                currentAnnotationSnapshot,
              ),
              input: 'touch',
              path: signal.gestureKind,
              snapshot: currentAnnotationSnapshot,
              sourceSquare: signal.sourceSquare,
              targetSquare: signal.targetSquare,
              type: 'start',
            }),
          );
          return;
        }
        case 'annotation-update': {
          const currentAnnotationSnapshot = annotationSnapshotAtCommit.current;
          if (currentAnnotationSnapshot === null) {
            return;
          }
          applyAnnotationReduction(
            reduceAnnotationGestureAdapter(annotationAdapter.current, {
              correlation: createAnnotationCorrelation(
                signal,
                currentAnnotationSnapshot,
              ),
              targetSquare: signal.targetSquare,
              type: 'update',
            }),
          );
          return;
        }
        case 'annotation-end': {
          const currentAnnotationSnapshot = annotationSnapshotAtCommit.current;
          if (currentAnnotationSnapshot === null) {
            return;
          }
          applyAnnotationReduction(
            reduceAnnotationGestureAdapter(annotationAdapter.current, {
              correlation: createAnnotationCorrelation(
                signal,
                currentAnnotationSnapshot,
              ),
              snapshot: currentAnnotationSnapshot,
              targetSquare: signal.targetSquare,
              type: 'finalize',
            }),
          );
          return;
        }
        case 'annotation-cancel': {
          const currentAnnotationSnapshot = annotationSnapshotAtCommit.current;
          if (currentAnnotationSnapshot === null) {
            return;
          }
          applyAnnotationReduction(
            reduceAnnotationGestureAdapter(annotationAdapter.current, {
              correlation: createAnnotationCorrelation(
                signal,
                currentAnnotationSnapshot,
              ),
              type: 'cancel',
            }),
          );
        }
      }
    },
    [
      applyReduction,
      applyAnnotationReduction,
      boardId,
      cancelAnnotation,
      providerGeometryRevision,
      providerRuntime,
      providerTransientRevision,
    ],
  );

  useLayoutEffect(() => {
    cancelFromProviderAtCommit.current = cancelFromProvider;
    onAnnotationCandidateAtCommit.current = onAnnotationCandidate;
    onAnnotationDraftChangeAtCommit.current = onAnnotationDraftChange;
    onCandidateAtCommit.current = onCandidate;
    onDragSourceChangeAtCommit.current = onDragSourceChange;
  }, [
    cancelFromProvider,
    onAnnotationCandidate,
    onAnnotationDraftChange,
    onCandidate,
    onDragSourceChange,
  ]);

  useLayoutEffect(() => {
    snapshotAtCommit.current = snapshot;
    annotationEnabledAtCommit.current = annotationSnapshot !== null;
    annotationSnapshotAtCommit.current = annotationSnapshot;
    dragEnabledAtCommit.current = dragEnabled;
    draggableSquaresAtCommit.current = draggableSquares;
    interactionEnabledAtCommit.current =
      dragEnabled || tapEnabled || annotationSnapshot !== null;
    tapEnabledAtCommit.current = tapEnabled;
    applyAnnotationReduction(
      reduceAnnotationGestureAdapter(annotationAdapter.current, {
        snapshot: annotationSnapshot,
        type: 'synchronize',
      }),
    );
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
    applyAnnotationReduction,
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
      const annotationPresentation = annotationAdapter.current.presentation;
      annotationAdapter.current = reduceAnnotationGestureAdapter(
        annotationAdapter.current,
        { type: 'cancel' },
      ).state;
      if (annotationPresentation !== null) {
        onAnnotationDraftChangeAtCommit.current?.(null);
      }
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
