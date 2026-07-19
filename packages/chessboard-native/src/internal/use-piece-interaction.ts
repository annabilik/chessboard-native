import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

import type {
  OnPieceDragStart,
  OnPiecePress,
  PieceInteractionContext,
} from '../public-types';
import {
  createPieceInteractionEmitter,
  type PieceInteractionEmitter,
} from './piece-interaction';

interface EmitterLease {
  active: boolean;
  readonly emitter: PieceInteractionEmitter;
}

export interface UsePieceInteractionOptions {
  readonly boardId: string | null;
  readonly onPieceDragStart: OnPieceDragStart | undefined;
  readonly onPiecePress: OnPiecePress | undefined;
}

export interface PieceInteractionCallbacks {
  readonly dragStart: (context: Readonly<PieceInteractionContext>) => boolean;
  readonly press: (context: Readonly<PieceInteractionContext>) => boolean;
}

/** Bind only committed callback props to one board-scoped emitter. */
export function usePieceInteraction({
  boardId,
  onPieceDragStart,
  onPiecePress,
}: Readonly<UsePieceInteractionOptions>): Readonly<PieceInteractionCallbacks> {
  const emitter = useMemo<PieceInteractionEmitter | null>(
    () => (boardId === null ? null : createPieceInteractionEmitter(boardId)),
    [boardId],
  );
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
    emitter.setHandlers({
      ...(onPieceDragStart === undefined ? {} : { onPieceDragStart }),
      ...(onPiecePress === undefined ? {} : { onPiecePress }),
    });
    return () => {
      lease.active = false;
      emitter.setHandlers({});
      void Promise.resolve().then(() => {
        if (!lease.active) {
          emitter.dispose();
        }
      });
    };
  }, [emitter, onPieceDragStart, onPiecePress]);

  const dragStart = useCallback(
    (context: Readonly<PieceInteractionContext>): boolean =>
      emitter?.emitDragStart(context) ?? false,
    [emitter],
  );
  const press = useCallback(
    (context: Readonly<PieceInteractionContext>): boolean =>
      emitter?.emitPress(context) ?? false,
    [emitter],
  );
  return useMemo(() => Object.freeze({ dragStart, press }), [dragStart, press]);
}
