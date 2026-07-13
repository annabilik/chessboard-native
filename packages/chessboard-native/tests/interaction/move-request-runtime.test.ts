import type {
  MoveDecision,
  MoveIntent,
  MoveOutcomeAccessibilityContext,
  OnMoveRequest,
} from '../../src/public-types';
import {
  createMoveRequestRuntime,
  type MoveIntentRequest,
  type MoveRequestRuntimeScheduler,
} from '../../src/internal/move-request-runtime';

interface ScheduledTask {
  readonly callback: () => void;
  readonly delayMs: number;
}

class ManualScheduler implements MoveRequestRuntimeScheduler {
  readonly tasks = new Map<number, Readonly<ScheduledTask>>();
  private nextHandle = 1;

  readonly clearTimeout = (handle: unknown): void => {
    if (typeof handle === 'number') {
      this.tasks.delete(handle);
    }
  };

  readonly setTimeout = (callback: () => void, delayMs: number): number => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.tasks.set(handle, Object.freeze({ callback, delayMs }));
    return handle;
  };

  delays(): readonly number[] {
    return [...this.tasks.values()].map(({ delayMs }) => delayMs);
  }

  runNext(): number {
    const entry = this.tasks.entries().next().value;
    if (entry === undefined) {
      throw new Error('No scheduled task is available.');
    }
    const [handle, task] = entry;
    this.tasks.delete(handle);
    task.callback();
    return task.delayMs;
  }
}

function deferred<Value>(): Readonly<{
  promise: Promise<Value>;
  resolve: (value: Value) => void;
}> {
  let resolvePromise: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return Object.freeze({
    promise,
    resolve: (value: Value): void => {
      if (resolvePromise === undefined) {
        throw new Error('Deferred promise was not initialized.');
      }
      resolvePromise(value);
    },
  });
}

function moveRequest(
  overrides: Partial<MoveIntentRequest> = {},
): MoveIntentRequest {
  return {
    basePositionRevision: 7,
    boardId: 'analysis',
    input: 'drag',
    piece: { id: 'white-pawn', pieceType: 'wP' },
    source: { kind: 'board', square: 'e2' },
    targetSquare: 'e4',
    ...overrides,
  };
}

async function flushPromiseJobs(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('move-request runtime', () => {
  it('allocates board-scoped sequence IDs and retains no consumer position object', async () => {
    const seen: MoveIntent[] = [];
    const scheduler = new ManualScheduler();
    const runtime = createMoveRequestRuntime({
      boardId: 'analysis',
      onMoveRequest: (intent) => {
        seen.push(intent);
        return { reason: 'not legal', status: 'rejected' };
      },
      positionRevision: 7,
      scheduler,
    });
    const position = { e2: { pieceType: 'wP' } };
    const input = {
      ...moveRequest(),
      handlerTag: 'must-not-be-an-id-source',
      position,
    } as unknown as MoveIntentRequest;

    const first = runtime.request(input);
    await flushPromiseJobs();
    const second = runtime.request(moveRequest({ targetSquare: 'e3' }));
    await flushPromiseJobs();

    expect(first).toBe('move:8:analysis:0');
    expect(second).toBe('move:8:analysis:1');
    expect(seen.map(({ intentId }) => intentId)).toEqual([first, second]);
    expect(seen[0]).not.toHaveProperty('handlerTag');
    expect(seen[0]).not.toHaveProperty('position');
    expect(runtime.getState()).not.toHaveProperty('position');
    expect(runtime.getState().phase).toBe('idle');
    expect(runtime.getResourceCounts()).toEqual({ requests: 0, timeouts: 0 });
    expect(scheduler.tasks.size).toBe(0);
  });

  it('waits after acceptance for a correlated newer controlled position', async () => {
    const scheduler = new ManualScheduler();
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    const runtime = createMoveRequestRuntime({
      boardId: 'analysis',
      onMoveRequest: () => ({ status: 'accepted' }),
      onOutcome: (context) => outcomes.push(context),
      positionRevision: 7,
      scheduler,
    });

    const intentId = runtime.request(moveRequest());
    expect(intentId).not.toBeNull();
    expect(runtime.getState().phase).toBe('deciding');
    expect(runtime.getResourceCounts()).toEqual({ requests: 1, timeouts: 1 });
    expect(scheduler.delays()).toEqual([10_000]);

    await flushPromiseJobs();
    expect(runtime.getState().phase).toBe('awaiting-commit');
    expect(runtime.getState()).not.toHaveProperty('position');
    expect(runtime.getResourceCounts()).toEqual({ requests: 0, timeouts: 1 });
    expect(scheduler.delays()).toEqual([1500]);

    runtime.controlledPosition(7, intentId ?? undefined);
    expect(runtime.getState().phase).toBe('awaiting-commit');
    expect(outcomes).toEqual([]);

    runtime.controlledPosition(8, intentId ?? undefined);
    expect(runtime.getState()).toEqual(
      expect.objectContaining({ phase: 'idle', positionRevision: 8 }),
    );
    expect(runtime.getResourceCounts()).toEqual({ requests: 0, timeouts: 0 });
    expect(scheduler.tasks.size).toBe(0);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.intent.intentId).toBe(intentId);
    expect(outcomes[0]?.outcome).toBe('committed');
    expect(Object.isFrozen(outcomes[0])).toBe(true);
  });

  it('aborts a pending decision when an uncorrelated newer position supersedes it', async () => {
    const decision = deferred<MoveDecision>();
    const scheduler = new ManualScheduler();
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    let signal: AbortSignal | undefined;
    const runtime = createMoveRequestRuntime({
      boardId: 'analysis',
      onMoveRequest: (_intent, context) => {
        signal = context.signal;
        return decision.promise;
      },
      onOutcome: (context) => outcomes.push(context),
      positionRevision: 7,
      scheduler,
    });

    const intentId = runtime.request(moveRequest());
    runtime.controlledPosition(8, 'another-intent');

    expect(signal?.aborted).toBe(true);
    expect(runtime.getState()).toEqual(
      expect.objectContaining({ phase: 'idle', positionRevision: 8 }),
    );
    expect(runtime.getResourceCounts()).toEqual({ requests: 0, timeouts: 0 });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.intent.intentId).toBe(intentId);
    expect(outcomes[0]?.outcome).toBe('cancelled');
    expect(outcomes[0]?.reason).toBe('position-change');

    decision.resolve({ status: 'accepted' });
    await flushPromiseJobs();
    expect(runtime.getState().phase).toBe('idle');
    expect(outcomes).toHaveLength(1);
  });

  it('turns thrown, rejected, and malformed callback results into rejected outcomes', async () => {
    const invalidResult = { reason: 42, status: 'rejected' };
    const callbacks: readonly OnMoveRequest[] = [
      () => {
        throw new Error('synchronous failure');
      },
      () => Promise.reject(new Error('asynchronous failure')),
      (() => invalidResult) as unknown as OnMoveRequest,
    ];
    const expectedReasons = [
      'synchronous failure',
      'asynchronous failure',
      'Move request returned an invalid decision.',
    ];

    for (const [index, callback] of callbacks.entries()) {
      const scheduler = new ManualScheduler();
      const outcomes: MoveOutcomeAccessibilityContext[] = [];
      const runtime = createMoveRequestRuntime({
        boardId: 'analysis',
        intentIdPrefix: `failure-${String(index)}:`,
        onMoveRequest: callback,
        onOutcome: (context) => outcomes.push(context),
        positionRevision: 7,
        scheduler,
      });

      expect(runtime.request(moveRequest())).toBe(`failure-${String(index)}:0`);
      await flushPromiseJobs();

      expect(runtime.getState().phase).toBe('idle');
      expect(runtime.getResourceCounts()).toEqual({ requests: 0, timeouts: 0 });
      expect(outcomes).toEqual([
        expect.objectContaining({
          outcome: 'rejected',
          reason: expectedReasons[index],
        }),
      ]);
    }
  });

  it('isolates throwing subscribers and outcome presentation handlers', () => {
    const scheduler = new ManualScheduler();
    const onOutcome = jest.fn(() => {
      throw new Error('presentation failed');
    });
    const runtime = createMoveRequestRuntime({
      boardId: 'analysis',
      onMoveRequest: () => {
        throw new Error('validation failed');
      },
      onOutcome,
      positionRevision: 7,
      scheduler,
    });
    runtime.subscribe(() => {
      throw new Error('subscriber failed');
    });

    expect(runtime.request(moveRequest())).toBe('move:8:analysis:0');
    expect(runtime.getState().phase).toBe('idle');
    expect(runtime.getResourceCounts()).toEqual({ requests: 0, timeouts: 0 });
    expect(scheduler.tasks.size).toBe(0);
    expect(onOutcome).toHaveBeenCalledTimes(1);
  });

  it('aborts decision work on timeout and ignores its late result', async () => {
    const decision = deferred<MoveDecision>();
    const scheduler = new ManualScheduler();
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    let signal: AbortSignal | undefined;
    const runtime = createMoveRequestRuntime({
      boardId: 'analysis',
      onMoveRequest: (_intent, context) => {
        signal = context.signal;
        return decision.promise;
      },
      onOutcome: (context) => outcomes.push(context),
      positionRevision: 7,
      scheduler,
      timeouts: { commitMs: 40, decisionMs: 25 },
    });

    runtime.request(moveRequest());
    expect(scheduler.runNext()).toBe(25);

    expect(signal?.aborted).toBe(true);
    expect(runtime.getState().phase).toBe('idle');
    expect(runtime.getResourceCounts()).toEqual({ requests: 0, timeouts: 0 });
    expect(outcomes).toEqual([
      expect.objectContaining({
        outcome: 'timed-out',
        reason: 'decision-timeout',
      }),
    ]);

    decision.resolve({ status: 'accepted' });
    await flushPromiseJobs();
    expect(runtime.getState().phase).toBe('idle');
    expect(outcomes).toHaveLength(1);
  });

  it('times out an accepted request that never receives a correlated commit', async () => {
    const scheduler = new ManualScheduler();
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    const runtime = createMoveRequestRuntime({
      boardId: 'analysis',
      onMoveRequest: () => ({ status: 'accepted' }),
      onOutcome: (context) => outcomes.push(context),
      positionRevision: 7,
      scheduler,
      timeouts: { commitMs: 40, decisionMs: 25 },
    });

    runtime.request(moveRequest());
    await flushPromiseJobs();
    expect(runtime.getState().phase).toBe('awaiting-commit');
    expect(scheduler.delays()).toEqual([40]);
    expect(scheduler.runNext()).toBe(40);

    expect(runtime.getState().phase).toBe('idle');
    expect(runtime.getResourceCounts()).toEqual({ requests: 0, timeouts: 0 });
    expect(outcomes).toEqual([
      expect.objectContaining({
        outcome: 'timed-out',
        reason: 'commit-timeout',
      }),
    ]);
  });

  it('cancels replaced requests and uses current handlers for later outcomes', async () => {
    const firstDecision = deferred<MoveDecision>();
    const scheduler = new ManualScheduler();
    const firstOutcomes: MoveOutcomeAccessibilityContext[] = [];
    const currentOutcomes: MoveOutcomeAccessibilityContext[] = [];
    const signals: AbortSignal[] = [];
    let invocation = 0;
    const onMoveRequest: OnMoveRequest = (_intent, { signal }) => {
      signals.push(signal);
      invocation += 1;
      return invocation === 1
        ? firstDecision.promise
        : { reason: 'second rejected', status: 'rejected' };
    };
    const runtime = createMoveRequestRuntime({
      boardId: 'analysis',
      onMoveRequest,
      onOutcome: (context) => firstOutcomes.push(context),
      positionRevision: 7,
      scheduler,
    });
    const phases: string[] = [];
    const unsubscribe = runtime.subscribe((state) => phases.push(state.phase));

    const first = runtime.request(moveRequest());
    runtime.setHandlers({
      onMoveRequest,
      onOutcome: (context) => currentOutcomes.push(context),
    });
    const second = runtime.request(moveRequest({ targetSquare: 'e3' }));

    expect(first).toBe('move:8:analysis:0');
    expect(second).toBe('move:8:analysis:1');
    expect(signals[0]?.aborted).toBe(true);
    expect(firstOutcomes).toEqual([]);
    expect(currentOutcomes).toHaveLength(1);
    expect(currentOutcomes[0]?.intent.intentId).toBe(first);
    expect(currentOutcomes[0]?.outcome).toBe('cancelled');
    expect(currentOutcomes[0]?.reason).toBe('replaced');

    await flushPromiseJobs();
    expect(currentOutcomes).toEqual([
      expect.objectContaining({ outcome: 'cancelled', reason: 'replaced' }),
      expect.objectContaining({
        outcome: 'rejected',
        reason: 'second rejected',
      }),
    ]);
    expect(runtime.getResourceCounts()).toEqual({ requests: 0, timeouts: 0 });
    expect(phases).toEqual(['deciding', 'deciding', 'idle']);

    firstDecision.resolve({ status: 'accepted' });
    await flushPromiseJobs();
    expect(currentOutcomes).toHaveLength(2);
    unsubscribe();
  });

  it('invalidates when the request handler is removed and disposes without publishing', () => {
    const decision = deferred<MoveDecision>();
    const scheduler = new ManualScheduler();
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    const signals: AbortSignal[] = [];
    const runtime = createMoveRequestRuntime({
      boardId: 'analysis',
      onMoveRequest: (_intent, { signal }) => {
        signals.push(signal);
        return decision.promise;
      },
      onOutcome: (context) => outcomes.push(context),
      positionRevision: 7,
      scheduler,
    });

    runtime.request(moveRequest());
    runtime.setHandlers({ onOutcome: (context) => outcomes.push(context) });
    expect(signals[0]?.aborted).toBe(true);
    expect(outcomes).toEqual([
      expect.objectContaining({
        outcome: 'cancelled',
        reason: 'permissions-change',
      }),
    ]);
    expect(runtime.request(moveRequest())).toBeNull();

    runtime.setHandlers({
      onMoveRequest: (_intent, { signal }) => {
        signals.push(signal);
        return decision.promise;
      },
      onOutcome: (context) => outcomes.push(context),
    });
    runtime.request(moveRequest());
    runtime.dispose();

    expect(signals[1]?.aborted).toBe(true);
    expect(runtime.getResourceCounts()).toEqual({ requests: 0, timeouts: 0 });
    expect(outcomes).toHaveLength(1);
    expect(runtime.request(moveRequest())).toBeNull();
    runtime.controlledPosition(8);
    expect(runtime.getState().positionRevision).toBe(7);
  });
});
