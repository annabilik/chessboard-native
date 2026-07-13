import type {
  MoveDecision,
  MoveIntent,
  MoveOutcomeAccessibilityContext,
  MoveRequestTimeouts,
  MoveSource,
  PieceData,
  PieceInteractionContext,
  Revision,
  SquareId,
} from '../public-types';

/** Monotonic identity for one transient interaction lifecycle. */
export type InteractionEpoch = number;

export type InteractionTimeoutStage = 'decision' | 'commit';

export type InteractionInvalidationReason =
  | 'user'
  | 'second-finger'
  | 'accessibility'
  | 'dimensions-change'
  | 'orientation-change'
  | 'permissions-change'
  | 'geometry-change'
  | 'unmount';

type InternalCancellationReason =
  | InteractionInvalidationReason
  | 'position-change'
  | 'replaced'
  | 'epoch-exhausted';

interface InteractionStateBase {
  /** Stable identity of the only board this lifecycle can accept. */
  readonly boardId: string;
  /** Invalidates queued non-cleanup effects from older reducer results. */
  readonly effectRevision: number;
  /** Null means epoch allocation is exhausted and fails closed. */
  readonly nextEpoch: InteractionEpoch | null;
  /** Correlation metadata only; no semantic position is retained. */
  readonly positionRevision: Revision;
  readonly timeouts: Readonly<MoveRequestTimeouts>;
}

export interface IdleInteractionState extends InteractionStateBase {
  readonly phase: 'idle';
}

export interface TapInteractionState extends InteractionStateBase {
  readonly phase: 'tap';
  readonly epoch: InteractionEpoch;
  readonly context: Readonly<PieceInteractionContext>;
  readonly targetSquare: SquareId | null;
}

export interface DragInteractionState extends InteractionStateBase {
  readonly phase: 'drag';
  readonly epoch: InteractionEpoch;
  readonly context: Readonly<PieceInteractionContext>;
  readonly targetSquare: SquareId | null;
}

export interface DecidingInteractionState extends InteractionStateBase {
  readonly phase: 'deciding';
  readonly epoch: InteractionEpoch;
  readonly intent: Readonly<MoveIntent>;
}

export interface AwaitingCommitInteractionState extends InteractionStateBase {
  readonly phase: 'awaiting-commit';
  readonly epoch: InteractionEpoch;
  readonly intent: Readonly<MoveIntent>;
}

/** Pure move-request lifecycle; it never contains a semantic position. */
export type MoveIntentLifecycle =
  | IdleInteractionState
  | TapInteractionState
  | DragInteractionState
  | DecidingInteractionState
  | AwaitingCommitInteractionState;

interface InteractionEffectBase {
  readonly boardId: string;
  readonly effectRevision: number;
  readonly epoch: InteractionEpoch;
  readonly intentId: string;
}

export interface StartInteractionTimeoutEffect extends InteractionEffectBase {
  readonly type: 'start-timeout';
  readonly stage: InteractionTimeoutStage;
  readonly delayMs: number;
}

export interface CancelInteractionTimeoutEffect extends InteractionEffectBase {
  readonly type: 'cancel-timeout';
  readonly stage: InteractionTimeoutStage;
}

export interface InvokeMoveRequestEffect extends InteractionEffectBase {
  readonly type: 'invoke-move-request';
  readonly intent: Readonly<MoveIntent>;
}

export interface AbortMoveRequestEffect extends InteractionEffectBase {
  readonly type: 'abort-move-request';
}

export interface PublishMoveOutcomeEffect extends InteractionEffectBase {
  readonly type: 'publish-outcome';
  readonly intent: Readonly<MoveIntent>;
  readonly outcome: MoveOutcomeAccessibilityContext['outcome'];
  readonly reason?: string;
}

export type InteractionEffect =
  | StartInteractionTimeoutEffect
  | CancelInteractionTimeoutEffect
  | InvokeMoveRequestEffect
  | AbortMoveRequestEffect
  | PublishMoveOutcomeEffect;

/**
 * Stable key for the timer or request resource targeted by an effect. A future
 * executor must store resources under this key rather than in one global slot.
 */
export function getInteractionEffectResourceKey(
  effect: Readonly<InteractionEffect>,
): string | null {
  const board = `${String(effect.boardId.length)}:${effect.boardId}`;
  const intent = `${String(effect.intentId.length)}:${effect.intentId}`;
  switch (effect.type) {
    case 'start-timeout':
    case 'cancel-timeout':
      return `timeout:${board}:${String(effect.epoch)}:${effect.stage}:${intent}`;
    case 'invoke-move-request':
    case 'abort-move-request':
      return `request:${board}:${String(effect.epoch)}:${intent}`;
    case 'publish-outcome':
      return null;
  }
}

export type InteractionEvent =
  | {
      readonly type: 'begin';
      readonly mode: 'tap' | 'drag';
      readonly context: Readonly<PieceInteractionContext>;
      readonly targetSquare: SquareId | null;
    }
  | {
      readonly type: 'update-target';
      readonly epoch: InteractionEpoch;
      readonly targetSquare: SquareId | null;
    }
  | {
      readonly type: 'submit';
      readonly epoch: InteractionEpoch;
      readonly intentId: string;
    }
  | {
      readonly type: 'request';
      readonly intent: Readonly<MoveIntent>;
    }
  | {
      readonly type: 'decision-resolved';
      readonly epoch: InteractionEpoch;
      readonly intentId: string;
      readonly decision: Readonly<MoveDecision>;
    }
  | {
      readonly type: 'decision-failed';
      readonly epoch: InteractionEpoch;
      readonly intentId: string;
      readonly reason: string;
    }
  | {
      readonly type: 'timeout';
      readonly epoch: InteractionEpoch;
      readonly intentId: string;
      readonly stage: InteractionTimeoutStage;
    }
  | {
      readonly type: 'controlled-position';
      readonly revision: Revision;
      readonly committedIntentId?: string;
    }
  | {
      readonly type: 'invalidate';
      readonly reason: InteractionInvalidationReason;
    };

export interface InteractionReduction {
  readonly state: Readonly<MoveIntentLifecycle>;
  readonly effects: readonly Readonly<InteractionEffect>[];
}

export interface CreateInteractionStateOptions {
  readonly boardId: string;
  readonly positionRevision: Revision;
  readonly timeouts?: Readonly<MoveRequestTimeouts>;
  /** Internal deterministic seed; normally omitted. */
  readonly nextEpoch?: InteractionEpoch;
}

export const DEFAULT_MOVE_REQUEST_TIMEOUTS: Readonly<MoveRequestTimeouts> =
  Object.freeze({ commitMs: 1500, decisionMs: 10_000 });

const EMPTY_EFFECTS: readonly never[] = Object.freeze([]);

function validateNonNegativeSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

function validateBoardId(boardId: string): string {
  if (boardId.trim().length === 0) {
    throw new RangeError('boardId must be non-empty.');
  }
  return boardId;
}

function validateTimeout(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number.`);
  }
  return value;
}

function normalizeTimeouts(
  timeouts: Readonly<MoveRequestTimeouts> | undefined,
): Readonly<MoveRequestTimeouts> {
  if (timeouts === undefined) {
    return DEFAULT_MOVE_REQUEST_TIMEOUTS;
  }
  return Object.freeze({
    commitMs: validateTimeout(timeouts.commitMs, 'commitMs'),
    decisionMs: validateTimeout(timeouts.decisionMs, 'decisionMs'),
  });
}

function copyPiece(piece: Readonly<PieceData>): Readonly<PieceData> {
  return Object.freeze({
    ...(piece.id === undefined ? {} : { id: piece.id }),
    pieceType: piece.pieceType,
  });
}

function copySource(source: Readonly<MoveSource>): Readonly<MoveSource> {
  return source.kind === 'board'
    ? Object.freeze({ kind: 'board', square: source.square })
    : Object.freeze({ kind: 'spare', spareId: source.spareId });
}

function copyContext(
  context: Readonly<PieceInteractionContext>,
): Readonly<PieceInteractionContext> {
  const shared = {
    basePositionRevision: context.basePositionRevision,
    boardId: context.boardId,
    piece: copyPiece(context.piece),
  };
  return context.source.kind === 'board'
    ? Object.freeze({
        ...shared,
        source: Object.freeze({
          kind: 'board' as const,
          square: context.source.square,
        }),
      })
    : Object.freeze({
        ...shared,
        source: Object.freeze({
          kind: 'spare' as const,
          spareId: context.source.spareId,
        }),
      });
}

function copyIntent(intent: Readonly<MoveIntent>): Readonly<MoveIntent> {
  return Object.freeze({
    basePositionRevision: intent.basePositionRevision,
    boardId: intent.boardId,
    input: intent.input,
    intentId: intent.intentId,
    piece: copyPiece(intent.piece),
    source: copySource(intent.source),
    targetSquare: intent.targetSquare,
  });
}

/** Create a detached idle interaction lifecycle. */
export function createInteractionState(
  options: CreateInteractionStateOptions,
): Readonly<MoveIntentLifecycle> {
  return Object.freeze({
    boardId: validateBoardId(options.boardId),
    effectRevision: 0,
    nextEpoch: validateNonNegativeSafeInteger(
      options.nextEpoch ?? 0,
      'nextEpoch',
    ),
    phase: 'idle',
    positionRevision: validateNonNegativeSafeInteger(
      options.positionRevision,
      'positionRevision',
    ),
    timeouts: normalizeTimeouts(options.timeouts),
  });
}

function noChange(
  state: Readonly<MoveIntentLifecycle>,
): Readonly<InteractionReduction> {
  return Object.freeze({ effects: EMPTY_EFFECTS, state });
}

function nextEffectRevision(current: number): number {
  if (current >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Interaction effect revision is exhausted.');
  }
  return current + 1;
}

function transition(
  previous: Readonly<MoveIntentLifecycle>,
  buildState: (effectRevision: number) => Readonly<MoveIntentLifecycle>,
  buildEffects: (
    effectRevision: number,
  ) => readonly Readonly<InteractionEffect>[] = () => EMPTY_EFFECTS,
): Readonly<InteractionReduction> {
  const effectRevision = nextEffectRevision(previous.effectRevision);
  const state = buildState(effectRevision);
  const effects = buildEffects(effectRevision);
  return Object.freeze({
    effects: effects.length === 0 ? EMPTY_EFFECTS : Object.freeze([...effects]),
    state,
  });
}

function idleState(
  previous: Readonly<MoveIntentLifecycle>,
  effectRevision: number,
  positionRevision = previous.positionRevision,
): Readonly<IdleInteractionState> {
  return Object.freeze({
    boardId: previous.boardId,
    effectRevision,
    nextEpoch: previous.nextEpoch,
    phase: 'idle',
    positionRevision,
    timeouts: previous.timeouts,
  });
}

function effectBase(
  effectRevision: number,
  boardId: string,
  epoch: InteractionEpoch,
  intentId: string,
): InteractionEffectBase {
  return { boardId, effectRevision, epoch, intentId };
}

function startTimeoutEffect(
  effectRevision: number,
  boardId: string,
  epoch: InteractionEpoch,
  intentId: string,
  stage: InteractionTimeoutStage,
  delayMs: number,
): Readonly<StartInteractionTimeoutEffect> {
  return Object.freeze({
    ...effectBase(effectRevision, boardId, epoch, intentId),
    delayMs,
    stage,
    type: 'start-timeout',
  });
}

function cancelTimeoutEffect(
  effectRevision: number,
  boardId: string,
  epoch: InteractionEpoch,
  intentId: string,
  stage: InteractionTimeoutStage,
): Readonly<CancelInteractionTimeoutEffect> {
  return Object.freeze({
    ...effectBase(effectRevision, boardId, epoch, intentId),
    stage,
    type: 'cancel-timeout',
  });
}

function invokeEffect(
  effectRevision: number,
  epoch: InteractionEpoch,
  intent: Readonly<MoveIntent>,
): Readonly<InvokeMoveRequestEffect> {
  return Object.freeze({
    ...effectBase(effectRevision, intent.boardId, epoch, intent.intentId),
    intent,
    type: 'invoke-move-request',
  });
}

function abortEffect(
  effectRevision: number,
  boardId: string,
  epoch: InteractionEpoch,
  intentId: string,
): Readonly<AbortMoveRequestEffect> {
  return Object.freeze({
    ...effectBase(effectRevision, boardId, epoch, intentId),
    type: 'abort-move-request',
  });
}

function outcomeEffect(
  effectRevision: number,
  epoch: InteractionEpoch,
  intent: Readonly<MoveIntent>,
  outcome: MoveOutcomeAccessibilityContext['outcome'],
  reason?: string,
): Readonly<PublishMoveOutcomeEffect> {
  return Object.freeze({
    ...effectBase(effectRevision, intent.boardId, epoch, intent.intentId),
    intent,
    outcome,
    ...(reason === undefined ? {} : { reason }),
    type: 'publish-outcome',
  });
}

function cancellationEffects(
  state: Readonly<MoveIntentLifecycle>,
  effectRevision: number,
  reason: InternalCancellationReason,
  publishOutcome = true,
): readonly Readonly<InteractionEffect>[] {
  if (state.phase === 'deciding') {
    return Object.freeze([
      cancelTimeoutEffect(
        effectRevision,
        state.boardId,
        state.epoch,
        state.intent.intentId,
        'decision',
      ),
      abortEffect(
        effectRevision,
        state.boardId,
        state.epoch,
        state.intent.intentId,
      ),
      ...(publishOutcome
        ? [
            outcomeEffect(
              effectRevision,
              state.epoch,
              state.intent,
              'cancelled',
              reason,
            ),
          ]
        : []),
    ]);
  }
  if (state.phase === 'awaiting-commit') {
    return Object.freeze([
      cancelTimeoutEffect(
        effectRevision,
        state.boardId,
        state.epoch,
        state.intent.intentId,
        'commit',
      ),
      ...(publishOutcome
        ? [
            outcomeEffect(
              effectRevision,
              state.epoch,
              state.intent,
              'cancelled',
              reason,
            ),
          ]
        : []),
    ]);
  }
  return EMPTY_EFFECTS;
}

function allocateEpoch(state: Readonly<MoveIntentLifecycle>): Readonly<{
  epoch: InteractionEpoch;
  nextEpoch: InteractionEpoch | null;
}> | null {
  const epoch = state.nextEpoch;
  if (epoch === null) {
    return null;
  }
  return Object.freeze({
    epoch,
    nextEpoch: epoch === Number.MAX_SAFE_INTEGER ? null : epoch + 1,
  });
}

function matchingIntent(
  state: Readonly<MoveIntentLifecycle>,
  epoch: InteractionEpoch,
  intentId: string,
  phase: 'deciding' | 'awaiting-commit',
): state is Readonly<
  DecidingInteractionState | AwaitingCommitInteractionState
> {
  return (
    state.phase === phase &&
    state.epoch === epoch &&
    state.intent.intentId === intentId
  );
}

function startTargeting(
  state: Readonly<MoveIntentLifecycle>,
  event: Extract<InteractionEvent, { type: 'begin' }>,
): Readonly<InteractionReduction> {
  if (
    event.context.boardId !== state.boardId ||
    event.context.basePositionRevision !== state.positionRevision
  ) {
    return noChange(state);
  }
  const allocation = allocateEpoch(state);
  if (allocation === null) {
    return state.phase === 'idle'
      ? noChange(state)
      : transition(
          state,
          (effectRevision) => idleState(state, effectRevision),
          (effectRevision) =>
            cancellationEffects(state, effectRevision, 'epoch-exhausted'),
        );
  }
  const context = copyContext(event.context);
  return transition(
    state,
    (effectRevision) =>
      Object.freeze({
        boardId: state.boardId,
        context,
        effectRevision,
        epoch: allocation.epoch,
        nextEpoch: allocation.nextEpoch,
        phase: event.mode,
        positionRevision: state.positionRevision,
        targetSquare: event.targetSquare,
        timeouts: state.timeouts,
      }),
    (effectRevision) => cancellationEffects(state, effectRevision, 'replaced'),
  );
}

function updateTarget(
  state: Readonly<MoveIntentLifecycle>,
  event: Extract<InteractionEvent, { type: 'update-target' }>,
): Readonly<InteractionReduction> {
  if (
    (state.phase !== 'tap' && state.phase !== 'drag') ||
    state.epoch !== event.epoch ||
    state.targetSquare === event.targetSquare
  ) {
    return noChange(state);
  }
  return transition(state, (effectRevision) =>
    Object.freeze({
      ...state,
      effectRevision,
      targetSquare: event.targetSquare,
    }),
  );
}

function submitTarget(
  state: Readonly<MoveIntentLifecycle>,
  event: Extract<InteractionEvent, { type: 'submit' }>,
): Readonly<InteractionReduction> {
  if (
    (state.phase !== 'tap' && state.phase !== 'drag') ||
    state.epoch !== event.epoch
  ) {
    return noChange(state);
  }
  const intent = copyIntent({
    basePositionRevision: state.context.basePositionRevision,
    boardId: state.context.boardId,
    input: state.phase,
    intentId: event.intentId,
    piece: state.context.piece,
    source: state.context.source,
    targetSquare: state.targetSquare,
  });
  return transition(
    state,
    (effectRevision) =>
      Object.freeze({
        boardId: state.boardId,
        effectRevision,
        epoch: state.epoch,
        intent,
        nextEpoch: state.nextEpoch,
        phase: 'deciding',
        positionRevision: state.positionRevision,
        timeouts: state.timeouts,
      }),
    (effectRevision) =>
      Object.freeze([
        startTimeoutEffect(
          effectRevision,
          state.boardId,
          state.epoch,
          intent.intentId,
          'decision',
          state.timeouts.decisionMs,
        ),
        invokeEffect(effectRevision, state.epoch, intent),
      ]),
  );
}

function requestIntent(
  state: Readonly<MoveIntentLifecycle>,
  event: Extract<InteractionEvent, { type: 'request' }>,
): Readonly<InteractionReduction> {
  if (
    event.intent.boardId !== state.boardId ||
    event.intent.basePositionRevision !== state.positionRevision
  ) {
    return noChange(state);
  }
  if (
    (state.phase === 'deciding' || state.phase === 'awaiting-commit') &&
    state.intent.intentId === event.intent.intentId
  ) {
    return noChange(state);
  }
  const allocation = allocateEpoch(state);
  if (allocation === null) {
    return state.phase === 'idle'
      ? noChange(state)
      : transition(
          state,
          (effectRevision) => idleState(state, effectRevision),
          (effectRevision) =>
            cancellationEffects(state, effectRevision, 'epoch-exhausted'),
        );
  }
  const intent = copyIntent(event.intent);
  return transition(
    state,
    (effectRevision) =>
      Object.freeze({
        boardId: state.boardId,
        effectRevision,
        epoch: allocation.epoch,
        intent,
        nextEpoch: allocation.nextEpoch,
        phase: 'deciding',
        positionRevision: state.positionRevision,
        timeouts: state.timeouts,
      }),
    (effectRevision) =>
      Object.freeze([
        ...cancellationEffects(state, effectRevision, 'replaced'),
        startTimeoutEffect(
          effectRevision,
          state.boardId,
          allocation.epoch,
          intent.intentId,
          'decision',
          state.timeouts.decisionMs,
        ),
        invokeEffect(effectRevision, allocation.epoch, intent),
      ]),
  );
}

function resolveDecision(
  state: Readonly<MoveIntentLifecycle>,
  event: Extract<InteractionEvent, { type: 'decision-resolved' }>,
): Readonly<InteractionReduction> {
  if (!matchingIntent(state, event.epoch, event.intentId, 'deciding')) {
    return noChange(state);
  }
  if (event.decision.status === 'accepted') {
    return transition(
      state,
      (effectRevision) =>
        Object.freeze({
          ...state,
          effectRevision,
          phase: 'awaiting-commit',
        }),
      (effectRevision) =>
        Object.freeze([
          cancelTimeoutEffect(
            effectRevision,
            state.boardId,
            state.epoch,
            state.intent.intentId,
            'decision',
          ),
          startTimeoutEffect(
            effectRevision,
            state.boardId,
            state.epoch,
            state.intent.intentId,
            'commit',
            state.timeouts.commitMs,
          ),
        ]),
    );
  }
  return transition(
    state,
    (effectRevision) => idleState(state, effectRevision),
    (effectRevision) =>
      Object.freeze([
        cancelTimeoutEffect(
          effectRevision,
          state.boardId,
          state.epoch,
          state.intent.intentId,
          'decision',
        ),
        outcomeEffect(
          effectRevision,
          state.epoch,
          state.intent,
          'rejected',
          'reason' in event.decision ? event.decision.reason : undefined,
        ),
      ]),
  );
}

function failDecision(
  state: Readonly<MoveIntentLifecycle>,
  event: Extract<InteractionEvent, { type: 'decision-failed' }>,
): Readonly<InteractionReduction> {
  if (!matchingIntent(state, event.epoch, event.intentId, 'deciding')) {
    return noChange(state);
  }
  return transition(
    state,
    (effectRevision) => idleState(state, effectRevision),
    (effectRevision) =>
      Object.freeze([
        cancelTimeoutEffect(
          effectRevision,
          state.boardId,
          state.epoch,
          state.intent.intentId,
          'decision',
        ),
        outcomeEffect(
          effectRevision,
          state.epoch,
          state.intent,
          'rejected',
          event.reason,
        ),
      ]),
  );
}

function timeoutInteraction(
  state: Readonly<MoveIntentLifecycle>,
  event: Extract<InteractionEvent, { type: 'timeout' }>,
): Readonly<InteractionReduction> {
  const expectedPhase =
    event.stage === 'decision' ? 'deciding' : 'awaiting-commit';
  if (!matchingIntent(state, event.epoch, event.intentId, expectedPhase)) {
    return noChange(state);
  }
  return transition(
    state,
    (effectRevision) => idleState(state, effectRevision),
    (effectRevision) =>
      Object.freeze([
        cancelTimeoutEffect(
          effectRevision,
          state.boardId,
          state.epoch,
          state.intent.intentId,
          event.stage,
        ),
        ...(event.stage === 'decision'
          ? [
              abortEffect(
                effectRevision,
                state.boardId,
                state.epoch,
                state.intent.intentId,
              ),
            ]
          : []),
        outcomeEffect(
          effectRevision,
          state.epoch,
          state.intent,
          'timed-out',
          `${event.stage}-timeout`,
        ),
      ]),
  );
}

function controlledPosition(
  state: Readonly<MoveIntentLifecycle>,
  event: Extract<InteractionEvent, { type: 'controlled-position' }>,
): Readonly<InteractionReduction> {
  if (event.revision <= state.positionRevision) {
    return noChange(state);
  }
  if (state.phase === 'idle') {
    return transition(state, (effectRevision) =>
      idleState(state, effectRevision, event.revision),
    );
  }
  if (
    (state.phase === 'deciding' || state.phase === 'awaiting-commit') &&
    event.committedIntentId === state.intent.intentId
  ) {
    return transition(
      state,
      (effectRevision) => idleState(state, effectRevision, event.revision),
      (effectRevision) =>
        Object.freeze([
          cancelTimeoutEffect(
            effectRevision,
            state.boardId,
            state.epoch,
            state.intent.intentId,
            state.phase === 'deciding' ? 'decision' : 'commit',
          ),
          ...(state.phase === 'deciding'
            ? [
                abortEffect(
                  effectRevision,
                  state.boardId,
                  state.epoch,
                  state.intent.intentId,
                ),
              ]
            : []),
          outcomeEffect(effectRevision, state.epoch, state.intent, 'committed'),
        ]),
    );
  }
  return transition(
    state,
    (effectRevision) => idleState(state, effectRevision, event.revision),
    (effectRevision) =>
      cancellationEffects(state, effectRevision, 'position-change'),
  );
}

function invalidateInteraction(
  state: Readonly<MoveIntentLifecycle>,
  event: Extract<InteractionEvent, { type: 'invalidate' }>,
): Readonly<InteractionReduction> {
  if (state.phase === 'idle') {
    return noChange(state);
  }
  return transition(
    state,
    (effectRevision) => idleState(state, effectRevision),
    (effectRevision) =>
      cancellationEffects(
        state,
        effectRevision,
        event.reason,
        event.reason !== 'unmount',
      ),
  );
}

/**
 * Pure interaction transition. It can schedule presentation effects but has no
 * effect capable of mutating consumer-owned semantic state.
 */
export function reduceInteraction(
  state: Readonly<MoveIntentLifecycle>,
  event: Readonly<InteractionEvent>,
): Readonly<InteractionReduction> {
  switch (event.type) {
    case 'begin':
      return startTargeting(state, event);
    case 'update-target':
      return updateTarget(state, event);
    case 'submit':
      return submitTarget(state, event);
    case 'request':
      return requestIntent(state, event);
    case 'decision-resolved':
      return resolveDecision(state, event);
    case 'decision-failed':
      return failDecision(state, event);
    case 'timeout':
      return timeoutInteraction(state, event);
    case 'controlled-position':
      return controlledPosition(state, event);
    case 'invalidate':
      return invalidateInteraction(state, event);
  }
}

/**
 * Guard for a future executor. Cleanup remains executable when stale so it can
 * release its own resource; the executor must address that resource through
 * `getInteractionEffectResourceKey`. Work-starting and publishing effects
 * require the exact reducer revision that emitted them.
 */
export function isInteractionEffectCurrent(
  state: Readonly<MoveIntentLifecycle>,
  effect: Readonly<InteractionEffect>,
): boolean {
  if (state.boardId !== effect.boardId) {
    return false;
  }
  return effect.type === 'cancel-timeout' ||
    effect.type === 'abort-move-request'
    ? true
    : state.effectRevision === effect.effectRevision;
}
