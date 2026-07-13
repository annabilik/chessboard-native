import { fireEvent, render } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { Chessboard } from '../../src';
import { BoardInteractionController } from '../../src/render/board-interaction-controller';
import type { BoardGestureGeometry } from '../../src/render/board-gesture-layer';

jest.mock('../../src/render/board-interaction-controller', () => ({
  BoardInteractionController: jest.fn(() => null),
}));

const rejectMove = () => ({ status: 'rejected' as const });

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected Chessboard to render one native root.');
  }
  return result.root;
}

async function measure(
  root: TestInstance,
  width: number,
  height: number,
): Promise<void> {
  await fireEvent(root, 'layout', {
    nativeEvent: { layout: { height, width, x: 0, y: 0 } },
  });
}

function gestureGeometry(): Readonly<BoardGestureGeometry> {
  const call = jest.mocked(BoardInteractionController).mock.calls.at(-1);
  if (call === undefined) {
    throw new Error('Expected one board interaction controller.');
  }
  return call[0].geometry;
}

describe('Chessboard geometry epoch integration', () => {
  it('keeps stable mappings correlated and increments every effective mapping change', async () => {
    const result = await render(
      <Chessboard
        boardId="geometry-epoch"
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={rejectMove}
        position={{ a1: { pieceType: 'wK' } }}
      />,
    );
    await measure(rootOf(result), 200, 200);
    const first = gestureGeometry();
    expect(first).toEqual(
      expect.objectContaining({
        height: 200,
        revision: 0,
        visualSquares: ['a2', 'b2', 'a1', 'b1'],
        width: 200,
      }),
    );

    await result.rerender(
      <Chessboard
        boardId="geometry-epoch"
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={rejectMove}
        position={{ a1: { pieceType: 'wK' } }}
      />,
    );
    expect(gestureGeometry().revision).toBe(first.revision);

    await result.rerender(
      <Chessboard
        boardId="geometry-epoch"
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={rejectMove}
        orientation="black"
        position={{ a1: { pieceType: 'wK' } }}
      />,
    );
    const oriented = gestureGeometry();
    expect(oriented.revision).toBe(first.revision + 1);
    expect(oriented.visualSquares).toEqual(['b1', 'a1', 'b2', 'a2']);

    await result.rerender(
      <Chessboard
        boardId="geometry-epoch"
        dimensions={{ columns: 4, rows: 4 }}
        onMoveRequest={rejectMove}
        orientation="black"
        position={{ a1: { pieceType: 'wK' } }}
      />,
    );
    const resizedGrid = gestureGeometry();
    expect(resizedGrid.revision).toBe(oriented.revision + 1);

    await measure(rootOf(result), 240, 240);
    const measured = gestureGeometry();
    expect(measured.revision).toBe(resizedGrid.revision + 1);
    expect(measured).toEqual(
      expect.objectContaining({ height: 240, width: 240 }),
    );
  });
});
