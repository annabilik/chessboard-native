import type { PieceData } from '../public-types';

declare const providerSpareSelectionTokenBrand: unique symbol;

/** Opaque identity for one mounted provider spare source. */
export type ProviderSpareSelectionOwner = object;

/** Opaque identity for one committed spare-selection epoch. */
export type ProviderSpareSelectionToken = Readonly<{
  [providerSpareSelectionTokenBrand]: true;
}>;

/** Detached transient source selected for tap or accessible board placement. */
export interface ProviderSpareSelectionDescriptor {
  readonly owner: ProviderSpareSelectionOwner;
  readonly piece: Readonly<PieceData>;
  readonly selectionToken: ProviderSpareSelectionToken;
  readonly spareId: string;
  readonly targetBoardId: string;
}

export interface ProviderSpareSelectionSnapshot {
  readonly active: Readonly<ProviderSpareSelectionDescriptor> | null;
  readonly revision: number;
}

export interface ProviderSpareSelectionCoordinator {
  /** Clear every active selection without permanently disabling the store. */
  readonly clearAll: () => boolean;
  /**
   * Clear a source-owned selection. Supplying its epoch token makes delayed
   * cleanup from the same mounted owner inert after a replacement selection.
   */
  readonly clearOwner: (
    owner: ProviderSpareSelectionOwner,
    selectionToken?: ProviderSpareSelectionToken,
  ) => boolean;
  /** Clear the selection routed to one successfully unregistered target. */
  readonly clearTarget: (targetBoardId: string) => boolean;
  /** Reversible provider-effect cleanup. */
  readonly deactivate: () => boolean;
  readonly getSnapshot: () => Readonly<ProviderSpareSelectionSnapshot>;
  /** Publish one detached selection, replacing any prior owner or epoch. */
  readonly select: (
    descriptor: Readonly<ProviderSpareSelectionDescriptor>,
  ) => boolean;
  readonly subscribe: (listener: () => void) => () => void;
}

function validateIdentity(value: unknown, name: string): object {
  if (
    (typeof value !== 'object' && typeof value !== 'function') ||
    value === null
  ) {
    throw new TypeError(`${name} must be an object identity.`);
  }
  return value;
}

function validateId(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value;
}

function copyPiece(value: unknown): Readonly<PieceData> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('piece must be an object.');
  }
  const piece = value as Readonly<Record<string, unknown>>;
  const pieceType = piece['pieceType'];
  if (typeof pieceType !== 'string') {
    throw new TypeError('piece.pieceType must be a string.');
  }
  const id = piece['id'];
  if (id !== undefined && typeof id !== 'string') {
    throw new TypeError('piece.id must be a string when present.');
  }
  return Object.freeze({
    ...(id === undefined ? {} : { id }),
    pieceType,
  });
}

function copyDescriptor(
  descriptor: Readonly<ProviderSpareSelectionDescriptor>,
): Readonly<ProviderSpareSelectionDescriptor> {
  return Object.freeze({
    owner: validateIdentity(descriptor.owner, 'owner'),
    piece: copyPiece(descriptor.piece),
    selectionToken: validateIdentity(
      descriptor.selectionToken,
      'selectionToken',
    ) as ProviderSpareSelectionToken,
    spareId: validateId(descriptor.spareId, 'spareId'),
    targetBoardId: validateId(descriptor.targetBoardId, 'targetBoardId'),
  });
}

function selectionsMatch(
  left: Readonly<ProviderSpareSelectionDescriptor>,
  right: Readonly<ProviderSpareSelectionDescriptor>,
): boolean {
  return (
    left.owner === right.owner &&
    left.selectionToken === right.selectionToken &&
    left.spareId === right.spareId &&
    left.targetBoardId === right.targetBoardId &&
    left.piece.id === right.piece.id &&
    left.piece.pieceType === right.piece.pieceType
  );
}

/** Allocate an unforgeable-by-shape identity for one selection epoch. */
export function createProviderSpareSelectionToken(): ProviderSpareSelectionToken {
  return Object.freeze({}) as ProviderSpareSelectionToken;
}

/**
 * Create the provider's transient spare-source placement selection store.
 *
 * It owns only detached source correlation. In particular it contains no
 * board position, position revision, semantic board selection, or callback.
 */
export function createProviderSpareSelectionCoordinator(): ProviderSpareSelectionCoordinator {
  let snapshot: Readonly<ProviderSpareSelectionSnapshot> = Object.freeze({
    active: null,
    revision: 0,
  });
  const listeners = new Set<() => void>();

  const publish = (
    active: Readonly<ProviderSpareSelectionDescriptor> | null,
  ): void => {
    if (snapshot.revision === Number.MAX_SAFE_INTEGER) {
      throw new RangeError('Provider spare selection revision is exhausted.');
    }
    snapshot = Object.freeze({
      active,
      revision: snapshot.revision + 1,
    });
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One observational subscriber cannot prevent the remaining updates.
      }
    }
  };

  const clearAll = (): boolean => {
    if (snapshot.active === null) {
      return false;
    }
    publish(null);
    return true;
  };

  return Object.freeze({
    clearAll,
    clearOwner: (
      owner: ProviderSpareSelectionOwner,
      selectionToken?: ProviderSpareSelectionToken,
    ): boolean => {
      const active = snapshot.active;
      if (
        active?.owner !== owner ||
        (selectionToken !== undefined &&
          active.selectionToken !== selectionToken)
      ) {
        return false;
      }
      publish(null);
      return true;
    },
    clearTarget: (targetBoardIdInput: string): boolean => {
      const targetBoardId = validateId(targetBoardIdInput, 'targetBoardId');
      if (snapshot.active?.targetBoardId !== targetBoardId) {
        return false;
      }
      publish(null);
      return true;
    },
    deactivate: clearAll,
    getSnapshot: () => snapshot,
    select: (
      descriptor: Readonly<ProviderSpareSelectionDescriptor>,
    ): boolean => {
      const next = copyDescriptor(descriptor);
      const active = snapshot.active;
      if (active !== null && selectionsMatch(active, next)) {
        return false;
      }
      publish(next);
      return true;
    },
    subscribe: (listener: () => void): (() => void) => {
      if (typeof listener !== 'function') {
        throw new TypeError('listener must be a function.');
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
}
