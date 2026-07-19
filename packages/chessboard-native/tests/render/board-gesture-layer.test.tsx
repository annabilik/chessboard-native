import { act, render } from '@testing-library/react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import {
  INTERACTION_PRESENTATION_PHASE,
  useInteractionPresentationSharedValues,
  type InteractionPresentationSharedValues,
} from '../../src/internal/interaction-presentation';
import type { SquareId } from '../../src/public-types';
import {
  BoardGestureLayer,
  DEFAULT_ANNOTATION_LONG_PRESS_DURATION_MS,
  DEFAULT_DRAG_ACTIVATION_DISTANCE,
  getBoardGestureTestIds,
  type BoardGestureGeometry,
  type BoardGestureSignal,
} from '../../src/render/board-gesture-layer';

const WHITE_GEOMETRY: Readonly<BoardGestureGeometry> = Object.freeze({
  columns: 2,
  height: 200,
  revision: 3,
  rows: 2,
  visualSquares: Object.freeze(['a2', 'b2', 'a1', 'b1']),
  width: 200,
});

const BLACK_GEOMETRY: Readonly<BoardGestureGeometry> = Object.freeze({
  ...WHITE_GEOMETRY,
  revision: 4,
  visualSquares: Object.freeze(['b1', 'a1', 'b2', 'a2']),
});

interface HarnessProps {
  readonly annotationEnabled?: boolean;
  readonly annotationRevision?: number | null;
  readonly boardId?: string;
  readonly enabled?: boolean;
  readonly geometry?: Readonly<BoardGestureGeometry>;
  readonly occupiedSquares?: readonly SquareId[];
  readonly onPresentation?: (
    values: Readonly<InteractionPresentationSharedValues>,
  ) => void;
  readonly onRender?: () => void;
  readonly onSignal: (signal: Readonly<BoardGestureSignal>) => void;
  readonly selectionRevision?: number | null;
  readonly trackDragTarget?: boolean;
  readonly trackPress?: boolean;
}

function Harness({
  annotationEnabled = false,
  annotationRevision = 17,
  boardId = 'gesture-board',
  enabled,
  geometry = WHITE_GEOMETRY,
  occupiedSquares = Object.freeze(['a2']),
  onPresentation,
  onRender,
  onSignal,
  selectionRevision = 11,
  trackDragTarget = false,
  trackPress = false,
}: HarnessProps) {
  onRender?.();
  const presentation = useInteractionPresentationSharedValues();
  onPresentation?.(presentation);
  return (
    <GestureHandlerRootView>
      <BoardGestureLayer
        annotationEnabled={annotationEnabled}
        annotationRevision={annotationRevision}
        boardId={boardId}
        dragEnabled={enabled ?? false}
        draggableSquares={occupiedSquares}
        geometry={geometry}
        onSignal={onSignal}
        positionRevision={7}
        presentation={presentation}
        resetKey="test-reset"
        selectionRevision={selectionRevision}
        tapEnabled={enabled ?? false}
        trackDragTarget={trackDragTarget}
        trackPress={trackPress}
      />
    </GestureHandlerRootView>
  );
}

function gestureConfig(gesture: unknown): Readonly<Record<string, unknown>> {
  return (gesture as Readonly<{ config: Readonly<Record<string, unknown>> }>)
    .config;
}

interface GestureCallbacks {
  readonly onBegin?: (event: Readonly<Record<string, unknown>>) => void;
  readonly onFinalize?: (
    event: Readonly<Record<string, unknown>>,
    success: boolean,
  ) => void;
  readonly onEnd?: (
    event: Readonly<Record<string, unknown>>,
    success: boolean,
  ) => void;
  readonly onStart?: (event: Readonly<Record<string, unknown>>) => void;
  readonly onUpdate?: (event: Readonly<Record<string, unknown>>) => void;
  readonly onTouchesDown?: (
    event: Readonly<{
      allTouches: readonly Readonly<Record<string, unknown>>[];
    }>,
    manager: Readonly<{ fail: () => void }>,
  ) => void;
  readonly onTouchesUp?: (
    event: Readonly<{
      allTouches: readonly Readonly<Record<string, unknown>>[];
      numberOfTouches: number;
    }>,
    manager: Readonly<{ fail: () => void }>,
  ) => void;
}

function gestureCallbacks(gesture: unknown): Readonly<GestureCallbacks> {
  return (gesture as Readonly<{ handlers: Readonly<GestureCallbacks> }>)
    .handlers;
}

describe('board-level native gesture plane', () => {
  it('[PARITY-BEHAVIOR-B18] configures board-level tap/pan activation, keeps updates on shared values, cancels cleanly, and is disabled by default', async () => {
    const ids = getBoardGestureTestIds('gesture-board');
    const disabledSignal = jest.fn();
    const disabled = await render(<Harness onSignal={disabledSignal} />);
    const disabledRoot = disabled.root;
    if (disabledRoot === null) {
      throw new Error('Expected the disabled harness to remain mounted.');
    }

    expect(
      disabledRoot.queryAll(
        (node) =>
          node.props['collapsable'] === false &&
          node.props['pointerEvents'] === 'auto' &&
          node.props['accessibilityElementsHidden'] === true &&
          node.props['importantForAccessibility'] === 'no-hide-descendants',
      ),
    ).toEqual([]);
    expect(() => getByGestureTestId(ids.pan)).toThrow();
    expect(() => getByGestureTestId(ids.tap)).toThrow();
    expect(() => getByGestureTestId(ids.longPress)).toThrow();
    expect(() => getByGestureTestId(ids.twoFinger)).toThrow();
    expect(disabledSignal).not.toHaveBeenCalled();
    await disabled.unmount();

    const signals: Readonly<BoardGestureSignal>[] = [];
    const presentations: Readonly<InteractionPresentationSharedValues>[] = [];
    const enabled = await render(
      <Harness
        enabled
        onPresentation={(values) => {
          presentations.push(values);
        }}
        onSignal={(signal) => {
          signals.push(signal);
        }}
      />,
    );
    const enabledRoot = enabled.root;
    if (enabledRoot === null) {
      throw new Error('Expected the enabled harness to remain mounted.');
    }

    const planes = enabledRoot.queryAll(
      (node) =>
        node.props['collapsable'] === false &&
        node.props['pointerEvents'] === 'auto' &&
        node.props['accessibilityElementsHidden'] === true &&
        node.props['importantForAccessibility'] === 'no-hide-descendants',
    );
    expect(planes).toHaveLength(1);
    expect(planes[0]).not.toHaveProp('testID');
    const pan = getByGestureTestId(ids.pan);
    const tap = getByGestureTestId(ids.tap);
    const panToken = (pan as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;
    expect(gestureConfig(pan)['minDist']).toBe(
      DEFAULT_DRAG_ACTIVATION_DISTANCE,
    );
    expect(gestureConfig(pan)['maxPointers']).toBe(1);
    expect(gestureConfig(tap)['maxDist']).toBe(
      DEFAULT_DRAG_ACTIVATION_DISTANCE,
    );
    expect(gestureConfig(tap)['enabled']).toBe(true);

    await act(() => {
      fireGestureHandler(pan, [
        { state: State.BEGAN, x: 25, y: 25 },
        {
          state: State.ACTIVE,
          translationX: 5,
          translationY: 0,
          x: 30,
          y: 25,
        },
        {
          state: State.ACTIVE,
          translationX: 120,
          translationY: 120,
          x: 145,
          y: 145,
        },
        { state: State.END, x: 145, y: 145 },
      ]);
    });

    expect(signals).toEqual([
      expect.objectContaining({
        sourceSquare: 'a2',
        targetSquare: 'a2',
        type: 'drag-start',
      }),
      expect.objectContaining({
        sourceSquare: 'a2',
        targetSquare: 'b1',
        type: 'drag-end',
      }),
    ]);
    expect(signals).toHaveLength(2);
    const firstPanToken = signals[0]?.gestureToken;
    expect(firstPanToken).toBeDefined();
    expect(signals[1]?.gestureToken).toBe(firstPanToken);
    const mountedPresentation = presentations.at(-1);
    if (mountedPresentation === undefined) {
      throw new Error('Expected mounted interaction presentation values.');
    }
    expect(mountedPresentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.IDLE,
    );
    expect(mountedPresentation.sourceSquare.value).toBeNull();
    expect(mountedPresentation.targetSquare.value).toBeNull();
    expect(mountedPresentation.pointerX.value).toBe(0);
    expect(mountedPresentation.pointerY.value).toBe(0);

    signals.length = 0;
    await act(() => {
      fireGestureHandler(pan, [
        { state: State.BEGAN, x: 25, y: 25 },
        { state: State.ACTIVE, x: 35, y: 25 },
        { state: State.CANCELLED, x: 40, y: 25 },
      ]);
    });
    const secondPanToken = signals[0]?.gestureToken;
    expect(signals).toEqual([
      expect.objectContaining({
        gestureToken: secondPanToken,
        type: 'drag-start',
      }),
      expect.objectContaining({
        gestureToken: secondPanToken,
        type: 'drag-cancel',
      }),
    ]);
    expect(secondPanToken).not.toBe(firstPanToken);
    expect(mountedPresentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.IDLE,
    );

    signals.length = 0;
    const fail = jest.fn();
    const callbacks = gestureCallbacks(pan);
    await act(() => {
      callbacks.onBegin?.({ handlerTag: panToken, x: 25, y: 25 });
      callbacks.onStart?.({ handlerTag: panToken, x: 30, y: 25 });
      callbacks.onTouchesDown?.(
        {
          allTouches: [
            { x: 30, y: 25 },
            { x: 35, y: 30 },
          ],
        },
        { fail },
      );
      callbacks.onFinalize?.({ handlerTag: panToken, x: 35, y: 30 }, false);
    });
    const thirdPanToken = signals[0]?.gestureToken;
    expect(fail).toHaveBeenCalledTimes(1);
    expect(signals).toEqual([
      expect.objectContaining({
        gestureToken: thirdPanToken,
        type: 'drag-start',
      }),
      expect.objectContaining({
        gestureToken: thirdPanToken,
        reason: 'second-finger',
        type: 'drag-cancel',
      }),
    ]);
    expect(thirdPanToken).not.toBe(secondPanToken);

    signals.length = 0;
    await act(() => {
      fireGestureHandler(pan, [
        { state: State.BEGAN, x: 25, y: 25 },
        { state: State.ACTIVE, x: 35, y: 25 },
        { state: State.END, x: 145, y: 145 },
      ]);
    });
    expect(signals).toEqual([
      expect.objectContaining({ type: 'drag-start' }),
      expect.objectContaining({ targetSquare: 'b1', type: 'drag-end' }),
    ]);
  });

  it('keeps 100 continuous pan updates on shared values without per-update JS signals or React renders', async () => {
    const onRender = jest.fn();
    const onSignal = jest.fn<undefined, [signal: Readonly<BoardGestureSignal>]>(
      () => undefined,
    );
    const presentation: {
      current: Readonly<InteractionPresentationSharedValues> | null;
    } = { current: null };
    await render(
      <Harness
        enabled
        onPresentation={(values) => {
          presentation.current = values;
        }}
        onRender={onRender}
        onSignal={onSignal}
      />,
    );
    const pan = getByGestureTestId(getBoardGestureTestIds('gesture-board').pan);
    const callbacks = gestureCallbacks(pan);
    const handlerTag = (pan as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;

    await act(() => {
      callbacks.onBegin?.({
        absoluteX: 125,
        absoluteY: 225,
        handlerTag,
        x: 25,
        y: 25,
      });
      callbacks.onStart?.({
        absoluteX: 130,
        absoluteY: 225,
        handlerTag,
        x: 30,
        y: 25,
      });
    });
    expect(onSignal).toHaveBeenCalledTimes(1);
    expect(onSignal).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'drag-start' }),
    );
    const rendersAfterStart = onRender.mock.calls.length;

    await act(() => {
      for (let index = 0; index < 100; index += 1) {
        callbacks.onUpdate?.({
          absoluteX: 131 + index,
          absoluteY: 226 + index,
          handlerTag,
          x: 31 + index,
          y: 26 + index,
        });
      }
    });

    expect(onSignal).toHaveBeenCalledTimes(1);
    expect(onRender).toHaveBeenCalledTimes(rendersAfterStart);
    const currentPresentation = presentation.current;
    if (currentPresentation === null) {
      throw new Error('Expected interaction presentation shared values.');
    }
    expect(currentPresentation.pointerX.value).toBe(130);
    expect(currentPresentation.pointerY.value).toBe(125);
    expect(currentPresentation.pointerWindowX.value).toBe(230);
    expect(currentPresentation.pointerWindowY.value).toBe(325);
    expect(currentPresentation.targetSquare.value).toBe('b1');

    await act(() => {
      callbacks.onEnd?.(
        {
          absoluteX: 230,
          absoluteY: 325,
          handlerTag,
          x: 130,
          y: 125,
        },
        true,
      );
      callbacks.onFinalize?.(
        {
          absoluteX: 230,
          absoluteY: 325,
          handlerTag,
          x: 130,
          y: 125,
        },
        true,
      );
    });
    expect(onSignal).toHaveBeenCalledTimes(2);
    expect(onSignal).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetSquare: 'b1', type: 'drag-end' }),
    );
  });

  it('emits drag-target only when the canonical hover square changes', async () => {
    const signals: Readonly<BoardGestureSignal>[] = [];
    await render(
      <Harness
        enabled
        onSignal={(signal) => {
          signals.push(signal);
        }}
        trackDragTarget
      />,
    );
    const pan = getByGestureTestId(getBoardGestureTestIds('gesture-board').pan);
    const callbacks = gestureCallbacks(pan);
    const handlerTag = (pan as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;

    await act(() => {
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onStart?.({ handlerTag, x: 30, y: 25 });
      callbacks.onUpdate?.({ handlerTag, x: 35, y: 30 });
      callbacks.onUpdate?.({ handlerTag, x: 125, y: 25 });
      callbacks.onUpdate?.({ handlerTag, x: 150, y: 50 });
      callbacks.onUpdate?.({ handlerTag, x: 225, y: 25 });
      callbacks.onUpdate?.({ handlerTag, x: 225, y: 75 });
      callbacks.onUpdate?.({ handlerTag, x: 125, y: 125 });
      callbacks.onEnd?.({ handlerTag, x: 125, y: 125 }, true);
      callbacks.onFinalize?.({ handlerTag, x: 125, y: 125 }, true);
    });

    expect(signals.map((signal) => signal.type)).toEqual([
      'drag-start',
      'drag-target',
      'drag-target',
      'drag-target',
      'drag-end',
    ]);
    expect(
      signals
        .filter((signal) => signal.type === 'drag-target')
        .map((signal) => signal.targetSquare),
    ).toEqual(['b2', null, 'b1']);
    expect(
      new Set(signals.map((signal) => signal.gestureToken)),
    ).toHaveProperty('size', 1);
  });

  it('emits correlated press state without enabling activation', async () => {
    const signals: Readonly<BoardGestureSignal>[] = [];
    await render(
      <Harness
        enabled={false}
        onSignal={(signal) => {
          signals.push(signal);
        }}
        trackPress
      />,
    );
    const ids = getBoardGestureTestIds('gesture-board');
    expect(gestureConfig(getByGestureTestId(ids.pan))['enabled']).toBe(false);
    const tap = getByGestureTestId(ids.tap);

    await act(() => {
      fireGestureHandler(tap, [
        { state: State.BEGAN, x: 25, y: 25 },
        { state: State.END, x: 25, y: 25 },
      ]);
      fireGestureHandler(tap, [
        { state: State.BEGAN, x: 125, y: 25 },
        { state: State.CANCELLED, x: 125, y: 25 },
      ]);
    });

    expect(signals.map((signal) => signal.type)).toEqual([
      'press-start',
      'press-end',
      'press-start',
      'press-end',
    ]);
    expect(signals).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'tap' })]),
    );
    expect(signals[0]).toEqual(
      expect.objectContaining({ sourceSquare: 'a2', type: 'press-start' }),
    );
    expect(signals[1]?.gestureToken).toBe(signals[0]?.gestureToken);
    expect(signals[2]).toEqual(
      expect.objectContaining({ sourceSquare: 'b2', type: 'press-start' }),
    );
    expect(signals[3]?.gestureToken).toBe(signals[2]?.gestureToken);
  });

  it('[PARITY-BEHAVIOR-B28] emits same-square occupied and empty activation while ignoring moved, outside, and cancelled taps in both orientations', async () => {
    for (const fixture of [
      {
        geometry: WHITE_GEOMETRY,
        occupied: Object.freeze(['a2']),
        point: Object.freeze({ x: 25, y: 25 }),
      },
      {
        geometry: BLACK_GEOMETRY,
        occupied: Object.freeze(['a2']),
        point: Object.freeze({ x: 125, y: 125 }),
      },
    ] as const) {
      const signals: Readonly<BoardGestureSignal>[] = [];
      const result = await render(
        <Harness
          enabled
          geometry={fixture.geometry}
          occupiedSquares={fixture.occupied}
          onSignal={(signal) => {
            signals.push(signal);
          }}
        />,
      );
      const tap = getByGestureTestId(
        getBoardGestureTestIds('gesture-board').tap,
      );
      await act(() => {
        fireGestureHandler(tap, [
          { state: State.BEGAN, ...fixture.point },
          { state: State.END, ...fixture.point },
        ]);
      });
      expect(signals).toEqual([
        expect.objectContaining({
          sourceSquare: 'a2',
          targetSquare: 'a2',
          annotationRevision: 17,
          selectionRevision: 11,
          type: 'tap',
        }),
      ]);
      const firstTapToken = signals[0]?.gestureToken;

      await act(() => {
        fireGestureHandler(tap, [
          { state: State.BEGAN, ...fixture.point },
          { state: State.END, x: 175, y: 25 },
        ]);
        fireGestureHandler(tap, [
          { state: State.BEGAN, ...fixture.point },
          { state: State.END, x: 200, y: 200 },
        ]);
        fireGestureHandler(tap, [
          { state: State.BEGAN, ...fixture.point },
          { state: State.CANCELLED, ...fixture.point },
        ]);
        fireGestureHandler(tap, [
          { state: State.BEGAN, x: 175, y: 25 },
          { state: State.END, x: 175, y: 25 },
        ]);
      });
      expect(signals).toEqual([
        expect.objectContaining({
          sourceSquare: 'a2',
          annotationRevision: 17,
          selectionRevision: 11,
          targetSquare: 'a2',
          type: 'tap',
        }),
        expect.objectContaining({
          selectionRevision: 11,
          sourceSquare: fixture.geometry === WHITE_GEOMETRY ? 'b2' : 'a1',
          annotationRevision: 17,
          targetSquare: fixture.geometry === WHITE_GEOMETRY ? 'b2' : 'a1',
          type: 'tap',
        }),
      ]);
      expect(signals[1]?.gestureToken).not.toBe(firstTapToken);
      await result.unmount();
    }
  });

  it('fails a tap that gains a second pointer before a retained terminal callback can emit', async () => {
    const signals: Readonly<BoardGestureSignal>[] = [];
    await render(
      <Harness
        enabled
        onSignal={(signal) => {
          signals.push(signal);
        }}
      />,
    );
    const tap = getByGestureTestId(getBoardGestureTestIds('gesture-board').tap);
    const callbacks = gestureCallbacks(tap);
    const handlerTag = (tap as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;
    const fail = jest.fn();

    await act(() => {
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onTouchesDown?.(
        {
          allTouches: [
            { x: 25, y: 25 },
            { x: 30, y: 25 },
          ],
        },
        { fail },
      );
      callbacks.onEnd?.({ handlerTag, x: 25, y: 25 }, true);
      callbacks.onFinalize?.({ handlerTag, x: 25, y: 25 }, false);
    });

    expect(fail).toHaveBeenCalledTimes(1);
    expect(signals).toEqual([]);
  });

  it('captures the committed selection revision and invalidates a tap that spans a selection commit', async () => {
    const signals: Readonly<BoardGestureSignal>[] = [];
    const result = await render(
      <Harness
        enabled
        onSignal={(signal) => {
          signals.push(signal);
        }}
        selectionRevision={12}
      />,
    );
    const tap = getByGestureTestId(getBoardGestureTestIds('gesture-board').tap);
    const callbacks = gestureCallbacks(tap);
    const tapToken = (tap as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;

    await act(() => {
      callbacks.onBegin?.({ handlerTag: tapToken, x: 25, y: 25 });
    });
    await result.rerender(
      <Harness
        enabled
        onSignal={(signal) => {
          signals.push(signal);
        }}
        selectionRevision={13}
      />,
    );
    await act(() => {
      callbacks.onEnd?.({ handlerTag: tapToken, x: 25, y: 25 }, true);
      callbacks.onFinalize?.({ handlerTag: tapToken, x: 25, y: 25 }, true);
    });
    expect(signals).toEqual([]);

    const currentTap = getByGestureTestId(
      getBoardGestureTestIds('gesture-board').tap,
    );
    await act(() => {
      fireGestureHandler(currentTap, [
        { state: State.BEGAN, x: 25, y: 25 },
        { state: State.END, x: 25, y: 25 },
      ]);
    });
    expect(signals).toEqual([
      expect.objectContaining({
        annotationRevision: 17,
        selectionRevision: 13,
        type: 'tap',
      }),
    ]);
  });

  it('preserves press correlation while invalidating activation across a selection commit', async () => {
    const signals: Readonly<BoardGestureSignal>[] = [];
    const result = await render(
      <Harness
        enabled
        onSignal={(signal) => {
          signals.push(signal);
        }}
        selectionRevision={12}
        trackPress
      />,
    );
    const tap = getByGestureTestId(getBoardGestureTestIds('gesture-board').tap);
    const callbacks = gestureCallbacks(tap);
    const handlerTag = (tap as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;

    await act(() => {
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
    });
    await result.rerender(
      <Harness
        enabled
        onSignal={(signal) => {
          signals.push(signal);
        }}
        selectionRevision={13}
        trackPress
      />,
    );
    await act(() => {
      callbacks.onEnd?.({ handlerTag, x: 25, y: 25 }, true);
      callbacks.onFinalize?.({ handlerTag, x: 25, y: 25 }, true);
    });

    expect(signals.map((signal) => signal.type)).toEqual([
      'press-start',
      'press-end',
    ]);
    expect(signals[1]?.gestureToken).toBe(signals[0]?.gestureToken);
  });

  it('configures long-press and two-finger annotation pans on the existing single plane', async () => {
    const result = await render(
      <Harness annotationEnabled onSignal={() => undefined} />,
    );
    const root = result.root;
    if (root === null) {
      throw new Error('Expected the annotation harness to remain mounted.');
    }
    const ids = getBoardGestureTestIds('gesture-board');
    const planes = root.queryAll(
      (node) =>
        node.props['collapsable'] === false &&
        node.props['pointerEvents'] === 'auto' &&
        node.props['accessibilityElementsHidden'] === true,
    );
    expect(planes).toHaveLength(1);

    const longPress = getByGestureTestId(ids.longPress);
    const twoFinger = getByGestureTestId(ids.twoFinger);
    expect(gestureConfig(longPress)).toEqual(
      expect.objectContaining({
        activateAfterLongPress: DEFAULT_ANNOTATION_LONG_PRESS_DURATION_MS,
        enabled: true,
        maxPointers: 1,
        minPointers: 1,
      }),
    );
    expect(gestureConfig(twoFinger)).toEqual(
      expect.objectContaining({
        avgTouches: true,
        enabled: true,
        maxPointers: 2,
        minDist: DEFAULT_DRAG_ACTIVATION_DISTANCE,
        minPointers: 2,
      }),
    );
  });

  it('preserves quick one-finger piece pan and tap signals while annotation producers are enabled', async () => {
    const signals: Readonly<BoardGestureSignal>[] = [];
    await render(
      <Harness
        annotationEnabled
        enabled
        onSignal={(signal) => {
          signals.push(signal);
        }}
      />,
    );
    const ids = getBoardGestureTestIds('gesture-board');
    const pan = getByGestureTestId(ids.pan);
    const tap = getByGestureTestId(ids.tap);

    await act(() => {
      fireGestureHandler(pan, [
        { state: State.BEGAN, x: 25, y: 25 },
        { state: State.ACTIVE, x: 35, y: 25 },
        { state: State.END, x: 125, y: 125 },
      ]);
      fireGestureHandler(tap, [
        { state: State.BEGAN, x: 25, y: 25 },
        { state: State.END, x: 25, y: 25 },
      ]);
    });

    expect(signals.map((signal) => signal.type)).toEqual([
      'drag-start',
      'drag-end',
      'tap',
    ]);
    expect(signals[2]).toEqual(
      expect.objectContaining({ annotationRevision: 17, type: 'tap' }),
    );
  });

  it('captures a newly committed annotation revision at tap begin without rebuilding the detector', async () => {
    const signals: Readonly<BoardGestureSignal>[] = [];
    const onSignal = (signal: Readonly<BoardGestureSignal>): void => {
      signals.push(signal);
    };
    const result = await render(
      <Harness enabled annotationRevision={40} onSignal={onSignal} />,
    );
    const ids = getBoardGestureTestIds('gesture-board');
    const tap = getByGestureTestId(ids.tap);
    const callbacks = gestureCallbacks(tap);
    const handlerTag = (tap as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;

    await result.rerender(
      <Harness enabled annotationRevision={41} onSignal={onSignal} />,
    );
    expect(getByGestureTestId(ids.tap)).toBe(tap);
    await act(() => {
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onEnd?.({ handlerTag, x: 25, y: 25 }, true);
      callbacks.onFinalize?.({ handlerTag, x: 25, y: 25 }, true);
    });

    expect(signals).toEqual([
      expect.objectContaining({ annotationRevision: 41, type: 'tap' }),
    ]);
  });

  it('emits long-press updates only when the hit-tested target changes and captures the current annotation revision at begin', async () => {
    const signals: Readonly<BoardGestureSignal>[] = [];
    const onSignal = (signal: Readonly<BoardGestureSignal>): void => {
      signals.push(signal);
    };
    const result = await render(
      <Harness annotationEnabled annotationRevision={20} onSignal={onSignal} />,
    );
    const ids = getBoardGestureTestIds('gesture-board');
    const longPress = getByGestureTestId(ids.longPress);
    const callbacks = gestureCallbacks(longPress);
    const handlerTag = (
      longPress as unknown as Readonly<{ handlerTag: number }>
    ).handlerTag;

    await result.rerender(
      <Harness annotationEnabled annotationRevision={21} onSignal={onSignal} />,
    );
    expect(getByGestureTestId(ids.longPress)).toBe(longPress);

    await act(() => {
      callbacks.onTouchesDown?.(
        { allTouches: [{ x: 25, y: 25 }] },
        { fail: jest.fn() },
      );
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onStart?.({ handlerTag, x: 25, y: 25 });
      for (let index = 0; index < 40; index += 1) {
        callbacks.onUpdate?.({ handlerTag, x: 25 + index, y: 25 });
      }
      callbacks.onUpdate?.({ handlerTag, x: 125, y: 25 });
      for (let index = 0; index < 40; index += 1) {
        callbacks.onUpdate?.({ handlerTag, x: 125 + index / 10, y: 25 });
      }
      callbacks.onUpdate?.({ handlerTag, x: 225, y: 25 });
      callbacks.onUpdate?.({ handlerTag, x: 225, y: 26 });
      callbacks.onUpdate?.({ handlerTag, x: 125, y: 125 });
      callbacks.onEnd?.({ handlerTag, x: 125, y: 125 }, true);
      callbacks.onFinalize?.({ handlerTag, x: 125, y: 125 }, true);
    });

    const longPressToken = signals[0]?.gestureToken;
    expect(typeof longPressToken).toBe('number');
    expect(signals).toEqual([
      {
        annotationRevision: 21,
        boardId: 'gesture-board',
        geometryRevision: 3,
        gestureKind: 'long-press',
        gestureToken: longPressToken,
        positionRevision: 7,
        sourceSquare: 'a2',
        targetSquare: 'a2',
        type: 'annotation-start',
      },
      expect.objectContaining({
        annotationRevision: 21,
        gestureKind: 'long-press',
        targetSquare: 'b2',
        type: 'annotation-update',
      }),
      expect.objectContaining({
        annotationRevision: 21,
        gestureKind: 'long-press',
        targetSquare: null,
        type: 'annotation-update',
      }),
      expect.objectContaining({
        annotationRevision: 21,
        gestureKind: 'long-press',
        targetSquare: 'b1',
        type: 'annotation-update',
      }),
      expect.objectContaining({
        annotationRevision: 21,
        gestureKind: 'long-press',
        targetSquare: 'b1',
        type: 'annotation-end',
      }),
    ]);
    const tokens = new Set(signals.map((signal) => signal.gestureToken));
    expect(tokens.size).toBe(1);
  });

  it('cancels and then reuses the two-finger producer with averaged source correlation', async () => {
    const signals: Readonly<BoardGestureSignal>[] = [];
    await render(
      <Harness
        annotationEnabled
        annotationRevision={31}
        onSignal={(signal) => {
          signals.push(signal);
        }}
      />,
    );
    const twoFinger = getByGestureTestId(
      getBoardGestureTestIds('gesture-board').twoFinger,
    );
    const callbacks = gestureCallbacks(twoFinger);
    const handlerTag = (
      twoFinger as unknown as Readonly<{ handlerTag: number }>
    ).handlerTag;

    await act(() => {
      callbacks.onTouchesDown?.(
        {
          allTouches: [
            { x: 20, y: 20 },
            { x: 30, y: 30 },
          ],
        },
        { fail: jest.fn() },
      );
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onStart?.({ handlerTag, x: 25, y: 25 });
      callbacks.onUpdate?.({
        handlerTag,
        numberOfPointers: 2,
        x: 125,
        y: 25,
      });
      callbacks.onFinalize?.({ handlerTag, x: 125, y: 25 }, false);
    });
    const cancelledToken = signals[0]?.gestureToken;
    expect(signals).toEqual([
      expect.objectContaining({
        annotationRevision: 31,
        gestureKind: 'two-finger',
        sourceSquare: 'a2',
        targetSquare: 'a2',
        type: 'annotation-start',
      }),
      expect.objectContaining({
        gestureToken: cancelledToken,
        targetSquare: 'b2',
        type: 'annotation-update',
      }),
      expect.objectContaining({
        gestureToken: cancelledToken,
        reason: 'user',
        targetSquare: 'b2',
        type: 'annotation-cancel',
      }),
    ]);

    signals.length = 0;
    await act(() => {
      callbacks.onTouchesDown?.(
        {
          allTouches: [
            { x: 20, y: 20 },
            { x: 30, y: 30 },
          ],
        },
        { fail: jest.fn() },
      );
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onStart?.({ handlerTag, x: 25, y: 25 });
      callbacks.onUpdate?.({
        handlerTag,
        numberOfPointers: 2,
        x: 125,
        y: 125,
      });
      callbacks.onEnd?.({ handlerTag, x: 175, y: 25 }, true);
      callbacks.onFinalize?.({ handlerTag, x: 125, y: 125 }, true);
    });
    const reusedToken = signals[0]?.gestureToken;
    expect(reusedToken).not.toBe(cancelledToken);
    expect(signals).toEqual([
      expect.objectContaining({
        gestureToken: reusedToken,
        sourceSquare: 'a2',
        type: 'annotation-start',
      }),
      expect.objectContaining({
        gestureToken: reusedToken,
        targetSquare: 'b1',
        type: 'annotation-update',
      }),
      expect.objectContaining({
        gestureToken: reusedToken,
        targetSquare: 'b1',
        type: 'annotation-end',
      }),
    ]);
  });

  it('finishes at the cached two-touch centroid when Android fails the normal first-pointer release', async () => {
    const signals: Readonly<BoardGestureSignal>[] = [];
    await render(
      <Harness
        annotationEnabled
        annotationRevision={32}
        onSignal={(signal) => {
          signals.push(signal);
        }}
      />,
    );
    const twoFinger = getByGestureTestId(
      getBoardGestureTestIds('gesture-board').twoFinger,
    );
    const callbacks = gestureCallbacks(twoFinger);
    const handlerTag = (
      twoFinger as unknown as Readonly<{ handlerTag: number }>
    ).handlerTag;
    await act(() => {
      callbacks.onTouchesDown?.(
        {
          allTouches: [
            { x: 20, y: 20 },
            { x: 30, y: 30 },
          ],
        },
        { fail: jest.fn() },
      );
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onStart?.({ handlerTag, x: 25, y: 25 });
      callbacks.onUpdate?.({
        handlerTag,
        numberOfPointers: 2,
        x: 125,
        y: 25,
      });
      callbacks.onTouchesUp?.(
        {
          allTouches: [
            { x: 125, y: 25 },
            { x: 175, y: 25 },
          ],
          numberOfTouches: 1,
        },
        { fail: jest.fn() },
      );
      callbacks.onFinalize?.({ handlerTag, x: 175, y: 25 }, false);
    });

    expect(signals).toEqual([
      expect.objectContaining({
        annotationRevision: 32,
        sourceSquare: 'a2',
        targetSquare: 'a2',
        type: 'annotation-start',
      }),
      expect.objectContaining({
        targetSquare: 'b2',
        type: 'annotation-update',
      }),
      expect.objectContaining({
        targetSquare: 'b2',
        type: 'annotation-end',
      }),
    ]);
    expect(signals.some((signal) => signal.type === 'annotation-cancel')).toBe(
      false,
    );
  });
});
