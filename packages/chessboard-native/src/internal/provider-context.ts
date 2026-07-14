import { createContext, useContext } from 'react';

import {
  createBoardLayoutRegistry,
  type BoardLayoutRegistry,
} from './board-layout-registry';
import {
  createProviderDragCoordinator,
  type ProviderDragCoordinator,
} from './provider-drag-coordinator';

export interface ChessboardProviderRuntime {
  readonly commitGeometryRevision: (revision: number) => void;
  readonly drag: ProviderDragCoordinator;
  readonly getGeometryRevision: () => number;
  readonly registry: BoardLayoutRegistry;
  readonly release: () => void;
  readonly retain: () => void;
}

export interface ChessboardProviderContextValue {
  readonly geometryRevision: number;
  readonly runtime: ChessboardProviderRuntime;
}

export const ChessboardProviderContext =
  createContext<Readonly<ChessboardProviderContextValue> | null>(null);

/** Create provider-private coordination without any semantic board state. */
export function createChessboardProviderRuntime(
  initialGeometryRevision: number,
): ChessboardProviderRuntime {
  let geometryRevision = initialGeometryRevision;
  const drag = createProviderDragCoordinator();
  const registry = createBoardLayoutRegistry({
    providerGeometryRevision: initialGeometryRevision,
  });
  let retainCount = 0;
  let disposalRevision = 0;

  return Object.freeze({
    commitGeometryRevision: (revision: number): void => {
      if (revision === geometryRevision) {
        return;
      }
      geometryRevision = revision;
      registry.setProviderGeometryRevision(revision);
      const active = drag.getSnapshot().active;
      if (active !== null) {
        drag.cancel(active.owner, active.gestureToken, 'geometry-change');
      }
    },
    drag,
    getGeometryRevision: () => geometryRevision,
    registry,
    release: (): void => {
      if (retainCount === 0) {
        return;
      }
      retainCount -= 1;
      disposalRevision += 1;
      const expectedRevision = disposalRevision;
      void Promise.resolve().then(() => {
        if (retainCount !== 0 || disposalRevision !== expectedRevision) {
          return;
        }
        const active = drag.getSnapshot().active;
        if (active !== null) {
          drag.cancel(active.owner, active.gestureToken, 'unmount');
        }
        // Suspense and Offscreen may clean up layout effects while preserving
        // component state. Clear transient work without poisoning the runtime
        // so a later reveal can register the committed boards again.
        registry.deactivate();
      });
    },
    retain: (): void => {
      retainCount += 1;
      disposalRevision += 1;
    },
  });
}

export function useOptionalChessboardProvider(): Readonly<ChessboardProviderContextValue> | null {
  return useContext(ChessboardProviderContext);
}

export function useChessboardProvider(): Readonly<ChessboardProviderContextValue> {
  const value = useOptionalChessboardProvider();
  if (value === null) {
    throw new Error('Chessboard provider runtime is missing.');
  }
  return value;
}
