import {
  useLayoutEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  ChessboardProviderContext,
  createChessboardProviderRuntime,
} from './internal/provider-context';
import type { Revision } from './public-types';

/** Shared coordination boundary for boards and external drag sources. @public */
export interface ChessboardProviderProps {
  /** Boards and, in a future release, external piece sources in this scope. */
  readonly children: ReactNode;
  /**
   * Consumer-controlled invalidation for programmatic ancestor movement that
   * React Native cannot observe through board layout events. It must not
   * decrease while mounted. Incrementing it cancels active provider dragging,
   * drop verification, and pending board interaction work in this scope.
   */
  readonly geometryRevision?: Revision;
}

function validateGeometryRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError(
      'ChessboardProvider geometryRevision must be a non-negative safe integer.',
    );
  }
  return revision;
}

/**
 * Owns board registration and one transient drag presentation for its scope.
 *
 * This context-only boundary is layout-neutral and owns no position,
 * selection, or annotation state. A standalone Chessboard creates an
 * equivalent private scope automatically.
 *
 * @public
 */
export function ChessboardProvider({
  children,
  geometryRevision: geometryRevisionProp = 0,
}: ChessboardProviderProps): ReactElement {
  const geometryRevision = validateGeometryRevision(geometryRevisionProp);
  const [runtime] = useState(() =>
    createChessboardProviderRuntime(geometryRevision),
  );
  if (geometryRevision < runtime.getGeometryRevision()) {
    throw new RangeError(
      'ChessboardProvider geometryRevision must not decrease while mounted.',
    );
  }
  const value = useMemo(
    () => Object.freeze({ geometryRevision, runtime }),
    [geometryRevision, runtime],
  );

  useLayoutEffect(() => {
    runtime.retain();
    return () => {
      runtime.release();
    };
  }, [runtime]);

  useLayoutEffect(() => {
    runtime.commitGeometryRevision(geometryRevision);
  }, [geometryRevision, runtime]);

  return (
    <ChessboardProviderContext.Provider value={value}>
      {children}
    </ChessboardProviderContext.Provider>
  );
}
