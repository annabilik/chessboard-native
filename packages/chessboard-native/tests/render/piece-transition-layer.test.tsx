import { render } from '@testing-library/react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { TestInstance } from 'test-renderer';

import type { MountedPositionTransition } from '../../src/internal/use-position-transition-runtime';
import { createTransitionPresentation } from '../../src/internal/transition-presentation';
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
  resolvePieceTransitionAnimatedStyle,
} from '../../src/render/piece-layer';

const EMPTY_STYLE: Readonly<ViewStyle> = Object.freeze({});

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
): Readonly<MountedPositionTransition> {
  return Object.freeze({
    durationMs: 300,
    plan: value,
    presentation: createTransitionPresentation({
      currentLayout: layout,
      plan: value,
      previousLayout: layout,
    }),
    progress,
  });
}

function currentPosition(value: PositionObject): Readonly<{
  revision: number;
  tier: 'envelope';
  value: PositionObject;
}> {
  return Object.freeze({ revision: 2, tier: 'envelope', value });
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
    if (artwork.parent === null) {
      throw new Error('Expected one animated piece host.');
    }
    expect(animatedStyle(artwork.parent)).toEqual(
      expect.objectContaining({
        opacity: 1,
        transform: [{ translateX: -100 }, { translateY: 0 }],
      }),
    );

    const halfwayResult = await render(
      <PieceLayer
        boardId="move"
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
    if (currentArtwork.parent === null) {
      throw new Error('Expected the updated animated piece host.');
    }
    expect(animatedStyle(currentArtwork.parent).transform).toEqual([
      { translateX: -50 },
      { translateY: 0 },
    ]);
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
    if (
      captured.parent === null ||
      runner.parent === null ||
      added.parent === null
    ) {
      throw new Error('Expected animated hosts.');
    }

    expect(animatedStyle(captured.parent).opacity).toBe(0.8);
    expect(animatedStyle(added.parent).opacity).toBe(0);
    const visualChildren = root.children.filter(
      (child): child is TestInstance => typeof child !== 'string',
    );
    expect(visualChildren.indexOf(captured.parent)).toBeLessThan(
      visualChildren.indexOf(runner.parent),
    );

    const progressedResult = await render(
      <PieceLayer
        boardId="capture"
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
    const currentCaptured = requiredNode(
      progressedRoot,
      'captured:b1:transition',
    ).parent;
    const currentAdded = requiredNode(
      progressedRoot,
      'added:c1:transition',
    ).parent;
    if (currentCaptured === null || currentAdded === null) {
      throw new Error('Expected updated animated hosts.');
    }
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
    if (
      victim.parent === null ||
      before.parent === null ||
      after.parent === null
    ) {
      throw new Error('Expected capture and replacement transition hosts.');
    }
    expect(animatedStyle(before.parent)).toEqual(
      expect.objectContaining({
        opacity: 0.5,
        transform: [{ translateX: 50 }, { translateY: 0 }],
      }),
    );
    expect(animatedStyle(after.parent)).toEqual(
      expect.objectContaining({
        opacity: 0.5,
        transform: [{ translateX: -50 }, { translateY: 0 }],
      }),
    );
    const visualChildren = root.children.filter(
      (child): child is TestInstance => typeof child !== 'string',
    );
    expect(visualChildren.indexOf(victim.parent)).toBeLessThan(
      visualChildren.indexOf(before.parent),
    );
    expect(visualChildren.indexOf(before.parent)).toBeLessThan(
      visualChildren.indexOf(after.parent),
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
    if (gone.parent === null) {
      throw new Error('Expected one transient host.');
    }
    expect(gone.parent).toHaveProp('accessible', false);
    expect(gone.parent).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    expect(gone.parent).toHaveProp('pointerEvents', 'none');
    const hostStyle = propsOf(gone.parent)['style'] as StyleProp<ViewStyle>;
    expect(StyleSheet.flatten<ViewStyle>(hostStyle)).toEqual(
      expect.objectContaining({ position: 'absolute' }),
    );
  });
});
