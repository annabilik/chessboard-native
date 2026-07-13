import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactElement,
} from 'react';

import type { NormalizedControlledValue } from '../internal/controlled-domain';
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
import type { PositionObject, SquareId } from '../public-types';
import {
  BoardGestureLayer,
  type BoardGestureGeometry,
  type BoardGestureSignal,
} from './board-gesture-layer';

interface BoardInteractionControllerProps {
  readonly boardId: string;
  readonly enabled?: boolean;
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly onCandidate?: (
    candidate: Readonly<BoardGestureIntentCandidate>,
  ) => void;
  readonly position: NormalizedControlledValue<PositionObject>;
}

const EMPTY_OCCUPIED_SQUARES: readonly SquareId[] = Object.freeze([]);

function createSnapshot(options: {
  readonly boardId: string;
  readonly geometry: Readonly<BoardGestureGeometry>;
  readonly position: NormalizedControlledValue<PositionObject>;
}): Readonly<BoardGestureSnapshot> {
  return Object.freeze({
    boardId: options.boardId,
    geometryEpoch: options.geometry.revision,
    position: options.position.value,
    positionRevision: options.position.revision,
  });
}

function createCorrelation(
  signal: Readonly<BoardGestureSignal>,
): Readonly<BoardGestureCorrelation> {
  return Object.freeze({
    boardId: signal.boardId,
    geometryEpoch: signal.geometryRevision,
    positionRevision: signal.positionRevision,
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
  enabled = false,
  geometry,
  onCandidate,
  position,
}: BoardInteractionControllerProps): ReactElement {
  const presentation = useInteractionPresentationSharedValues();
  const snapshot = useMemo(
    () => createSnapshot({ boardId, geometry, position }),
    [boardId, geometry, position],
  );
  const occupiedSquares = useMemo(() => {
    const occupied = geometry.visualSquares.filter((square) =>
      Object.hasOwn(position.value, square),
    );
    return occupied.length === 0
      ? EMPTY_OCCUPIED_SQUARES
      : Object.freeze(occupied);
  }, [geometry.visualSquares, position]);
  const adapter = useRef<Readonly<BoardGestureAdapterState>>(
    createBoardGestureAdapterState({
      boardId,
      geometryEpoch: geometry.revision,
      positionRevision: position.revision,
    }),
  );
  const acceptingSignals = useRef(true);
  const enabledAtCommit = useRef(enabled);
  const snapshotAtCommit = useRef(snapshot);

  const applyReduction = useCallback(
    (reduction: Readonly<BoardGestureAdapterReduction>): void => {
      adapter.current = reduction.state;
      syncInteractionPresentationSharedValues(
        presentation,
        projectInteractionPresentation(reduction.state.lifecycle),
      );
      if (reduction.candidate !== null) {
        onCandidate?.(reduction.candidate);
      }
    },
    [onCandidate, presentation],
  );

  const handleSignal = useCallback(
    (signal: Readonly<BoardGestureSignal>): void => {
      if (
        !acceptingSignals.current ||
        !enabledAtCommit.current ||
        signal.boardId !== boardId
      ) {
        return;
      }
      const currentSnapshot = snapshotAtCommit.current;

      switch (signal.type) {
        case 'drag-start': {
          const correlation = createCorrelation(signal);
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
              reason: 'user',
              type: 'cancel',
            }),
          );
          return;
        }
        case 'tap': {
          applyReduction(
            reduceBoardGestureAdapter(adapter.current, {
              correlation: createCorrelation(signal),
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
    snapshotAtCommit.current = snapshot;
    enabledAtCommit.current = enabled;
    let reduction = reduceBoardGestureAdapter(adapter.current, {
      snapshot,
      type: 'synchronize',
    });
    const activeCorrelation = reduction.state.active?.correlation;
    if (!enabled && activeCorrelation !== undefined) {
      reduction = reduceBoardGestureAdapter(reduction.state, {
        correlation: activeCorrelation,
        reason: 'permissions-change',
        type: 'cancel',
      });
    }
    applyReduction(reduction);
  }, [applyReduction, enabled, snapshot]);

  useLayoutEffect(() => {
    acceptingSignals.current = true;
    return () => {
      acceptingSignals.current = false;
      enabledAtCommit.current = false;
      const correlation = adapter.current.active?.correlation;
      if (correlation !== undefined) {
        adapter.current = reduceBoardGestureAdapter(adapter.current, {
          correlation,
          reason: 'unmount',
          type: 'cancel',
        }).state;
      }
      resetInteractionPresentationSharedValues(presentation);
    };
  }, [presentation]);

  return (
    <BoardGestureLayer
      boardId={boardId}
      enabled={enabled}
      geometry={geometry}
      occupiedSquares={occupiedSquares}
      onSignal={handleSignal}
      positionRevision={position.revision}
      presentation={presentation}
    />
  );
}
