import {
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type Ref,
} from 'react';

import type { ChessboardActions } from '../public-types';

interface ChessboardActionLease {
  readonly cancelMove: () => boolean;
}

/** Publish one stable handle backed only by the latest committed action lease. */
export function useChessboardActions(
  actionsRef: Ref<ChessboardActions> | undefined,
  cancelMove: () => boolean,
): void {
  const leaseAtCommit = useRef<Readonly<ChessboardActionLease> | null>(null);
  const mountedAtCommit = useRef(false);
  const actions = useMemo<Readonly<ChessboardActions>>(
    () =>
      Object.freeze({
        cancelMove: (): boolean =>
          mountedAtCommit.current
            ? (leaseAtCommit.current?.cancelMove() ?? false)
            : false,
      }),
    [],
  );

  useLayoutEffect(() => {
    leaseAtCommit.current = Object.freeze({
      cancelMove,
    });
  }, [cancelMove]);

  useLayoutEffect(() => {
    mountedAtCommit.current = true;
    return () => {
      mountedAtCommit.current = false;
    };
  }, []);

  useImperativeHandle(actionsRef, () => actions, [actions]);
}
