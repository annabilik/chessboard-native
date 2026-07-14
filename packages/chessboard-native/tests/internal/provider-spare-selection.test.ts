import {
  createProviderSpareSelectionCoordinator,
  createProviderSpareSelectionToken,
  type ProviderSpareSelectionDescriptor,
  type ProviderSpareSelectionOwner,
  type ProviderSpareSelectionToken,
} from '../../src/internal/provider-spare-selection';

function selection(options: {
  readonly owner: ProviderSpareSelectionOwner;
  readonly selectionToken?: ProviderSpareSelectionToken;
  readonly spareId?: string;
  readonly targetBoardId?: string;
}): ProviderSpareSelectionDescriptor {
  return {
    owner: options.owner,
    piece: { id: 'palette-piece', pieceType: 'wQ' },
    selectionToken:
      options.selectionToken ?? createProviderSpareSelectionToken(),
    spareId: options.spareId ?? 'white-queen',
    targetBoardId: options.targetBoardId ?? 'editor',
  };
}

describe('provider spare selection coordinator', () => {
  it('publishes a deeply detached immutable selection without semantic board state', () => {
    const coordinator = createProviderSpareSelectionCoordinator();
    const owner = Object.freeze({});
    const descriptor = selection({ owner });
    const listener = jest.fn();
    const unsubscribe = coordinator.subscribe(listener);

    expect(coordinator.select(descriptor)).toBe(true);

    const snapshot = coordinator.getSnapshot();
    expect(snapshot).toEqual({ active: descriptor, revision: 1 });
    expect(snapshot.active).not.toBe(descriptor);
    expect(snapshot.active?.piece).not.toBe(descriptor.piece);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.active)).toBe(true);
    expect(Object.isFrozen(snapshot.active?.piece)).toBe(true);
    expect(snapshot.active).not.toHaveProperty('position');
    expect(snapshot.active).not.toHaveProperty('positionRevision');
    expect(snapshot.active).not.toHaveProperty('selection');
    expect(snapshot.active).not.toHaveProperty('annotations');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(coordinator.clearAll()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('makes owner- and epoch-stale cleanup inert after replacement', () => {
    const coordinator = createProviderSpareSelectionCoordinator();
    const firstOwner = Object.freeze({});
    const secondOwner = Object.freeze({});
    const firstToken = createProviderSpareSelectionToken();
    const replacementToken = createProviderSpareSelectionToken();

    coordinator.select(
      selection({ owner: firstOwner, selectionToken: firstToken }),
    );
    coordinator.select(
      selection({
        owner: firstOwner,
        selectionToken: replacementToken,
        spareId: 'white-rook',
      }),
    );

    expect(coordinator.clearOwner(secondOwner)).toBe(false);
    expect(coordinator.clearOwner(firstOwner, firstToken)).toBe(false);
    expect(coordinator.getSnapshot().active?.selectionToken).toBe(
      replacementToken,
    );
    expect(coordinator.clearOwner(firstOwner, replacementToken)).toBe(true);
    expect(coordinator.getSnapshot()).toEqual({ active: null, revision: 3 });
  });

  it('replaces another owner atomically and deduplicates an equivalent selection', () => {
    const coordinator = createProviderSpareSelectionCoordinator();
    const listener = jest.fn();
    coordinator.subscribe(listener);
    const first = selection({ owner: Object.freeze({}) });
    const second = selection({ owner: Object.freeze({}) });

    expect(coordinator.select(first)).toBe(true);
    expect(coordinator.select(second)).toBe(true);
    expect(coordinator.select({ ...second, piece: { ...second.piece } })).toBe(
      false,
    );

    expect(coordinator.getSnapshot().active?.owner).toBe(second.owner);
    expect(coordinator.getSnapshot().revision).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('clears only the matching target and leaves delayed target cleanup inert', () => {
    const coordinator = createProviderSpareSelectionCoordinator();
    const owner = Object.freeze({});
    coordinator.select(selection({ owner, targetBoardId: 'variation' }));

    expect(coordinator.clearTarget('editor')).toBe(false);
    expect(coordinator.getSnapshot().active?.targetBoardId).toBe('variation');
    expect(coordinator.clearTarget('variation')).toBe(true);
    expect(coordinator.clearTarget('variation')).toBe(false);
    expect(coordinator.getSnapshot()).toEqual({ active: null, revision: 2 });
  });

  it('deactivates reversibly and does not publish redundant empty cleanup', () => {
    const coordinator = createProviderSpareSelectionCoordinator();
    const listener = jest.fn();
    coordinator.subscribe(listener);

    expect(coordinator.deactivate()).toBe(false);
    coordinator.select(selection({ owner: Object.freeze({}) }));
    expect(coordinator.deactivate()).toBe(true);
    expect(coordinator.clearAll()).toBe(false);
    expect(coordinator.getSnapshot()).toEqual({ active: null, revision: 2 });

    expect(coordinator.select(selection({ owner: Object.freeze({}) }))).toBe(
      true,
    );
    expect(coordinator.getSnapshot().revision).toBe(3);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('isolates subscriber failures and validates public coordination inputs', () => {
    const coordinator = createProviderSpareSelectionCoordinator();
    const listener = jest.fn();
    coordinator.subscribe(() => {
      throw new Error('observer failed');
    });
    coordinator.subscribe(listener);

    expect(() =>
      coordinator.select(selection({ owner: Object.freeze({}) })),
    ).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => coordinator.clearTarget('   ')).toThrow(
      'targetBoardId must be a non-empty string.',
    );
    expect(() =>
      coordinator.select({
        ...selection({ owner: Object.freeze({}) }),
        piece: { pieceType: 3 } as never,
      }),
    ).toThrow('piece.pieceType must be a string.');
  });
});
