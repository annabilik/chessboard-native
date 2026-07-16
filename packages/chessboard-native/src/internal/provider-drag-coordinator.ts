import type { ViewStyle } from 'react-native';

import type { InteractionPresentationSharedValues } from './interaction-presentation';
import type {
  MoveSource,
  PieceData,
  PieceRenderer,
  SquareId,
} from '../public-types';

/** Opaque identity for one mounted provider drag source. */
export type ProviderDragOwner = object;

export type ProviderDragCancellationReason =
  'geometry-change' | 'replacement' | 'unmount';

/** Transient artwork and correlation for the provider's only active drag. */
export type ProviderDragOverlayDescriptor = {
  readonly boardId: string;
  readonly gestureToken: number;
  readonly onCancel: (reason: ProviderDragCancellationReason) => void;
  readonly owner: ProviderDragOwner;
  readonly piece: Readonly<PieceData>;
  readonly presentation: Readonly<InteractionPresentationSharedValues>;
  readonly renderer: PieceRenderer | null;
  readonly size: number;
  readonly style: Readonly<ViewStyle>;
} & (
  | {
      readonly source: Extract<MoveSource, { readonly kind: 'board' }>;
      readonly square: SquareId;
    }
  | {
      readonly source: Extract<MoveSource, { readonly kind: 'spare' }>;
      /** Null while the source remains outside a board. */
      readonly square: SquareId | null;
    }
);

export interface ProviderDragCoordinatorSnapshot {
  readonly active: Readonly<ProviderDragOverlayDescriptor> | null;
  readonly revision: number;
}

export interface ProviderDragCoordinator {
  readonly cancel: (
    owner: ProviderDragOwner,
    gestureToken: number,
    reason: ProviderDragCancellationReason,
  ) => boolean;
  readonly claim: (descriptor: Readonly<ProviderDragOverlayDescriptor>) => void;
  readonly getSnapshot: () => Readonly<ProviderDragCoordinatorSnapshot>;
  readonly release: (owner: ProviderDragOwner, gestureToken: number) => boolean;
  readonly subscribe: (listener: () => void) => () => void;
}

function sameClaim(
  left: Readonly<ProviderDragOverlayDescriptor>,
  right: Readonly<ProviderDragOverlayDescriptor>,
): boolean {
  return left.owner === right.owner && left.gestureToken === right.gestureToken;
}

/**
 * Create the provider's one-active-drag lease and overlay store.
 *
 * The store owns transient presentation only. It deliberately has no board
 * position, selection, or annotation fields.
 */
export function createProviderDragCoordinator(): ProviderDragCoordinator {
  let snapshot: Readonly<ProviderDragCoordinatorSnapshot> = Object.freeze({
    active: null,
    revision: 0,
  });
  const listeners = new Set<() => void>();

  const publish = (
    active: Readonly<ProviderDragOverlayDescriptor> | null,
  ): void => {
    snapshot = Object.freeze({
      active,
      revision: snapshot.revision + 1,
    });
    for (const listener of [...listeners]) {
      listener();
    }
  };

  return Object.freeze({
    cancel: (
      owner: ProviderDragOwner,
      gestureToken: number,
      reason: ProviderDragCancellationReason,
    ): boolean => {
      const active = snapshot.active;
      if (active?.owner !== owner || active.gestureToken !== gestureToken) {
        return false;
      }
      publish(null);
      active.onCancel(reason);
      return true;
    },
    claim: (descriptor: Readonly<ProviderDragOverlayDescriptor>): void => {
      const active = snapshot.active;
      if (active !== null && sameClaim(active, descriptor)) {
        if (active !== descriptor) {
          publish(descriptor);
        }
        return;
      }
      // One source controller reduces its own replacement gesture before it
      // updates the provider lease. Cancelling the previous token here would
      // accidentally cancel that already-current reducer lifecycle.
      if (active !== null && active.owner === descriptor.owner) {
        publish(descriptor);
        return;
      }
      if (active !== null) {
        publish(null);
        active.onCancel('replacement');
      }
      publish(descriptor);
    },
    getSnapshot: () => snapshot,
    release: (owner: ProviderDragOwner, gestureToken: number): boolean => {
      const active = snapshot.active;
      if (active?.owner !== owner || active.gestureToken !== gestureToken) {
        return false;
      }
      publish(null);
      return true;
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
}
