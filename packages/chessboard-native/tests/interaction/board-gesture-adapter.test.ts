import type { PieceData, PositionObject } from '../../src/public-types';
import {
  createBoardGestureAdapterState,
  reduceBoardGestureAdapter,
  type BoardGestureAdapterState,
  type BoardGestureCorrelation,
  type BoardGestureSnapshot,
} from '../../src/internal/board-gesture-adapter';

const WHITE_PAWN: Readonly<PieceData> = Object.freeze({
  id: 'white-pawn',
  pieceType: 'wP',
});
const BLACK_KNIGHT: Readonly<PieceData> = Object.freeze({
  id: 'black-knight',
  pieceType: 'bN',
});
const DEFAULT_POSITION: PositionObject = Object.freeze({
  b8: BLACK_KNIGHT,
  e2: WHITE_PAWN,
});

function snapshot(
  boardId = 'analysis',
  geometryEpoch = 3,
  positionRevision = 7,
  position: PositionObject | null = DEFAULT_POSITION,
): Readonly<BoardGestureSnapshot> {
  return Object.freeze({
    boardId,
    geometryEpoch,
    position,
    positionRevision,
  });
}

function correlation(
  current: Readonly<BoardGestureSnapshot>,
  token = 11,
): Readonly<BoardGestureCorrelation> {
  return Object.freeze({
    boardId: current.boardId,
    geometryEpoch: current.geometryEpoch,
    positionRevision: current.positionRevision,
    token,
  });
}

function initialState(
  current: Readonly<BoardGestureSnapshot> = snapshot(),
): Readonly<BoardGestureAdapterState> {
  return createBoardGestureAdapterState({
    boardId: current.boardId,
    geometryEpoch: current.geometryEpoch,
    positionRevision: current.positionRevision,
  });
}

function startDrag(
  state: Readonly<BoardGestureAdapterState>,
  current: Readonly<BoardGestureSnapshot> = snapshot(),
  currentCorrelation: Readonly<BoardGestureCorrelation> = correlation(current),
  sourceSquare = 'e2',
) {
  return reduceBoardGestureAdapter(state, {
    correlation: currentCorrelation,
    snapshot: current,
    sourceSquare,
    type: 'drag-start',
  });
}

describe('pure board gesture adapter', () => {
  it('targets and finalizes a drag without submitting or retaining semantic state', () => {
    const current = snapshot();
    const currentCorrelation = correlation(current);
    const initial = initialState(current);
    const started = startDrag(initial, current, currentCorrelation);

    expect(started.candidate).toBeNull();
    expect(Object.keys(started).sort()).toEqual(['candidate', 'state']);
    expect(started.state.active).toEqual({
      correlation: currentCorrelation,
      sourceSquare: 'e2',
    });
    expect(started.state.lifecycle).toEqual(
      expect.objectContaining({
        phase: 'drag',
        positionRevision: 7,
        targetSquare: 'e2',
      }),
    );
    expect(started.state).not.toHaveProperty('position');
    expect(started.state.lifecycle).not.toHaveProperty('position');

    const updated = reduceBoardGestureAdapter(started.state, {
      correlation: currentCorrelation,
      targetSquare: 'e4',
      type: 'drag-update',
    });
    expect(updated.state.lifecycle).toEqual(
      expect.objectContaining({ phase: 'drag', targetSquare: 'e4' }),
    );
    const duplicate = reduceBoardGestureAdapter(updated.state, {
      correlation: currentCorrelation,
      targetSquare: 'e4',
      type: 'drag-update',
    });
    expect(duplicate.state).toBe(updated.state);
    expect(duplicate.candidate).toBeNull();

    const finalized = reduceBoardGestureAdapter(updated.state, {
      correlation: currentCorrelation,
      snapshot: current,
      targetSquare: 'e4',
      type: 'drag-finalize',
    });
    expect(finalized.candidate).toEqual({
      basePositionRevision: 7,
      boardId: 'analysis',
      geometryEpoch: 3,
      input: 'drag',
      piece: WHITE_PAWN,
      source: { kind: 'board', square: 'e2' },
      targetSquare: 'e4',
      token: 11,
    });
    expect(finalized.candidate).not.toHaveProperty('intentId');
    expect(finalized).not.toHaveProperty('effects');
    expect(finalized.state).toEqual(
      expect.objectContaining({ active: null, geometryEpoch: 3 }),
    );
    expect(finalized.state.lifecycle).toEqual(
      expect.objectContaining({ phase: 'idle', positionRevision: 7 }),
    );
    expect(Object.isFrozen(finalized.state)).toBe(true);
    expect(Object.isFrozen(finalized.candidate)).toBe(true);
    expect(Object.isFrozen(finalized.candidate?.piece)).toBe(true);
    expect(Object.isFrozen(finalized.candidate?.source)).toBe(true);
  });

  it('ignores late foreign tokens but fails closed for a terminal stale geometry or position epoch', () => {
    const current = snapshot();
    const currentCorrelation = correlation(current, 4);
    const started = startDrag(
      initialState(current),
      current,
      currentCorrelation,
    ).state;
    const wrongToken = { ...currentCorrelation, token: 5 };

    const staleUpdate = reduceBoardGestureAdapter(started, {
      correlation: wrongToken,
      targetSquare: 'e4',
      type: 'drag-update',
    });
    expect(staleUpdate.state).toBe(started);

    const staleFinalize = reduceBoardGestureAdapter(started, {
      correlation: wrongToken,
      snapshot: current,
      targetSquare: 'e4',
      type: 'drag-finalize',
    });
    expect(staleFinalize.state).toBe(started);

    const newerGeometry = snapshot('analysis', 4, 7);
    const geometryInvalidated = reduceBoardGestureAdapter(started, {
      correlation: currentCorrelation,
      snapshot: newerGeometry,
      targetSquare: 'e4',
      type: 'drag-finalize',
    });
    expect(geometryInvalidated.candidate).toBeNull();
    expect(geometryInvalidated.state).toEqual(
      expect.objectContaining({ active: null, geometryEpoch: 4 }),
    );
    expect(geometryInvalidated.state.lifecycle.phase).toBe('idle');

    const restartedCorrelation = correlation(newerGeometry, 6);
    const restarted = startDrag(
      geometryInvalidated.state,
      newerGeometry,
      restartedCorrelation,
    ).state;
    const newerPosition = snapshot('analysis', 4, 8, {
      e2: WHITE_PAWN,
    });
    const positionInvalidated = reduceBoardGestureAdapter(restarted, {
      correlation: restartedCorrelation,
      snapshot: newerPosition,
      targetSquare: 'e4',
      type: 'drag-finalize',
    });
    expect(positionInvalidated.candidate).toBeNull();
    expect(positionInvalidated.state.active).toBeNull();
    expect(positionInvalidated.state.lifecycle).toEqual(
      expect.objectContaining({ phase: 'idle', positionRevision: 8 }),
    );
  });

  it('deduplicates an off-board target and preserves null in the terminal candidate', () => {
    const current = snapshot();
    const currentCorrelation = correlation(current);
    const started = startDrag(
      initialState(current),
      current,
      currentCorrelation,
    ).state;
    const offBoard = reduceBoardGestureAdapter(started, {
      correlation: currentCorrelation,
      targetSquare: null,
      type: 'drag-update',
    });
    expect(offBoard.state.lifecycle).toEqual(
      expect.objectContaining({ phase: 'drag', targetSquare: null }),
    );
    const duplicate = reduceBoardGestureAdapter(offBoard.state, {
      correlation: currentCorrelation,
      targetSquare: null,
      type: 'drag-update',
    });
    expect(duplicate.state).toBe(offBoard.state);

    const finalized = reduceBoardGestureAdapter(offBoard.state, {
      correlation: currentCorrelation,
      snapshot: current,
      targetSquare: null,
      type: 'drag-finalize',
    });
    expect(finalized.candidate).toEqual(
      expect.objectContaining({ input: 'drag', targetSquare: null }),
    );
    expect(finalized.state.active).toBeNull();
    expect(finalized.state.lifecycle.phase).toBe('idle');
  });

  it('recognizes only a same-square tap on a current occupied source', () => {
    const current = snapshot();
    const currentCorrelation = correlation(current, 20);
    const initial = initialState(current);
    const movedTap = reduceBoardGestureAdapter(initial, {
      correlation: currentCorrelation,
      endSquare: 'e3',
      snapshot: current,
      startSquare: 'e2',
      type: 'tap',
    });
    expect(movedTap.state).toBe(initial);
    expect(movedTap.candidate).toBeNull();

    const sameSquare = reduceBoardGestureAdapter(initial, {
      correlation: currentCorrelation,
      endSquare: 'e2',
      snapshot: current,
      startSquare: 'e2',
      type: 'tap',
    });
    expect(sameSquare.candidate).toEqual({
      basePositionRevision: 7,
      boardId: 'analysis',
      geometryEpoch: 3,
      input: 'tap',
      piece: WHITE_PAWN,
      source: { kind: 'board', square: 'e2' },
      targetSquare: 'e2',
      token: 20,
    });
    expect(sameSquare.state.active).toBeNull();
    expect(sameSquare.state.lifecycle.phase).toBe('idle');
    expect(sameSquare.state.lifecycle.nextEpoch).toBe(1);

    const offBoard = reduceBoardGestureAdapter(initial, {
      correlation: currentCorrelation,
      endSquare: null,
      snapshot: current,
      startSquare: 'e2',
      type: 'tap',
    });
    expect(offBoard.state).toBe(initial);
    expect(offBoard.candidate).toBeNull();
  });

  it('rejects empty, disabled, and inherited source entries without allocating an epoch', () => {
    const empty = snapshot('analysis', 3, 7, Object.freeze({}));
    const emptyCorrelation = correlation(empty);
    const initial = initialState(empty);
    const emptyDrag = startDrag(initial, empty, emptyCorrelation, 'e2');
    expect(emptyDrag.state).toBe(initial);
    expect(emptyDrag.state.lifecycle.nextEpoch).toBe(0);

    const emptyTap = reduceBoardGestureAdapter(initial, {
      correlation: emptyCorrelation,
      endSquare: 'e2',
      snapshot: empty,
      startSquare: 'e2',
      type: 'tap',
    });
    expect(emptyTap.state).toBe(initial);
    expect(emptyTap.candidate).toBeNull();

    const disabled = snapshot('analysis', 3, 7, null);
    expect(
      startDrag(initial, disabled, correlation(disabled), 'e2').state,
    ).toBe(initial);

    const inherited = Object.create({ e2: WHITE_PAWN }) as PositionObject;
    const inheritedSnapshot = snapshot('analysis', 3, 7, inherited);
    expect(
      startDrag(
        initial,
        inheritedSnapshot,
        correlation(inheritedSnapshot),
        'e2',
      ).state,
    ).toBe(initial);
  });

  it('cancels only the matching board token and resets the lifecycle without effects', () => {
    const current = snapshot();
    const currentCorrelation = correlation(current, 31);
    const started = startDrag(
      initialState(current),
      current,
      currentCorrelation,
    ).state;

    const wrongToken = reduceBoardGestureAdapter(started, {
      correlation: { ...currentCorrelation, token: 32 },
      reason: 'second-finger',
      type: 'cancel',
    });
    expect(wrongToken.state).toBe(started);

    const cancelled = reduceBoardGestureAdapter(started, {
      correlation: currentCorrelation,
      reason: 'second-finger',
      type: 'cancel',
    });
    expect(cancelled.candidate).toBeNull();
    expect(cancelled).not.toHaveProperty('effects');
    expect(cancelled.state.active).toBeNull();
    expect(cancelled.state.lifecycle.phase).toBe('idle');
  });

  it('isolates identical native tokens and epochs by stable board ID', () => {
    const firstSnapshot = snapshot('first', 9, 12, {
      e2: WHITE_PAWN,
    });
    const secondSnapshot = snapshot('second', 9, 12, {
      b8: BLACK_KNIGHT,
    });
    const firstCorrelation = correlation(firstSnapshot, 1);
    const secondCorrelation = correlation(secondSnapshot, 1);
    const first = startDrag(
      initialState(firstSnapshot),
      firstSnapshot,
      firstCorrelation,
    ).state;
    const second = startDrag(
      initialState(secondSnapshot),
      secondSnapshot,
      secondCorrelation,
      'b8',
    ).state;

    const crossBoardUpdate = reduceBoardGestureAdapter(second, {
      correlation: firstCorrelation,
      targetSquare: 'e4',
      type: 'drag-update',
    });
    expect(crossBoardUpdate.state).toBe(second);
    const crossBoardFinalize = reduceBoardGestureAdapter(second, {
      correlation: firstCorrelation,
      snapshot: firstSnapshot,
      targetSquare: 'e4',
      type: 'drag-finalize',
    });
    expect(crossBoardFinalize.state).toBe(second);
    expect(crossBoardFinalize.candidate).toBeNull();

    const firstFinalized = reduceBoardGestureAdapter(first, {
      correlation: firstCorrelation,
      snapshot: firstSnapshot,
      targetSquare: 'e4',
      type: 'drag-finalize',
    });
    expect(firstFinalized.candidate).toEqual(
      expect.objectContaining({ boardId: 'first', piece: WHITE_PAWN }),
    );
    expect(second.lifecycle).toEqual(
      expect.objectContaining({ phase: 'drag', targetSquare: 'b8' }),
    );
  });

  it('synchronizes monotonic board metadata and invalidates active targeting', () => {
    const current = snapshot();
    const currentCorrelation = correlation(current);
    const started = startDrag(
      initialState(current),
      current,
      currentCorrelation,
    ).state;
    const next = snapshot('analysis', 4, 8, { e2: WHITE_PAWN });
    const synchronized = reduceBoardGestureAdapter(started, {
      snapshot: next,
      type: 'synchronize',
    });
    expect(synchronized.candidate).toBeNull();
    expect(synchronized.state.active).toBeNull();
    expect(synchronized.state.geometryEpoch).toBe(4);
    expect(synchronized.state.lifecycle).toEqual(
      expect.objectContaining({ phase: 'idle', positionRevision: 8 }),
    );

    const stale = reduceBoardGestureAdapter(synchronized.state, {
      snapshot: current,
      type: 'synchronize',
    });
    expect(stale.state).toBe(synchronized.state);
  });
});
