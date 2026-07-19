import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { TestInstance } from 'test-renderer';

import { ChessboardRuntime } from '../../src/Chessboard';
import type {
  ControlledPosition,
  ControlledSelection,
  MoveIntent,
  OnMoveRequest,
  PieceInteractionContext,
  PieceRenderers,
  SquareActivationIntent,
} from '../../src';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

const BOARD_SIZE = 200;
const POINTS = Object.freeze({
  a1: Object.freeze({ x: 25, y: 125 }),
  a2: Object.freeze({ x: 25, y: 25 }),
  b1: Object.freeze({ x: 125, y: 125 }),
  b2: Object.freeze({ x: 125, y: 25 }),
});

interface TapCallbacks {
  readonly onBegin?: (event: Readonly<Record<string, unknown>>) => void;
  readonly onEnd?: (
    event: Readonly<Record<string, unknown>>,
    success: boolean,
  ) => void;
  readonly onFinalize?: (
    event: Readonly<Record<string, unknown>>,
    success: boolean,
  ) => void;
}

interface PanCallbacks {
  readonly onBegin?: (event: Readonly<Record<string, unknown>>) => void;
  readonly onFinalize?: (
    event: Readonly<Record<string, unknown>>,
    success: boolean,
  ) => void;
  readonly onStart?: (event: Readonly<Record<string, unknown>>) => void;
}

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

async function tap(
  boardId: string,
  point: Readonly<{ x: number; y: number }>,
): Promise<void> {
  const gesture = getByGestureTestId(getBoardGestureTestIds(boardId).tap);
  await act(() => {
    fireGestureHandler(gesture, [
      { state: State.BEGAN, ...point },
      { state: State.END, ...point },
    ]);
  });
}

async function flushDecisions(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function gesturePlanes(root: TestInstance): TestInstance[] {
  return root.queryAll(
    (node) =>
      node.props['accessibilityElementsHidden'] === true &&
      node.props['accessible'] === false &&
      node.props['collapsable'] === false &&
      node.props['importantForAccessibility'] === 'no-hide-descendants' &&
      node.props['pointerEvents'] === 'auto',
  );
}

function tapCallbacks(gesture: unknown): Readonly<TapCallbacks> {
  return (gesture as Readonly<{ handlers: Readonly<TapCallbacks> }>).handlers;
}

function panCallbacks(gesture: unknown): Readonly<PanCallbacks> {
  return (gesture as Readonly<{ handlers: Readonly<PanCallbacks> }>).handlers;
}

function accessibilityActionNames(root: TestInstance): string[] {
  const actions = root.props['accessibilityActions'] as
    readonly Readonly<{ name: string }>[] | undefined;
  return actions?.map(({ name }) => name) ?? [];
}

function pieceProbe(): ReactElement {
  return <View />;
}

const PIECE_RENDERERS = Object.freeze({
  token: pieceProbe,
}) satisfies PieceRenderers;

describe('public controlled selection activation', () => {
  it('[PARITY-BEHAVIOR-B33] emits one immutable touch intent from the current controlled snapshot without mutating consumer state', async () => {
    const initialPosition = Object.freeze({
      revision: 11,
      value: Object.freeze({
        a2: Object.freeze({ id: 'old-piece', pieceType: 'token' }),
      }),
    }) satisfies ControlledPosition;
    const initialSelection = Object.freeze({
      revision: 4,
      selectedSquare: null,
    }) satisfies ControlledSelection;
    const currentValue = Object.freeze({
      a2: Object.freeze({ id: 'source', pieceType: 'token' }),
      b2: Object.freeze({ id: 'current-target', pieceType: 'token' }),
    });
    const currentPosition = Object.freeze({
      revision: 12,
      value: currentValue,
    }) satisfies ControlledPosition;
    const currentSelection = Object.freeze({
      destinationSquares: Object.freeze(['b1']),
      revision: 5,
      selectedSquare: 'a2',
    }) satisfies ControlledSelection;
    const positionBefore = JSON.stringify(currentPosition);
    const selectionBefore = JSON.stringify(currentSelection);
    const intents: SquareActivationIntent[] = [];
    const result = await render(
      <ChessboardRuntime
        boardId="current-activation"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onSquareActivate={(intent) => intents.push(intent)}
        pieceRenderers={PIECE_RENDERERS}
        position={initialPosition}
        selection={initialSelection}
      />,
    );
    await measure(rootOf(result));
    await result.rerender(
      <ChessboardRuntime
        boardId="current-activation"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onSquareActivate={(intent) => intents.push(intent)}
        pieceRenderers={PIECE_RENDERERS}
        position={currentPosition}
        selection={currentSelection}
      />,
    );

    await tap('current-activation', POINTS.b2);

    expect(intents).toHaveLength(1);
    const intent = intents[0];
    if (intent === undefined) {
      throw new Error('Expected one current square activation intent.');
    }
    expect(intent).toEqual({
      action: 'activate',
      basePositionRevision: 12,
      baseSelectionRevision: 5,
      boardId: 'current-activation',
      input: 'touch',
      intentId: intent.intentId,
      isDestination: false,
      piece: { id: 'current-target', pieceType: 'token' },
      selectedSquare: 'a2',
      square: 'b2',
    });
    expect(typeof intent.intentId).toBe('string');
    expect(Object.isFrozen(intent)).toBe(true);
    expect(Object.isFrozen(intent.piece)).toBe(true);
    expect(intent.piece).not.toBe(currentValue.b2);
    expect(JSON.stringify(currentPosition)).toBe(positionBefore);
    expect(JSON.stringify(currentSelection)).toBe(selectionBefore);
    expect(currentPosition.value).toBe(currentValue);
  });

  it('[PARITY-BEHAVIOR-B27] sends a selected destination through exactly one move intent and never also emits square activation', async () => {
    const positionValue = Object.freeze({
      a2: Object.freeze({ id: 'source', pieceType: 'token' }),
      b1: Object.freeze({ id: 'target', pieceType: 'token' }),
    });
    const position = Object.freeze({
      revision: 20,
      value: positionValue,
    }) satisfies ControlledPosition;
    const selection = Object.freeze({
      destinationSquares: Object.freeze(['b1']),
      revision: 8,
      selectedSquare: 'a2',
    }) satisfies ControlledSelection;
    const positionBefore = JSON.stringify(position);
    const selectionBefore = JSON.stringify(selection);
    const moves: MoveIntent[] = [];
    const activations: SquareActivationIntent[] = [];
    const piecePresses: Readonly<PieceInteractionContext>[] = [];
    const onMoveRequest: OnMoveRequest = (intent) => {
      moves.push(intent);
      return { status: 'rejected' };
    };
    const result = await render(
      <ChessboardRuntime
        boardId="destination-route"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        onPiecePress={(context) => piecePresses.push(context)}
        onSquareActivate={(intent) => activations.push(intent)}
        pieceRenderers={PIECE_RENDERERS}
        position={position}
        selection={selection}
      />,
    );
    await measure(rootOf(result));

    await tap('destination-route', POINTS.b1);
    await flushDecisions();

    expect(moves).toHaveLength(1);
    const move = moves[0];
    if (move === undefined) {
      throw new Error('Expected one destination move intent.');
    }
    expect(move).toEqual({
      basePositionRevision: 20,
      boardId: 'destination-route',
      input: 'tap',
      intentId: move.intentId,
      piece: { id: 'source', pieceType: 'token' },
      source: { kind: 'board', square: 'a2' },
      targetSquare: 'b1',
    });
    expect(typeof move.intentId).toBe('string');
    expect(piecePresses).toEqual([]);
    expect(activations).toEqual([]);
    expect(JSON.stringify(position)).toBe(positionBefore);
    expect(JSON.stringify(selection)).toBe(selectionBefore);
    expect(position.value).toBe(positionValue);
  });

  it('[PARITY-OPTION-ON-PIECE-CLICK] routes occupied piece presses before square activation for touch and accessibility, while empty squares fall back', async () => {
    const positionValue = Object.freeze({
      a2: Object.freeze({ id: 'press-target', pieceType: 'token' }),
    });
    const piecePresses: Readonly<PieceInteractionContext>[] = [];
    const activations: SquareActivationIntent[] = [];
    const result = await render(
      <ChessboardRuntime
        boardId="piece-press-precedence"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onPiecePress={(context) => piecePresses.push(context)}
        onSquareActivate={(intent) => activations.push(intent)}
        pieceRenderers={PIECE_RENDERERS}
        position={{ revision: 31, value: positionValue }}
        selection={{ revision: 7, selectedSquare: null }}
      />,
    );
    const root = rootOf(result);
    await measure(root);

    await tap('piece-press-precedence', POINTS.a2);
    expect(piecePresses).toHaveLength(1);
    expect(activations).toEqual([]);

    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(piecePresses).toHaveLength(2);
    expect(activations).toEqual([]);

    await tap('piece-press-precedence', POINTS.a1);
    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'move-cursor-right' },
    });
    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });

    expect(piecePresses).toEqual([
      {
        basePositionRevision: 31,
        boardId: 'piece-press-precedence',
        piece: { id: 'press-target', pieceType: 'token' },
        source: { kind: 'board', square: 'a2' },
      },
      {
        basePositionRevision: 31,
        boardId: 'piece-press-precedence',
        piece: { id: 'press-target', pieceType: 'token' },
        source: { kind: 'board', square: 'a2' },
      },
    ]);
    for (const context of piecePresses) {
      expect(Object.isFrozen(context)).toBe(true);
      expect(Object.isFrozen(context.piece)).toBe(true);
      expect(Object.isFrozen(context.source)).toBe(true);
      expect(context.piece).not.toBe(positionValue.a2);
    }
    expect(activations).toHaveLength(2);
    expect(activations[0]).toEqual(
      expect.objectContaining({ input: 'touch', piece: null, square: 'a1' }),
    );
    expect(activations[1]).toEqual(
      expect.objectContaining({
        input: 'accessibility',
        piece: null,
        square: 'b2',
      }),
    );
  });

  it('keeps touch destination routing active when only accessibility move actions are disabled', async () => {
    const moves: MoveIntent[] = [];
    const activations: SquareActivationIntent[] = [];
    const result = await render(
      <ChessboardRuntime
        boardId="touch-route-with-accessibility-moves-disabled"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        interactionPermissions={{ accessibility: false }}
        onMoveRequest={(intent) => {
          moves.push(intent);
          return { status: 'rejected' };
        }}
        onSquareActivate={(intent) => activations.push(intent)}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 21,
          value: { a2: { id: 'source', pieceType: 'token' } },
        }}
        selection={{
          destinationSquares: ['b2'],
          revision: 9,
          selectedSquare: 'a2',
        }}
      />,
    );
    const root = rootOf(result);
    await measure(root);

    await tap('touch-route-with-accessibility-moves-disabled', POINTS.b2);
    await flushDecisions();
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual(
      expect.objectContaining({ input: 'tap', targetSquare: 'b2' }),
    );
    expect(activations).toEqual([]);

    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'move-cursor-right' },
    });
    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(moves).toHaveLength(1);
    expect(activations).toHaveLength(1);
    expect(activations[0]).toEqual(
      expect.objectContaining({ input: 'accessibility', square: 'b2' }),
    );
  });

  it('[PARITY-OPTION-ON-SQUARE-CLICK] reports an empty square as a null-piece activation', async () => {
    const activations: SquareActivationIntent[] = [];
    const result = await render(
      <ChessboardRuntime
        boardId="empty-square"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onSquareActivate={(intent) => activations.push(intent)}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 3,
          value: { a2: { pieceType: 'token' } },
        }}
        selection={{ revision: 2, selectedSquare: null }}
      />,
    );
    await measure(rootOf(result));

    await tap('empty-square', POINTS.a1);

    expect(activations).toHaveLength(1);
    const activation = activations[0];
    if (activation === undefined) {
      throw new Error('Expected one empty-square activation intent.');
    }
    expect(activation).toEqual({
      action: 'activate',
      basePositionRevision: 3,
      baseSelectionRevision: 2,
      boardId: 'empty-square',
      input: 'touch',
      intentId: activation.intentId,
      isDestination: false,
      piece: null,
      selectedSquare: null,
      square: 'a1',
    });
    expect(typeof activation.intentId).toBe('string');
  });

  it('ignores a tap begun before the controlled selection revision changes', async () => {
    const moves: MoveIntent[] = [];
    const activations: SquareActivationIntent[] = [];
    const onMoveRequest: OnMoveRequest = (intent) => {
      moves.push(intent);
      return { status: 'rejected' };
    };
    const renderBoard = (selection: ControlledSelection): ReactElement => (
      <ChessboardRuntime
        boardId="stale-selection"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        onSquareActivate={(intent) => activations.push(intent)}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 30,
          value: {
            a2: { id: 'first-source', pieceType: 'token' },
            b2: { id: 'second-source', pieceType: 'token' },
          },
        }}
        selection={selection}
      />
    );
    const result = await render(
      renderBoard({
        destinationSquares: ['b1'],
        revision: 12,
        selectedSquare: 'a2',
      }),
    );
    await measure(rootOf(result));
    const oldTap = getByGestureTestId(
      getBoardGestureTestIds('stale-selection').tap,
    );
    const callbacks = tapCallbacks(oldTap);
    const token = (oldTap as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;

    await act(() => {
      callbacks.onBegin?.({ handlerTag: token, ...POINTS.b1 });
    });
    await result.rerender(
      renderBoard({
        destinationSquares: ['b1'],
        revision: 13,
        selectedSquare: 'b2',
      }),
    );
    await act(() => {
      callbacks.onEnd?.({ handlerTag: token, ...POINTS.b1 }, true);
      callbacks.onFinalize?.({ handlerTag: token, ...POINTS.b1 }, true);
    });
    await flushDecisions();

    expect(moves).toEqual([]);
    expect(activations).toEqual([]);
  });

  it('falls back to square activation when a selected destination has no current source piece', async () => {
    const moves: MoveIntent[] = [];
    const activations: SquareActivationIntent[] = [];
    const onMoveRequest: OnMoveRequest = (intent) => {
      moves.push(intent);
      return { status: 'rejected' };
    };
    const result = await render(
      <ChessboardRuntime
        boardId="missing-source"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        onSquareActivate={(intent) => activations.push(intent)}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 9,
          value: { b1: { id: 'target', pieceType: 'token' } },
        }}
        selection={{
          destinationSquares: ['b1'],
          revision: 6,
          selectedSquare: 'a2',
        }}
      />,
    );
    await measure(rootOf(result));

    await tap('missing-source', POINTS.b1);

    expect(moves).toEqual([]);
    expect(activations).toHaveLength(1);
    const activation = activations[0];
    if (activation === undefined) {
      throw new Error('Expected one missing-source activation intent.');
    }
    expect(activation).toEqual({
      action: 'activate',
      basePositionRevision: 9,
      baseSelectionRevision: 6,
      boardId: 'missing-source',
      input: 'touch',
      intentId: activation.intentId,
      isDestination: true,
      piece: { id: 'target', pieceType: 'token' },
      selectedSquare: 'a2',
      square: 'b1',
    });
    expect(typeof activation.intentId).toBe('string');
  });

  it('blocks destination taps when either the target or selected source is disabled', async () => {
    for (const fixture of [
      { boardId: 'disabled-target', disabledSquares: ['b1'] },
      { boardId: 'disabled-source', disabledSquares: ['a2'] },
    ] as const) {
      const moves: MoveIntent[] = [];
      const activations: SquareActivationIntent[] = [];
      const onMoveRequest: OnMoveRequest = (intent) => {
        moves.push(intent);
        return { status: 'rejected' };
      };
      const result = await render(
        <ChessboardRuntime
          boardId={fixture.boardId}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={onMoveRequest}
          onSquareActivate={(intent) => activations.push(intent)}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 10,
            value: { a2: { id: 'source', pieceType: 'token' } },
          }}
          selection={{
            destinationSquares: ['b1'],
            disabledSquares: fixture.disabledSquares,
            revision: 7,
            selectedSquare: 'a2',
          }}
        />,
      );
      await measure(rootOf(result));

      await tap(fixture.boardId, POINTS.b1);
      await flushDecisions();

      expect(moves).toEqual([]);
      expect(activations).toEqual([]);
      await result.unmount();
    }
  });

  it('suppresses accessible activation while a physical drag owns the interaction', async () => {
    const moves: MoveIntent[] = [];
    const activations: SquareActivationIntent[] = [];
    const result = await render(
      <ChessboardRuntime
        boardId="drag-exclusive-activation"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={(intent) => {
          moves.push(intent);
          return { status: 'rejected' };
        }}
        onSquareActivate={(intent) => activations.push(intent)}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 10,
          value: { a2: { id: 'source', pieceType: 'token' } },
        }}
        selection={{
          destinationSquares: ['b1'],
          revision: 7,
          selectedSquare: 'a2',
        }}
      />,
    );
    const root = rootOf(result);
    await measure(root);
    expect(accessibilityActionNames(root)).toContain('activate');

    const pan = getByGestureTestId(
      getBoardGestureTestIds('drag-exclusive-activation').pan,
    );
    const callbacks = panCallbacks(pan);
    const handlerTag = (pan as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;
    await act(() => {
      callbacks.onBegin?.({ handlerTag, ...POINTS.a2 });
      callbacks.onStart?.({ handlerTag, ...POINTS.a2 });
    });

    expect(accessibilityActionNames(root)).not.toContain('activate');
    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(moves).toEqual([]);
    expect(activations).toEqual([]);

    await act(() => {
      callbacks.onFinalize?.({ handlerTag, ...POINTS.a2 }, false);
    });
  });

  it('mounts no tap plane when square activation is absent from an otherwise read-only board', async () => {
    const boardId = 'no-square-activation';
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 1,
          value: { a2: { pieceType: 'token' } },
        }}
      />,
    );
    await measure(rootOf(result));

    expect(gesturePlanes(rootOf(result))).toEqual([]);
    expect(() =>
      getByGestureTestId(getBoardGestureTestIds(boardId).tap),
    ).toThrow();
  });

  it('keeps square activation callbacks and intent identities isolated across mounted boards', async () => {
    const first: SquareActivationIntent[] = [];
    const second: SquareActivationIntent[] = [];
    const result = await render(
      <View>
        <ChessboardRuntime
          boardId="selection-first"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onSquareActivate={(intent) => first.push(intent)}
          pieceRenderers={PIECE_RENDERERS}
          position={{ revision: 5, value: {} }}
          selection={{ revision: 2, selectedSquare: null }}
        />
        <ChessboardRuntime
          boardId="selection-second"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onSquareActivate={(intent) => second.push(intent)}
          pieceRenderers={PIECE_RENDERERS}
          position={{ revision: 5, value: {} }}
          selection={{ revision: 2, selectedSquare: null }}
        />
      </View>,
    );
    const boards = rootOf(result).queryAll(
      (node) => node.props['accessibilityRole'] === 'adjustable',
    );
    expect(boards).toHaveLength(2);
    const firstBoard = boards[0];
    const secondBoard = boards[1];
    if (firstBoard === undefined || secondBoard === undefined) {
      throw new Error('Expected two controlled board hosts.');
    }
    await measure(firstBoard);
    await measure(secondBoard);

    await tap('selection-second', POINTS.b2);
    await tap('selection-first', POINTS.a1);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]?.boardId).toBe('selection-first');
    expect(first[0]?.square).toBe('a1');
    expect(second[0]?.boardId).toBe('selection-second');
    expect(second[0]?.square).toBe('b2');
    expect(first[0]?.intentId).not.toBe(second[0]?.intentId);
  });
});
