import { act, render } from '@testing-library/react-native';

import type { BoardGestureIntentCandidate } from '../../src/internal/board-gesture-adapter';
import type { NormalizedControlledValue } from '../../src/internal/controlled-domain';
import type { PositionObject } from '../../src/public-types';
import { BoardInteractionController } from '../../src/render/board-interaction-controller';
import {
  BoardGestureLayer,
  type BoardGestureGeometry,
  type BoardGestureSignal,
} from '../../src/render/board-gesture-layer';

jest.mock('../../src/render/board-gesture-layer', () => ({
  BoardGestureLayer: jest.fn(() => null),
}));

const POSITION: PositionObject = Object.freeze({
  a2: Object.freeze({ id: 'pawn', pieceType: 'wP' }),
});

function controlledPosition(
  revision: number,
): NormalizedControlledValue<PositionObject> {
  return Object.freeze({ revision, tier: 'envelope', value: POSITION });
}

function geometry(revision: number): Readonly<BoardGestureGeometry> {
  return Object.freeze({
    columns: 2,
    height: 200,
    revision,
    rows: 2,
    visualSquares: Object.freeze(['a2', 'b2', 'a1', 'b1']),
    width: 200,
  });
}

function dragSignal(options: {
  readonly geometryRevision?: number;
  readonly gestureToken: number;
  readonly positionRevision?: number;
  readonly targetSquare?: 'a2' | 'b1';
  readonly type: 'drag-start' | 'drag-end';
}): Readonly<BoardGestureSignal> {
  return Object.freeze({
    boardId: 'race-board',
    geometryRevision: options.geometryRevision ?? 5,
    gestureToken: options.gestureToken,
    pointerX: options.targetSquare === 'b1' ? 150 : 50,
    pointerY: options.targetSquare === 'b1' ? 150 : 50,
    positionRevision: options.positionRevision ?? 9,
    sourceSquare: 'a2',
    targetSquare: options.targetSquare ?? 'a2',
    type: options.type,
  });
}

type GestureLayerProps = Parameters<typeof BoardGestureLayer>[0];

function currentSignalHandler(): GestureLayerProps['onSignal'] {
  const call = jest.mocked(BoardGestureLayer).mock.calls.at(-1);
  if (call === undefined) {
    throw new Error('Expected one board gesture layer.');
  }
  return call[0].onSignal;
}

describe('board interaction controller races', () => {
  it('rejects a replaced handler terminal by exact native token', async () => {
    const candidates: Readonly<BoardGestureIntentCandidate>[] = [];
    await render(
      <BoardInteractionController
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onCandidate={(candidate) => {
          candidates.push(candidate);
        }}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    const signal = currentSignalHandler();

    await act(() => {
      signal(dragSignal({ gestureToken: 101, type: 'drag-start' }));
      signal(dragSignal({ gestureToken: 202, type: 'drag-start' }));
      signal(
        dragSignal({
          gestureToken: 101,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });
    expect(candidates).toEqual([]);

    await act(() => {
      signal(
        dragSignal({
          gestureToken: 202,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });
    expect(candidates).toEqual([
      expect.objectContaining({ targetSquare: 'b1', token: 202 }),
    ]);
  });

  it('makes retained terminal callbacks inert after disable, geometry, and position commits', async () => {
    const onCandidate = jest.fn();
    const result = await render(
      <BoardInteractionController
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onCandidate={onCandidate}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    const retainedSignal = currentSignalHandler();

    await act(() => {
      retainedSignal(dragSignal({ gestureToken: 1, type: 'drag-start' }));
    });
    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        dragEnabled={false}
        geometry={geometry(5)}
        onCandidate={onCandidate}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    await act(() => {
      retainedSignal(
        dragSignal({
          gestureToken: 1,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });

    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onCandidate={onCandidate}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    const geometrySignal = currentSignalHandler();
    await act(() => {
      geometrySignal(dragSignal({ gestureToken: 2, type: 'drag-start' }));
    });
    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        dragEnabled
        geometry={geometry(6)}
        onCandidate={onCandidate}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    await act(() => {
      geometrySignal(
        dragSignal({
          gestureToken: 2,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });

    const positionSignal = currentSignalHandler();
    await act(() => {
      positionSignal(
        dragSignal({
          geometryRevision: 6,
          gestureToken: 3,
          type: 'drag-start',
        }),
      );
    });
    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        dragEnabled
        geometry={geometry(6)}
        onCandidate={onCandidate}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(10)}
      />,
    );
    await act(() => {
      positionSignal(
        dragSignal({
          geometryRevision: 6,
          gestureToken: 3,
          positionRevision: 9,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });

    expect(onCandidate).not.toHaveBeenCalled();
  });
});
