import type {
  MoveSource,
  PieceData,
  PositionObject,
  Revision,
  SquareId,
} from '../public-types';
import {
  createInteractionState,
  reduceInteraction,
  type DragInteractionState,
  type InteractionEvent,
  type InteractionInvalidationReason,
  type MoveIntentLifecycle,
} from './interaction-reducer';

/** One immutable controlled board snapshot observed at a gesture boundary. */
export interface BoardGestureSnapshot {
  readonly boardId: string;
  readonly geometryEpoch: number;
  readonly positionRevision: Revision;
  readonly selectionRevision: Revision | null;
  readonly position: PositionObject | null;
}

/** Identity carried by every event belonging to one native gesture. */
export interface BoardGestureCorrelation {
  readonly boardId: string;
  readonly token: number;
  readonly geometryEpoch: number;
  readonly positionRevision: Revision;
  readonly selectionRevision: Revision | null;
}

interface ActiveBoardGesture {
  readonly correlation: Readonly<BoardGestureCorrelation>;
  readonly sourceSquare: SquareId;
}

/**
 * Render-agnostic adapter state. Only idle and drag targeting lifecycle phases
 * are retained; a position snapshot is never stored.
 */
export interface BoardGestureAdapterState {
  readonly boardId: string;
  readonly geometryEpoch: number;
  readonly active: Readonly<ActiveBoardGesture> | null;
  readonly lifecycle: Readonly<MoveIntentLifecycle>;
}

/**
 * A terminal gesture candidate. It deliberately lacks an intent ID and cannot
 * be executed by the interaction reducer until a later runtime chooses to turn
 * it into a request.
 */
interface BoardGestureCandidateBase {
  readonly boardId: string;
  readonly token: number;
  readonly geometryEpoch: number;
  readonly basePositionRevision: Revision;
}

export interface BoardDragIntentCandidate extends BoardGestureCandidateBase {
  readonly source: Extract<MoveSource, { readonly kind: 'board' }>;
  readonly targetSquare: SquareId | null;
  readonly piece: Readonly<PieceData>;
  readonly input: 'drag';
}

export interface BoardTapActivationCandidate extends BoardGestureCandidateBase {
  readonly baseSelectionRevision: Revision | null;
  readonly input: 'tap';
  readonly square: SquareId;
}

/** Terminal, still-inert candidate emitted by the native gesture adapter. */
export type BoardGestureIntentCandidate =
  BoardDragIntentCandidate | BoardTapActivationCandidate;

export type BoardGestureAdapterEvent =
  | {
      readonly type: 'synchronize';
      readonly snapshot: Readonly<BoardGestureSnapshot>;
    }
  | {
      readonly type: 'drag-start';
      readonly correlation: Readonly<BoardGestureCorrelation>;
      readonly snapshot: Readonly<BoardGestureSnapshot>;
      readonly sourceSquare: SquareId;
    }
  | {
      readonly type: 'drag-update';
      readonly correlation: Readonly<BoardGestureCorrelation>;
      readonly targetSquare: SquareId | null;
    }
  | {
      readonly type: 'drag-finalize';
      readonly correlation: Readonly<BoardGestureCorrelation>;
      readonly snapshot: Readonly<BoardGestureSnapshot>;
      readonly targetSquare: SquareId | null;
    }
  | {
      readonly type: 'tap';
      readonly correlation: Readonly<BoardGestureCorrelation>;
      readonly snapshot: Readonly<BoardGestureSnapshot>;
      readonly startSquare: SquareId | null;
      readonly endSquare: SquareId | null;
    }
  | {
      readonly type: 'cancel';
      readonly correlation: Readonly<BoardGestureCorrelation>;
      readonly reason?: InteractionInvalidationReason;
    };

export interface BoardGestureAdapterReduction {
  readonly state: Readonly<BoardGestureAdapterState>;
  readonly candidate: Readonly<BoardGestureIntentCandidate> | null;
}

export interface CreateBoardGestureAdapterStateOptions {
  readonly boardId: string;
  readonly geometryEpoch: number;
  readonly positionRevision: Revision;
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateEpoch(value: number, name: string): number {
  if (!isNonNegativeSafeInteger(value)) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

function freezeCorrelation(
  correlation: Readonly<BoardGestureCorrelation>,
): Readonly<BoardGestureCorrelation> {
  return Object.freeze({
    boardId: correlation.boardId,
    geometryEpoch: correlation.geometryEpoch,
    positionRevision: correlation.positionRevision,
    selectionRevision: correlation.selectionRevision,
    token: correlation.token,
  });
}

function freezeState(
  boardId: string,
  geometryEpoch: number,
  lifecycle: Readonly<MoveIntentLifecycle>,
  active: Readonly<ActiveBoardGesture> | null,
): Readonly<BoardGestureAdapterState> {
  return Object.freeze({ active, boardId, geometryEpoch, lifecycle });
}

function result(
  state: Readonly<BoardGestureAdapterState>,
  candidate: Readonly<BoardGestureIntentCandidate> | null = null,
): Readonly<BoardGestureAdapterReduction> {
  return Object.freeze({ candidate, state });
}

/** Create an idle board-scoped gesture adapter. */
export function createBoardGestureAdapterState(
  options: Readonly<CreateBoardGestureAdapterStateOptions>,
): Readonly<BoardGestureAdapterState> {
  const lifecycle = createInteractionState({
    boardId: options.boardId,
    positionRevision: options.positionRevision,
  });
  return freezeState(
    lifecycle.boardId,
    validateEpoch(options.geometryEpoch, 'geometryEpoch'),
    lifecycle,
    null,
  );
}

function reduceLifecycleWithoutEffects(
  lifecycle: Readonly<MoveIntentLifecycle>,
  event: Readonly<InteractionEvent>,
): Readonly<MoveIntentLifecycle> {
  const reduction = reduceInteraction(lifecycle, event);
  if (reduction.effects.length !== 0) {
    throw new Error(
      'The board gesture adapter cannot consume interaction effects.',
    );
  }
  return reduction.state;
}

function invalidateLifecycle(
  lifecycle: Readonly<MoveIntentLifecycle>,
  reason: InteractionInvalidationReason,
): Readonly<MoveIntentLifecycle> {
  return reduceLifecycleWithoutEffects(lifecycle, {
    reason,
    type: 'invalidate',
  });
}

function resetActive(
  state: Readonly<BoardGestureAdapterState>,
  reason: InteractionInvalidationReason = 'user',
): Readonly<BoardGestureAdapterState> {
  if (state.active === null && state.lifecycle.phase === 'idle') {
    return state;
  }
  const lifecycle = invalidateLifecycle(state.lifecycle, reason);
  return freezeState(state.boardId, state.geometryEpoch, lifecycle, null);
}

function snapshotMetadataIsValid(
  snapshot: Readonly<BoardGestureSnapshot>,
): boolean {
  return (
    isNonNegativeSafeInteger(snapshot.geometryEpoch) &&
    isNonNegativeSafeInteger(snapshot.positionRevision) &&
    (snapshot.selectionRevision === null ||
      isNonNegativeSafeInteger(snapshot.selectionRevision))
  );
}

function synchronizeSnapshot(
  state: Readonly<BoardGestureAdapterState>,
  snapshot: Readonly<BoardGestureSnapshot>,
): Readonly<BoardGestureAdapterState> {
  if (
    snapshot.boardId !== state.boardId ||
    !snapshotMetadataIsValid(snapshot) ||
    snapshot.geometryEpoch < state.geometryEpoch ||
    snapshot.positionRevision < state.lifecycle.positionRevision
  ) {
    return state;
  }

  const geometryChanged = snapshot.geometryEpoch > state.geometryEpoch;
  const positionChanged =
    snapshot.positionRevision > state.lifecycle.positionRevision;
  if (!geometryChanged && !positionChanged) {
    return state;
  }

  let lifecycle = state.lifecycle;
  if (positionChanged) {
    lifecycle = reduceLifecycleWithoutEffects(lifecycle, {
      revision: snapshot.positionRevision,
      type: 'controlled-position',
    });
  }
  if (geometryChanged && lifecycle.phase !== 'idle') {
    lifecycle = invalidateLifecycle(lifecycle, 'geometry-change');
  }

  return freezeState(
    state.boardId,
    geometryChanged ? snapshot.geometryEpoch : state.geometryEpoch,
    lifecycle,
    lifecycle.phase === 'idle' ? null : state.active,
  );
}

function correlationMatchesSnapshot(
  correlation: Readonly<BoardGestureCorrelation>,
  snapshot: Readonly<BoardGestureSnapshot>,
  includeSelectionRevision = false,
): boolean {
  return (
    correlation.boardId === snapshot.boardId &&
    correlation.geometryEpoch === snapshot.geometryEpoch &&
    correlation.positionRevision === snapshot.positionRevision &&
    (!includeSelectionRevision ||
      correlation.selectionRevision === snapshot.selectionRevision) &&
    isNonNegativeSafeInteger(correlation.token) &&
    snapshotMetadataIsValid(snapshot)
  );
}

function correlationIsCurrent(
  state: Readonly<BoardGestureAdapterState>,
  correlation: Readonly<BoardGestureCorrelation>,
): boolean {
  return (
    correlation.boardId === state.boardId &&
    correlation.geometryEpoch === state.geometryEpoch &&
    correlation.positionRevision === state.lifecycle.positionRevision &&
    isNonNegativeSafeInteger(correlation.token)
  );
}

function matchesActiveToken(
  state: Readonly<BoardGestureAdapterState>,
  correlation: Readonly<BoardGestureCorrelation>,
): boolean {
  return (
    state.active !== null &&
    correlation.boardId === state.boardId &&
    correlation.token === state.active.correlation.token
  );
}

function matchesActiveCorrelation(
  state: Readonly<BoardGestureAdapterState>,
  correlation: Readonly<BoardGestureCorrelation>,
): boolean {
  const active = state.active;
  return (
    active !== null &&
    correlationIsCurrent(state, correlation) &&
    correlation.boardId === active.correlation.boardId &&
    correlation.token === active.correlation.token &&
    correlation.geometryEpoch === active.correlation.geometryEpoch &&
    correlation.positionRevision === active.correlation.positionRevision &&
    correlation.selectionRevision === active.correlation.selectionRevision
  );
}

function pieceAt(
  snapshot: Readonly<BoardGestureSnapshot>,
  square: SquareId,
): Readonly<PieceData> | null {
  const position = snapshot.position;
  if (position === null || !Object.hasOwn(position, square)) {
    return null;
  }
  return position[square] ?? null;
}

function piecesAreEqual(
  left: Readonly<PieceData>,
  right: Readonly<PieceData>,
): boolean {
  return left.pieceType === right.pieceType && left.id === right.id;
}

function createDragCandidate(
  lifecycle: Readonly<DragInteractionState>,
  correlation: Readonly<BoardGestureCorrelation>,
): Readonly<BoardDragIntentCandidate> {
  if (lifecycle.context.source.kind !== 'board') {
    throw new Error('A board gesture must have a board source.');
  }
  return Object.freeze({
    basePositionRevision: lifecycle.context.basePositionRevision,
    boardId: lifecycle.context.boardId,
    geometryEpoch: correlation.geometryEpoch,
    input: lifecycle.phase,
    piece: lifecycle.context.piece,
    source: lifecycle.context.source,
    targetSquare: lifecycle.targetSquare,
    token: correlation.token,
  });
}

function startDrag(
  state: Readonly<BoardGestureAdapterState>,
  event: Extract<BoardGestureAdapterEvent, { readonly type: 'drag-start' }>,
): Readonly<BoardGestureAdapterReduction> {
  if (!correlationMatchesSnapshot(event.correlation, event.snapshot)) {
    return result(state);
  }
  const synchronized = synchronizeSnapshot(state, event.snapshot);
  if (!correlationIsCurrent(synchronized, event.correlation)) {
    return result(synchronized);
  }
  if (synchronized.active?.correlation.token === event.correlation.token) {
    return result(synchronized);
  }

  const piece = pieceAt(event.snapshot, event.sourceSquare);
  if (piece === null) {
    return result(synchronized);
  }
  const lifecycle = reduceLifecycleWithoutEffects(synchronized.lifecycle, {
    context: {
      basePositionRevision: event.correlation.positionRevision,
      boardId: synchronized.boardId,
      piece,
      source: { kind: 'board', square: event.sourceSquare },
    },
    mode: 'drag',
    targetSquare: event.sourceSquare,
    type: 'begin',
  });
  if (lifecycle.phase !== 'drag') {
    return result(synchronized);
  }

  const active = Object.freeze({
    correlation: freezeCorrelation(event.correlation),
    sourceSquare: event.sourceSquare,
  });
  return result(
    freezeState(
      synchronized.boardId,
      synchronized.geometryEpoch,
      lifecycle,
      active,
    ),
  );
}

function updateDrag(
  state: Readonly<BoardGestureAdapterState>,
  event: Extract<BoardGestureAdapterEvent, { readonly type: 'drag-update' }>,
): Readonly<BoardGestureAdapterReduction> {
  if (
    !matchesActiveCorrelation(state, event.correlation) ||
    state.lifecycle.phase !== 'drag'
  ) {
    return result(state);
  }
  const lifecycle = reduceLifecycleWithoutEffects(state.lifecycle, {
    epoch: state.lifecycle.epoch,
    targetSquare: event.targetSquare,
    type: 'update-target',
  });
  if (lifecycle === state.lifecycle) {
    return result(state);
  }
  return result(
    freezeState(state.boardId, state.geometryEpoch, lifecycle, state.active),
  );
}

function finalizeDrag(
  state: Readonly<BoardGestureAdapterState>,
  event: Extract<BoardGestureAdapterEvent, { readonly type: 'drag-finalize' }>,
): Readonly<BoardGestureAdapterReduction> {
  if (!matchesActiveToken(state, event.correlation)) {
    return result(state);
  }
  const synchronized = synchronizeSnapshot(state, event.snapshot);
  if (synchronized !== state) {
    return result(resetActive(synchronized));
  }
  const lifecycle = synchronized.lifecycle;
  if (
    !matchesActiveCorrelation(state, event.correlation) ||
    !correlationMatchesSnapshot(event.correlation, event.snapshot) ||
    lifecycle.phase !== 'drag'
  ) {
    return result(resetActive(state));
  }
  if (synchronized.active === null) {
    return result(synchronized);
  }
  const currentPiece = pieceAt(
    event.snapshot,
    synchronized.active.sourceSquare,
  );
  if (
    currentPiece === null ||
    !piecesAreEqual(currentPiece, lifecycle.context.piece)
  ) {
    return result(resetActive(synchronized));
  }

  const updated = updateDrag(synchronized, {
    correlation: event.correlation,
    targetSquare: event.targetSquare,
    type: 'drag-update',
  }).state;
  if (updated.lifecycle.phase !== 'drag') {
    return result(resetActive(updated));
  }
  const candidate = createDragCandidate(updated.lifecycle, event.correlation);
  return result(resetActive(updated), candidate);
}

function recognizeTap(
  state: Readonly<BoardGestureAdapterState>,
  event: Extract<BoardGestureAdapterEvent, { readonly type: 'tap' }>,
): Readonly<BoardGestureAdapterReduction> {
  if (!correlationMatchesSnapshot(event.correlation, event.snapshot, true)) {
    return result(state);
  }
  const synchronized = synchronizeSnapshot(state, event.snapshot);
  if (!correlationIsCurrent(synchronized, event.correlation)) {
    return result(synchronized);
  }
  if (synchronized.active !== null) {
    return result(
      synchronized.active.correlation.token === event.correlation.token
        ? resetActive(synchronized)
        : synchronized,
    );
  }
  if (
    event.snapshot.position === null ||
    event.startSquare === null ||
    event.endSquare === null ||
    event.startSquare !== event.endSquare
  ) {
    return result(synchronized);
  }

  return result(
    synchronized,
    Object.freeze({
      basePositionRevision: event.correlation.positionRevision,
      baseSelectionRevision: event.correlation.selectionRevision,
      boardId: synchronized.boardId,
      geometryEpoch: event.correlation.geometryEpoch,
      input: 'tap',
      square: event.startSquare,
      token: event.correlation.token,
    }),
  );
}

/**
 * Translate native gesture boundaries into transient lifecycle targeting.
 *
 * This adapter never dispatches `submit`, never reaches a decision/commit
 * phase, never exposes reducer effects, and always clears targeting after a
 * terminal event.
 */
export function reduceBoardGestureAdapter(
  state: Readonly<BoardGestureAdapterState>,
  event: Readonly<BoardGestureAdapterEvent>,
): Readonly<BoardGestureAdapterReduction> {
  switch (event.type) {
    case 'synchronize':
      return result(synchronizeSnapshot(state, event.snapshot));
    case 'drag-start':
      return startDrag(state, event);
    case 'drag-update':
      return updateDrag(state, event);
    case 'drag-finalize':
      return finalizeDrag(state, event);
    case 'tap':
      return recognizeTap(state, event);
    case 'cancel':
      if (!matchesActiveToken(state, event.correlation)) {
        return result(state);
      }
      return result(resetActive(state, event.reason ?? 'user'));
  }
}
