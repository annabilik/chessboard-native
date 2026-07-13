import type {
  MoveDecision,
  MoveIntent,
  MoveOutcomeAccessibilityContext,
  MoveRequestTimeouts,
  OnMoveRequest,
  Revision,
} from '../public-types';
import {
  createInteractionState,
  getInteractionEffectResourceKey,
  isInteractionEffectCurrent,
  reduceInteraction,
  type InteractionEffect,
  type InteractionEvent,
  type InteractionInvalidationReason,
  type InteractionReduction,
  type MoveIntentLifecycle,
} from './interaction-reducer';
import { safeErrorMessage } from './safe-error';

export type MoveIntentRequest = Omit<MoveIntent, 'intentId'>;

export type MoveRequestOutcomeHandler = (
  context: Readonly<MoveOutcomeAccessibilityContext>,
) => void;

export interface MoveRequestRuntimeHandlers {
  readonly onMoveRequest?: OnMoveRequest;
  readonly onOutcome?: MoveRequestOutcomeHandler;
}

export interface MoveRequestRuntimeScheduler {
  readonly clearTimeout: (handle: unknown) => void;
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
}

export interface CreateMoveRequestRuntimeOptions extends MoveRequestRuntimeHandlers {
  readonly boardId: string;
  readonly positionRevision: Revision;
  readonly timeouts?: Readonly<MoveRequestTimeouts>;
  /** Internal deterministic prefix; normally omitted. */
  readonly intentIdPrefix?: string;
  /** Internal deterministic sequence seed; normally omitted. */
  readonly nextIntentSequence?: number;
  /** Internal scheduling seam for deterministic tests. */
  readonly scheduler?: MoveRequestRuntimeScheduler;
}

export interface MoveRequestRuntimeResourceCounts {
  readonly requests: number;
  readonly timeouts: number;
}

export type MoveRequestRuntimeSubscriber = (
  state: Readonly<MoveIntentLifecycle>,
) => void;

export interface MoveRequestRuntime {
  readonly controlledPosition: (
    revision: Revision,
    committedIntentId?: string,
  ) => void;
  readonly dispose: () => void;
  readonly getResourceCounts: () => Readonly<MoveRequestRuntimeResourceCounts>;
  readonly getState: () => Readonly<MoveIntentLifecycle>;
  readonly invalidate: (reason: InteractionInvalidationReason) => void;
  readonly request: (intent: Readonly<MoveIntentRequest>) => string | null;
  readonly setHandlers: (
    handlers: Readonly<MoveRequestRuntimeHandlers>,
  ) => void;
  readonly subscribe: (subscriber: MoveRequestRuntimeSubscriber) => () => void;
}

interface TimerResource {
  readonly handle: unknown;
}

interface RequestResource {
  readonly controller: AbortController;
}

const DEFAULT_SCHEDULER: MoveRequestRuntimeScheduler = Object.freeze({
  clearTimeout: (handle: unknown): void => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
  setTimeout: (callback: () => void, delayMs: number): unknown =>
    globalThis.setTimeout(callback, delayMs),
});

function validateSequence(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      'nextIntentSequence must be a non-negative safe integer.',
    );
  }
  return value;
}

function validatePrefix(value: string): string {
  if (value.length === 0) {
    throw new RangeError('intentIdPrefix must be non-empty.');
  }
  return value;
}

function defaultIntentPrefix(boardId: string): string {
  return `move:${String(boardId.length)}:${boardId}:`;
}

function freezeHandlers(
  handlers: Readonly<MoveRequestRuntimeHandlers>,
): Readonly<MoveRequestRuntimeHandlers> {
  return Object.freeze({
    ...(handlers.onMoveRequest === undefined
      ? {}
      : { onMoveRequest: handlers.onMoveRequest }),
    ...(handlers.onOutcome === undefined
      ? {}
      : { onOutcome: handlers.onOutcome }),
  });
}

function normalizeDecision(value: unknown): Readonly<MoveDecision> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const decision = value as Readonly<Record<string, unknown>>;
    if (decision['status'] === 'accepted') {
      return Object.freeze({ status: 'accepted' });
    }
    if (decision['status'] !== 'rejected') {
      return null;
    }
    const reason = decision['reason'];
    if (reason !== undefined && typeof reason !== 'string') {
      return null;
    }
    return Object.freeze({
      ...(reason === undefined ? {} : { reason }),
      status: 'rejected',
    });
  } catch {
    return null;
  }
}

function requiredResourceKey(effect: Readonly<InteractionEffect>): string {
  const key = getInteractionEffectResourceKey(effect);
  if (key === null) {
    throw new Error(`Interaction effect ${effect.type} has no resource key.`);
  }
  return key;
}

/**
 * Create one board-scoped reducer executor.
 *
 * The runtime retains correlation, timers, and abort controllers only. Consumer
 * position objects never enter this boundary; controlled updates provide only a
 * revision and optional committed intent ID.
 */
export function createMoveRequestRuntime(
  options: Readonly<CreateMoveRequestRuntimeOptions>,
): MoveRequestRuntime {
  let state = createInteractionState({
    boardId: options.boardId,
    positionRevision: options.positionRevision,
    ...(options.timeouts === undefined ? {} : { timeouts: options.timeouts }),
  });
  let handlers = freezeHandlers(options);
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  const intentPrefix = validatePrefix(
    options.intentIdPrefix ?? defaultIntentPrefix(state.boardId),
  );
  let nextIntentSequence: number | null = validateSequence(
    options.nextIntentSequence ?? 0,
  );
  let disposed = false;
  const timers = new Map<string, Readonly<TimerResource>>();
  const requests = new Map<string, Readonly<RequestResource>>();
  const subscribers = new Set<MoveRequestRuntimeSubscriber>();

  const notifySubscribers = (): void => {
    for (const subscriber of [...subscribers]) {
      try {
        subscriber(state);
      } catch {
        // A presentation subscriber cannot prevent callback/timer cleanup.
      }
    }
  };

  const dispatch = (event: Readonly<InteractionEvent>): void => {
    if (disposed) {
      return;
    }
    applyReduction(reduceInteraction(state, event));
  };

  const cancelTimer = (effect: Readonly<InteractionEffect>): void => {
    const key = requiredResourceKey(effect);
    const resource = timers.get(key);
    if (resource === undefined) {
      return;
    }
    timers.delete(key);
    scheduler.clearTimeout(resource.handle);
  };

  const abortRequest = (effect: Readonly<InteractionEffect>): void => {
    const key = requiredResourceKey(effect);
    const resource = requests.get(key);
    if (resource === undefined) {
      return;
    }
    requests.delete(key);
    try {
      resource.controller.abort();
    } catch {
      // Abort is cleanup. A hostile platform shim cannot revive stale work.
    }
  };

  const publishOutcome = (effect: Readonly<InteractionEffect>): void => {
    if (effect.type !== 'publish-outcome') {
      return;
    }
    const onOutcome = handlers.onOutcome;
    if (onOutcome === undefined) {
      return;
    }
    const context: Readonly<MoveOutcomeAccessibilityContext> = Object.freeze({
      intent: effect.intent,
      outcome: effect.outcome,
      ...(effect.reason === undefined ? {} : { reason: effect.reason }),
    });
    try {
      onOutcome(context);
    } catch {
      // Outcome presentation is observational and cannot break cleanup.
    }
  };

  const settleRequestFailure = (
    key: string,
    resource: Readonly<RequestResource>,
    effect: Extract<
      InteractionEffect,
      { readonly type: 'invoke-move-request' }
    >,
    error: unknown,
  ): void => {
    if (requests.get(key) !== resource) {
      return;
    }
    requests.delete(key);
    dispatch({
      epoch: effect.epoch,
      intentId: effect.intentId,
      reason: safeErrorMessage(error, 'Move request failed.'),
      type: 'decision-failed',
    });
  };

  const settleRequestDecision = (
    key: string,
    resource: Readonly<RequestResource>,
    effect: Extract<
      InteractionEffect,
      { readonly type: 'invoke-move-request' }
    >,
    value: unknown,
  ): void => {
    if (requests.get(key) !== resource) {
      return;
    }
    requests.delete(key);
    const decision = normalizeDecision(value);
    if (decision === null) {
      dispatch({
        epoch: effect.epoch,
        intentId: effect.intentId,
        reason: 'Move request returned an invalid decision.',
        type: 'decision-failed',
      });
      return;
    }
    dispatch({
      decision,
      epoch: effect.epoch,
      intentId: effect.intentId,
      type: 'decision-resolved',
    });
  };

  const invokeMoveRequest = (
    effect: Extract<
      InteractionEffect,
      { readonly type: 'invoke-move-request' }
    >,
  ): void => {
    const key = requiredResourceKey(effect);
    const existing = requests.get(key);
    if (existing !== undefined) {
      requests.delete(key);
      try {
        existing.controller.abort();
      } catch {
        // Replacing an impossible duplicate still fails closed.
      }
    }

    const resource: Readonly<RequestResource> = Object.freeze({
      controller: new AbortController(),
    });
    requests.set(key, resource);
    const onMoveRequest = handlers.onMoveRequest;
    if (onMoveRequest === undefined) {
      settleRequestFailure(
        key,
        resource,
        effect,
        new Error('Move requests are disabled.'),
      );
      return;
    }

    let callbackResult: unknown;
    try {
      callbackResult = onMoveRequest(effect.intent, {
        signal: resource.controller.signal,
      });
    } catch (error) {
      settleRequestFailure(key, resource, effect, error);
      return;
    }

    let resolution: Promise<unknown>;
    try {
      resolution = Promise.resolve(callbackResult);
    } catch (error) {
      settleRequestFailure(key, resource, effect, error);
      return;
    }
    void resolution.then(
      (value) => {
        settleRequestDecision(key, resource, effect, value);
      },
      (error: unknown) => {
        settleRequestFailure(key, resource, effect, error);
      },
    );
  };

  const startTimer = (
    effect: Extract<InteractionEffect, { readonly type: 'start-timeout' }>,
  ): void => {
    const key = requiredResourceKey(effect);
    const existing = timers.get(key);
    if (existing !== undefined) {
      timers.delete(key);
      scheduler.clearTimeout(existing.handle);
    }

    let resource: Readonly<TimerResource> | undefined;
    try {
      const handle = scheduler.setTimeout(() => {
        if (resource === undefined || timers.get(key) !== resource) {
          return;
        }
        timers.delete(key);
        dispatch({
          epoch: effect.epoch,
          intentId: effect.intentId,
          stage: effect.stage,
          type: 'timeout',
        });
      }, effect.delayMs);
      resource = Object.freeze({ handle });
      timers.set(key, resource);
    } catch {
      dispatch({
        epoch: effect.epoch,
        intentId: effect.intentId,
        stage: effect.stage,
        type: 'timeout',
      });
    }
  };

  const executeEffects = (
    effects: readonly Readonly<InteractionEffect>[],
  ): void => {
    for (const effect of effects) {
      if (!isInteractionEffectCurrent(state, effect)) {
        continue;
      }
      switch (effect.type) {
        case 'start-timeout':
          startTimer(effect);
          break;
        case 'cancel-timeout':
          cancelTimer(effect);
          break;
        case 'invoke-move-request':
          invokeMoveRequest(effect);
          break;
        case 'abort-move-request':
          abortRequest(effect);
          break;
        case 'publish-outcome':
          publishOutcome(effect);
          break;
      }
    }
  };

  function applyReduction(reduction: Readonly<InteractionReduction>): void {
    if (reduction.state === state) {
      return;
    }
    state = reduction.state;
    notifySubscribers();
    executeEffects(reduction.effects);
  }

  const allocateIntentId = (): string | null => {
    const sequence = nextIntentSequence;
    if (sequence === null) {
      return null;
    }
    nextIntentSequence =
      sequence === Number.MAX_SAFE_INTEGER ? null : sequence + 1;
    return `${intentPrefix}${String(sequence)}`;
  };

  const runtime: MoveRequestRuntime = {
    controlledPosition: (
      revision: Revision,
      committedIntentId?: string,
    ): void => {
      const event: InteractionEvent =
        committedIntentId === undefined
          ? { revision, type: 'controlled-position' }
          : { committedIntentId, revision, type: 'controlled-position' };
      dispatch(event);
    },
    dispose: (): void => {
      if (disposed) {
        return;
      }
      dispatch({ reason: 'unmount', type: 'invalidate' });
      for (const resource of timers.values()) {
        scheduler.clearTimeout(resource.handle);
      }
      timers.clear();
      for (const resource of requests.values()) {
        try {
          resource.controller.abort();
        } catch {
          // Disposal stays terminal even with a hostile platform shim.
        }
      }
      requests.clear();
      disposed = true;
      subscribers.clear();
    },
    getResourceCounts: (): Readonly<MoveRequestRuntimeResourceCounts> =>
      Object.freeze({ requests: requests.size, timeouts: timers.size }),
    getState: (): Readonly<MoveIntentLifecycle> => state,
    invalidate: (reason: InteractionInvalidationReason): void => {
      dispatch({ reason, type: 'invalidate' });
    },
    request: (request: Readonly<MoveIntentRequest>): string | null => {
      if (
        disposed ||
        handlers.onMoveRequest === undefined ||
        request.boardId !== state.boardId ||
        request.basePositionRevision !== state.positionRevision
      ) {
        return null;
      }
      const intentId = allocateIntentId();
      if (intentId === null) {
        return null;
      }
      const intent: Readonly<MoveIntent> = Object.freeze({
        ...request,
        intentId,
      });
      const reduction = reduceInteraction(state, { intent, type: 'request' });
      if (reduction.state === state) {
        return null;
      }
      applyReduction(reduction);
      return intentId;
    },
    setHandlers: (nextHandlers: Readonly<MoveRequestRuntimeHandlers>): void => {
      if (disposed) {
        return;
      }
      const wasEnabled = handlers.onMoveRequest !== undefined;
      handlers = freezeHandlers(nextHandlers);
      if (wasEnabled && handlers.onMoveRequest === undefined) {
        dispatch({ reason: 'permissions-change', type: 'invalidate' });
      }
    },
    subscribe: (subscriber: MoveRequestRuntimeSubscriber): (() => void) => {
      if (disposed) {
        return () => undefined;
      }
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
  };

  return Object.freeze(runtime);
}
