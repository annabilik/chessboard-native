import { useCallback, useId, useLayoutEffect, useMemo, useRef } from 'react';

import {
  createSquareActivationEmitter,
  type SquareActivationEmitter,
  type SquareActivationHandler,
  type SquareActivationRequest,
} from './square-activation';

interface EmitterLease {
  active: boolean;
  readonly emitter: SquareActivationEmitter;
}

export interface UseSquareActivationOptions {
  readonly boardId: string | null;
  readonly onSquareActivate: SquareActivationHandler | undefined;
}

export interface SquareActivationInteraction {
  readonly emit: (request: Readonly<SquareActivationRequest>) => string | null;
}

let nextEmitterGeneration = 0;

function allocateEmitterGeneration(): number {
  if (!Number.isSafeInteger(nextEmitterGeneration)) {
    throw new RangeError('Square activation emitter generation exhausted.');
  }
  const generation = nextEmitterGeneration;
  nextEmitterGeneration = generation + 1;
  return generation;
}

/** Bind committed callback props to one board-scoped activation emitter. */
export function useSquareActivation({
  boardId,
  onSquareActivate,
}: Readonly<UseSquareActivationOptions>): Readonly<SquareActivationInteraction> {
  const reactInstanceId = useId();
  const emitter = useMemo<SquareActivationEmitter | null>(() => {
    if (boardId === null) {
      return null;
    }
    const generation = allocateEmitterGeneration();
    return createSquareActivationEmitter({
      boardId,
      intentIdPrefix: `activation:${String(boardId.length)}:${boardId}:${reactInstanceId}:${String(generation)}:`,
    });
  }, [boardId, reactInstanceId]);

  const leaseRef = useRef<EmitterLease | null>(null);
  useLayoutEffect(() => {
    if (emitter === null) {
      leaseRef.current = null;
      return;
    }
    let lease = leaseRef.current;
    if (lease?.emitter !== emitter) {
      lease = { active: true, emitter };
      leaseRef.current = lease;
    } else {
      lease.active = true;
    }
    emitter.setHandler(onSquareActivate);

    return () => {
      lease.active = false;
      emitter.setHandler(undefined);
      void Promise.resolve().then(() => {
        if (!lease.active) {
          emitter.dispose();
        }
      });
    };
  }, [emitter, onSquareActivate]);

  const emit = useCallback(
    (request: Readonly<SquareActivationRequest>): string | null =>
      emitter?.emit(request) ?? null,
    [emitter],
  );

  return useMemo(() => Object.freeze({ emit }), [emit]);
}
