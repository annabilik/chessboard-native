import { act, render } from '@testing-library/react-native';
import { startTransition, Suspense, useState, type ReactElement } from 'react';

import { ChessboardProvider } from '../../src/ChessboardProvider';
import type { BoardGestureIntentCandidate } from '../../src/internal/board-gesture-adapter';
import type { NormalizedControlledValue } from '../../src/internal/controlled-domain';
import {
  useChessboardProvider,
  type ChessboardProviderRuntime,
} from '../../src/internal/provider-context';
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

function tapSignal(options: {
  readonly geometryRevision?: number;
  readonly gestureToken: number;
  readonly positionRevision?: number;
  readonly selectionRevision?: number | null;
  readonly square?: 'a2' | 'b2';
}): Readonly<BoardGestureSignal> {
  const square = options.square ?? 'b2';
  return Object.freeze({
    annotationRevision: null,
    boardId: 'race-board',
    geometryRevision: options.geometryRevision ?? 5,
    gestureToken: options.gestureToken,
    positionRevision: options.positionRevision ?? 9,
    selectionRevision:
      options.selectionRevision === undefined ? 3 : options.selectionRevision,
    sourceSquare: square,
    targetSquare: square,
    type: 'tap',
  });
}

function dragTargetSignal(options: {
  readonly gestureToken: number;
  readonly targetSquare: 'a2' | 'b1' | null;
}): Readonly<BoardGestureSignal> {
  return Object.freeze({
    boardId: 'race-board',
    geometryRevision: 5,
    gestureToken: options.gestureToken,
    positionRevision: 9,
    sourceSquare: 'a2',
    targetSquare: options.targetSquare,
    type: 'drag-target',
  });
}

function pressSignal(options: {
  readonly gestureToken: number;
  readonly positionRevision?: number;
  readonly type: 'press-start' | 'press-end';
}): Readonly<BoardGestureSignal> {
  return Object.freeze({
    boardId: 'race-board',
    geometryRevision: 5,
    gestureToken: options.gestureToken,
    positionRevision: options.positionRevision ?? 9,
    sourceSquare: 'a2',
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
  it('publishes only correlated drag-target boundaries to the provider lease', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    function RuntimeProbe(): null {
      runtime.current = useChessboardProvider().runtime;
      return null;
    }

    await render(
      <ChessboardProvider>
        <RuntimeProbe />
        <BoardInteractionController
          boardId="race-board"
          dragEnabled
          draggingPieceGhostStyle={{ opacity: 0.25 }}
          draggingPieceStyle={{ transform: [{ scale: 1.15 }] }}
          geometry={geometry(5)}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(9)}
        />
      </ChessboardProvider>,
    );
    const signal = currentSignalHandler();

    await act(() => {
      signal(dragSignal({ gestureToken: 71, type: 'drag-start' }));
      signal(dragTargetSignal({ gestureToken: 71, targetSquare: 'b1' }));
      signal(dragTargetSignal({ gestureToken: 70, targetSquare: null }));
    });

    if (runtime.current === null) {
      throw new Error('Expected the provider runtime probe to commit.');
    }
    const active = runtime.current.drag.getSnapshot().active;
    expect(active).toEqual(
      expect.objectContaining({
        boardId: 'race-board',
        gestureToken: 71,
        sourceGhostStyle: { opacity: 0.25 },
        style: { transform: [{ scale: 1.15 }] },
        targetSquare: 'b1',
      }),
    );
  });

  it('clears only the current correlated press and invalidates it on a position commit', async () => {
    const onPressedSquareChange = jest.fn();
    const result = await render(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onPressedSquareChange={onPressedSquareChange}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
        trackPress
      />,
    );
    const retainedSignal = currentSignalHandler();

    await act(() => {
      retainedSignal(pressSignal({ gestureToken: 81, type: 'press-start' }));
      retainedSignal(pressSignal({ gestureToken: 80, type: 'press-end' }));
      retainedSignal(pressSignal({ gestureToken: 81, type: 'press-end' }));
      retainedSignal(pressSignal({ gestureToken: 82, type: 'press-start' }));
    });
    expect(onPressedSquareChange.mock.calls).toEqual([['a2'], [null], ['a2']]);

    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onPressedSquareChange={onPressedSquareChange}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(10)}
        trackPress
      />,
    );
    expect(onPressedSquareChange).toHaveBeenLastCalledWith(null);
  });

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

  it('routes a retained signal handler to the latest committed candidate callback', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const result = await render(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onCandidate={first}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
        selectionRevision={3}
        tapEnabled
      />,
    );
    const retainedSignal = currentSignalHandler();

    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onCandidate={second}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
        selectionRevision={3}
        tapEnabled
      />,
    );
    await act(() => {
      retainedSignal(tapSignal({ gestureToken: 41 }));
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(
      expect.objectContaining({
        baseSelectionRevision: 3,
        input: 'tap',
        square: 'b2',
        token: 41,
      }),
    );
  });

  it('rejects a tap correlated to a stale selection commit and accepts the current revision', async () => {
    const onCandidate = jest.fn();
    const result = await render(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onCandidate={onCandidate}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
        selectionRevision={3}
        tapEnabled
      />,
    );
    const retainedSignal = currentSignalHandler();

    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onCandidate={onCandidate}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
        selectionRevision={4}
        tapEnabled
      />,
    );
    await act(() => {
      retainedSignal(tapSignal({ gestureToken: 51, selectionRevision: 3 }));
      retainedSignal(tapSignal({ gestureToken: 52, selectionRevision: 4 }));
    });

    expect(onCandidate).toHaveBeenCalledTimes(1);
    expect(onCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseSelectionRevision: 4,
        input: 'tap',
        token: 52,
      }),
    );
  });

  it('makes a retained tap signal inert after tap is disabled while drag remains enabled', async () => {
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
        selectionRevision={3}
        tapEnabled
      />,
    );
    const retainedSignal = currentSignalHandler();

    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onCandidate={onCandidate}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
        selectionRevision={3}
        tapEnabled={false}
      />,
    );
    await act(() => {
      retainedSignal(tapSignal({ gestureToken: 55 }));
    });

    expect(onCandidate).not.toHaveBeenCalled();
  });

  it('does not install a candidate callback from an abandoned concurrent render', async () => {
    interface HarnessState {
      readonly mode: 'committed' | 'suspended';
      readonly version: number;
    }

    const committed = jest.fn();
    const abandoned = jest.fn();
    const never = new Promise<never>(() => undefined);
    let updateHarness: ((next: HarnessState) => void) | undefined;

    function SuspendForever(): ReactElement {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Suspense uses thrown thenables as its render protocol.
      throw never;
    }

    function ConcurrentHarness(): ReactElement {
      const [state, setState] = useState<HarnessState>({
        mode: 'committed',
        version: 0,
      });
      updateHarness = setState;
      const shouldSuspend = state.mode === 'suspended';
      return (
        <Suspense fallback={null}>
          <BoardInteractionController
            boardId="race-board"
            geometry={geometry(5)}
            onCandidate={shouldSuspend ? abandoned : committed}
            pieceRenderers={{}}
            pieceStyle={{}}
            position={controlledPosition(9)}
            selectionRevision={3}
            tapEnabled
          />
          {shouldSuspend ? <SuspendForever /> : null}
        </Suspense>
      );
    }

    await render(<ConcurrentHarness />);
    const retainedSignal = currentSignalHandler();
    const update = updateHarness;
    if (update === undefined) {
      throw new Error('Expected the concurrent harness state setter.');
    }

    await act(() => {
      startTransition(() => {
        update({ mode: 'suspended', version: 1 });
      });
    });
    await act(() => {
      update({ mode: 'committed', version: 2 });
    });
    await act(() => {
      retainedSignal(tapSignal({ gestureToken: 61 }));
    });

    expect(committed).toHaveBeenCalledTimes(1);
    expect(abandoned).not.toHaveBeenCalled();
  });
});
