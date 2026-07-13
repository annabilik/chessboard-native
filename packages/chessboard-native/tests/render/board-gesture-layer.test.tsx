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
  readonly boardId?: string;
  readonly enabled?: boolean;
  readonly geometry?: Readonly<BoardGestureGeometry>;
  readonly occupiedSquares?: readonly SquareId[];
  readonly onPresentation?: (
    values: Readonly<InteractionPresentationSharedValues>,
  ) => void;
  readonly onSignal: (signal: Readonly<BoardGestureSignal>) => void;
}

function Harness({
  boardId = 'gesture-board',
  enabled,
  geometry = WHITE_GEOMETRY,
  occupiedSquares = Object.freeze(['a2']),
  onPresentation,
  onSignal,
}: HarnessProps) {
  const presentation = useInteractionPresentationSharedValues();
  onPresentation?.(presentation);
  return (
    <GestureHandlerRootView>
      <BoardGestureLayer
        boardId={boardId}
        dragEnabled={enabled ?? false}
        draggableSquares={occupiedSquares}
        geometry={geometry}
        occupiedSquares={occupiedSquares}
        onSignal={onSignal}
        positionRevision={7}
        presentation={presentation}
        tapEnabled={enabled ?? false}
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
  readonly onStart?: (event: Readonly<Record<string, unknown>>) => void;
  readonly onTouchesDown?: (
    event: Readonly<{
      allTouches: readonly Readonly<Record<string, unknown>>[];
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
        gestureToken: panToken,
        type: 'drag-start',
      }),
      expect.objectContaining({
        sourceSquare: 'a2',
        targetSquare: 'b1',
        gestureToken: panToken,
        type: 'drag-end',
      }),
    ]);
    expect(signals).toHaveLength(2);
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
    expect(signals).toEqual([
      expect.objectContaining({ gestureToken: panToken, type: 'drag-start' }),
      expect.objectContaining({ gestureToken: panToken, type: 'drag-cancel' }),
    ]);
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
    expect(fail).toHaveBeenCalledTimes(1);
    expect(signals).toEqual([
      expect.objectContaining({ gestureToken: panToken, type: 'drag-start' }),
      expect.objectContaining({
        gestureToken: panToken,
        reason: 'second-finger',
        type: 'drag-cancel',
      }),
    ]);

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

  it('[PARITY-BEHAVIOR-B28] emits one same-square occupied tap and ignores moved, outside, cancelled, and empty-source taps in both orientations', async () => {
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
      const tapToken = (tap as unknown as Readonly<{ handlerTag: number }>)
        .handlerTag;
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
          gestureToken: tapToken,
          type: 'tap',
        }),
      ]);

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
      expect(signals).toHaveLength(1);
      await result.unmount();
    }
  });
});
