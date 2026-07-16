import { createContext, useContext } from 'react';

import {
  createBoardLayoutRegistry,
  type BoardLayoutRegistry,
} from './board-layout-registry';
import {
  createProviderDragCoordinator,
  type ProviderDragCancellationReason,
  type ProviderDragCoordinator,
} from './provider-drag-coordinator';
import {
  createProviderSpareSelectionCoordinator,
  type ProviderSpareSelectionCoordinator,
} from './provider-spare-selection';

export interface ChessboardProviderRuntime {
  readonly cancelTransient: (
    reason: ProviderDragCancellationReason,
    options?: Readonly<{ clearSpareSelection?: boolean }>,
  ) => void;
  readonly commitGeometryRevision: (revision: number) => void;
  readonly drag: ProviderDragCoordinator;
  readonly getGeometryRevision: () => number;
  readonly getTransientRevision: () => number;
  readonly registry: BoardLayoutRegistry;
  readonly spareSelection: ProviderSpareSelectionCoordinator;
  readonly release: () => void;
  readonly retain: () => void;
}

export interface ChessboardProviderContextValue {
  readonly geometryRevision: number;
  readonly lifecycleRevision: number;
  readonly runtime: ChessboardProviderRuntime;
}

export const ChessboardProviderContext =
  createContext<Readonly<ChessboardProviderContextValue> | null>(null);

/** Create provider-private coordination without any semantic board state. */
export function createChessboardProviderRuntime(
  initialGeometryRevision: number,
): ChessboardProviderRuntime {
  let geometryRevision = initialGeometryRevision;
  const drag: ProviderDragCoordinator = createProviderDragCoordinator();
  const spareSelection: ProviderSpareSelectionCoordinator =
    createProviderSpareSelectionCoordinator();
  const registry = createBoardLayoutRegistry({
    providerGeometryRevision: initialGeometryRevision,
  });
  let retainCount = 0;
  let disposalRevision = 0;
  let transientRevision = 0;

  return Object.freeze({
    cancelTransient: (
      reason: ProviderDragCancellationReason,
      options: Readonly<{ clearSpareSelection?: boolean }> = {},
    ): void => {
      if (transientRevision === Number.MAX_SAFE_INTEGER) {
        throw new RangeError(
          'ChessboardProvider transient revision exhausted.',
        );
      }
      transientRevision += 1;
      const active = drag.getSnapshot().active;
      if (active !== null) {
        drag.cancel(active.owner, active.gestureToken, reason);
      }
      registry.cancelTransient();
      if (options.clearSpareSelection === true) {
        spareSelection.deactivate();
      }
    },
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
    getTransientRevision: () => transientRevision,
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
        spareSelection.deactivate();
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
    spareSelection,
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
