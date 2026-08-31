import { act, render } from '@testing-library/react-native';
import { StrictMode, useState, type ReactElement } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { TestInstance } from 'test-renderer';

import type { MountedPositionTransition } from '../../src/internal/use-position-transition-runtime';
import {
  createTransitionPresentation,
  sampleTransitionPresentation,
} from '../../src/internal/transition-presentation';
import type { PendingCommitHandoffDescriptor } from '../../src/internal/pending-commit-handoff';
import type { PositionTransitionPlan } from '../../src/internal/transition-planner';
import type {
  PieceRenderer,
  PieceRendererProps,
  PositionObject,
} from '../../src/public-types';
import { createBoardSurfaceLayout } from '../../src/render/board-layout';
import {
  createPieceTransitionProjection,
  PieceLayer,
  pieceLayerNativeDrainHostBudget,
  resolvePieceTransitionAnimatedStyle,
} from '../../src/render/piece-layer';
import {
  PendingMoveLayer,
  PENDING_MOVE_NATIVE_DRAIN_HOST_BUDGET,
} from '../../src/render/pending-move-layer';
import {
  ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS,
  transitionHostNativeDrainMs,
  useTransitionHostRetirement,
} from '../../src/render/use-transition-host-retirement';

const EMPTY_STYLE: Readonly<ViewStyle> = Object.freeze({});
const DEFAULT_GHOST_STYLE: Readonly<ViewStyle> = Object.freeze({
  opacity: 0.5,
});

function testSharedValue(initialValue: number): SharedValue<number> {
  let value = initialValue;
  return {
    addListener: () => undefined,
    get value() {
      return value;
    },
    set value(nextValue: number) {
      value = nextValue;
    },
    get: () => value,
    modify: (modifier) => {
      if (modifier !== undefined) {
        value = modifier(value);
      }
    },
    removeListener: () => undefined,
    set: (nextValue) => {
      value = typeof nextValue === 'function' ? nextValue(value) : nextValue;
    },
  };
}

function plan(
  input: Partial<PositionTransitionPlan>,
): Readonly<PositionTransitionPlan> {
  return Object.freeze({
    enters: Object.freeze([]),
    epoch: 3,
    exits: Object.freeze([]),
    fromRevision: 1,
    hasAmbiguity: false,
    hint: null,
    moves: Object.freeze([]),
    replacements: Object.freeze([]),
    toRevision: 2,
    ...input,
  });
}

function transition(
  value: Readonly<PositionTransitionPlan>,
  layout: ReturnType<typeof createBoardSurfaceLayout>,
  progress = testSharedValue(0),
  pendingHandoff: Readonly<PendingCommitHandoffDescriptor> | null = null,
): Readonly<MountedPositionTransition> {
  return Object.freeze({
    durationMs: 300,
    plan: value,
    presentation: createTransitionPresentation({
      currentLayout: layout,
      pendingHandoff,
      plan: value,
      previousLayout: layout,
    }),
    progress,
  });
}

function pendingHandoff(): Readonly<PendingCommitHandoffDescriptor> {
  return Object.freeze({
    boardId: 'handoff',
    epoch: 0,
    fromRevision: 1,
    intentId: 'intent-1',
    piece: Object.freeze({ id: 'runner', pieceType: 'token' }),
    source: Object.freeze({ kind: 'board' as const, square: 'a1' }),
    targetSquare: 'b1',
    toRevision: 2,
  });
}

function fullPosition(
  layout: ReturnType<typeof createBoardSurfaceLayout>,
  generation: number,
): PositionObject {
  return Object.freeze(
    Object.fromEntries(
      layout.cells.map(({ square }) => [
        square,
        Object.freeze({
          id: `generation:${String(generation)}:${square}`,
          pieceType: 'token',
        }),
      ]),
    ),
  );
}

function fullReplacementPlan(
  layout: ReturnType<typeof createBoardSurfaceLayout>,
  generation: number,
  epoch: number,
  fromRevision: number,
  toRevision: number,
): Readonly<PositionTransitionPlan> {
  const before = fullPosition(layout, generation - 1);
  const after = fullPosition(layout, generation);
  return plan({
    epoch,
    fromRevision,
    replacements: Object.freeze(
      layout.cells.map(({ square }) =>
        Object.freeze({
          after: after[square] ?? Object.freeze({ pieceType: 'token' }),
          before: before[square] ?? Object.freeze({ pieceType: 'token' }),
          from: square,
          kind: 'replace' as const,
          matchedBy: 'explicit' as const,
          to: square,
        }),
      ),
    ),
    toRevision,
  });
}

function saturatedFullBoardTransition(
  layout: ReturnType<typeof createBoardSurfaceLayout>,
  generation: number,
): Readonly<MountedPositionTransition> {
  const seedFromRevision = generation * 2;
  const seedPlan = fullReplacementPlan(
    layout,
    generation - 1,
    seedFromRevision,
    seedFromRevision,
    seedFromRevision + 1,
  );
  const seedPresentation = createTransitionPresentation({
    currentLayout: layout,
    plan: seedPlan,
    previousLayout: layout,
  });
  const saturatedPlan = fullReplacementPlan(
    layout,
    generation,
    seedFromRevision + 1,
    seedFromRevision + 1,
    seedFromRevision + 2,
  );
  return Object.freeze({
    durationMs: 200,
    plan: saturatedPlan,
    presentation: createTransitionPresentation({
      currentLayout: layout,
      plan: saturatedPlan,
      previousLayout: layout,
      prior: sampleTransitionPresentation(seedPresentation, 0.5),
    }),
    progress: testSharedValue(0.5),
  });
}

interface RetirementProbeDescriptor {
  readonly key: string;
  readonly label: string;
  readonly nativeDrainToken: string | null;
}

interface RetirementFrameHarness {
  readonly cancelSpy: jest.SpyInstance;
  readonly frames: ((timestamp: number) => void)[];
  readonly runNext: () => void;
}

function installRetirementFrameHarness(): RetirementFrameHarness {
  const frames: ((timestamp: number) => void)[] = [];
  let nextFrameId = 1;
  jest
    .spyOn(globalThis, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      frames.push(callback);
      const frameId = nextFrameId;
      nextFrameId += 1;
      return frameId;
    });
  const cancelSpy = jest
    .spyOn(globalThis, 'cancelAnimationFrame')
    // A queued native callback can still win cancellation; guards must make it
    // inert even when this test deliberately leaves the callback runnable.
    .mockImplementation(() => undefined);
  return {
    cancelSpy,
    frames,
    runNext: () => {
      const frame = frames.shift();
      if (frame === undefined) {
        throw new Error('Expected one queued retirement frame.');
      }
      frame(16);
    },
  };
}

function RetirementProbe({
  descriptors,
  maximumNativeDrainHosts = 1,
  nativeDrainMs = 0,
}: {
  readonly descriptors: readonly Readonly<RetirementProbeDescriptor>[];
  readonly maximumNativeDrainHosts?: number;
  readonly nativeDrainMs?: number;
}): ReactElement {
  const displayed = useTransitionHostRetirement(
    descriptors,
    maximumNativeDrainHosts,
    nativeDrainMs,
  );
  return (
    <View>
      {displayed.map(({ descriptor, nativeDrain, quiescent }) => (
        <View
          key={descriptor.key}
          testID={`${quiescent ? 'retiring' : 'live'}:${nativeDrain ? 'admitted' : 'static'}:${descriptor.label}`}
        />
      ))}
    </View>
  );
}

function currentPosition(
  value: PositionObject,
  revision = 2,
): Readonly<{
  revision: number;
  tier: 'envelope';
  value: PositionObject;
}> {
  return Object.freeze({ revision, tier: 'envelope', value });
}

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected PieceLayer to render one native root.');
  }
  return result.root;
}

function requiredNode(root: TestInstance, testID: string): TestInstance {
  const node =
    root.queryAll((candidate) => candidate.props['testID'] === testID).at(0) ??
    null;
  if (node === null) {
    throw new Error(`Expected ${testID}.`);
  }
  return node;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function propsOf(node: TestInstance): Readonly<Record<string, unknown>> {
  const props: unknown = node.props;
  if (!isRecord(props)) {
    throw new Error('Expected test-renderer props.');
  }
  return props;
}

interface ReanimatedStyleDescriptor {
  readonly viewDescriptors: Readonly<{
    readonly shareableViewDescriptors: Readonly<{
      readonly value: readonly unknown[];
    }>;
  }>;
}

function findReanimatedStyleDescriptor(
  style: unknown,
): ReanimatedStyleDescriptor | null {
  if (Array.isArray(style)) {
    for (const entry of style) {
      const descriptor = findReanimatedStyleDescriptor(entry);
      if (descriptor !== null) {
        return descriptor;
      }
    }
    return null;
  }
  if (!isRecord(style)) {
    return null;
  }
  const viewDescriptors = style['viewDescriptors'];
  if (!isRecord(viewDescriptors)) {
    return null;
  }
  const shareableViewDescriptors = viewDescriptors['shareableViewDescriptors'];
  return isRecord(shareableViewDescriptors) &&
    Array.isArray(shareableViewDescriptors['value'])
    ? (style as unknown as ReanimatedStyleDescriptor)
    : null;
}

function attachedStyleDescriptor(
  host: TestInstance,
): ReanimatedStyleDescriptor | null {
  let fiber = host.unstable_fiber;
  while (fiber !== null) {
    const props: unknown = fiber.memoizedProps;
    if (isRecord(props)) {
      const descriptor = findReanimatedStyleDescriptor(props['style']);
      if (descriptor !== null) {
        return descriptor;
      }
    }
    fiber = fiber.return;
  }
  return null;
}

function animatedStyle(node: TestInstance): Readonly<ViewStyle> {
  const animated = propsOf(node)['jestAnimatedStyle'];
  if (!isRecord(animated)) {
    throw new Error('Expected a Reanimated Jest style.');
  }
  const value = animated['value'];
  if (!isRecord(value)) {
    throw new Error('Expected a Reanimated Jest style.');
  }
  return value;
}

function nativeStyle(node: TestInstance): Readonly<ViewStyle> {
  return StyleSheet.flatten<ViewStyle>(
    propsOf(node)['style'] as StyleProp<ViewStyle>,
  );
}

function boardPieceHost(artwork: TestInstance): TestInstance {
  const host = artwork.parent?.parent ?? null;
  if (host === null) {
    throw new Error('Expected a board-piece host and occlusion boundary.');
  }
  return host;
}

function boardPieceOcclusionBoundary(artwork: TestInstance): TestInstance {
  const boundary = artwork.parent;
  if (boundary === null) {
    throw new Error('Expected a board-piece occlusion boundary.');
  }
  return boundary;
}

const Probe: PieceRenderer = (props: PieceRendererProps) => (
  <View
    testID={`${props.piece.id ?? props.piece.pieceType}:${props.square ?? 'spare'}:${props.state.isTransitioning ? 'transition' : 'static'}`}
  />
);

describe('mounted piece transition projection', () => {
  it('[PARITY-BEHAVIOR-B15] derives move transforms from measured oriented cells', () => {
    const white = createBoardSurfaceLayout(
      { height: 200, width: 300 },
      { columns: 3, rows: 2 },
      'white',
    );
    const black = createBoardSurfaceLayout(
      { height: 200, width: 300 },
      { columns: 3, rows: 2 },
      'black',
    );
    const movePlan = plan({
      moves: Object.freeze([
        Object.freeze({
          after: Object.freeze({ id: 'runner', pieceType: 'token' }),
          before: Object.freeze({ id: 'runner', pieceType: 'token' }),
          from: 'a1',
          kind: 'move' as const,
          matchedBy: 'piece-id' as const,
          to: 'c2',
        }),
      ]),
    });

    expect(
      createPieceTransitionProjection(
        white,
        transition(movePlan, white),
      ).current.get('c2'),
    ).toEqual({
      endOpacity: 1,
      endTranslateX: 0,
      endTranslateY: 0,
      kind: 'move',
      startOpacity: 1,
      startTranslateX: -200,
      startTranslateY: 100,
    });
    expect(
      createPieceTransitionProjection(
        black,
        transition(movePlan, black),
      ).current.get('c2'),
    ).toEqual({
      endOpacity: 1,
      endTranslateX: 0,
      endTranslateY: 0,
      kind: 'move',
      startOpacity: 1,
      startTranslateX: 200,
      startTranslateY: -100,
    });

    const widePlan = plan({
      moves: Object.freeze([
        Object.freeze({
          after: Object.freeze({ id: 'wide', pieceType: 'token' }),
          before: Object.freeze({ id: 'wide', pieceType: 'token' }),
          from: 'a1',
          kind: 'move' as const,
          matchedBy: 'piece-id' as const,
          to: 'z1',
        }),
      ]),
    });
    const wideLayout = createBoardSurfaceLayout(
      { height: 100, width: 2_600 },
      { columns: 26, rows: 1 },
      'white',
    );
    expect(
      createPieceTransitionProjection(
        wideLayout,
        transition(widePlan, wideLayout),
      ).current.get('z1'),
    ).toEqual({
      endOpacity: 1,
      endTranslateX: 0,
      endTranslateY: 0,
      kind: 'move',
      startOpacity: 1,
      startTranslateX: -2_500,
      startTranslateY: 0,
    });

    const tallPlan = plan({
      moves: Object.freeze([
        Object.freeze({
          after: Object.freeze({ id: 'tall', pieceType: 'token' }),
          before: Object.freeze({ id: 'tall', pieceType: 'token' }),
          from: 'a9',
          kind: 'move' as const,
          matchedBy: 'piece-id' as const,
          to: 'a10',
        }),
      ]),
    });
    const tallLayout = createBoardSurfaceLayout(
      { height: 1_000, width: 100 },
      { columns: 1, rows: 10 },
      'white',
    );
    expect(
      createPieceTransitionProjection(
        tallLayout,
        transition(tallPlan, tallLayout),
      ).current.get('a10'),
    ).toEqual({
      endOpacity: 1,
      endTranslateX: 0,
      endTranslateY: 0,
      kind: 'move',
      startOpacity: 1,
      startTranslateX: 0,
      startTranslateY: 100,
    });
  });

  it('keeps replacement artwork co-located on a black-oriented rectangular board', () => {
    const layout = createBoardSurfaceLayout(
      { height: 200, width: 300 },
      { columns: 3, rows: 2 },
      'black',
    );
    const replacementPlan = plan({
      replacements: Object.freeze([
        Object.freeze({
          after: Object.freeze({ pieceType: 'wQ' }),
          before: Object.freeze({ pieceType: 'wP' }),
          from: 'a1',
          kind: 'replace' as const,
          matchedBy: 'promotion' as const,
          to: 'c2',
        }),
      ]),
    });
    const projection = createPieceTransitionProjection(
      layout,
      transition(replacementPlan, layout),
    );
    const enter = projection.current.get('c2') ?? null;
    const exit = projection.replacements[0]?.transition ?? null;

    expect(enter).toEqual({
      endOpacity: 1,
      endTranslateX: 0,
      endTranslateY: 0,
      kind: 'replace-enter',
      startOpacity: 0,
      startTranslateX: 200,
      startTranslateY: -100,
    });
    expect(exit).toEqual({
      endOpacity: 0,
      endTranslateX: -200,
      endTranslateY: 100,
      kind: 'replace-exit',
      startOpacity: 1,
      startTranslateX: 0,
      startTranslateY: 0,
    });
    expect(resolvePieceTransitionAnimatedStyle(enter, 0.5, 1)).toEqual({
      opacity: 0.5,
      transform: [{ translateX: 100 }, { translateY: -50 }],
    });
    expect(resolvePieceTransitionAnimatedStyle(exit, 0.5, 1)).toEqual({
      opacity: 0.5,
      transform: [{ translateX: -100 }, { translateY: 50 }],
    });
    expect(resolvePieceTransitionAnimatedStyle(enter, 0, 1).opacity).toBe(0);
    expect(resolvePieceTransitionAnimatedStyle(exit, 0, 1).opacity).toBe(1);
    expect(resolvePieceTransitionAnimatedStyle(enter, 1, 1).opacity).toBe(1);
    expect(resolvePieceTransitionAnimatedStyle(exit, 1, 1).opacity).toBe(0);
  });

  it('animates the current target host from its measured source without changing its canonical square', async () => {
    const progress = testSharedValue(0);
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 200 },
      { columns: 2, rows: 1 },
      'white',
    );
    const mounted = transition(
      plan({
        moves: Object.freeze([
          Object.freeze({
            after: Object.freeze({ id: 'runner', pieceType: 'token' }),
            before: Object.freeze({ id: 'runner', pieceType: 'token' }),
            from: 'a1',
            kind: 'move' as const,
            matchedBy: 'piece-id' as const,
            to: 'b1',
          }),
        ]),
      }),
      layout,
      progress,
    );
    const result = await render(
      <PieceLayer
        boardId="move"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={{ token: Probe }}
        position={currentPosition({
          b1: Object.freeze({ id: 'runner', pieceType: 'token' }),
        })}
        style={EMPTY_STYLE}
        transition={mounted}
      />,
    );

    const artwork = requiredNode(rootOf(result), 'runner:b1:transition');
    expect(animatedStyle(boardPieceHost(artwork))).toEqual(
      expect.objectContaining({
        opacity: 1,
        transform: [{ translateX: -100 }, { translateY: 0 }],
      }),
    );

    const halfwayResult = await render(
      <PieceLayer
        boardId="move"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={{ token: Probe }}
        position={currentPosition({
          b1: Object.freeze({ id: 'runner', pieceType: 'token' }),
        })}
        style={EMPTY_STYLE}
        transition={transition(mounted.plan, layout, testSharedValue(0.5))}
      />,
    );
    const currentArtwork = requiredNode(
      rootOf(halfwayResult),
      'runner:b1:transition',
    );
    expect(animatedStyle(boardPieceHost(currentArtwork)).transform).toEqual([
      { translateX: -50 },
      { translateY: 0 },
    ]);
  });

  it('keeps fresh drag and pending sources descriptor-free through restoration and owner unmount', async () => {
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 200 },
      { columns: 2, rows: 1 },
      'white',
    );
    const current = currentPosition(
      {
        a1: Object.freeze({ id: 'drag', pieceType: 'token' }),
        b1: Object.freeze({ id: 'pending', pieceType: 'token' }),
      },
      7,
    );
    const tree = (
      dragSourceSquare: 'a1' | null,
      pendingSourceSquare: 'b1' | null,
      ghostOpacity: number,
    ): ReactElement => (
      <PieceLayer
        boardId="fresh-interaction"
        dragSourceSquare={dragSourceSquare}
        draggingPieceGhostStyle={{ opacity: ghostOpacity }}
        layout={layout}
        pendingSourceSquare={pendingSourceSquare}
        pieceRenderers={{ token: Probe }}
        position={current}
        style={EMPTY_STYLE}
      />
    );
    const result = await render(tree(null, null, 0.5));
    const initialDragArtwork = requiredNode(rootOf(result), 'drag:a1:static');
    const initialPendingArtwork = requiredNode(
      rootOf(result),
      'pending:b1:static',
    );
    const dragHost = boardPieceHost(initialDragArtwork);
    const pendingHost = boardPieceHost(initialPendingArtwork);
    expect(attachedStyleDescriptor(dragHost)).toBeNull();
    expect(attachedStyleDescriptor(pendingHost)).toBeNull();

    await result.rerender(tree('a1', 'b1', 0.5));
    const activeDragArtwork = requiredNode(rootOf(result), 'drag:a1:static');
    const activePendingArtwork = requiredNode(
      rootOf(result),
      'pending:b1:static',
    );
    expect(boardPieceHost(activeDragArtwork)).toBe(dragHost);
    expect(boardPieceHost(activePendingArtwork)).toBe(pendingHost);
    expect(attachedStyleDescriptor(dragHost)).toBeNull();
    expect(attachedStyleDescriptor(pendingHost)).toBeNull();
    expect(nativeStyle(dragHost).opacity).toBe(0.5);
    expect(
      nativeStyle(boardPieceOcclusionBoundary(activeDragArtwork)).opacity,
    ).toBeUndefined();
    expect(nativeStyle(pendingHost).opacity).toBe(0.45);
    expect(
      nativeStyle(boardPieceOcclusionBoundary(activePendingArtwork)).opacity,
    ).toBeUndefined();

    await result.rerender(tree('a1', 'b1', 0));
    const zeroGhostArtwork = requiredNode(rootOf(result), 'drag:a1:static');
    expect(boardPieceHost(zeroGhostArtwork)).toBe(dragHost);
    expect(attachedStyleDescriptor(dragHost)).toBeNull();
    expect(nativeStyle(dragHost).opacity).toBe(1);
    expect(
      nativeStyle(boardPieceOcclusionBoundary(zeroGhostArtwork)).opacity,
    ).toBe(0);

    await result.rerender(tree(null, null, 0));
    const restoredDragArtwork = requiredNode(rootOf(result), 'drag:a1:static');
    const restoredPendingArtwork = requiredNode(
      rootOf(result),
      'pending:b1:static',
    );
    expect(boardPieceHost(restoredDragArtwork)).toBe(dragHost);
    expect(boardPieceHost(restoredPendingArtwork)).toBe(pendingHost);
    expect(attachedStyleDescriptor(dragHost)).toBeNull();
    expect(attachedStyleDescriptor(pendingHost)).toBeNull();
    expect(nativeStyle(dragHost).opacity).toBe(1);
    expect(nativeStyle(pendingHost).opacity).toBe(1);
    expect(
      nativeStyle(boardPieceOcclusionBoundary(restoredDragArtwork)).opacity,
    ).toBeUndefined();
    expect(
      nativeStyle(boardPieceOcclusionBoundary(restoredPendingArtwork)).opacity,
    ).toBeUndefined();

    await result.unmount();
  });

  it('preserves a stateful canonical renderer and native host while entering and settling a controlled transition', async () => {
    let mounts = 0;
    function StatefulProbe(props: PieceRendererProps): ReactElement {
      const [mount] = useState(() => {
        mounts += 1;
        return mounts;
      });
      return (
        <View
          style={{ height: '100%', width: '100%' }}
          testID={`stateful:${String(mount)}:${props.square ?? 'spare'}:${props.state.isTransitioning ? 'transition' : 'static'}`}
        />
      );
    }
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 200 },
      { columns: 2, rows: 1 },
      'white',
    );
    const movePlan = plan({
      moves: Object.freeze([
        Object.freeze({
          after: Object.freeze({ id: 'runner', pieceType: 'stateful' }),
          before: Object.freeze({ id: 'runner', pieceType: 'stateful' }),
          from: 'a1',
          kind: 'move' as const,
          matchedBy: 'piece-id' as const,
          to: 'b1',
        }),
      ]),
    });
    const renderers = Object.freeze({ stateful: StatefulProbe });
    const moveProgress = testSharedValue(0.5);
    const result = await render(
      <PieceLayer
        boardId="stateful-transition"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={renderers}
        position={currentPosition(
          { a1: Object.freeze({ id: 'runner', pieceType: 'stateful' }) },
          1,
        )}
        style={EMPTY_STYLE}
      />,
    );
    const initialArtwork = requiredNode(rootOf(result), 'stateful:1:a1:static');
    const initialHost = boardPieceHost(initialArtwork);
    expect(nativeStyle(boardPieceOcclusionBoundary(initialArtwork))).toEqual(
      expect.objectContaining({ height: '100%', width: '100%' }),
    );
    expect(attachedStyleDescriptor(initialHost)).toBeNull();

    await result.rerender(
      <PieceLayer
        boardId="stateful-transition"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={renderers}
        position={currentPosition({
          b1: Object.freeze({ id: 'runner', pieceType: 'stateful' }),
        })}
        style={EMPTY_STYLE}
        transition={transition(movePlan, layout, moveProgress)}
      />,
    );
    const transitioningArtwork = requiredNode(
      rootOf(result),
      'stateful:1:b1:transition',
    );
    const transitioningHost = boardPieceHost(transitioningArtwork);
    expect(transitioningHost).toBe(initialHost);
    const activeDescriptor = attachedStyleDescriptor(transitioningHost);
    if (activeDescriptor === null) {
      throw new Error('Expected one active Reanimated style descriptor.');
    }
    expect(
      activeDescriptor.viewDescriptors.shareableViewDescriptors.value,
    ).toHaveLength(1);
    expect(mounts).toBe(1);

    moveProgress.value = 1;
    await result.rerender(
      <PieceLayer
        boardId="stateful-transition"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={renderers}
        position={currentPosition({
          b1: Object.freeze({ id: 'runner', pieceType: 'stateful' }),
        })}
        style={EMPTY_STYLE}
      />,
    );
    const settledArtwork = requiredNode(rootOf(result), 'stateful:1:b1:static');
    const settledHost = boardPieceHost(settledArtwork);
    expect(settledHost).toBe(initialHost);
    expect(mounts).toBe(1);
    expect(attachedStyleDescriptor(settledHost)).toBe(activeDescriptor);
    expect(
      activeDescriptor.viewDescriptors.shareableViewDescriptors.value,
    ).toHaveLength(1);
    expect(animatedStyle(settledHost).opacity).toBe(1);

    await result.rerender(
      <PieceLayer
        boardId="stateful-transition"
        dragSourceSquare="b1"
        draggingPieceGhostStyle={{ opacity: 0 }}
        layout={layout}
        pieceRenderers={renderers}
        position={currentPosition({
          b1: Object.freeze({ id: 'runner', pieceType: 'stateful' }),
        })}
        style={EMPTY_STYLE}
      />,
    );
    const draggedArtwork = requiredNode(rootOf(result), 'stateful:1:b1:static');
    const draggedHost = boardPieceHost(draggedArtwork);
    expect(draggedHost).toBe(initialHost);
    expect(attachedStyleDescriptor(draggedHost)).toBe(activeDescriptor);
    expect(animatedStyle(draggedHost).opacity).toBe(1);
    const draggedOcclusionBoundary =
      boardPieceOcclusionBoundary(draggedArtwork);
    expect(nativeStyle(draggedOcclusionBoundary).opacity).toBe(0);

    await result.rerender(
      <PieceLayer
        boardId="stateful-transition"
        draggingPieceGhostStyle={{ opacity: 0 }}
        layout={layout}
        pieceRenderers={renderers}
        position={currentPosition({
          b1: Object.freeze({ id: 'runner', pieceType: 'stateful' }),
        })}
        style={EMPTY_STYLE}
      />,
    );
    const restoredArtwork = requiredNode(
      rootOf(result),
      'stateful:1:b1:static',
    );
    const restoredHost = boardPieceHost(restoredArtwork);
    expect(restoredHost).toBe(initialHost);
    expect(attachedStyleDescriptor(restoredHost)).toBe(activeDescriptor);
    expect(
      nativeStyle(boardPieceOcclusionBoundary(restoredArtwork)).opacity,
    ).toBeUndefined();
    expect(mounts).toBe(1);
  });

  it('prepares one pending controlled commit behind a hard mask while the canonical mapper drains', async () => {
    function PreparationProbe(props: PieceRendererProps): ReactElement {
      const role = props.state.isPending
        ? props.state.isGhost
          ? 'pending-source'
          : 'pending-target'
        : 'canonical';
      return (
        <View
          testID={`prepared:${role}:${props.square ?? 'spare'}:${props.piece.pieceType}`}
        />
      );
    }
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 200 },
      { columns: 2, rows: 1 },
      'white',
    );
    const handoff = pendingHandoff();
    const movePlan = plan({
      moves: Object.freeze([
        Object.freeze({
          after: Object.freeze({ id: 'runner', pieceType: 'token' }),
          before: Object.freeze({ id: 'runner', pieceType: 'token' }),
          from: 'a1',
          kind: 'move' as const,
          matchedBy: 'piece-id' as const,
          to: 'b1',
        }),
      ]),
    });
    const renderers = Object.freeze({ token: PreparationProbe });
    const tree = (
      stage: 'pending' | 'prepared' | 'transition',
    ): ReactElement => {
      const mounted =
        stage === 'transition'
          ? transition(movePlan, layout, testSharedValue(0), handoff)
          : null;
      return (
        <View>
          <PieceLayer
            boardId="handoff"
            draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
            layout={layout}
            pendingCommitPreparation={stage === 'prepared' ? handoff : null}
            pendingSourceSquare={stage === 'pending' ? 'a1' : null}
            pieceRenderers={renderers}
            position={
              stage === 'pending'
                ? currentPosition(
                    {
                      a1: Object.freeze({
                        id: 'runner',
                        pieceType: 'token',
                      }),
                    },
                    1,
                  )
                : currentPosition({
                    b1: Object.freeze({
                      id: 'runner',
                      pieceType: 'token',
                    }),
                  })
            }
            style={EMPTY_STYLE}
            transition={mounted}
          />
          <PendingMoveLayer
            boardId="handoff"
            layout={layout}
            lifecycle={null}
            pendingCommitPreparation={stage === 'prepared' ? handoff : null}
            pieceRenderers={renderers}
            style={EMPTY_STYLE}
            transition={mounted}
          />
        </View>
      );
    };

    const result = await render(tree('pending'));
    const sourceArtwork = requiredNode(
      rootOf(result),
      'prepared:pending-source:a1:token',
    );
    const sourceHost = boardPieceHost(sourceArtwork);
    expect(attachedStyleDescriptor(sourceHost)).toBeNull();
    expect(nativeStyle(sourceHost).opacity).toBe(0.45);

    await result.rerender(tree('prepared'));
    const preparedCanonicalArtwork = requiredNode(
      rootOf(result),
      'prepared:canonical:b1:token',
    );
    const preparedCanonicalHost = boardPieceHost(preparedCanonicalArtwork);
    const preparedPendingHost = requiredNode(
      rootOf(result),
      'prepared:pending-target:b1:token',
    ).parent;
    if (preparedPendingHost === null) {
      throw new Error('Expected both prepared commit actors.');
    }
    expect(preparedCanonicalHost).toBe(sourceHost);
    const descriptor = attachedStyleDescriptor(preparedCanonicalHost);
    if (descriptor === null) {
      throw new Error('Expected exact preparation native-style admission.');
    }
    expect(attachedStyleDescriptor(preparedCanonicalHost)).toBe(descriptor);
    // Exact preparation first admits this otherwise-static host behind the
    // independent child mask. Its unattached pending-source worklet may still
    // expose .45 until the replacement base-one mapper evaluates.
    const preparedOuterOpacity = Number(
      animatedStyle(preparedCanonicalHost).opacity,
    );
    expect(preparedOuterOpacity).toBeGreaterThanOrEqual(0.45);
    expect(preparedOuterOpacity).toBeLessThanOrEqual(1);
    expect(
      nativeStyle(boardPieceOcclusionBoundary(preparedCanonicalArtwork))
        .opacity,
    ).toBe(0);
    expect(nativeStyle(preparedPendingHost).opacity ?? 1).toBe(1);

    await result.rerender(tree('transition'));
    const transitionCanonicalArtwork = requiredNode(
      rootOf(result),
      'prepared:canonical:b1:token',
    );
    const transitionCanonicalHost = boardPieceHost(transitionCanonicalArtwork);
    const transitionPendingHost = requiredNode(
      rootOf(result),
      'prepared:pending-target:b1:token',
    ).parent?.parent;
    if (transitionPendingHost == null) {
      throw new Error('Expected both crossfade actors.');
    }
    expect(transitionCanonicalHost).toBe(sourceHost);
    expect(attachedStyleDescriptor(transitionCanonicalHost)).toBe(descriptor);
    const transitionOuterOpacity = Number(
      animatedStyle(transitionCanonicalHost).opacity,
    );
    const transitionMaskOpacity = Number(
      nativeStyle(boardPieceOcclusionBoundary(transitionCanonicalArtwork))
        .opacity,
    );
    const transitionPendingOpacity = Number(
      animatedStyle(transitionPendingHost).opacity,
    );
    expect(transitionOuterOpacity).toBeGreaterThanOrEqual(0);
    expect(transitionOuterOpacity).toBeLessThanOrEqual(1);
    expect(transitionMaskOpacity).toBe(0);
    expect(transitionPendingOpacity).toBe(1);
    expect(
      transitionOuterOpacity * transitionMaskOpacity + transitionPendingOpacity,
    ).toBe(1);
  });

  it('mounts an anonymous square-keyed controlled target already admitted at opacity zero', async () => {
    function AnonymousProbe(props: PieceRendererProps): ReactElement {
      return (
        <View
          testID={`anonymous:${props.state.isPending ? 'pending' : 'canonical'}:${props.square ?? 'spare'}`}
        />
      );
    }
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 200 },
      { columns: 2, rows: 1 },
      'white',
    );
    const handoff = Object.freeze({
      ...pendingHandoff(),
      piece: Object.freeze({ pieceType: 'token' }),
    });
    const result = await render(
      <View>
        <PieceLayer
          boardId="handoff"
          draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
          layout={layout}
          pendingCommitPreparation={handoff}
          pieceRenderers={{ token: AnonymousProbe }}
          position={currentPosition({
            b1: Object.freeze({ pieceType: 'token' }),
          })}
          style={EMPTY_STYLE}
        />
        <PendingMoveLayer
          boardId="handoff"
          layout={layout}
          lifecycle={null}
          pendingCommitPreparation={handoff}
          pieceRenderers={{ token: AnonymousProbe }}
          style={EMPTY_STYLE}
        />
      </View>,
    );
    const canonicalArtwork = requiredNode(
      rootOf(result),
      'anonymous:canonical:b1',
    );
    const canonicalHost = boardPieceHost(canonicalArtwork);
    const pendingHost = requiredNode(
      rootOf(result),
      'anonymous:pending:b1',
    ).parent;
    if (pendingHost === null) {
      throw new Error('Expected anonymous prepared actors.');
    }
    expect(attachedStyleDescriptor(canonicalHost)).not.toBeNull();
    expect(animatedStyle(canonicalHost).opacity).toBe(1);
    expect(
      nativeStyle(boardPieceOcclusionBoundary(canonicalArtwork)).opacity,
    ).toBe(0);
    expect(nativeStyle(pendingHost).opacity ?? 1).toBe(1);
  });

  it('maps only Android transition hosts to the settled-props drain guard', () => {
    expect(transitionHostNativeDrainMs('android')).toBe(
      ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS,
    );
    expect(transitionHostNativeDrainMs('ios')).toBe(0);
    expect(transitionHostNativeDrainMs('web')).toBe(0);
  });

  it('admits all transition hosts when no native drain window is required', async () => {
    const descriptor = Object.freeze({
      key: 'unbounded-off-android',
      label: 'unbounded-off-android',
      nativeDrainToken: 'epoch:1',
    });
    const result = await render(
      <RetirementProbe
        descriptors={[descriptor]}
        maximumNativeDrainHosts={0}
      />,
    );

    requiredNode(rootOf(result), 'live:admitted:unbounded-off-android');
  });

  it('derives admission only from committed descriptors under StrictMode', async () => {
    const retirement = installRetirementFrameHarness();
    const first = Object.freeze({
      key: 'shared',
      label: 'first',
      nativeDrainToken: 'epoch:1',
    });
    const replacement = Object.freeze({
      key: 'shared',
      label: 'replacement',
      nativeDrainToken: 'epoch:2',
    });
    const tree = (
      descriptors: readonly Readonly<RetirementProbeDescriptor>[],
    ): ReactElement => (
      <StrictMode>
        <RetirementProbe
          descriptors={descriptors}
          nativeDrainMs={ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS}
        />
      </StrictMode>
    );
    const result = await render(tree([first]));
    const initialHost = requiredNode(rootOf(result), 'live:admitted:first');

    await result.rerender(tree([]));
    expect(requiredNode(rootOf(result), 'retiring:admitted:first')).toBe(
      initialHost,
    );
    expect(retirement.frames).toEqual([]);

    await result.rerender(tree([replacement]));
    expect(requiredNode(rootOf(result), 'live:admitted:replacement')).toBe(
      initialHost,
    );
    expect(retirement.frames).toEqual([]);
    expect(rootOf(result).children).toHaveLength(1);
  });

  it('preserves admission and makes canceled timer and frame callbacks inert when an exact key revives', async () => {
    jest.useFakeTimers();
    try {
      const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
      const retirement = installRetirementFrameHarness();
      const first = Object.freeze({
        key: 'reviving',
        label: 'first',
        nativeDrainToken: 'epoch:1',
      });
      const replacement = Object.freeze({
        key: 'reviving',
        label: 'replacement',
        nativeDrainToken: 'epoch:2',
      });
      const tree = (
        descriptors: readonly Readonly<RetirementProbeDescriptor>[],
      ): ReactElement => (
        <RetirementProbe
          descriptors={descriptors}
          nativeDrainMs={ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS}
        />
      );
      const result = await render(tree([first]));
      const initialHost = requiredNode(rootOf(result), 'live:admitted:first');

      await result.rerender(tree([]));
      await act(() => {
        jest.advanceTimersByTime(1_000);
      });
      await result.rerender(tree([replacement]));
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(requiredNode(rootOf(result), 'live:admitted:replacement')).toBe(
        initialHost,
      );
      await act(() => {
        jest.advanceTimersByTime(ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS + 1);
      });
      expect(retirement.frames).toEqual([]);

      await result.rerender(tree([]));
      await act(() => {
        jest.advanceTimersByTime(ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS);
      });
      expect(retirement.frames).toHaveLength(1);
      await act(() => {
        retirement.runNext();
      });
      expect(retirement.frames).toHaveLength(1);
      await result.rerender(tree([replacement]));
      expect(retirement.cancelSpy).toHaveBeenCalledTimes(1);
      await act(() => {
        retirement.runNext();
      });
      expect(retirement.frames).toEqual([]);
      expect(requiredNode(rootOf(result), 'live:admitted:replacement')).toBe(
        initialHost,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels admitted drain timers and overflow frames when the owner layer unmounts', async () => {
    jest.useFakeTimers();
    try {
      const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
      const retirement = installRetirementFrameHarness();
      const admitted = Object.freeze({
        key: 'admitted',
        label: 'admitted',
        nativeDrainToken: 'epoch:1',
      });
      const overflow = Object.freeze({
        key: 'overflow',
        label: 'overflow',
        nativeDrainToken: 'epoch:1',
      });
      const tree = (
        descriptors: readonly Readonly<RetirementProbeDescriptor>[],
      ): ReactElement => (
        <RetirementProbe
          descriptors={descriptors}
          maximumNativeDrainHosts={1}
          nativeDrainMs={ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS}
        />
      );
      const result = await render(tree([admitted, overflow]));
      await result.rerender(tree([]));
      expect(retirement.frames).toHaveLength(1);

      await result.unmount();
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(retirement.cancelSpy).toHaveBeenCalledTimes(1);
      await act(() => {
        jest.advanceTimersByTime(ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS + 1);
        retirement.runNext();
      });
      expect(retirement.frames).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('counts admitted live and retiring hosts, then admits a denied key only in a later epoch after drain', async () => {
    jest.useFakeTimers();
    try {
      const retirement = installRetirementFrameHarness();
      const admitted = Object.freeze({
        key: 'admitted',
        label: 'admitted',
        nativeDrainToken: 'epoch:1',
      });
      const denied = (token: string): Readonly<RetirementProbeDescriptor> =>
        Object.freeze({
          key: 'denied',
          label: token,
          nativeDrainToken: token,
        });
      const tree = (
        descriptors: readonly Readonly<RetirementProbeDescriptor>[],
      ): ReactElement => (
        <RetirementProbe
          descriptors={descriptors}
          maximumNativeDrainHosts={1}
          nativeDrainMs={ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS}
        />
      );
      const result = await render(tree([admitted, denied('epoch:1')]));
      requiredNode(rootOf(result), 'live:admitted:admitted');
      requiredNode(rootOf(result), 'live:static:epoch:1');

      await result.rerender(tree([denied('epoch:1')]));
      requiredNode(rootOf(result), 'retiring:admitted:admitted');
      requiredNode(rootOf(result), 'live:static:epoch:1');
      await act(() => {
        jest.advanceTimersByTime(ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS);
      });
      expect(retirement.frames).toHaveLength(1);
      await act(() => {
        retirement.runNext();
        retirement.runNext();
      });
      expect(rootOf(result).children).toHaveLength(1);
      requiredNode(rootOf(result), 'live:static:epoch:1');

      await result.rerender(tree([denied('epoch:2')]));
      requiredNode(rootOf(result), 'live:admitted:epoch:2');
    } finally {
      jest.useRealTimers();
    }
  });

  it('retires overflow after two frames but holds admitted hosts through the native drain', async () => {
    jest.useFakeTimers();
    try {
      const retirement = installRetirementFrameHarness();
      const admitted = Object.freeze({
        key: 'admitted',
        label: 'admitted',
        nativeDrainToken: 'epoch:1',
      });
      const overflow = Object.freeze({
        key: 'overflow',
        label: 'overflow',
        nativeDrainToken: 'epoch:1',
      });
      const tree = (
        descriptors: readonly Readonly<RetirementProbeDescriptor>[],
      ): ReactElement => (
        <RetirementProbe
          descriptors={descriptors}
          maximumNativeDrainHosts={1}
          nativeDrainMs={ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS}
        />
      );
      const result = await render(tree([admitted, overflow]));
      await result.rerender(tree([]));
      requiredNode(rootOf(result), 'retiring:admitted:admitted');
      requiredNode(rootOf(result), 'retiring:static:overflow');
      expect(retirement.frames).toHaveLength(1);

      await act(() => {
        retirement.runNext();
        retirement.runNext();
      });
      expect(rootOf(result).children).toHaveLength(1);
      requiredNode(rootOf(result), 'retiring:admitted:admitted');

      await act(() => {
        jest.advanceTimersByTime(ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS);
      });
      expect(retirement.frames).toHaveLength(1);
      await act(() => {
        retirement.runNext();
        retirement.runNext();
      });
      expect(rootOf(result).children).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('caps 72 saturated full-board interruption epochs, renders overflow canonical state statically, and recovers capacity', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.useFakeTimers();
    try {
      const retirement = installRetirementFrameHarness();
      const layout = createBoardSurfaceLayout(
        { height: 800, width: 800 },
        { columns: 8, rows: 8 },
        'white',
      );
      const renderers = Object.freeze({ token: Probe });
      const tree = (generation: number): ReactElement => (
        <PieceLayer
          boardId="bounded-full-board-churn"
          draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
          layout={layout}
          pieceRenderers={renderers}
          position={currentPosition(
            fullPosition(layout, generation),
            generation,
          )}
          style={EMPTY_STYLE}
          transition={saturatedFullBoardTransition(layout, generation)}
        />
      );
      const drainFrames = (): void => {
        while (retirement.frames.length > 0) {
          retirement.runNext();
        }
      };
      const result = await render(tree(100));
      const expectedBudget = pieceLayerNativeDrainHostBudget(
        layout.cells.length,
      );
      expect(expectedBudget).toBe(192);
      expect(rootOf(result).children).toHaveLength(expectedBudget);

      for (let generation = 101; generation < 172; generation += 1) {
        await result.rerender(tree(generation));
        await act(() => {
          jest.advanceTimersByTime(125);
          drainFrames();
        });

        const root = rootOf(result);
        expect(root.children.length).toBeLessThanOrEqual(
          expectedBudget + layout.cells.length,
        );
        const canonicalArtwork = root.queryAll((node) => {
          const testID: unknown = node.props['testID'];
          return (
            typeof testID === 'string' &&
            testID.startsWith(`generation:${String(generation)}:`)
          );
        });
        expect(canonicalArtwork).toHaveLength(layout.cells.length);
        for (const artwork of canonicalArtwork) {
          const testID: unknown = artwork.props['testID'];
          if (typeof testID !== 'string') {
            throw new Error('Expected one canonical full-board piece host.');
          }
          const artworkHost = boardPieceHost(artwork);
          if (testID.endsWith(':static')) {
            expect(attachedStyleDescriptor(artworkHost)).toBeNull();
          } else {
            expect(testID.endsWith(':transition')).toBe(true);
            expect(attachedStyleDescriptor(artworkHost)).not.toBeNull();
          }
        }
      }

      await result.rerender(
        <PieceLayer
          boardId="bounded-full-board-churn"
          draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
          layout={layout}
          pieceRenderers={renderers}
          position={currentPosition({}, 172)}
          style={EMPTY_STYLE}
        />,
      );
      await act(() => {
        jest.advanceTimersByTime(ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS);
        drainFrames();
      });
      expect(rootOf(result).children).toEqual([]);

      await result.rerender(tree(1_000));
      expect(rootOf(result).children).toHaveLength(expectedBudget);
      const recoveredArtwork = rootOf(result).queryAll((node) => {
        const testID: unknown = node.props['testID'];
        return typeof testID === 'string' && testID.endsWith(':transition');
      });
      expect(recoveredArtwork).toHaveLength(expectedBudget);
      for (const artwork of recoveredArtwork) {
        expect(attachedStyleDescriptor(boardPieceHost(artwork))).not.toBeNull();
      }
      await result.unmount();
    } finally {
      jest.useRealTimers();
    }
  }, 30_000);

  it('reuses the returning anonymous square host across rapid A-B-A controlled commits', async () => {
    const retirement = installRetirementFrameHarness();
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 200 },
      { columns: 2, rows: 1 },
      'white',
    );
    const piece = Object.freeze({ pieceType: 'token' });
    const ab = transition(
      plan({
        moves: Object.freeze([
          Object.freeze({
            after: piece,
            before: piece,
            from: 'a1',
            kind: 'move' as const,
            matchedBy: 'piece-type' as const,
            to: 'b1',
          }),
        ]),
      }),
      layout,
    );
    const ba = transition(
      plan({
        epoch: 4,
        fromRevision: 2,
        moves: Object.freeze([
          Object.freeze({
            after: piece,
            before: piece,
            from: 'b1',
            kind: 'move' as const,
            matchedBy: 'piece-type' as const,
            to: 'a1',
          }),
        ]),
        toRevision: 3,
      }),
      layout,
    );
    const result = await render(
      <PieceLayer
        boardId="anonymous-interruption"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={{ token: Probe }}
        position={currentPosition({ a1: piece }, 1)}
        style={EMPTY_STYLE}
      />,
    );
    const initialArtwork = requiredNode(rootOf(result), 'token:a1:static');
    const aHost = boardPieceHost(initialArtwork);

    await result.rerender(
      <PieceLayer
        boardId="anonymous-interruption"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={{ token: Probe }}
        position={currentPosition({ b1: piece }, 2)}
        style={EMPTY_STYLE}
        transition={ab}
      />,
    );
    expect(aHost.children).toEqual([]);
    const bArtwork = requiredNode(rootOf(result), 'token:b1:transition');
    const bHost = boardPieceHost(bArtwork);
    expect(retirement.frames).toHaveLength(1);

    await result.rerender(
      <PieceLayer
        boardId="anonymous-interruption"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={{ token: Probe }}
        position={currentPosition({ a1: piece }, 3)}
        style={EMPTY_STYLE}
        transition={ba}
      />,
    );
    expect(
      boardPieceHost(requiredNode(rootOf(result), 'token:a1:transition')),
    ).toBe(aHost);
    expect(bHost.children).toEqual([]);
    expect(retirement.cancelSpy).toHaveBeenCalledTimes(1);
    expect(retirement.frames).toHaveLength(2);
    await act(() => {
      retirement.runNext();
    });
    expect(retirement.frames).toHaveLength(1);
    expect(
      boardPieceHost(requiredNode(rootOf(result), 'token:a1:transition')),
    ).toBe(aHost);

    await result.unmount();
    expect(retirement.cancelSpy).toHaveBeenCalledTimes(2);
  });

  it('retires disappearing piece hosts for two guarded frames and reuses an exact live key before either frame', async () => {
    const retirement = installRetirementFrameHarness();
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 100 },
      { columns: 1, rows: 1 },
      'white',
    );
    const exitPlan = plan({
      exits: Object.freeze([
        Object.freeze({
          from: 'a1',
          kind: 'exit' as const,
          piece: Object.freeze({ id: 'gone', pieceType: 'token' }),
          reason: 'removed' as const,
        }),
      ]),
    });
    const mounted = transition(exitPlan, layout, testSharedValue(0.5));
    const tree = (
      currentTransition: Readonly<MountedPositionTransition> | null,
    ): ReactElement => (
      <PieceLayer
        boardId="retirement"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={{ token: Probe }}
        position={currentPosition({})}
        style={EMPTY_STYLE}
        transition={currentTransition}
      />
    );
    const result = await render(tree(mounted));
    const initialArtwork = requiredNode(rootOf(result), 'gone:a1:transition');
    const initialHost = boardPieceHost(initialArtwork);
    const activeDescriptor = attachedStyleDescriptor(initialHost);
    if (activeDescriptor === null) {
      throw new Error('Expected the detached host animated style.');
    }

    await result.rerender(tree(null));
    const firstRetiringHost = rootOf(result).children[0];
    expect(firstRetiringHost).toBe(initialHost);
    expect(initialHost.children).toEqual([]);
    expect(attachedStyleDescriptor(initialHost)).toBeNull();
    expect(propsOf(initialHost)['style']).not.toContain(activeDescriptor);
    expect(
      StyleSheet.flatten<ViewStyle>(
        propsOf(initialHost)['style'] as StyleProp<ViewStyle>,
      ),
    ).toEqual(expect.objectContaining({ opacity: 0 }));
    expect(retirement.frames).toHaveLength(1);

    await result.rerender(tree(mounted));
    const beforeFirstReplacement = requiredNode(
      rootOf(result),
      'gone:a1:transition',
    );
    expect(boardPieceHost(beforeFirstReplacement)).toBe(initialHost);
    expect(retirement.cancelSpy).toHaveBeenCalledTimes(1);
    await act(() => {
      retirement.runNext();
    });
    expect(retirement.frames).toEqual([]);
    expect(
      boardPieceHost(requiredNode(rootOf(result), 'gone:a1:transition')),
    ).toBe(initialHost);

    await result.rerender(tree(null));
    await act(() => {
      retirement.runNext();
    });
    expect(retirement.frames).toHaveLength(1);
    expect(rootOf(result).children[0]).toBe(initialHost);

    await result.rerender(tree(mounted));
    expect(retirement.cancelSpy).toHaveBeenCalledTimes(2);
    expect(
      boardPieceHost(requiredNode(rootOf(result), 'gone:a1:transition')),
    ).toBe(initialHost);
    await act(() => {
      retirement.runNext();
    });
    expect(rootOf(result).children).toHaveLength(1);

    await result.rerender(tree(null));
    await act(() => {
      retirement.runNext();
    });
    expect(rootOf(result).children[0]).toBe(initialHost);
    await act(() => {
      retirement.runNext();
    });
    expect(rootOf(result).children).toEqual([]);
  });

  it('keeps anonymous capture actors at one square in separate transition host key scopes', async () => {
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 200 },
      { columns: 2, rows: 1 },
      'white',
    );
    const capturePlan = plan({
      exits: Object.freeze([
        Object.freeze({
          from: 'b1',
          kind: 'exit' as const,
          piece: Object.freeze({ pieceType: 'token' }),
          reason: 'captured' as const,
        }),
      ]),
      moves: Object.freeze([
        Object.freeze({
          after: Object.freeze({ pieceType: 'token' }),
          before: Object.freeze({ pieceType: 'token' }),
          from: 'a1',
          kind: 'move' as const,
          matchedBy: 'piece-type' as const,
          to: 'b1',
        }),
      ]),
    });
    const result = await render(
      <PieceLayer
        boardId="anonymous-capture"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={{ token: Probe }}
        position={currentPosition({
          b1: Object.freeze({ pieceType: 'token' }),
        })}
        style={EMPTY_STYLE}
        transition={transition(capturePlan, layout)}
      />,
    );
    const actors = rootOf(result).queryAll(
      (node) => node.props['testID'] === 'token:b1:transition',
    );
    expect(actors).toHaveLength(2);
    const [beforeActor, afterActor] = actors;
    if (beforeActor === undefined || afterActor === undefined) {
      throw new Error('Expected two anonymous capture actors.');
    }
    expect(boardPieceHost(beforeActor)).not.toBe(boardPieceHost(afterActor));
  });

  it('retires pending handoff hosts without artwork and cancels the second frame on unmount', async () => {
    const retirement = installRetirementFrameHarness();
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 200 },
      { columns: 2, rows: 1 },
      'white',
    );
    const movePlan = plan({
      moves: Object.freeze([
        Object.freeze({
          after: Object.freeze({ id: 'runner', pieceType: 'token' }),
          before: Object.freeze({ id: 'runner', pieceType: 'token' }),
          from: 'a1',
          kind: 'move' as const,
          matchedBy: 'piece-id' as const,
          to: 'b1',
        }),
      ]),
    });
    const mounted = transition(
      movePlan,
      layout,
      testSharedValue(0.5),
      pendingHandoff(),
    );
    const tree = (
      currentTransition: Readonly<MountedPositionTransition> | null,
    ): ReactElement => (
      <PendingMoveLayer
        boardId="handoff"
        layout={layout}
        lifecycle={null}
        pieceRenderers={{ token: Probe }}
        style={EMPTY_STYLE}
        transition={currentTransition}
      />
    );
    const result = await render(tree(mounted));
    const pendingArtwork = requiredNode(rootOf(result), 'runner:b1:static');
    const pendingHost = pendingArtwork.parent?.parent ?? null;
    if (pendingHost === null) {
      throw new Error('Expected one pending handoff animated host.');
    }
    expect(pendingHost).toHaveProp('collapsable', false);
    const activeDescriptor = attachedStyleDescriptor(pendingHost);
    if (activeDescriptor === null) {
      throw new Error('Expected the pending handoff animated style.');
    }

    await result.rerender(tree(null));
    expect(rootOf(result).children[0]).toBe(pendingHost);
    expect(pendingHost.children).toEqual([]);
    expect(attachedStyleDescriptor(pendingHost)).toBeNull();
    expect(propsOf(pendingHost)['style']).not.toContain(activeDescriptor);
    expect(
      StyleSheet.flatten<ViewStyle>(
        propsOf(pendingHost)['style'] as StyleProp<ViewStyle>,
      ),
    ).toEqual(expect.objectContaining({ opacity: 0 }));
    expect(retirement.frames).toHaveLength(1);

    await act(() => {
      retirement.runNext();
    });
    expect(retirement.frames).toHaveLength(1);
    expect(rootOf(result).children[0]).toBe(pendingHost);

    await result.unmount();
    expect(retirement.cancelSpy).toHaveBeenCalledTimes(1);
    await act(() => {
      retirement.runNext();
    });
    expect(retirement.frames).toEqual([]);
  });

  it('omits pending overflow before first commit and admits it only in a later epoch after capacity drains', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.useFakeTimers();
    try {
      const retirement = installRetirementFrameHarness();
      const layout = createBoardSurfaceLayout(
        { height: 100, width: 200 },
        { columns: 2, rows: 1 },
        'white',
      );
      const movePlan = plan({
        moves: Object.freeze([
          Object.freeze({
            after: Object.freeze({ id: 'runner', pieceType: 'token' }),
            before: Object.freeze({ id: 'runner', pieceType: 'token' }),
            from: 'a1',
            kind: 'move' as const,
            matchedBy: 'piece-id' as const,
            to: 'b1',
          }),
        ]),
      });
      const base = transition(
        movePlan,
        layout,
        testSharedValue(0.5),
        pendingHandoff(),
      );
      const baseActor = base.presentation.pending[0];
      if (baseActor === undefined) {
        throw new Error('Expected one pending handoff actor.');
      }
      const mounted = (
        epoch: number,
        ids: readonly string[],
      ): Readonly<MountedPositionTransition> =>
        Object.freeze({
          ...base,
          presentation: Object.freeze({
            ...base.presentation,
            epoch,
            pending: Object.freeze(
              ids.map((id) =>
                Object.freeze({
                  ...baseActor,
                  actorKey: `pending:${id}`,
                  piece: Object.freeze({ id, pieceType: 'token' }),
                }),
              ),
            ),
          }),
          progress: testSharedValue(0.5),
        });
      const tree = (
        currentTransition: Readonly<MountedPositionTransition>,
      ): ReactElement => (
        <PendingMoveLayer
          boardId="bounded-pending"
          layout={layout}
          lifecycle={null}
          pieceRenderers={{ token: Probe }}
          style={EMPTY_STYLE}
          transition={currentTransition}
        />
      );
      const admittedIds = Array.from(
        { length: PENDING_MOVE_NATIVE_DRAIN_HOST_BUDGET },
        (_, index) => `admitted-${String(index)}`,
      );
      const result = await render(tree(mounted(1, admittedIds)));
      expect(rootOf(result).children).toHaveLength(
        PENDING_MOVE_NATIVE_DRAIN_HOST_BUDGET,
      );

      await result.rerender(tree(mounted(2, ['overflow'])));
      expect(
        rootOf(result).queryAll(
          (node) => node.props['testID'] === 'overflow:b1:static',
        ),
      ).toEqual([]);
      expect(
        rootOf(result).queryAll((node) => {
          const testID: unknown = node.props['testID'];
          return typeof testID === 'string' && testID.endsWith(':static');
        }),
      ).toEqual([]);

      await act(() => {
        jest.advanceTimersByTime(ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS);
        while (retirement.frames.length > 0) {
          retirement.runNext();
        }
      });
      await result.rerender(tree(mounted(3, ['overflow'])));
      const recovered = requiredNode(rootOf(result), 'overflow:b1:static');
      const recoveredHost = recovered.parent?.parent ?? null;
      if (recoveredHost === null) {
        throw new Error('Expected the recovered pending animated host.');
      }
      expect(attachedStyleDescriptor(recoveredHost)).not.toBeNull();
      await result.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders a capture exit below its moving current actor and fades both generic enter/exit paths', async () => {
    const progress = testSharedValue(0);
    const capturePlan = plan({
      enters: Object.freeze([
        Object.freeze({
          kind: 'enter' as const,
          piece: Object.freeze({ id: 'added', pieceType: 'token' }),
          reason: 'added' as const,
          to: 'c1',
        }),
      ]),
      exits: Object.freeze([
        Object.freeze({
          from: 'b1',
          kind: 'exit' as const,
          piece: Object.freeze({ id: 'captured', pieceType: 'token' }),
          reason: 'captured' as const,
        }),
      ]),
      moves: Object.freeze([
        Object.freeze({
          after: Object.freeze({ id: 'runner', pieceType: 'token' }),
          before: Object.freeze({ id: 'runner', pieceType: 'token' }),
          from: 'a1',
          kind: 'move' as const,
          matchedBy: 'piece-id' as const,
          to: 'b1',
        }),
      ]),
    });
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 300 },
      { columns: 3, rows: 1 },
      'white',
    );
    const result = await render(
      <PieceLayer
        boardId="capture"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={{ token: Probe }}
        position={currentPosition({
          b1: Object.freeze({ id: 'runner', pieceType: 'token' }),
          c1: Object.freeze({ id: 'added', pieceType: 'token' }),
        })}
        style={{ opacity: 0.8 }}
        transition={transition(capturePlan, layout, progress)}
      />,
    );
    const root = rootOf(result);
    const captured = requiredNode(root, 'captured:b1:transition');
    const runner = requiredNode(root, 'runner:b1:transition');
    const added = requiredNode(root, 'added:c1:transition');
    const capturedHost = boardPieceHost(captured);
    const runnerHost = boardPieceHost(runner);
    const addedHost = boardPieceHost(added);

    expect(animatedStyle(capturedHost).opacity).toBe(0.8);
    expect(animatedStyle(addedHost).opacity).toBe(0);
    const visualChildren = root.children.filter(
      (child): child is TestInstance => typeof child !== 'string',
    );
    expect(visualChildren.indexOf(capturedHost)).toBeLessThan(
      visualChildren.indexOf(runnerHost),
    );

    const progressedResult = await render(
      <PieceLayer
        boardId="capture"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={{ token: Probe }}
        position={currentPosition({
          b1: Object.freeze({ id: 'runner', pieceType: 'token' }),
          c1: Object.freeze({ id: 'added', pieceType: 'token' }),
        })}
        style={{ opacity: 0.8 }}
        transition={transition(capturePlan, layout, testSharedValue(0.25))}
      />,
    );
    const progressedRoot = rootOf(progressedResult);
    const currentCaptured = boardPieceHost(
      requiredNode(progressedRoot, 'captured:b1:transition'),
    );
    const currentAdded = boardPieceHost(
      requiredNode(progressedRoot, 'added:c1:transition'),
    );
    expect(animatedStyle(currentCaptured).opacity).toBeCloseTo(0.6);
    expect(animatedStyle(currentAdded).opacity).toBeCloseTo(0.2);
  });

  it('crossfades ambiguous actors and co-locates both sides of a replacement path', () => {
    const ambiguous = plan({
      enters: Object.freeze([
        Object.freeze({
          kind: 'enter' as const,
          piece: Object.freeze({ pieceType: 'wR' }),
          reason: 'ambiguous' as const,
          to: 'b1',
        }),
      ]),
      exits: Object.freeze([
        Object.freeze({
          from: 'a1',
          kind: 'exit' as const,
          piece: Object.freeze({ pieceType: 'wR' }),
          reason: 'ambiguous' as const,
        }),
      ]),
      hasAmbiguity: true,
      replacements: Object.freeze([
        Object.freeze({
          after: Object.freeze({ id: 'pawn', pieceType: 'wQ' }),
          before: Object.freeze({ id: 'pawn', pieceType: 'wP' }),
          from: 'c1',
          kind: 'replace' as const,
          matchedBy: 'piece-id' as const,
          to: 'd1',
        }),
      ]),
    });
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 400 },
      { columns: 4, rows: 1 },
      'white',
    );
    const projection = createPieceTransitionProjection(
      layout,
      transition(ambiguous, layout),
    );

    expect(projection.current.get('b1')).toEqual({
      endOpacity: 1,
      endTranslateX: 0,
      endTranslateY: 0,
      kind: 'enter',
      startOpacity: 0,
      startTranslateX: 0,
      startTranslateY: 0,
    });
    expect(projection.exits.map(({ square }) => square)).toEqual(['a1']);
    expect(projection.current.get('d1')).toEqual({
      endOpacity: 1,
      endTranslateX: 0,
      endTranslateY: 0,
      kind: 'replace-enter',
      startOpacity: 0,
      startTranslateX: -100,
      startTranslateY: 0,
    });
    expect(projection.replacements).toEqual([
      expect.objectContaining({
        square: 'c1',
        transition: {
          endOpacity: 0,
          endTranslateX: 100,
          endTranslateY: 0,
          kind: 'replace-exit',
          startOpacity: 1,
          startTranslateX: 0,
          startTranslateY: 0,
        },
      }),
    ]);
    expect(
      resolvePieceTransitionAnimatedStyle(
        projection.current.get('b1') ?? null,
        0.4,
        1,
      ),
    ).toEqual({ opacity: 0.4, transform: undefined });
    expect(
      resolvePieceTransitionAnimatedStyle(
        projection.current.get('d1') ?? null,
        0.4,
        1,
      ),
    ).toEqual({
      opacity: 0.4,
      transform: [{ translateX: -60 }, { translateY: 0 }],
    });
    expect(
      resolvePieceTransitionAnimatedStyle(
        projection.replacements[0]?.transition ?? null,
        0.4,
        1,
      ),
    ).toEqual({
      opacity: 0.6,
      transform: [{ translateX: 40 }, { translateY: 0 }],
    });
  });

  it('renders detached before artwork below the canonical replacement target on one shared progress value', async () => {
    const replacementPlan = plan({
      exits: Object.freeze([
        Object.freeze({
          from: 'd1',
          kind: 'exit' as const,
          piece: Object.freeze({ id: 'victim', pieceType: 'captured' }),
          reason: 'captured' as const,
        }),
      ]),
      replacements: Object.freeze([
        Object.freeze({
          after: Object.freeze({ id: 'pawn', pieceType: 'promoted' }),
          before: Object.freeze({ id: 'pawn', pieceType: 'pawn' }),
          from: 'c1',
          kind: 'replace' as const,
          matchedBy: 'explicit' as const,
          to: 'd1',
        }),
      ]),
    });
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 400 },
      { columns: 4, rows: 1 },
      'white',
    );
    const result = await render(
      <PieceLayer
        boardId="promotion"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={{ captured: Probe, pawn: Probe, promoted: Probe }}
        position={currentPosition({
          d1: Object.freeze({ id: 'pawn', pieceType: 'promoted' }),
        })}
        style={EMPTY_STYLE}
        transition={transition(replacementPlan, layout, testSharedValue(0.5))}
      />,
    );
    const root = rootOf(result);
    const victim = requiredNode(root, 'victim:d1:transition');
    const before = requiredNode(root, 'pawn:c1:transition');
    const after = requiredNode(root, 'pawn:d1:transition');
    const victimHost = boardPieceHost(victim);
    const beforeHost = boardPieceHost(before);
    const afterHost = boardPieceHost(after);
    expect(animatedStyle(beforeHost)).toEqual(
      expect.objectContaining({
        opacity: 0.5,
        transform: [{ translateX: 50 }, { translateY: 0 }],
      }),
    );
    expect(animatedStyle(afterHost)).toEqual(
      expect.objectContaining({
        opacity: 0.5,
        transform: [{ translateX: -50 }, { translateY: 0 }],
      }),
    );
    const visualChildren = root.children.filter(
      (child): child is TestInstance => typeof child !== 'string',
    );
    expect(visualChildren.indexOf(victimHost)).toBeLessThan(
      visualChildren.indexOf(beforeHost),
    );
    expect(visualChildren.indexOf(beforeHost)).toBeLessThan(
      visualChildren.indexOf(afterHost),
    );
  });

  it('keeps transient hosts pointerless and hidden from accessibility', async () => {
    const layout = createBoardSurfaceLayout(
      { height: 80, width: 80 },
      { columns: 1, rows: 1 },
      'white',
    );
    const result = await render(
      <PieceLayer
        boardId="decorative"
        draggingPieceGhostStyle={DEFAULT_GHOST_STYLE}
        layout={layout}
        pieceRenderers={{ token: Probe }}
        position={currentPosition({})}
        style={EMPTY_STYLE}
        transition={transition(
          plan({
            exits: Object.freeze([
              Object.freeze({
                from: 'a1',
                kind: 'exit' as const,
                piece: Object.freeze({ id: 'gone', pieceType: 'token' }),
                reason: 'removed' as const,
              }),
            ]),
          }),
          layout,
        )}
      />,
    );
    const gone = requiredNode(rootOf(result), 'gone:a1:transition');
    const goneHost = boardPieceHost(gone);
    expect(goneHost).toHaveProp('accessible', false);
    expect(goneHost).toHaveProp('collapsable', false);
    expect(goneHost).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    expect(goneHost).toHaveProp('pointerEvents', 'none');
    const hostStyle = propsOf(goneHost)['style'] as StyleProp<ViewStyle>;
    expect(StyleSheet.flatten<ViewStyle>(hostStyle)).toEqual(
      expect.objectContaining({ position: 'absolute' }),
    );
  });
});
