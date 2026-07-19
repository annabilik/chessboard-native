import { act, render, renderHook } from '@testing-library/react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { getAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { ReducedMotionProvider } from '../../src/accessibility/reduced-motion';
import {
  INTERACTION_PRESENTATION_PHASE,
  projectInteractionPresentation,
  resetInteractionPresentationSharedValues,
  syncInteractionPresentationSharedValues,
  updateInteractionPresentationPointer,
  useInteractionPresentationSharedValues,
  type InteractionPresentationPhase,
  type InteractionPresentationSharedValues,
} from '../../src/internal/interaction-presentation';
import {
  createInteractionState,
  reduceInteraction,
  type MoveIntentLifecycle,
} from '../../src/internal/interaction-reducer';
import type {
  PieceInteractionContext,
  PieceRenderer,
  PieceRendererProps,
} from '../../src/public-types';
import {
  DRAG_OVERLAY_LIFT_SCALE,
  DragOverlay,
  resolveDragOverlayAnimatedStyle,
} from '../../src/render/drag-overlay';
import {
  InteractionPieceVisual,
  interactionPieceVisualState,
} from '../../src/render/interaction-piece-visual';

const context: Readonly<PieceInteractionContext> = Object.freeze({
  basePositionRevision: 7,
  boardId: 'presentation-board',
  piece: Object.freeze({ id: 'pawn', pieceType: 'wP' }),
  source: Object.freeze({ kind: 'board', square: 'e2' }),
});

function phase<Phase extends MoveIntentLifecycle['phase']>(
  lifecycle: Readonly<MoveIntentLifecycle>,
  expected: Phase,
): Readonly<Extract<MoveIntentLifecycle, { readonly phase: Phase }>> {
  expect(lifecycle.phase).toBe(expected);
  return lifecycle as Readonly<
    Extract<MoveIntentLifecycle, { readonly phase: Phase }>
  >;
}

function dragLifecycle(): Readonly<MoveIntentLifecycle> {
  const idle = createInteractionState({
    boardId: context.boardId,
    positionRevision: context.basePositionRevision,
  });
  return reduceInteraction(idle, {
    context,
    mode: 'drag',
    targetSquare: 'e2',
    type: 'begin',
  }).state;
}

function testSharedValue<Value>(initialValue: Value): SharedValue<Value> {
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

function testPresentationSharedValues(): Readonly<InteractionPresentationSharedValues> {
  return Object.freeze({
    epoch: testSharedValue<number | null>(0),
    phase: testSharedValue<InteractionPresentationPhase>(
      INTERACTION_PRESENTATION_PHASE.DRAG,
    ),
    pointerX: testSharedValue(120),
    pointerY: testSharedValue(80),
    pointerWindowX: testSharedValue(220),
    pointerWindowY: testSharedValue(180),
    sourceSquare: testSharedValue<string | null>('e2'),
    targetSquare: testSharedValue<string | null>('e4'),
  });
}

describe('interaction presentation foundation', () => {
  it('[PARITY-BEHAVIOR-B26] projects lift, source ghost, and pending visuals without retaining a position snapshot', async () => {
    const dragging = phase(dragLifecycle(), 'drag');
    const dragPresentation = projectInteractionPresentation(dragging);

    expect(dragPresentation).toEqual({
      boardId: 'presentation-board',
      epoch: 0,
      isLifted: true,
      isPending: false,
      phase: INTERACTION_PRESENTATION_PHASE.DRAG,
      piece: { id: 'pawn', pieceType: 'wP' },
      showsSourceGhost: true,
      sourceSquare: 'e2',
      targetSquare: 'e2',
    });
    expect(dragPresentation).not.toHaveProperty('position');
    expect(dragPresentation).not.toHaveProperty('annotations');
    expect(Object.isFrozen(dragPresentation)).toBe(true);

    const targeted = phase(
      reduceInteraction(dragging, {
        epoch: dragging.epoch,
        targetSquare: 'e4',
        type: 'update-target',
      }).state,
      'drag',
    );
    const deciding = phase(
      reduceInteraction(targeted, {
        epoch: targeted.epoch,
        intentId: 'intent-1',
        type: 'submit',
      }).state,
      'deciding',
    );
    const decisionPresentation = projectInteractionPresentation(deciding);
    expect(decisionPresentation).toEqual(
      expect.objectContaining({
        isLifted: false,
        isPending: true,
        phase: INTERACTION_PRESENTATION_PHASE.DECIDING,
        showsSourceGhost: true,
        sourceSquare: 'e2',
        targetSquare: 'e4',
      }),
    );

    const awaitingCommit = phase(
      reduceInteraction(deciding, {
        decision: { status: 'accepted' },
        epoch: deciding.epoch,
        intentId: deciding.intent.intentId,
        type: 'decision-resolved',
      }).state,
      'awaiting-commit',
    );
    expect(projectInteractionPresentation(awaitingCommit)).toEqual(
      expect.objectContaining({
        isPending: true,
        phase: INTERACTION_PRESENTATION_PHASE.AWAITING_COMMIT,
        showsSourceGhost: true,
      }),
    );

    const rendererCalls: PieceRendererProps[] = [];
    const Renderer: PieceRenderer = (props) => {
      rendererCalls.push(props);
      return <View testID="piece-art" />;
    };
    const style = Object.freeze<ViewStyle>({
      aspectRatio: 9,
      bottom: 999,
      display: 'none',
      height: 999,
      inset: 999,
      left: 999,
      margin: 999,
      maxHeight: 1,
      maxWidth: 1,
      minHeight: 999,
      minWidth: 999,
      opacity: 0.75,
      position: 'relative',
      right: 999,
      top: 999,
      transform: [{ scale: 9 }],
      transformOrigin: 'left top',
      width: 999,
    });
    const result = await render(
      <InteractionPieceVisual
        boardId="presentation-board"
        containerStyle={{ height: 48, left: 20, top: 30, width: 48 }}
        kind="source-ghost"
        piece={context.piece}
        renderer={Renderer}
        size={48}
        source={{ kind: 'board', square: 'e2' }}
        square="e2"
        style={style}
        testID="source-ghost"
      />,
    );

    const sourceGhost = result.getByTestId('source-ghost', {
      includeHiddenElements: true,
    });
    expect(sourceGhost).toHaveProp('pointerEvents', 'none');
    expect(sourceGhost).toHaveProp('accessible', false);
    const sourceGhostStyle = StyleSheet.flatten<ViewStyle>(
      sourceGhost.props['style'] as StyleProp<ViewStyle>,
    );
    expect(sourceGhostStyle).toEqual(
      expect.objectContaining({
        aspectRatio: undefined,
        bottom: undefined,
        display: 'flex',
        height: 48,
        inset: undefined,
        left: 20,
        margin: 0,
        maxHeight: undefined,
        maxWidth: undefined,
        minHeight: undefined,
        minWidth: undefined,
        opacity: 0.75,
        position: 'absolute',
        right: undefined,
        top: 30,
        transform: undefined,
        transformOrigin: undefined,
        width: 48,
      }),
    );
    expect(rendererCalls).toEqual([
      expect.objectContaining({
        boardId: 'presentation-board',
        piece: { id: 'pawn', pieceType: 'wP' },
        size: 48,
        square: 'e2',
        state: {
          isDragging: false,
          isGhost: true,
          isPending: false,
          isPressed: false,
          isTransitioning: false,
        },
        style,
      }),
    ]);
  });

  it('presents board taps as pending while keeping spare sources ghost-free', () => {
    const tapTargeting = phase(
      reduceInteraction(
        createInteractionState({
          boardId: context.boardId,
          positionRevision: context.basePositionRevision,
        }),
        {
          context,
          mode: 'tap',
          targetSquare: 'e4',
          type: 'begin',
        },
      ).state,
      'tap',
    );
    const tapDecision = phase(
      reduceInteraction(tapTargeting, {
        epoch: tapTargeting.epoch,
        intentId: 'tap-intent',
        type: 'submit',
      }).state,
      'deciding',
    );
    expect(projectInteractionPresentation(tapDecision)).toEqual(
      expect.objectContaining({
        isLifted: false,
        isPending: true,
        showsSourceGhost: true,
        sourceSquare: 'e2',
        targetSquare: 'e4',
      }),
    );

    const idle = createInteractionState({
      boardId: 'spare-target',
      positionRevision: 11,
    });
    const deciding = phase(
      reduceInteraction(idle, {
        intent: {
          basePositionRevision: 11,
          boardId: 'spare-target',
          input: 'accessibility',
          intentId: 'spare-intent',
          piece: { pieceType: 'wQ' },
          source: { kind: 'spare', spareId: 'white-queen' },
          targetSquare: 'd5',
        },
        type: 'request',
      }).state,
      'deciding',
    );
    const presentation = projectInteractionPresentation(deciding);

    expect(presentation).toEqual(
      expect.objectContaining({
        isPending: true,
        showsSourceGhost: false,
        sourceSquare: null,
        targetSquare: 'd5',
      }),
    );
  });

  it('synchronizes correlation while preserving pan coordinates and fully resets on idle', async () => {
    const shared = (
      await renderHook(() => useInteractionPresentationSharedValues())
    ).result;
    const dragging = projectInteractionPresentation(dragLifecycle());

    await act(() => {
      updateInteractionPresentationPointer(shared.current, 120.5, 93.25);
      syncInteractionPresentationSharedValues(shared.current, dragging);
    });
    expect(shared.current.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.DRAG,
    );
    expect(shared.current.epoch.value).toBe(0);
    expect(shared.current.sourceSquare.value).toBe('e2');
    expect(shared.current.targetSquare.value).toBe('e2');
    expect(shared.current.pointerX.value).toBe(120.5);
    expect(shared.current.pointerY.value).toBe(93.25);

    await act(() => {
      updateInteractionPresentationPointer(
        shared.current,
        Number.NaN,
        Number.POSITIVE_INFINITY,
      );
    });
    expect(shared.current.pointerX.value).toBe(120.5);
    expect(shared.current.pointerY.value).toBe(93.25);

    const invalidated = projectInteractionPresentation(
      reduceInteraction(dragLifecycle(), {
        reason: 'geometry-change',
        type: 'invalidate',
      }).state,
    );
    await act(() => {
      syncInteractionPresentationSharedValues(shared.current, invalidated);
    });
    expect(shared.current.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.IDLE,
    );
    expect(shared.current.epoch.value).toBeNull();
    expect(shared.current.sourceSquare.value).toBeNull();
    expect(shared.current.targetSquare.value).toBeNull();
    expect(shared.current.pointerX.value).toBe(0);
    expect(shared.current.pointerY.value).toBe(0);

    await act(() => {
      resetInteractionPresentationSharedValues(shared.current);
    });
    expect(shared.current.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.IDLE,
    );
  });

  it('uses immutable, mutually exclusive renderer flags', () => {
    expect(interactionPieceVisualState('drag-overlay')).toEqual(
      expect.objectContaining({ isDragging: true }),
    );
    expect(interactionPieceVisualState('source-ghost')).toEqual(
      expect.objectContaining({ isGhost: true }),
    );
    expect(interactionPieceVisualState('pending')).toEqual(
      expect.objectContaining({ isPending: true }),
    );
    expect(Object.isFrozen(interactionPieceVisualState('pending'))).toBe(true);
  });

  it('updates the drag overlay worklet transform from shared pointer values without a React render', async () => {
    let presentation: Readonly<InteractionPresentationSharedValues> | undefined;
    let harnessRenderCount = 0;
    const rendererCalls: PieceRendererProps[] = [];
    const Renderer: PieceRenderer = (props) => {
      rendererCalls.push(props);
      return <View testID="drag-art" />;
    };

    function Harness() {
      harnessRenderCount += 1;
      presentation = useInteractionPresentationSharedValues();
      return (
        <ReducedMotionProvider preference="never">
          <DragOverlay
            boardId="presentation-board"
            piece={context.piece}
            presentation={presentation}
            reducedMotion={false}
            renderer={Renderer}
            size={48}
            source={{ kind: 'board', square: 'e2' }}
            square="e2"
            style={Object.freeze({})}
            testID="drag-overlay"
          />
        </ReducedMotionProvider>
      );
    }

    const result = await render(<Harness />);
    const overlay = result.getByTestId('drag-overlay', {
      includeHiddenElements: true,
    });
    const values = presentation;
    if (values === undefined) {
      throw new Error('Expected mounted overlay shared values.');
    }

    expect(getAnimatedStyle(overlay)).toEqual(
      expect.objectContaining({
        opacity: 0,
        transform: [{ translateX: -24 }, { translateY: -24 }],
      }),
    );
    expect(harnessRenderCount).toBe(1);
    expect(rendererCalls).toHaveLength(1);

    await act(() => {
      values.phase.value = INTERACTION_PRESENTATION_PHASE.DRAG;
      updateInteractionPresentationPointer(values, 120.5, 93.25);
    });
    expect(resolveDragOverlayAnimatedStyle(values, 48, false)).toEqual({
      opacity: 1,
      transform: [
        { translateX: 96.5 },
        { translateY: 69.25 },
        { scale: DRAG_OVERLAY_LIFT_SCALE },
      ],
    });
    expect(
      resolveDragOverlayAnimatedStyle(values, 48, false, 0, 0, 0).opacity,
    ).toBe(0);
    expect(harnessRenderCount).toBe(1);
    expect(rendererCalls).toHaveLength(1);

    await act(() => {
      updateInteractionPresentationPointer(values, 203, 151);
    });
    expect(
      resolveDragOverlayAnimatedStyle(values, 48, false).transform,
    ).toEqual([
      { translateX: 179 },
      { translateY: 127 },
      { scale: DRAG_OVERLAY_LIFT_SCALE },
    ]);
    expect(harnessRenderCount).toBe(1);
    expect(rendererCalls).toHaveLength(1);
  });

  it('composes the resolved dragging-piece transform after pointer translation without changing hit data', () => {
    const values = testPresentationSharedValues();
    const targetBefore = values.targetSquare.value;

    expect(
      resolveDragOverlayAnimatedStyle(values, 40, false, 20, 30, 1, [
        { scale: 1.35 },
        { rotate: '8deg' },
      ]),
    ).toEqual({
      opacity: 1,
      transform: [
        { translateX: 180 },
        { translateY: 130 },
        { scale: 1.35 },
        { rotate: '8deg' },
      ],
    });
    expect(values.targetSquare.value).toBe(targetBefore);
    expect(values.pointerWindowX.value).toBe(220);
    expect(values.pointerWindowY.value).toBe(180);
  });

  it('[PARITY-BEHAVIOR-B25] clamps the overlay center before composing consumer paint transforms', () => {
    const values = testPresentationSharedValues();

    expect(
      resolveDragOverlayAnimatedStyle(
        values,
        40,
        false,
        20,
        30,
        1,
        [{ scale: 1.35 }],
        Object.freeze({ height: 100, kind: 'gesture', width: 100 }),
      ),
    ).toEqual({
      opacity: 1,
      transform: [{ translateX: 160 }, { translateY: 130 }, { scale: 1.35 }],
    });
    expect(values.pointerWindowX.value).toBe(220);
    expect(values.pointerWindowY.value).toBe(180);
    expect(values.targetSquare.value).toBe('e4');
  });

  it.each([
    { expectedTransform: [] as const, preference: 'always' as const },
    {
      expectedTransform: [{ scale: 50 }] as const,
      preference: 'never' as const,
    },
  ])(
    'uses the resolved outer transform when reduced motion is $preference',
    async ({ expectedTransform, preference }) => {
      const presentation = testPresentationSharedValues();
      const rendererCalls: PieceRendererProps[] = [];
      const Renderer: PieceRenderer = (props) => {
        rendererCalls.push(props);
        return <View testID="policy-art" />;
      };
      const draggingStyle = Object.freeze<ViewStyle>({
        opacity: 0.7,
        transform: [{ scale: 50 }],
      });
      const result = await render(
        <ReducedMotionProvider preference={preference}>
          <DragOverlay
            boardId="motion-board"
            piece={{ pieceType: 'wN' }}
            presentation={presentation}
            reducedMotion={preference === 'always'}
            renderer={Renderer}
            size={40}
            source={{ kind: 'board', square: 'b1' }}
            square="b1"
            style={draggingStyle}
            testID={`overlay-${preference}`}
          />
        </ReducedMotionProvider>,
      );
      const overlay = result.getByTestId(`overlay-${preference}`, {
        includeHiddenElements: true,
      });

      expect(getAnimatedStyle(overlay)).toEqual(
        expect.objectContaining({
          opacity: 1,
          transform: [
            { translateX: 200 },
            { translateY: 160 },
            ...expectedTransform,
          ],
        }),
      );
      expect(rendererCalls).toHaveLength(1);
      expect(rendererCalls[0]?.style).toBe(draggingStyle);
      expect(rendererCalls[0]?.state).toEqual(
        expect.objectContaining({ isDragging: true }),
      );
      const artwork = result.getByTestId('policy-art', {
        includeHiddenElements: true,
      });
      if (artwork.parent === null) {
        throw new Error('Expected contained overlay piece host.');
      }
      expect(
        StyleSheet.flatten<ViewStyle>(
          artwork.parent.props['style'] as StyleProp<ViewStyle>,
        ),
      ).toEqual(
        expect.objectContaining({
          height: '100%',
          position: 'absolute',
          transform: undefined,
          transformOrigin: undefined,
          width: '100%',
        }),
      );
    },
  );
});
