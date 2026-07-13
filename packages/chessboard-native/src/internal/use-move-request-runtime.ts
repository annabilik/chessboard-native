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

interface RuntimeSeed {
  readonly boardId: string;
  readonly commitMs: number;
  readonly decisionMs: number;
  readonly intentIdPrefix: string;
  readonly positionRevision: number;
}

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

function sameRuntimeIdentity(
  previous: Readonly<RuntimeSeed> | null,
  next: Readonly<RuntimeSeed> | null,
): boolean {
  if (previous === null || next === null) {
    return previous === next;
  }
  return (
    previous.boardId === next.boardId &&
    previous.commitMs === next.commitMs &&
    previous.decisionMs === next.decisionMs
  );
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
  const seedRef = useRef<Readonly<RuntimeSeed> | null>(null);
  const nextRuntimeGeneration = useRef(0);
  const desiredSeed: Readonly<RuntimeSeed> | null =
    boardId === null || position === null
      ? null
      : {
          boardId,
          commitMs,
          decisionMs,
          intentIdPrefix: '',
          positionRevision: position.revision,
        };
  if (!sameRuntimeIdentity(seedRef.current, desiredSeed)) {
    if (desiredSeed === null) {
      seedRef.current = null;
    } else {
      const generation = nextRuntimeGeneration.current;
      nextRuntimeGeneration.current =
        generation === Number.MAX_SAFE_INTEGER ? 0 : generation + 1;
      seedRef.current = Object.freeze({
        ...desiredSeed,
        intentIdPrefix: `move:${String(desiredSeed.boardId.length)}:${desiredSeed.boardId}:${reactInstanceId}:${String(generation)}:`,
      });
    }
  }
  const seed = seedRef.current;

  const runtime = useMemo<MoveRequestRuntime | null>(() => {
    if (seed === null) {
      return null;
    }
    return createMoveRequestRuntime({
      boardId: seed.boardId,
      intentIdPrefix: seed.intentIdPrefix,
      positionRevision: seed.positionRevision,
      timeouts: {
        commitMs: seed.commitMs,
        decisionMs: seed.decisionMs,
      },
    });
  }, [seed]);

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
