import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { ViewStyle } from 'react-native';

import type { NormalizedControlledValue } from '../internal/controlled-domain';
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
import type {
  CanDragPiece,
  PieceData,
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
import { DragOverlay } from './drag-overlay';
import { resolvePieceRenderer } from './piece-layer';

interface BoardInteractionControllerProps {
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

interface ActiveDragVisual {
  readonly piece: Readonly<PieceData>;
  readonly sourceSquare: SquareId;
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
 * It can produce an inert candidate for tests and the future P2.3 executor,
 * but cannot submit a reducer intent, invoke consumer code, or mutate position.
 */
export function BoardInteractionController({
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
  const presentation = useInteractionPresentationSharedValues();
  const [activeDragVisual, setActiveDragVisual] =
    useState<Readonly<ActiveDragVisual> | null>(null);
  const snapshot = useMemo(
    () => createSnapshot({ boardId, geometry, position, selectionRevision }),
    [boardId, geometry, position, selectionRevision],
  );
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
  const acceptingSignals = useRef(true);
  const dragEnabledAtCommit = useRef(dragEnabled);
  const draggableSquaresAtCommit = useRef(draggableSquares);
  const interactionEnabledAtCommit = useRef(dragEnabled || tapEnabled);
  const tapEnabledAtCommit = useRef(tapEnabled);
  const onCandidateAtCommit = useRef(onCandidate);
  const onDragSourceChangeAtCommit = useRef(onDragSourceChange);
  const snapshotAtCommit = useRef(snapshot);

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
        const next = Object.freeze({
          piece: lifecycle.context.piece,
          sourceSquare: lifecycle.context.source.square,
        });
        setActiveDragVisual((current) =>
          current?.sourceSquare === next.sourceSquare &&
          current.piece.id === next.piece.id &&
          current.piece.pieceType === next.piece.pieceType
            ? current
            : next,
        );
        onDragSourceChangeAtCommit.current?.(next.sourceSquare);
      } else {
        setActiveDragVisual((current) => (current === null ? current : null));
        onDragSourceChangeAtCommit.current?.(null);
      }
      if (reduction.candidate !== null) {
        onCandidateAtCommit.current?.(reduction.candidate);
      }
    },
    [presentation],
  );

  const handleSignal = useCallback(
    (signal: Readonly<BoardGestureSignal>): void => {
      if (
        !acceptingSignals.current ||
        !interactionEnabledAtCommit.current ||
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
        }
      }
    },
    [applyReduction, boardId],
  );

  useLayoutEffect(() => {
    onCandidateAtCommit.current = onCandidate;
    onDragSourceChangeAtCommit.current = onDragSourceChange;
  }, [onCandidate, onDragSourceChange]);

  useLayoutEffect(() => {
    snapshotAtCommit.current = snapshot;
    dragEnabledAtCommit.current = dragEnabled;
    draggableSquaresAtCommit.current = draggableSquares;
    interactionEnabledAtCommit.current = dragEnabled || tapEnabled;
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
  }, [applyReduction, dragEnabled, draggableSquares, snapshot, tapEnabled]);

  useLayoutEffect(() => {
    acceptingSignals.current = true;
    return () => {
      acceptingSignals.current = false;
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
      onDragSourceChangeAtCommit.current?.(null);
      resetInteractionPresentationSharedValues(presentation);
    };
  }, [presentation]);

  const renderer =
    activeDragVisual === null
      ? null
      : resolvePieceRenderer(pieceRenderers, activeDragVisual.piece.pieceType);
  const pieceSize = Math.min(
    geometry.width / geometry.columns,
    geometry.height / geometry.rows,
  );

  return (
    <>
      <BoardGestureLayer
        boardId={boardId}
        dragEnabled={dragEnabled}
        draggableSquares={draggableSquares}
        geometry={geometry}
        onSignal={handleSignal}
        positionRevision={position.revision}
        presentation={presentation}
        selectionRevision={selectionRevision}
        tapEnabled={tapEnabled}
      />
      {activeDragVisual === null || renderer === null ? null : (
        <DragOverlay
          boardId={boardId}
          piece={activeDragVisual.piece}
          presentation={presentation}
          renderer={renderer}
          size={pieceSize}
          sourceSquare={activeDragVisual.sourceSquare}
          style={pieceStyle}
        />
      )}
    </>
  );
}
