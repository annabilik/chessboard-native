import type {
  MoveIntent,
  PieceInteractionContext,
} from '../../src/public-types';
import {
  createInteractionState,
  DEFAULT_MOVE_REQUEST_TIMEOUTS,
  getInteractionEffectResourceKey,
  isInteractionEffectCurrent,
  reduceInteraction,
  type InteractionEffect,
  type MoveIntentLifecycle,
} from '../../src/internal/interaction-reducer';

function boardContext(basePositionRevision = 7): PieceInteractionContext {
  return {
    basePositionRevision,
    boardId: 'analysis',
    piece: { id: 'white-pawn', pieceType: 'wP' },
    source: { kind: 'board', square: 'e2' },
  };
}

function moveIntent(
  intentId: string,
  input: MoveIntent['input'] = 'keyboard',
  targetSquare: MoveIntent['targetSquare'] = 'e4',
): MoveIntent {
  return {
    basePositionRevision: 7,
    boardId: 'analysis',
    input,
    intentId,
    piece: { id: 'white-pawn', pieceType: 'wP' },
    source: { kind: 'board', square: 'e2' },
    targetSquare,
  };
}

function phase<Phase extends MoveIntentLifecycle['phase']>(
  state: Readonly<MoveIntentLifecycle>,
  expected: Phase,
): Readonly<Extract<MoveIntentLifecycle, { phase: Phase }>> {
  expect(state.phase).toBe(expected);
  if (state.phase !== expected) {
    throw new Error(`Expected ${expected}, received ${state.phase}.`);
  }
  return state as Readonly<Extract<MoveIntentLifecycle, { phase: Phase }>>;
}

function effectTypes(
  effects: readonly Readonly<InteractionEffect>[],
): InteractionEffect['type'][] {
  return effects.map(({ type }) => type);
}

function request(
  intent: MoveIntent = moveIntent('intent-1'),
  state = createInteractionState({ boardId: 'analysis', positionRevision: 7 }),
) {
  return reduceInteraction(state, { intent, type: 'request' });
}

function accept(state: Readonly<MoveIntentLifecycle>) {
  const deciding = phase(state, 'deciding');
  return reduceInteraction(deciding, {
    decision: { status: 'accepted' },
    epoch: deciding.epoch,
    intentId: deciding.intent.intentId,
    type: 'decision-resolved',
  });
}

describe('pure interaction reducer', () => {
  it('creates validated, detached, deeply frozen lifecycle state', () => {
    const timeouts = { commitMs: 17, decisionMs: 29 };
    const initial = createInteractionState({
      boardId: 'analysis',
      nextEpoch: 3,
      positionRevision: 7,
      timeouts,
    });
    timeouts.commitMs = 99;

    expect(initial).toEqual({
      boardId: 'analysis',
      effectRevision: 0,
      nextEpoch: 3,
      phase: 'idle',
      positionRevision: 7,
      timeouts: { commitMs: 17, decisionMs: 29 },
    });
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.timeouts)).toBe(true);
    expect(DEFAULT_MOVE_REQUEST_TIMEOUTS).toEqual({
      commitMs: 1500,
      decisionMs: 10_000,
    });
    expect(() =>
      createInteractionState({ boardId: 'analysis', positionRevision: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      createInteractionState({ boardId: ' ', positionRevision: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      createInteractionState({
        boardId: 'analysis',
        positionRevision: 0,
        timeouts: { commitMs: Number.POSITIVE_INFINITY, decisionMs: 0 },
      }),
    ).toThrow(RangeError);
  });

  it('rejects interaction input routed from a different board', () => {
    const initial = createInteractionState({
      boardId: 'analysis',
      positionRevision: 7,
    });
    const foreignBegin = reduceInteraction(initial, {
      context: { ...boardContext(), boardId: 'other-board' },
      mode: 'drag',
      targetSquare: 'e4',
      type: 'begin',
    });
    expect(foreignBegin.state).toBe(initial);
    expect(foreignBegin.effects).toEqual([]);

    const foreignRequest = reduceInteraction(initial, {
      intent: { ...moveIntent('foreign'), boardId: 'other-board' },
      type: 'request',
    });
    expect(foreignRequest.state).toBe(initial);
    expect(foreignRequest.effects).toEqual([]);

    const first = request(moveIntent('same-intent'), initial);
    const otherInitial = createInteractionState({
      boardId: 'other-board',
      positionRevision: 7,
    });
    const other = reduceInteraction(otherInitial, {
      intent: { ...moveIntent('same-intent'), boardId: 'other-board' },
      type: 'request',
    });
    const firstTimer = first.effects.find(
      ({ type }) => type === 'start-timeout',
    );
    const otherTimer = other.effects.find(
      ({ type }) => type === 'start-timeout',
    );
    expect(firstTimer?.epoch).toBe(otherTimer?.epoch);
    expect(firstTimer?.intentId).toBe(otherTimer?.intentId);
    expect(firstTimer && getInteractionEffectResourceKey(firstTimer)).not.toBe(
      otherTimer && getInteractionEffectResourceKey(otherTimer),
    );
    const firstState = phase(first.state, 'deciding');
    expect(
      otherTimer && isInteractionEffectCurrent(firstState, otherTimer),
    ).toBe(false);
    const otherState = phase(other.state, 'deciding');
    const otherRejected = reduceInteraction(otherState, {
      decision: { status: 'rejected' },
      epoch: otherState.epoch,
      intentId: otherState.intent.intentId,
      type: 'decision-resolved',
    });
    const otherCleanup = otherRejected.effects.find(
      ({ type }) => type === 'cancel-timeout',
    );
    expect(
      otherCleanup && isInteractionEffectCurrent(firstState, otherCleanup),
    ).toBe(false);
  });

  it('[CBN-CONTRACT-003-GESTURE-NONCOMMITTING] turns tap and drag targeting into move-request effects without a position mutation', () => {
    const initial = createInteractionState({
      boardId: 'analysis',
      positionRevision: 7,
    });
    const context = boardContext();
    const begun = reduceInteraction(initial, {
      context,
      mode: 'drag',
      targetSquare: null,
      type: 'begin',
    });
    const dragging = phase(begun.state, 'drag');
    expect(dragging).not.toHaveProperty('position');
    expect(dragging.epoch).toBe(0);
    expect(dragging.context).not.toBe(context);
    expect(Object.isFrozen(dragging.context)).toBe(true);
    expect(Object.isFrozen(dragging.context.piece)).toBe(true);
    expect(Object.isFrozen(dragging.context.source)).toBe(true);

    const targeted = reduceInteraction(dragging, {
      epoch: dragging.epoch,
      targetSquare: 'e4',
      type: 'update-target',
    });
    const submitted = reduceInteraction(targeted.state, {
      epoch: dragging.epoch,
      intentId: 'drag-1',
      type: 'submit',
    });
    const deciding = phase(submitted.state, 'deciding');

    expect(deciding.intent).toEqual(moveIntent('drag-1', 'drag'));
    expect(deciding).not.toHaveProperty('position');
    expect(effectTypes(submitted.effects)).toEqual([
      'start-timeout',
      'invoke-move-request',
    ]);
    expect(submitted.effects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'set-position' }),
      ]),
    );
  });

  it('[CBN-CONTRACT-005-VISUAL-NONCANONICAL] keeps transient targeting visual-only and restores idle from current controlled metadata', () => {
    const begun = reduceInteraction(
      createInteractionState({ boardId: 'analysis', positionRevision: 7 }),
      {
        context: boardContext(),
        mode: 'tap',
        targetSquare: 'e3',
        type: 'begin',
      },
    );
    const tapping = phase(begun.state, 'tap');
    expect(Object.keys(tapping).sort()).toEqual([
      'boardId',
      'context',
      'effectRevision',
      'epoch',
      'nextEpoch',
      'phase',
      'positionRevision',
      'targetSquare',
      'timeouts',
    ]);

    const changed = reduceInteraction(tapping, {
      revision: 8,
      type: 'controlled-position',
    });
    expect(changed.state).toEqual(
      expect.objectContaining({ phase: 'idle', positionRevision: 8 }),
    );
    expect(changed.effects).toEqual([]);
  });

  it('[PARITY-BEHAVIOR-B11] [CBN-CONTRACT-004-CALLBACK-NONCOMMITTING] waits for a newer controlled revision after acceptance', () => {
    const pending = accept(request().state);
    const awaiting = phase(pending.state, 'awaiting-commit');
    expect(effectTypes(pending.effects)).toEqual([
      'cancel-timeout',
      'start-timeout',
    ]);
    expect(awaiting).not.toHaveProperty('position');

    const sameRevision = reduceInteraction(awaiting, {
      committedIntentId: awaiting.intent.intentId,
      revision: 7,
      type: 'controlled-position',
    });
    expect(sameRevision.state).toBe(awaiting);
    expect(sameRevision.effects).toEqual([]);

    const committed = reduceInteraction(awaiting, {
      committedIntentId: awaiting.intent.intentId,
      revision: 8,
      type: 'controlled-position',
    });
    expect(committed.state).toEqual(
      expect.objectContaining({ phase: 'idle', positionRevision: 8 }),
    );
    expect(committed.effects).toEqual([
      expect.objectContaining({ stage: 'commit', type: 'cancel-timeout' }),
      expect.objectContaining({
        outcome: 'committed',
        type: 'publish-outcome',
      }),
    ]);
  });

  it('correlates controlled commits when an intent ID is available', () => {
    const awaiting = phase(accept(request().state).state, 'awaiting-commit');
    const matching = reduceInteraction(awaiting, {
      committedIntentId: awaiting.intent.intentId,
      revision: 8,
      type: 'controlled-position',
    });
    expect(matching.effects[1]).toEqual(
      expect.objectContaining({ outcome: 'committed' }),
    );

    const freshAwaiting = phase(
      accept(request().state).state,
      'awaiting-commit',
    );
    const mismatched = reduceInteraction(freshAwaiting, {
      committedIntentId: 'different-intent',
      revision: 8,
      type: 'controlled-position',
    });
    expect(mismatched.effects[1]).toEqual(
      expect.objectContaining({
        outcome: 'cancelled',
        reason: 'position-change',
      }),
    );

    const plainAwaiting = phase(
      accept(request(moveIntent('plain-update')).state).state,
      'awaiting-commit',
    );
    const uncorrelated = reduceInteraction(plainAwaiting, {
      revision: 8,
      type: 'controlled-position',
    });
    expect(uncorrelated.effects[1]).toEqual(
      expect.objectContaining({
        outcome: 'cancelled',
        reason: 'position-change',
      }),
    );
  });

  it('[CBN-CONTRACT-007-REVISION-EPOCH] replaces work with a new epoch and makes late results identity no-ops', () => {
    const first = request(moveIntent('first'));
    const firstState = phase(first.state, 'deciding');
    const replacement = request(
      moveIntent('second', 'accessibility'),
      firstState,
    );
    const secondState = phase(replacement.state, 'deciding');

    expect(secondState.epoch).toBe(firstState.epoch + 1);
    expect(effectTypes(replacement.effects)).toEqual([
      'cancel-timeout',
      'abort-move-request',
      'publish-outcome',
      'start-timeout',
      'invoke-move-request',
    ]);
    const stale = reduceInteraction(secondState, {
      decision: { status: 'accepted' },
      epoch: firstState.epoch,
      intentId: firstState.intent.intentId,
      type: 'decision-resolved',
    });
    expect(stale.state).toBe(secondState);
    expect(stale.effects).toEqual([]);
  });

  it('[CBN-CONTRACT-008-RESTORE-CONTROLLED] rejects without retaining or restoring a semantic snapshot', () => {
    const deciding = phase(request().state, 'deciding');
    const rejected = reduceInteraction(deciding, {
      decision: { reason: 'illegal move', status: 'rejected' },
      epoch: deciding.epoch,
      intentId: deciding.intent.intentId,
      type: 'decision-resolved',
    });

    expect(rejected.state).toEqual(
      expect.objectContaining({ phase: 'idle', positionRevision: 7 }),
    );
    expect(rejected.state).not.toHaveProperty('position');
    expect(rejected.effects).toEqual([
      expect.objectContaining({ stage: 'decision', type: 'cancel-timeout' }),
      expect.objectContaining({
        outcome: 'rejected',
        reason: 'illegal move',
        type: 'publish-outcome',
      }),
    ]);
  });

  it('[CBN-CONTRACT-009-UPDATE-CANCELS-GESTURE] cancels active work on a newer controlled position and ignores its stale completion', () => {
    const deciding = phase(request().state, 'deciding');
    const changed = reduceInteraction(deciding, {
      revision: 8,
      type: 'controlled-position',
    });
    expect(changed.state).toEqual(
      expect.objectContaining({ phase: 'idle', positionRevision: 8 }),
    );
    expect(effectTypes(changed.effects)).toEqual([
      'cancel-timeout',
      'abort-move-request',
      'publish-outcome',
    ]);

    const stale = reduceInteraction(changed.state, {
      decision: { status: 'accepted' },
      epoch: deciding.epoch,
      intentId: deciding.intent.intentId,
      type: 'decision-resolved',
    });
    expect(stale.state).toBe(changed.state);
    expect(stale.effects).toEqual([]);
  });

  it('[PARITY-BEHAVIOR-B08] invalidates epochs when dimensions, orientation, permissions, or geometry change', () => {
    const reasons = [
      'dimensions-change',
      'orientation-change',
      'permissions-change',
      'geometry-change',
    ] as const;

    for (const reason of reasons) {
      const deciding = phase(
        request(moveIntent(`intent-${reason}`)).state,
        'deciding',
      );
      const invalidated = reduceInteraction(deciding, {
        reason,
        type: 'invalidate',
      });
      expect(invalidated.state.phase).toBe('idle');
      expect(effectTypes(invalidated.effects)).toEqual([
        'cancel-timeout',
        'abort-move-request',
        'publish-outcome',
      ]);

      const stale = reduceInteraction(invalidated.state, {
        decision: { status: 'accepted' },
        epoch: deciding.epoch,
        intentId: deciding.intent.intentId,
        type: 'decision-resolved',
      });
      expect(stale.state).toBe(invalidated.state);
      expect(stale.effects).toEqual([]);
    }
  });

  it('[PARITY-BEHAVIOR-B16] guards queued work and makes timeout-versus-result races deterministic', () => {
    const started = request();
    const deciding = phase(started.state, 'deciding');
    expect(
      started.effects.every((effect) =>
        isInteractionEffectCurrent(deciding, effect),
      ),
    ).toBe(true);

    const accepted = accept(deciding);
    const awaiting = phase(accepted.state, 'awaiting-commit');
    expect(
      started.effects.every(
        (effect) => !isInteractionEffectCurrent(awaiting, effect),
      ),
    ).toBe(true);
    expect(
      accepted.effects.every((effect) =>
        isInteractionEffectCurrent(awaiting, effect),
      ),
    ).toBe(true);

    const timedOut = reduceInteraction(awaiting, {
      epoch: awaiting.epoch,
      intentId: awaiting.intent.intentId,
      stage: 'commit',
      type: 'timeout',
    });
    const lateCommit = reduceInteraction(timedOut.state, {
      committedIntentId: awaiting.intent.intentId,
      revision: 8,
      type: 'controlled-position',
    });
    expect(lateCommit.state).toEqual(
      expect.objectContaining({ phase: 'idle', positionRevision: 8 }),
    );
    expect(lateCommit.effects).toEqual([]);

    const freshDeciding = phase(
      request(moveIntent('decision-race')).state,
      'deciding',
    );
    const decisionTimedOut = reduceInteraction(freshDeciding, {
      epoch: freshDeciding.epoch,
      intentId: freshDeciding.intent.intentId,
      stage: 'decision',
      type: 'timeout',
    });
    const lateDecision = reduceInteraction(decisionTimedOut.state, {
      decision: { status: 'accepted' },
      epoch: freshDeciding.epoch,
      intentId: freshDeciding.intent.intentId,
      type: 'decision-resolved',
    });
    expect(lateDecision.state).toBe(decisionTimedOut.state);
    expect(lateDecision.effects).toEqual([]);

    const cancelled = started.effects.find(
      ({ type }) => type === 'start-timeout',
    );
    const cleanup = timedOut.effects.find(
      ({ type }) => type === 'cancel-timeout',
    );
    expect(
      cancelled && isInteractionEffectCurrent(timedOut.state, cancelled),
    ).toBe(false);
    expect(cleanup && isInteractionEffectCurrent(timedOut.state, cleanup)).toBe(
      true,
    );

    const first = request(moveIntent('replace-first'));
    const firstState = phase(first.state, 'deciding');
    const replacement = request(moveIntent('replace-second'), firstState);
    const oldStart = first.effects.find(({ type }) => type === 'start-timeout');
    const oldCleanup = replacement.effects.find(
      ({ type }) => type === 'cancel-timeout',
    );
    const newStart = replacement.effects.find(
      ({ type }) => type === 'start-timeout',
    );
    if (
      oldStart === undefined ||
      oldCleanup === undefined ||
      newStart === undefined
    ) {
      throw new Error('Expected correlated timeout effects.');
    }
    const oldKey = getInteractionEffectResourceKey(oldStart);
    const cleanupKey = getInteractionEffectResourceKey(oldCleanup);
    const newKey = getInteractionEffectResourceKey(newStart);
    expect(cleanupKey).toBe(oldKey);
    expect(newKey).not.toBe(oldKey);

    const resources = new Map<string, string>();
    if (oldKey === null || cleanupKey === null || newKey === null) {
      throw new Error('Timeout effects must have resource keys.');
    }
    resources.set(oldKey, 'old timer');
    resources.set(newKey, 'replacement timer');
    resources.delete(cleanupKey);
    expect(resources.get(newKey)).toBe('replacement timer');
  });

  it('settles decision and controlled-commit races once in either order', () => {
    const deciding = phase(
      request(moveIntent('decision-first')).state,
      'deciding',
    );
    const accepted = accept(deciding);
    const awaiting = phase(accepted.state, 'awaiting-commit');
    const lateDecisionTimeout = reduceInteraction(awaiting, {
      epoch: deciding.epoch,
      intentId: deciding.intent.intentId,
      stage: 'decision',
      type: 'timeout',
    });
    expect(lateDecisionTimeout.state).toBe(awaiting);
    expect(lateDecisionTimeout.effects).toEqual([]);

    const committed = reduceInteraction(awaiting, {
      committedIntentId: awaiting.intent.intentId,
      revision: 8,
      type: 'controlled-position',
    });
    const lateCommitTimeout = reduceInteraction(committed.state, {
      epoch: awaiting.epoch,
      intentId: awaiting.intent.intentId,
      stage: 'commit',
      type: 'timeout',
    });
    expect(lateCommitTimeout.state).toBe(committed.state);
    expect(lateCommitTimeout.effects).toEqual([]);

    const propFirst = phase(
      request(moveIntent('prop-before-decision')).state,
      'deciding',
    );
    const earlyCommit = reduceInteraction(propFirst, {
      committedIntentId: propFirst.intent.intentId,
      revision: 8,
      type: 'controlled-position',
    });
    expect(effectTypes(earlyCommit.effects)).toEqual([
      'cancel-timeout',
      'abort-move-request',
      'publish-outcome',
    ]);
    expect(earlyCommit.effects[2]).toEqual(
      expect.objectContaining({ outcome: 'committed' }),
    );
    const lateDecision = reduceInteraction(earlyCommit.state, {
      decision: { status: 'accepted' },
      epoch: propFirst.epoch,
      intentId: propFirst.intent.intentId,
      type: 'decision-resolved',
    });
    expect(lateDecision.state).toBe(earlyCommit.state);
    expect(lateDecision.effects).toEqual([]);
  });

  it('replaces accepted pending work and lets an older controlled commit cancel its replacement', () => {
    const oldAwaiting = phase(
      accept(request(moveIntent('old-intent')).state).state,
      'awaiting-commit',
    );
    const replacement = request(moveIntent('new-intent'), oldAwaiting);
    const newDeciding = phase(replacement.state, 'deciding');
    expect(effectTypes(replacement.effects)).toEqual([
      'cancel-timeout',
      'publish-outcome',
      'start-timeout',
      'invoke-move-request',
    ]);

    const oldCommit = reduceInteraction(newDeciding, {
      committedIntentId: oldAwaiting.intent.intentId,
      revision: 8,
      type: 'controlled-position',
    });
    expect(oldCommit.state).toEqual(
      expect.objectContaining({ phase: 'idle', positionRevision: 8 }),
    );
    expect(oldCommit.effects).toEqual([
      expect.objectContaining({ type: 'cancel-timeout' }),
      expect.objectContaining({ type: 'abort-move-request' }),
      expect.objectContaining({
        intentId: 'new-intent',
        outcome: 'cancelled',
        reason: 'position-change',
      }),
    ]);
  });

  it('settles a failed decision once and ignores every late terminal event', () => {
    const deciding = phase(request(moveIntent('failed')).state, 'deciding');
    const failed = reduceInteraction(deciding, {
      epoch: deciding.epoch,
      intentId: deciding.intent.intentId,
      reason: 'validator unavailable',
      type: 'decision-failed',
    });
    expect(failed.effects[1]).toEqual(
      expect.objectContaining({
        outcome: 'rejected',
        reason: 'validator unavailable',
      }),
    );

    const lateEvents = [
      {
        epoch: deciding.epoch,
        intentId: deciding.intent.intentId,
        reason: 'again',
        type: 'decision-failed' as const,
      },
      {
        decision: { status: 'accepted' as const },
        epoch: deciding.epoch,
        intentId: deciding.intent.intentId,
        type: 'decision-resolved' as const,
      },
      {
        epoch: deciding.epoch,
        intentId: deciding.intent.intentId,
        stage: 'decision' as const,
        type: 'timeout' as const,
      },
    ];
    for (const event of lateEvents) {
      const late = reduceInteraction(failed.state, event);
      expect(late.state).toBe(failed.state);
      expect(late.effects).toEqual([]);
    }
  });

  it('[PARITY-BEHAVIOR-B22] models accept, reject, decision-timeout, and commit-timeout outcomes', () => {
    const accepted = accept(request(moveIntent('accepted')).state);
    expect(accepted.state.phase).toBe('awaiting-commit');

    const rejecting = phase(request(moveIntent('rejected')).state, 'deciding');
    const rejected = reduceInteraction(rejecting, {
      decision: { status: 'rejected' },
      epoch: rejecting.epoch,
      intentId: rejecting.intent.intentId,
      type: 'decision-resolved',
    });
    expect(rejected.effects[1]).toEqual(
      expect.objectContaining({ outcome: 'rejected' }),
    );

    const deciding = phase(
      request(moveIntent('decision-timeout')).state,
      'deciding',
    );
    const decisionTimeout = reduceInteraction(deciding, {
      epoch: deciding.epoch,
      intentId: deciding.intent.intentId,
      stage: 'decision',
      type: 'timeout',
    });
    expect(effectTypes(decisionTimeout.effects)).toEqual([
      'cancel-timeout',
      'abort-move-request',
      'publish-outcome',
    ]);
    expect(decisionTimeout.effects[2]).toEqual(
      expect.objectContaining({
        outcome: 'timed-out',
        reason: 'decision-timeout',
      }),
    );

    const awaiting = phase(
      accept(request(moveIntent('commit-timeout')).state).state,
      'awaiting-commit',
    );
    const commitTimeout = reduceInteraction(awaiting, {
      epoch: awaiting.epoch,
      intentId: awaiting.intent.intentId,
      stage: 'commit',
      type: 'timeout',
    });
    expect(effectTypes(commitTimeout.effects)).toEqual([
      'cancel-timeout',
      'publish-outcome',
    ]);
    expect(commitTimeout.effects[1]).toEqual(
      expect.objectContaining({
        outcome: 'timed-out',
        reason: 'commit-timeout',
      }),
    );
  });

  it('[PARITY-BEHAVIOR-B23] preserves an off-board null target through the same controlled lifecycle', () => {
    const started = request(moveIntent('off-board', 'drag', null));
    const deciding = phase(started.state, 'deciding');
    expect(deciding.intent.targetSquare).toBeNull();
    const invoked = started.effects.find(
      ({ type }) => type === 'invoke-move-request',
    );
    expect(invoked?.type).toBe('invoke-move-request');
    expect(
      invoked?.type === 'invoke-move-request' && invoked.intent.targetSquare,
    ).toBeNull();

    const rejected = reduceInteraction(deciding, {
      decision: { status: 'rejected' },
      epoch: deciding.epoch,
      intentId: deciding.intent.intentId,
      type: 'decision-resolved',
    });
    expect(rejected.effects[1]).toEqual(
      expect.objectContaining({ outcome: 'rejected' }),
    );

    const timingOut = phase(
      request(moveIntent('off-board-timeout', 'drag', null)).state,
      'deciding',
    );
    const decisionTimeout = reduceInteraction(timingOut, {
      epoch: timingOut.epoch,
      intentId: timingOut.intent.intentId,
      stage: 'decision',
      type: 'timeout',
    });
    expect(decisionTimeout.effects[2]).toEqual(
      expect.objectContaining({ outcome: 'timed-out' }),
    );

    const awaitingCommit = phase(
      accept(request(moveIntent('off-board-commit', 'drag', null)).state).state,
      'awaiting-commit',
    );
    const committed = reduceInteraction(awaitingCommit, {
      committedIntentId: awaitingCommit.intent.intentId,
      revision: 8,
      type: 'controlled-position',
    });
    expect(committed.effects[1]).toEqual(
      expect.objectContaining({ outcome: 'committed' }),
    );

    const awaitingTimeout = phase(
      accept(
        request(moveIntent('off-board-commit-timeout', 'drag', null)).state,
      ).state,
      'awaiting-commit',
    );
    const commitTimeout = reduceInteraction(awaitingTimeout, {
      epoch: awaitingTimeout.epoch,
      intentId: awaitingTimeout.intent.intentId,
      stage: 'commit',
      type: 'timeout',
    });
    expect(commitTimeout.effects[1]).toEqual(
      expect.objectContaining({ outcome: 'timed-out' }),
    );
  });

  it('[PARITY-BEHAVIOR-B24] cancels user, second-finger, accessibility, and unmount lifecycles with correlated cleanup', () => {
    const reasons = [
      'user',
      'second-finger',
      'accessibility',
      'unmount',
    ] as const;

    for (const reason of reasons) {
      const deciding = phase(
        request(moveIntent(`intent-${reason}`)).state,
        'deciding',
      );
      const cancelled = reduceInteraction(deciding, {
        reason,
        type: 'invalidate',
      });
      expect(cancelled.state.phase).toBe('idle');
      expect(effectTypes(cancelled.effects).slice(0, 2)).toEqual([
        'cancel-timeout',
        'abort-move-request',
      ]);
      expect(
        cancelled.effects.every(({ epoch }) => epoch === deciding.epoch),
      ).toBe(true);
      expect(
        cancelled.effects.every(
          ({ intentId }) => intentId === deciding.intent.intentId,
        ),
      ).toBe(true);
      expect(effectTypes(cancelled.effects).includes('publish-outcome')).toBe(
        reason !== 'unmount',
      );
    }

    const targeting = reduceInteraction(
      createInteractionState({ boardId: 'analysis', positionRevision: 7 }),
      {
        context: boardContext(),
        mode: 'drag',
        targetSquare: 'e4',
        type: 'begin',
      },
    );
    const dragging = phase(targeting.state, 'drag');
    const cancelledDrag = reduceInteraction(dragging, {
      reason: 'second-finger',
      type: 'invalidate',
    });
    expect(cancelledDrag.state.phase).toBe('idle');
    expect(cancelledDrag.effects).toEqual([]);
    const staleSubmit = reduceInteraction(cancelledDrag.state, {
      epoch: dragging.epoch,
      intentId: 'stale-drag',
      type: 'submit',
    });
    expect(staleSubmit.state).toBe(cancelledDrag.state);

    const awaiting = phase(
      accept(request(moveIntent('awaiting-cancel')).state).state,
      'awaiting-commit',
    );
    const cancelledPending = reduceInteraction(awaiting, {
      reason: 'user',
      type: 'invalidate',
    });
    expect(effectTypes(cancelledPending.effects)).toEqual([
      'cancel-timeout',
      'publish-outcome',
    ]);
  });

  it('fails closed when epoch allocation is exhausted', () => {
    const initial = createInteractionState({
      boardId: 'analysis',
      nextEpoch: Number.MAX_SAFE_INTEGER,
      positionRevision: 7,
    });
    const finalAllocation = request(moveIntent('last'), initial);
    const deciding = phase(finalAllocation.state, 'deciding');
    expect(deciding.epoch).toBe(Number.MAX_SAFE_INTEGER);
    expect(deciding.nextEpoch).toBeNull();

    const exhausted = request(moveIntent('impossible'), deciding);
    expect(exhausted.state.phase).toBe('idle');
    expect(exhausted.effects).toEqual([
      expect.objectContaining({ type: 'cancel-timeout' }),
      expect.objectContaining({ type: 'abort-move-request' }),
      expect.objectContaining({
        outcome: 'cancelled',
        reason: 'epoch-exhausted',
      }),
    ]);
    const retry = request(moveIntent('still-impossible'), exhausted.state);
    expect(retry.state).toBe(exhausted.state);
    expect(retry.effects).toEqual([]);
  });

  it('rejects wrong phase, epoch, intent, and timeout-stage events as identity no-ops', () => {
    const deciding = phase(request().state, 'deciding');
    const events = [
      {
        decision: { status: 'accepted' as const },
        epoch: deciding.epoch + 1,
        intentId: deciding.intent.intentId,
        type: 'decision-resolved' as const,
      },
      {
        epoch: deciding.epoch,
        intentId: 'wrong',
        stage: 'decision' as const,
        type: 'timeout' as const,
      },
      {
        epoch: deciding.epoch,
        intentId: deciding.intent.intentId,
        stage: 'commit' as const,
        type: 'timeout' as const,
      },
    ];

    for (const event of events) {
      const result = reduceInteraction(deciding, event);
      expect(result.state).toBe(deciding);
      expect(result.effects).toEqual([]);
    }
  });
});
