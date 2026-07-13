import { act, render } from '@testing-library/react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import type { BoardGestureIntentCandidate } from '../../src/internal/board-gesture-adapter';
import type { NormalizedControlledValue } from '../../src/internal/controlled-domain';
import type { PositionObject } from '../../src/public-types';
import { BoardInteractionController } from '../../src/render/board-interaction-controller';
import {
  getBoardGestureTestIds,
  type BoardGestureGeometry,
} from '../../src/render/board-gesture-layer';

const GEOMETRY: Readonly<BoardGestureGeometry> = Object.freeze({
  columns: 2,
  height: 200,
  revision: 5,
  rows: 2,
  visualSquares: Object.freeze(['a2', 'b2', 'a1', 'b1']),
  width: 200,
});

const POSITION: PositionObject = Object.freeze({
  a2: Object.freeze({ id: 'pawn', pieceType: 'wP' }),
});

const CONTROLLED_POSITION: NormalizedControlledValue<PositionObject> =
  Object.freeze({
    revision: 9,
    tier: 'envelope',
    value: POSITION,
  });

describe('board interaction controller', () => {
  it('wires terminal native signals through the reducer adapter without changing the controlled position', async () => {
    const candidates: Readonly<BoardGestureIntentCandidate>[] = [];
    await render(
      <GestureHandlerRootView>
        <BoardInteractionController
          boardId="controller-board"
          dragEnabled
          geometry={GEOMETRY}
          onCandidate={(candidate) => {
            candidates.push(candidate);
          }}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={CONTROLLED_POSITION}
        />
      </GestureHandlerRootView>,
    );
    const pan = getByGestureTestId(
      getBoardGestureTestIds('controller-board').pan,
    );
    const gestureToken = (pan as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;

    await act(() => {
      fireGestureHandler(pan, [
        { state: State.BEGAN, x: 25, y: 25 },
        { state: State.ACTIVE, x: 35, y: 25 },
        { state: State.ACTIVE, x: 135, y: 135 },
        { state: State.END, x: 135, y: 135 },
      ]);
    });

    expect(candidates).toEqual([
      {
        basePositionRevision: 9,
        boardId: 'controller-board',
        geometryEpoch: 5,
        input: 'drag',
        piece: { id: 'pawn', pieceType: 'wP' },
        source: { kind: 'board', square: 'a2' },
        targetSquare: 'b1',
        token: gestureToken,
      },
    ]);
    expect(candidates[0]).not.toHaveProperty('intentId');
    expect(candidates[0]).not.toHaveProperty('effects');
    expect(CONTROLLED_POSITION.value).toBe(POSITION);
    expect(POSITION).toEqual({
      a2: { id: 'pawn', pieceType: 'wP' },
    });
  });

  it('turns native cancellation into cleanup without producing a candidate', async () => {
    const onCandidate = jest.fn();
    await render(
      <GestureHandlerRootView>
        <BoardInteractionController
          boardId="cancel-board"
          dragEnabled
          geometry={GEOMETRY}
          onCandidate={onCandidate}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={CONTROLLED_POSITION}
        />
      </GestureHandlerRootView>,
    );
    const pan = getByGestureTestId(getBoardGestureTestIds('cancel-board').pan);

    await act(() => {
      fireGestureHandler(pan, [
        { state: State.BEGAN, x: 25, y: 25 },
        { state: State.ACTIVE, x: 35, y: 25 },
        { state: State.CANCELLED, x: 40, y: 25 },
      ]);
    });

    expect(onCandidate).not.toHaveBeenCalled();
  });
});
