import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  ChessboardProviderContext,
  createChessboardProviderRuntime,
} from './internal/provider-context';
import type { Revision } from './public-types';
import { ProviderDragOverlay } from './render/provider-drag-overlay';

/** Shared coordination boundary for boards and external drag sources. @public */
export interface ChessboardProviderProps {
  /** Boards and external piece sources coordinated in this scope. */
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

function appStateIsInteractive(status: AppStateStatus | null): boolean {
  return status === null || status === 'active';
}

function nextLifecycleRevision(revision: number): number {
  if (revision === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('ChessboardProvider lifecycle revision exhausted.');
  }
  return revision + 1;
}

/**
 * Owns board registration and one transient drag presentation for its scope.
 *
 * This boundary adds no native layout wrapper. While a drag is active it
 * renders one absolute, pointerless overlay sibling, and it owns no position,
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
  const [lifecycleRevision, setLifecycleRevision] = useState(0);
  const appInteractive = useRef(appStateIsInteractive(AppState.currentState));
  if (geometryRevision < runtime.getGeometryRevision()) {
    throw new RangeError(
      'ChessboardProvider geometryRevision must not decrease while mounted.',
    );
  }
  const value = useMemo(
    () => Object.freeze({ geometryRevision, lifecycleRevision, runtime }),
    [geometryRevision, lifecycleRevision, runtime],
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

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus): void => {
        const nextInteractive = appStateIsInteractive(nextState);
        if (!nextInteractive && appInteractive.current) {
          runtime.cancelTransient('app-background', {
            clearSpareSelection: true,
          });
          setLifecycleRevision(nextLifecycleRevision);
        }
        appInteractive.current = nextInteractive;
      },
    );
    return () => {
      subscription.remove();
    };
  }, [runtime]);

  return (
    <ChessboardProviderContext.Provider value={value}>
      {children}
      <ProviderDragOverlay />
    </ChessboardProviderContext.Provider>
  );
}
