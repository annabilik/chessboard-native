import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { TestInstance } from 'test-renderer';

import type { PieceRendererProps, PieceRenderers } from '../../src';
import { Chessboard } from '../../src/react-chessboard-compat';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

const BOARD_ID = 'compat-controlled-position';
const BOARD_SIZE = 200;
const A2 = Object.freeze({ x: 12.5, y: 162.5 });
const B2 = Object.freeze({ x: 37.5, y: 162.5 });

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected the compatibility board to render.');
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

async function drag(): Promise<void> {
  const pan = getByGestureTestId(getBoardGestureTestIds(BOARD_ID).pan);
  await act(() => {
    fireGestureHandler(pan, [
      { state: State.BEGAN, ...A2 },
      { state: State.ACTIVE, x: A2.x + 5, y: A2.y },
      { state: State.ACTIVE, ...B2 },
      { state: State.END, ...B2 },
    ]);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function pieceKind(props: PieceRendererProps): string {
  if (props.state.isDragging) return 'dragging';
  if (props.state.isPending && props.state.isGhost) return 'pending-source';
  if (props.state.isPending) return 'pending-target';
  if (props.state.isGhost) return 'ghost';
  return 'static';
}

function pieceRenderer(props: PieceRendererProps): ReactElement {
  return (
    <View
      testID={`compat-piece:${pieceKind(props)}:${props.square ?? 'spare'}`}
    />
  );
}

const PIECES = Object.freeze({ token: pieceRenderer }) satisfies PieceRenderers;

function count(root: TestInstance, testID: string): number {
  return root.queryAll((node) => node.props['testID'] === testID).length;
}

describe('react-chessboard compatibility component', () => {
  it('keeps an accepted drop visual-only until the consumer publishes position', async () => {
    const onPieceDrop = jest.fn(() => true);
    const initial = Object.freeze({
      a2: Object.freeze({ pieceType: 'token' }),
    });
    const result = await render(
      <Chessboard
        options={{
          id: BOARD_ID,
          onPieceDrop,
          pieces: PIECES,
          position: initial,
          showAnimations: false,
        }}
      />,
    );
    await measure(rootOf(result));
    expect(count(rootOf(result), 'compat-piece:static:a2')).toBe(1);

    await drag();

    expect(onPieceDrop).toHaveBeenCalledTimes(1);
    expect(onPieceDrop).toHaveBeenCalledWith({
      piece: {
        isSparePiece: false,
        pieceType: 'token',
        position: 'a2',
      },
      sourceSquare: 'a2',
      targetSquare: 'b2',
    });
    expect(count(rootOf(result), 'compat-piece:static:b2')).toBe(0);

    await result.rerender(
      <Chessboard
        options={{
          id: BOARD_ID,
          onPieceDrop,
          pieces: PIECES,
          position: initial,
          showAnimations: false,
        }}
      />,
    );
    expect(count(rootOf(result), 'compat-piece:static:b2')).toBe(0);

    await result.rerender(
      <Chessboard
        options={{
          id: BOARD_ID,
          onPieceDrop,
          pieces: PIECES,
          position: Object.freeze({
            b2: Object.freeze({ pieceType: 'token' }),
          }),
          showAnimations: false,
        }}
      />,
    );
    expect(count(rootOf(result), 'compat-piece:static:b2')).toBe(1);
    expect(onPieceDrop).toHaveBeenCalledTimes(1);
  });
});
