import { act, fireEvent, render } from '@testing-library/react-native';
import {
  State,
  type State as GestureState,
} from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { TestInstance } from 'test-renderer';

import { ChessboardRuntime } from '../../src/Chessboard';
import type {
  ControlledPosition,
  SquareActivationIntent,
  SquarePressContext,
  SquareRendererProps,
} from '../../src';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

const BOARD_SIZE = 200;
const TOP_LEFT = Object.freeze({ x: 25, y: 25 });
const BOTTOM_LEFT = Object.freeze({ x: 25, y: 125 });

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected ChessboardRuntime to render one native root.');
  }
  return result.root;
}

async function measure(root: TestInstance): Promise<void> {
  await fireEvent(root, 'layout', {
    nativeEvent: {
      layout: { height: BOARD_SIZE, width: BOARD_SIZE, x: 0, y: 0 },
    },
  });
}

function gesturePlaneCount(root: TestInstance): number {
  return root.queryAll(
    (node) =>
      node.props['accessibilityElementsHidden'] === true &&
      node.props['accessible'] === false &&
      node.props['collapsable'] === false &&
      node.props['importantForAccessibility'] === 'no-hide-descendants' &&
      node.props['pointerEvents'] === 'auto',
  ).length;
}

interface TapGestureCallbacks {
  readonly onBegin?: (event: Readonly<Record<string, number>>) => void;
  readonly onEnd?: (
    event: Readonly<Record<string, number>>,
    success: boolean,
  ) => void;
  readonly onFinalize?: (
    event: Readonly<Record<string, number>>,
    success: boolean,
  ) => void;
}

function tapGestureCallbacks(gesture: unknown): Readonly<TapGestureCallbacks> {
  return (gesture as Readonly<{ handlers: Readonly<TapGestureCallbacks> }>)
    .handlers;
}

async function press(
  gesture: Parameters<typeof fireGestureHandler>[0],
  point: Readonly<{ x: number; y: number }>,
  terminal: GestureState = State.END,
): Promise<void> {
  await act(() => {
    fireGestureHandler(gesture, [
      { state: State.BEGAN, ...point },
      { state: terminal, ...point },
    ]);
  });
}

describe('public square press callbacks', () => {
  it('[PARITY-OPTION-ON-SQUARE-MOUSE-DOWN] mounts a callback-only plane and emits one detached current occupied context', async () => {
    const piece = Object.freeze({ id: 'white-pawn', pieceType: 'wP' });
    const value = Object.freeze({ a2: piece });
    const position = Object.freeze({
      revision: 7,
      value,
    }) satisfies ControlledPosition;
    const contexts: Readonly<SquarePressContext>[] = [];
    const result = await render(
      <ChessboardRuntime
        boardId="press-in-board"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onSquarePressIn={(context) => contexts.push(context)}
        position={position}
      />,
    );
    const root = rootOf(result);
    await measure(root);

    expect(gesturePlaneCount(root)).toBe(1);
    await press(
      getByGestureTestId(getBoardGestureTestIds('press-in-board').tap),
      TOP_LEFT,
    );

    expect(contexts).toEqual([
      {
        basePositionRevision: 7,
        boardId: 'press-in-board',
        piece,
        square: 'a2',
      },
    ]);
    expect(contexts[0]?.piece).not.toBe(piece);
    expect(Object.isFrozen(contexts[0])).toBe(true);
    expect(Object.isFrozen(contexts[0]?.piece)).toBe(true);
    expect(position.value).toBe(value);
  });

  it('[PARITY-OPTION-ON-SQUARE-MOUSE-UP] emits one paired empty context when the native press cancels outside', async () => {
    const contexts: Readonly<SquarePressContext>[] = [];
    const result = await render(
      <ChessboardRuntime
        boardId="press-out-board"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onSquarePressOut={(context) => contexts.push(context)}
        position={{ revision: 8, value: {} }}
      />,
    );
    await measure(rootOf(result));

    await press(
      getByGestureTestId(getBoardGestureTestIds('press-out-board').tap),
      BOTTOM_LEFT,
      State.CANCELLED,
    );

    expect(contexts).toEqual([
      {
        basePositionRevision: 8,
        boardId: 'press-out-board',
        piece: null,
        square: 'a1',
      },
    ]);
    expect(Object.isFrozen(contexts[0])).toBe(true);
  });

  it('[PARITY-BEHAVIOR-B30] orders press-in and press-out before activation in both orientations without mutating position', async () => {
    const events: string[] = [];
    const contexts: Readonly<SquarePressContext>[] = [];
    const activations: Readonly<SquareActivationIntent>[] = [];
    const value = Object.freeze({
      a2: Object.freeze({ id: 'white-pawn', pieceType: 'wP' }),
      b1: Object.freeze({ id: 'black-knight', pieceType: 'bN' }),
    });
    const position = Object.freeze({
      revision: 9,
      value,
    }) satisfies ControlledPosition;
    const callbacks = {
      onSquareActivate: (intent: Readonly<SquareActivationIntent>): void => {
        events.push(`activate:${intent.square}`);
        activations.push(intent);
      },
      onSquarePressIn: (context: Readonly<SquarePressContext>): void => {
        events.push(`in:${context.square}`);
        contexts.push(context);
      },
      onSquarePressOut: (context: Readonly<SquarePressContext>): void => {
        events.push(`out:${context.square}`);
        contexts.push(context);
      },
    };
    const result = await render(
      <ChessboardRuntime
        boardId="press-order-board"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        {...callbacks}
        position={position}
      />,
    );
    await measure(rootOf(result));

    await press(
      getByGestureTestId(getBoardGestureTestIds('press-order-board').tap),
      TOP_LEFT,
    );
    expect(events).toEqual(['in:a2', 'out:a2', 'activate:a2']);

    await result.rerender(
      <ChessboardRuntime
        boardId="press-order-board"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        orientation="black"
        {...callbacks}
        position={position}
      />,
    );
    await press(
      getByGestureTestId(getBoardGestureTestIds('press-order-board').tap),
      TOP_LEFT,
    );

    expect(events).toEqual([
      'in:a2',
      'out:a2',
      'activate:a2',
      'in:b1',
      'out:b1',
      'activate:b1',
    ]);
    expect(contexts.map(({ square }) => square)).toEqual([
      'a2',
      'a2',
      'b1',
      'b1',
    ]);
    expect(activations.map(({ square }) => square)).toEqual(['a2', 'b1']);
    expect(position.value).toBe(value);
  });

  it('uses committed replacement handlers, rejects retained stale generations, and isolates callback errors', async () => {
    const first = jest.fn();
    const replacement = jest.fn(() => {
      throw new Error('consumer failed');
    });
    const activations = jest.fn();
    const result = await render(
      <ChessboardRuntime
        boardId="press-replacement-board"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onSquareActivate={activations}
        onSquarePressIn={first}
        onSquarePressOut={first}
        position={{ revision: 10, value: {} }}
      />,
    );
    await measure(rootOf(result));
    const retained = getByGestureTestId(
      getBoardGestureTestIds('press-replacement-board').tap,
    );

    await result.rerender(
      <ChessboardRuntime
        boardId="press-replacement-board"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onSquareActivate={activations}
        onSquarePressIn={replacement}
        onSquarePressOut={replacement}
        position={{ revision: 10, value: {} }}
      />,
    );
    await press(retained, TOP_LEFT);

    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledTimes(2);
    expect(activations).toHaveBeenCalledTimes(1);

    await result.rerender(
      <ChessboardRuntime
        boardId="press-replacement-board"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onSquareActivate={activations}
        onSquarePressIn={replacement}
        onSquarePressOut={replacement}
        position={{ revision: 11, value: {} }}
      />,
    );
    await press(retained, TOP_LEFT);

    expect(replacement).toHaveBeenCalledTimes(2);
    expect(activations).toHaveBeenCalledTimes(1);
  });

  it('clears a pressed visual while its custom square renderer is removed', async () => {
    const observed = new Map<string, boolean>();
    const renderSquare = (props: SquareRendererProps): null => {
      observed.set(props.square, props.state.isPressed);
      return null;
    };
    const callbacks = {
      onSquarePressIn: jest.fn(),
      onSquarePressOut: jest.fn(),
    };
    const common = {
      boardId: 'press-renderer-board',
      development: false,
      dimensions: { columns: 2, rows: 2 } as const,
      position: { revision: 12, value: {} },
      ...callbacks,
    };
    const result = await render(
      <ChessboardRuntime {...common} renderSquare={renderSquare} />,
    );
    await measure(rootOf(result));
    const gesture = getByGestureTestId(
      getBoardGestureTestIds('press-renderer-board').tap,
    );
    const gestureCallbacks = tapGestureCallbacks(gesture);
    const event = { handlerTag: 91, ...TOP_LEFT };

    await act(() => {
      gestureCallbacks.onBegin?.(event);
    });
    expect(observed.get('a2')).toBe(true);

    await result.rerender(<ChessboardRuntime {...common} />);
    await act(() => {
      gestureCallbacks.onEnd?.(event, true);
      gestureCallbacks.onFinalize?.(event, true);
    });
    await result.rerender(
      <ChessboardRuntime {...common} renderSquare={renderSquare} />,
    );

    expect(observed.get('a2')).toBe(false);
    expect(callbacks.onSquarePressIn).toHaveBeenCalledTimes(1);
    expect(callbacks.onSquarePressOut).toHaveBeenCalledTimes(1);
  });
});
