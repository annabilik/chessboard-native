import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import type { NormalizedPositionValue } from './position-domain';
import {
  DEFAULT_MOVE_REQUEST_TIMEOUTS,
  type InteractionInvalidationReason,
  type MoveIntentLifecycle,
} from './interaction-reducer';
import {
  createMoveRequestRuntime,
  type MoveIntentRequest,
  type MoveRequestOutcomeHandler,
  type MoveRequestRuntime,
} from './move-request-runtime';
import type { MoveRequestTimeouts, OnMoveRequest } from '../public-types';

interface RuntimeLease {
  active: boolean;
  readonly runtime: MoveRequestRuntime;
}

interface UseMoveRequestRuntimeOptions {
  readonly boardId: string | null;
  readonly onMoveRequest: OnMoveRequest | undefined;
  readonly onOutcome: MoveRequestOutcomeHandler | undefined;
  readonly position: NormalizedPositionValue | null;
  readonly timeouts: Readonly<MoveRequestTimeouts> | undefined;
}

export interface MoveRequestInteraction {
  readonly cancel: () => void;
  readonly invalidate: (reason: InteractionInvalidationReason) => void;
  readonly lifecycle: Readonly<MoveIntentLifecycle> | null;
  readonly request: (draft: Readonly<MoveIntentRequest>) => boolean;
}

const NULL_SNAPSHOT = (): null => null;
const EMPTY_SUBSCRIBE = (): (() => void) => () => undefined;
let nextRuntimeGeneration = 0;

function allocateRuntimeGeneration(): number {
  if (!Number.isSafeInteger(nextRuntimeGeneration)) {
    throw new RangeError('Move request runtime generation exhausted.');
  }
  const generation = nextRuntimeGeneration;
  nextRuntimeGeneration = generation + 1;
  return generation;
}

/** Bind one board instance to the pure move-request reducer executor. */
export function useMoveRequestRuntime({
  boardId,
  onMoveRequest,
  onOutcome,
  position,
  timeouts,
}: UseMoveRequestRuntimeOptions): Readonly<MoveRequestInteraction> {
  const reactInstanceId = useId();
  const commitMs = timeouts?.commitMs ?? DEFAULT_MOVE_REQUEST_TIMEOUTS.commitMs;
  const decisionMs =
    timeouts?.decisionMs ?? DEFAULT_MOVE_REQUEST_TIMEOUTS.decisionMs;
  const hasPosition = position !== null;

  const runtime = useMemo<MoveRequestRuntime | null>(() => {
    if (boardId === null || !hasPosition) {
      return null;
    }
    const generation = allocateRuntimeGeneration();
    return createMoveRequestRuntime({
      boardId,
      intentIdPrefix: `move:${String(boardId.length)}:${boardId}:${reactInstanceId}:${String(generation)}:`,
      // The controlled revision is synchronized in a layout effect before any
      // committed input can reach this runtime. Keeping prop revisions out of
      // this memo prevents ordinary controlled updates from replacing it.
      positionRevision: 0,
      timeouts: {
        commitMs,
        decisionMs,
      },
    });
  }, [boardId, commitMs, decisionMs, hasPosition, reactInstanceId]);

  useLayoutEffect(() => {
    runtime?.setHandlers({
      ...(onMoveRequest === undefined ? {} : { onMoveRequest }),
      ...(onOutcome === undefined ? {} : { onOutcome }),
    });
  }, [onMoveRequest, onOutcome, runtime]);

  const committedIntentId = position?.committedIntentId;
  const positionRevision = position?.revision;
  useLayoutEffect(() => {
    if (runtime === null || positionRevision === undefined) {
      return;
    }
    runtime.controlledPosition(positionRevision, committedIntentId);
  }, [committedIntentId, positionRevision, runtime]);

  const leaseRef = useRef<RuntimeLease | null>(null);
  useLayoutEffect(() => {
    if (runtime === null) {
      leaseRef.current = null;
      return;
    }
    let lease = leaseRef.current;
    if (lease?.runtime !== runtime) {
      lease = { active: true, runtime };
      leaseRef.current = lease;
    } else {
      lease.active = true;
    }
    return () => {
      lease.active = false;
      runtime.invalidate('unmount');
      runtime.setHandlers({});
      void Promise.resolve().then(() => {
        if (!lease.active) {
          runtime.dispose();
        }
      });
    };
  }, [runtime]);

  const subscribe = useCallback(
    (notify: () => void): (() => void) =>
      runtime === null ? EMPTY_SUBSCRIBE() : runtime.subscribe(notify),
    [runtime],
  );
  const getSnapshot = useCallback(
    (): Readonly<MoveIntentLifecycle> | null =>
      runtime === null ? NULL_SNAPSHOT() : runtime.getState(),
    [runtime],
  );
  const lifecycle = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const request = useCallback(
    (draft: Readonly<MoveIntentRequest>): boolean => {
      if (runtime === null) {
        return false;
      }
      try {
        return runtime.request(draft) !== null;
      } catch {
        return false;
      }
    },
    [runtime],
  );
  const invalidate = useCallback(
    (reason: InteractionInvalidationReason): void => {
      runtime?.invalidate(reason);
    },
    [runtime],
  );
  const cancel = useCallback((): void => {
    invalidate('accessibility');
  }, [invalidate]);

  return useMemo(
    () => Object.freeze({ cancel, invalidate, lifecycle, request }),
    [cancel, invalidate, lifecycle, request],
  );
}
