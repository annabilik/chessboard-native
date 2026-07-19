import type { SharedValue } from 'react-native-reanimated';

import {
  INTERACTION_PRESENTATION_PHASE,
  type InteractionPresentationPhase,
  type InteractionPresentationSharedValues,
} from '../../src/internal/interaction-presentation';
import { createChessboardProviderRuntime } from '../../src/internal/provider-context';
import {
  createProviderDragCoordinator,
  type ProviderDragCancellationReason,
  type ProviderDragOverlayDescriptor,
  type ProviderDragOwner,
} from '../../src/internal/provider-drag-coordinator';

function sharedValue<Value>(initialValue: Value): SharedValue<Value> {
  let currentValue = initialValue;
  return {
    addListener: () => undefined,
    get value() {
      return currentValue;
    },
    set value(value: Value) {
      currentValue = value;
    },
    get: () => currentValue,
    modify: (modifier) => {
      if (modifier !== undefined) {
        currentValue = modifier(currentValue);
      }
    },
    removeListener: () => undefined,
    set: (value) => {
      currentValue =
        typeof value === 'function'
          ? (value as (current: Value) => Value)(currentValue)
          : value;
    },
  };
}

function presentation(): Readonly<InteractionPresentationSharedValues> {
  return Object.freeze({
    epoch: sharedValue<number | null>(0),
    phase: sharedValue<InteractionPresentationPhase>(
      INTERACTION_PRESENTATION_PHASE.DRAG,
    ),
    pointerWindowX: sharedValue(120),
    pointerWindowY: sharedValue(80),
    pointerX: sharedValue(20),
    pointerY: sharedValue(30),
    sourceSquare: sharedValue<string | null>('a2'),
    targetSquare: sharedValue<string | null>('b1'),
  });
}

function descriptor(options: {
  readonly boardId: string;
  readonly gestureToken: number;
  readonly onCancel: (reason: ProviderDragCancellationReason) => void;
  readonly owner: ProviderDragOwner;
}): Readonly<ProviderDragOverlayDescriptor> {
  return Object.freeze({
    boardId: options.boardId,
    bounds: null,
    gestureToken: options.gestureToken,
    onCancel: options.onCancel,
    owner: options.owner,
    piece: Object.freeze({
      id: `${options.boardId}-piece`,
      pieceType: 'token',
    }),
    presentation: presentation(),
    reducedMotion: false,
    renderer: () => null,
    size: 40,
    sourceGhostStyle: Object.freeze({ opacity: 0.4 }),
    source: Object.freeze({ kind: 'board' as const, square: 'a2' }),
    square: 'a2',
    style: Object.freeze({ opacity: 1 }),
    targetSquare: 'b1',
  });
}

describe('provider drag coordinator', () => {
  it('owns exactly one transient active lease and publishes detached snapshots', () => {
    const coordinator = createProviderDragCoordinator();
    const owner = Object.freeze({});
    const listener = jest.fn();
    const unsubscribe = coordinator.subscribe(listener);
    const active = descriptor({
      boardId: 'analysis',
      gestureToken: 3,
      onCancel: jest.fn(),
      owner,
    });

    coordinator.claim(active);

    expect(coordinator.getSnapshot()).toEqual({ active, revision: 1 });
    expect(Object.isFrozen(coordinator.getSnapshot())).toBe(true);
    expect(coordinator.getSnapshot().active).not.toHaveProperty('position');
    expect(coordinator.getSnapshot().active).not.toHaveProperty('selection');
    expect(coordinator.getSnapshot().active).not.toHaveProperty('annotations');
    expect(coordinator.getSnapshot().active).toEqual(
      expect.objectContaining({
        sourceGhostStyle: { opacity: 0.4 },
        targetSquare: 'b1',
      }),
    );
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(coordinator.release(owner, 3)).toBe(true);
    expect(coordinator.getSnapshot().active).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('cancels the prior owner before replacing the provider lease', () => {
    const coordinator = createProviderDragCoordinator();
    const firstOwner = Object.freeze({});
    const secondOwner = Object.freeze({});
    const firstCancelled = jest.fn<
      undefined,
      [ProviderDragCancellationReason]
    >();
    const secondCancelled = jest.fn<
      undefined,
      [ProviderDragCancellationReason]
    >();
    const first = descriptor({
      boardId: 'first',
      gestureToken: 1,
      onCancel: firstCancelled,
      owner: firstOwner,
    });
    const second = descriptor({
      boardId: 'second',
      gestureToken: 8,
      onCancel: secondCancelled,
      owner: secondOwner,
    });

    coordinator.claim(first);
    coordinator.claim(second);

    expect(firstCancelled).toHaveBeenCalledTimes(1);
    expect(firstCancelled).toHaveBeenCalledWith('replacement');
    expect(secondCancelled).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().active).toBe(second);
    expect(coordinator.getSnapshot().revision).toBe(3);
  });

  it('keeps same-owner replacement current and makes stale release inert', () => {
    const coordinator = createProviderDragCoordinator();
    const owner = Object.freeze({});
    const firstCancelled = jest.fn<
      undefined,
      [ProviderDragCancellationReason]
    >();
    const secondCancelled = jest.fn<
      undefined,
      [ProviderDragCancellationReason]
    >();
    const first = descriptor({
      boardId: 'analysis',
      gestureToken: 4,
      onCancel: firstCancelled,
      owner,
    });
    const second = descriptor({
      boardId: 'analysis',
      gestureToken: 5,
      onCancel: secondCancelled,
      owner,
    });

    coordinator.claim(first);
    coordinator.claim(second);

    expect(firstCancelled).not.toHaveBeenCalled();
    expect(secondCancelled).not.toHaveBeenCalled();
    expect(coordinator.release(owner, 4)).toBe(false);
    expect(coordinator.cancel(owner, 4, 'replacement')).toBe(false);
    expect(coordinator.getSnapshot().active).toBe(second);
    expect(coordinator.release(owner, 5)).toBe(true);
    expect(coordinator.getSnapshot().active).toBeNull();
  });

  it('cancels the active lease when controlled provider geometry changes', () => {
    const runtime = createChessboardProviderRuntime(7);
    const owner = Object.freeze({});
    const onCancel = jest.fn<undefined, [ProviderDragCancellationReason]>();
    runtime.drag.claim(
      descriptor({
        boardId: 'geometry',
        gestureToken: 2,
        onCancel,
        owner,
      }),
    );

    runtime.commitGeometryRevision(7);
    expect(onCancel).not.toHaveBeenCalled();
    expect(runtime.drag.getSnapshot().active).not.toBeNull();

    runtime.commitGeometryRevision(8);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith('geometry-change');
    expect(runtime.drag.getSnapshot().active).toBeNull();
    expect(runtime.getGeometryRevision()).toBe(8);
  });

  it('cancels the active lease only after the provider is actually unmounted', async () => {
    const runtime = createChessboardProviderRuntime(0);
    const owner = Object.freeze({});
    const onCancel = jest.fn<undefined, [ProviderDragCancellationReason]>();
    runtime.retain();
    runtime.drag.claim(
      descriptor({
        boardId: 'strict-provider',
        gestureToken: 9,
        onCancel,
        owner,
      }),
    );

    runtime.release();
    runtime.retain();
    await Promise.resolve();
    expect(onCancel).not.toHaveBeenCalled();
    expect(runtime.drag.getSnapshot().active).not.toBeNull();

    runtime.release();
    await Promise.resolve();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith('unmount');
    expect(runtime.drag.getSnapshot().active).toBeNull();
  });
});
