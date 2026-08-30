import { act, render } from '@testing-library/react-native';
import { startTransition, Suspense, useState, type ReactElement } from 'react';

import { ChessboardProvider } from '../../src/ChessboardProvider';
import type { BoardGestureIntentCandidate } from '../../src/internal/board-gesture-adapter';
import type { NormalizedControlledValue } from '../../src/internal/controlled-domain';
import { INTERACTION_PRESENTATION_PHASE } from '../../src/internal/interaction-presentation';
import {
  useChessboardProvider,
  type ChessboardProviderRuntime,
} from '../../src/internal/provider-context';
import type {
  PositionObject,
  SquarePressContext,
} from '../../src/public-types';
import {
  BoardInteractionController,
  type TerminalBoardDragAcknowledgement,
} from '../../src/render/board-interaction-controller';
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
  readonly allowDragOffBoard?: boolean;
  readonly allowDragOffBoardGeneration?: number;
  readonly geometryRevision?: number;
  readonly gestureToken: number;
  readonly positionRevision?: number;
  readonly targetSquare?: 'a2' | 'b1';
  readonly type: 'drag-start' | 'drag-end';
}): Readonly<BoardGestureSignal> {
  return Object.freeze({
    allowDragOffBoard: options.allowDragOffBoard ?? true,
    allowDragOffBoardGeneration: options.allowDragOffBoardGeneration ?? 0,
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
    allowDragOffBoard: true,
    allowDragOffBoardGeneration: 0,
    boardId: 'race-board',
    geometryRevision: 5,
    gestureToken: options.gestureToken,
    positionRevision: 9,
    sourceSquare: 'a2',
    targetSquare: options.targetSquare,
    type: 'drag-target',
  });
}

function dragCancelSignal(options: {
  readonly gestureToken: number;
  readonly reason?: 'second-finger' | 'user';
}): Readonly<BoardGestureSignal> {
  return Object.freeze({
    allowDragOffBoard: true,
    allowDragOffBoardGeneration: 0,
    boardId: 'race-board',
    geometryRevision: 5,
    gestureToken: options.gestureToken,
    positionRevision: 9,
    reason: options.reason ?? 'user',
    sourceSquare: 'a2',
    type: 'drag-cancel',
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

  it('retains an exact terminal lease across controlled synchronization until the BoardSurface ACK', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const onCandidate = jest.fn(() => true);
    function RuntimeProbe(): null {
      runtime.current = useChessboardProvider().runtime;
      return null;
    }

    const result = await render(
      <ChessboardProvider>
        <RuntimeProbe />
        <BoardInteractionController
          boardId="race-board"
          dragEnabled
          geometry={geometry(5)}
          onCandidate={onCandidate}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(9)}
        />
      </ChessboardProvider>,
    );
    const signal = currentSignalHandler();
    await act(() => {
      signal(dragSignal({ gestureToken: 74, type: 'drag-start' }));
    });
    const activeBeforeTerminal = runtime.current?.drag.getSnapshot().active;
    if (activeBeforeTerminal === null || activeBeforeTerminal === undefined) {
      throw new Error('Expected the provider to own the active drag.');
    }

    await act(() => {
      signal(
        dragSignal({
          gestureToken: 74,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });

    expect(onCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ input: 'drag', targetSquare: 'b1', token: 74 }),
    );
    expect(runtime.current?.drag.getSnapshot().active).toBe(
      activeBeforeTerminal,
    );

    await result.rerender(
      <ChessboardProvider>
        <RuntimeProbe />
        <BoardInteractionController
          boardId="race-board"
          dragEnabled
          geometry={geometry(5)}
          onCandidate={onCandidate}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(10)}
        />
      </ChessboardProvider>,
    );
    expect(runtime.current?.drag.getSnapshot().active).toBe(
      activeBeforeTerminal,
    );
    expect(activeBeforeTerminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.DRAG,
    );

    const acknowledgement: Readonly<TerminalBoardDragAcknowledgement> =
      Object.freeze({
        boardId: activeBeforeTerminal.boardId,
        gestureToken: activeBeforeTerminal.gestureToken,
        mountedResetPermit: { current: false },
        owner: activeBeforeTerminal.owner,
        presentation: activeBeforeTerminal.presentation,
        sourceSquare: 'a2',
      });
    await act(() => {
      runtime.current?.drag.release(
        acknowledgement.owner,
        acknowledgement.gestureToken,
      );
    });
    await result.rerender(
      <ChessboardProvider>
        <RuntimeProbe />
        <BoardInteractionController
          boardId="race-board"
          dragEnabled
          geometry={geometry(5)}
          onCandidate={onCandidate}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(10)}
          terminalDragAcknowledgement={acknowledgement}
        />
      </ChessboardProvider>,
    );
    expect(activeBeforeTerminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.DRAG,
    );

    await result.rerender(
      <ChessboardProvider>
        <RuntimeProbe />
        <BoardInteractionController
          boardId="race-board"
          dragEnabled
          geometry={geometry(5)}
          onCandidate={onCandidate}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(11)}
        />
      </ChessboardProvider>,
    );
    expect(activeBeforeTerminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.IDLE,
    );
  });

  it('retains an exact native-cancel lease until the BoardSurface restore ACK', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const cancellationLeases: TerminalBoardDragAcknowledgement[] = [];
    function RuntimeProbe(): null {
      runtime.current = useChessboardProvider().runtime;
      return null;
    }
    const result = await render(
      <ChessboardProvider>
        <RuntimeProbe />
        <BoardInteractionController
          boardId="race-board"
          dragEnabled
          geometry={geometry(5)}
          onTerminalDragCancellation={(lease) => {
            cancellationLeases.push(
              Object.freeze({
                ...lease,
                mountedResetPermit: { current: false },
              }),
            );
            return true;
          }}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(9)}
        />
      </ChessboardProvider>,
    );
    const signal = currentSignalHandler();
    await act(() => {
      signal(dragSignal({ gestureToken: 741, type: 'drag-start' }));
    });
    const terminal = runtime.current?.drag.getSnapshot().active ?? null;
    if (terminal === null) {
      throw new Error('Expected an exact provider cancellation lease.');
    }
    terminal.presentation.phase.value =
      INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL;
    await act(() => {
      signal(dragCancelSignal({ gestureToken: 741 }));
    });

    expect(cancellationLeases).toHaveLength(1);
    expect(cancellationLeases[0]).toEqual(
      expect.objectContaining({
        gestureToken: 741,
        owner: terminal.owner,
        presentation: terminal.presentation,
        sourceSquare: 'a2',
      }),
    );
    expect(runtime.current?.drag.getSnapshot().active).toBe(terminal);
    expect(terminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL,
    );

    const acknowledgement = cancellationLeases[0];
    if (acknowledgement === undefined) {
      throw new Error('Expected the retained cancellation acknowledgement.');
    }
    await act(() => {
      runtime.current?.drag.release(
        acknowledgement.owner,
        acknowledgement.gestureToken,
      );
    });
    await result.rerender(
      <ChessboardProvider>
        <RuntimeProbe />
        <BoardInteractionController
          boardId="race-board"
          dragEnabled
          geometry={geometry(5)}
          onTerminalDragCancellation={() => true}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(9)}
          terminalDragAcknowledgement={acknowledgement}
        />
      </ChessboardProvider>,
    );
    expect(acknowledgement.mountedResetPermit.current).toBe(true);
    expect(terminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL,
    );
    await result.unmount();
  });

  it('does not release or reset a same-token replacement during native-cancel fallback', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const foreignOwner = Object.freeze({});
    const replacement: {
      current: NonNullable<
        ReturnType<ChessboardProviderRuntime['drag']['getSnapshot']>['active']
      > | null;
    } = { current: null };
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
          geometry={geometry(5)}
          onTerminalDragCancellation={(lease) => {
            const current = runtime.current?.drag.getSnapshot().active ?? null;
            if (current === null) {
              return false;
            }
            replacement.current = Object.freeze({
              ...current,
              onCancel: jest.fn(),
              owner: foreignOwner,
              source: Object.freeze({
                kind: 'spare' as const,
                spareId: 'cancel-replacement',
              }),
              square: null,
            });
            runtime.current?.drag.claim(replacement.current);
            expect(lease.presentation).toBe(current.presentation);
            return false;
          }}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(9)}
        />
      </ChessboardProvider>,
    );
    const signal = currentSignalHandler();
    await act(() => {
      signal(dragSignal({ gestureToken: 742, type: 'drag-start' }));
    });
    const terminal = runtime.current?.drag.getSnapshot().active ?? null;
    if (terminal === null) {
      throw new Error('Expected the original cancellation lease.');
    }
    terminal.presentation.phase.value =
      INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL;
    await act(() => {
      signal(dragCancelSignal({ gestureToken: 742 }));
    });

    expect(replacement.current).not.toBeNull();
    expect(runtime.current?.drag.getSnapshot().active).toBe(
      replacement.current,
    );
    expect(terminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL,
    );
    const claimedReplacement = replacement.current;
    if (claimedReplacement !== null) {
      await act(() => {
        runtime.current?.drag.release(
          claimedReplacement.owner,
          claimedReplacement.gestureToken,
        );
      });
    }
  });

  it('establishes terminal retention before a candidate synchronously commits controlled position', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    function RuntimeProbe(): null {
      runtime.current = useChessboardProvider().runtime;
      return null;
    }
    function Harness(): ReactElement {
      const [revision, setRevision] = useState(9);
      return (
        <ChessboardProvider>
          <RuntimeProbe />
          <BoardInteractionController
            boardId="race-board"
            dragEnabled
            geometry={geometry(5)}
            onCandidate={() => {
              setRevision(10);
              return true;
            }}
            pieceRenderers={{}}
            pieceStyle={{}}
            position={controlledPosition(revision)}
          />
        </ChessboardProvider>
      );
    }

    const result = await render(<Harness />);
    const signal = currentSignalHandler();
    await act(() => {
      signal(dragSignal({ gestureToken: 75, type: 'drag-start' }));
    });
    const terminal = runtime.current?.drag.getSnapshot().active;
    if (terminal === null || terminal === undefined) {
      throw new Error('Expected the provider terminal lease.');
    }
    await act(() => {
      signal(
        dragSignal({
          gestureToken: 75,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });

    expect(runtime.current?.drag.getSnapshot().active).toBe(terminal);
    expect(terminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.DRAG,
    );
    await result.unmount();
  });

  it('cleans an exact terminal lease after a synchronous controlled update rejects the candidate', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    function RuntimeProbe(): null {
      runtime.current = useChessboardProvider().runtime;
      return null;
    }
    function Harness(): ReactElement {
      const [revision, setRevision] = useState(9);
      return (
        <ChessboardProvider>
          <RuntimeProbe />
          <BoardInteractionController
            boardId="race-board"
            dragEnabled
            geometry={geometry(5)}
            onCandidate={() => {
              setRevision(10);
              return false;
            }}
            pieceRenderers={{}}
            pieceStyle={{}}
            position={controlledPosition(revision)}
          />
        </ChessboardProvider>
      );
    }

    await render(<Harness />);
    const signal = currentSignalHandler();
    await act(() => {
      signal(dragSignal({ gestureToken: 76, type: 'drag-start' }));
    });
    const terminal = runtime.current?.drag.getSnapshot().active;
    if (terminal === null || terminal === undefined) {
      throw new Error('Expected the provider terminal lease.');
    }
    await act(() => {
      signal(
        dragSignal({
          gestureToken: 76,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });

    expect(runtime.current?.drag.getSnapshot().active).toBeNull();
    expect(terminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.IDLE,
    );
  });

  it('does not let rejected terminal cleanup release or reset a synchronous same-token spare replacement', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const foreignOwner = Object.freeze({});
    const replacement: {
      current: ReturnType<
        ChessboardProviderRuntime['drag']['getSnapshot']
      >['active'];
    } = { current: null };
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
          geometry={geometry(5)}
          onCandidate={() => {
            const current = runtime.current?.drag.getSnapshot().active;
            if (current === null || current === undefined) {
              return false;
            }
            replacement.current = Object.freeze({
              ...current,
              onCancel: jest.fn(),
              owner: foreignOwner,
              source: Object.freeze({
                kind: 'spare' as const,
                spareId: 'foreign-spare',
              }),
              square: null,
            });
            runtime.current?.drag.claim(replacement.current);
            return false;
          }}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(9)}
        />
      </ChessboardProvider>,
    );
    const signal = currentSignalHandler();
    await act(() => {
      signal(dragSignal({ gestureToken: 77, type: 'drag-start' }));
      signal(
        dragSignal({
          gestureToken: 77,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });

    expect(replacement.current).not.toBeNull();
    expect(runtime.current?.drag.getSnapshot().active).toBe(
      replacement.current,
    );
    expect(replacement.current?.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.DRAG,
    );
    const foreign = replacement.current;
    if (foreign !== null) {
      await act(() => {
        runtime.current?.drag.release(foreign.owner, foreign.gestureToken);
      });
    }
  });

  it('does not apply the stale terminal reduction after a candidate synchronously starts a successor drag', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const onPieceDragStart = jest.fn(() => true);
    let signal: GestureLayerProps['onSignal'] | null = null;
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
          geometry={geometry(5)}
          onCandidate={() => {
            signal?.(dragSignal({ gestureToken: 79, type: 'drag-start' }));
            return true;
          }}
          onPieceDragStart={onPieceDragStart}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(9)}
        />
      </ChessboardProvider>,
    );
    signal = currentSignalHandler();
    await act(() => {
      signal(dragSignal({ gestureToken: 78, type: 'drag-start' }));
      signal(
        dragSignal({
          gestureToken: 78,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });

    expect(runtime.current?.drag.getSnapshot().active?.gestureToken).toBe(79);
    expect(onPieceDragStart).toHaveBeenCalledTimes(2);
  });

  it('retains terminal ownership across a synchronous permission disable', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    function RuntimeProbe(): null {
      runtime.current = useChessboardProvider().runtime;
      return null;
    }
    function Harness(): ReactElement {
      const [enabled, setEnabled] = useState(true);
      return (
        <ChessboardProvider>
          <RuntimeProbe />
          <BoardInteractionController
            boardId="race-board"
            dragEnabled={enabled}
            geometry={geometry(5)}
            onCandidate={() => {
              setEnabled(false);
              return true;
            }}
            pieceRenderers={{}}
            pieceStyle={{}}
            position={controlledPosition(9)}
          />
        </ChessboardProvider>
      );
    }

    const result = await render(<Harness />);
    const signal = currentSignalHandler();
    await act(() => {
      signal(dragSignal({ gestureToken: 80, type: 'drag-start' }));
    });
    const terminal = runtime.current?.drag.getSnapshot().active;
    if (terminal === null || terminal === undefined) {
      throw new Error('Expected the provider terminal lease.');
    }
    await act(() => {
      signal(
        dragSignal({
          gestureToken: 80,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });
    expect(runtime.current?.drag.getSnapshot().active).toBe(terminal);
    expect(terminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.DRAG,
    );
    await result.unmount();
  });

  it('releases only the exact terminal lease without shared writes on synchronous unmount', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    function RuntimeProbe(): null {
      runtime.current = useChessboardProvider().runtime;
      return null;
    }
    function Harness(): ReactElement {
      const [mounted, setMounted] = useState(true);
      return (
        <ChessboardProvider>
          <RuntimeProbe />
          {mounted ? (
            <BoardInteractionController
              boardId="race-board"
              dragEnabled
              geometry={geometry(5)}
              onCandidate={() => {
                setMounted(false);
                return true;
              }}
              pieceRenderers={{}}
              pieceStyle={{}}
              position={controlledPosition(9)}
            />
          ) : null}
        </ChessboardProvider>
      );
    }

    await render(<Harness />);
    const signal = currentSignalHandler();
    await act(() => {
      signal(dragSignal({ gestureToken: 81, type: 'drag-start' }));
    });
    const terminal = runtime.current?.drag.getSnapshot().active;
    if (terminal === null || terminal === undefined) {
      throw new Error('Expected the provider terminal lease.');
    }
    await act(() => {
      signal(
        dragSignal({
          gestureToken: 81,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });

    expect(runtime.current?.drag.getSnapshot().active).toBeNull();
    expect(terminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.DRAG,
    );
  });

  it('synchronously rejects a queued board start after another provider source replaces its drag lease', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const onPieceDragStart = jest.fn(() => true);
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
          geometry={geometry(5)}
          onPieceDragStart={onPieceDragStart}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(9)}
        />
      </ChessboardProvider>,
    );
    const retainedSignal = currentSignalHandler();
    await act(() => {
      retainedSignal(dragSignal({ gestureToken: 72, type: 'drag-start' }));
    });
    const providerRuntime = runtime.current;
    const active = providerRuntime?.drag.getSnapshot().active ?? null;
    if (providerRuntime === null || active === null) {
      throw new Error('Expected the board to own the provider drag lease.');
    }
    const replacement = Object.freeze({
      ...active,
      boardId: 'replacement-board',
      gestureToken: 999,
      onCancel: jest.fn(),
      owner: Object.freeze({}),
    });

    await act(() => {
      providerRuntime.drag.claim(replacement);
      retainedSignal(dragSignal({ gestureToken: 73, type: 'drag-start' }));
    });

    expect(onPieceDragStart).toHaveBeenCalledTimes(1);
    expect(providerRuntime.drag.getSnapshot().active).toBe(replacement);
  });

  it('pairs only the current correlated press and invalidates it once on a position commit', async () => {
    const onPressedSquareChange = jest.fn();
    const events: string[] = [];
    const contexts: Readonly<SquarePressContext>[] = [];
    const result = await render(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onPressedSquareChange={onPressedSquareChange}
        onSquarePressIn={(context) => {
          events.push('in');
          contexts.push(context);
        }}
        onSquarePressOut={(context) => {
          events.push('out');
          contexts.push(context);
        }}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
        trackPress
      />,
    );
    const retainedSignal = currentSignalHandler();

    await act(() => {
      retainedSignal(pressSignal({ gestureToken: 81, type: 'press-start' }));
      retainedSignal(pressSignal({ gestureToken: 81, type: 'press-start' }));
      retainedSignal(pressSignal({ gestureToken: 80, type: 'press-end' }));
      retainedSignal(pressSignal({ gestureToken: 81, type: 'press-end' }));
      retainedSignal(pressSignal({ gestureToken: 82, type: 'press-start' }));
    });
    expect(onPressedSquareChange.mock.calls).toEqual([['a2'], [null], ['a2']]);
    expect(events).toEqual(['in', 'out', 'in']);

    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onPressedSquareChange={onPressedSquareChange}
        onSquarePressIn={(context) => {
          events.push('in');
          contexts.push(context);
        }}
        onSquarePressOut={(context) => {
          events.push('out');
          contexts.push(context);
        }}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(10)}
        trackPress
      />,
    );
    expect(onPressedSquareChange).toHaveBeenLastCalledWith(null);
    expect(events).toEqual(['in', 'out', 'in', 'out']);
    expect(contexts).toHaveLength(4);
    expect(contexts.every((context) => Object.isFrozen(context))).toBe(true);
    expect(contexts.every((context) => Object.isFrozen(context.piece))).toBe(
      true,
    );
    expect(
      contexts.map(({ basePositionRevision }) => basePositionRevision),
    ).toEqual([9, 9, 9, 9]);
  });

  it('uses the latest committed terminal handler, drops removed handlers, and stays silent after unmount', async () => {
    const onSquarePressIn = jest.fn();
    const firstOut = jest.fn();
    const replacementOut = jest.fn();
    const result = await render(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onSquarePressIn={onSquarePressIn}
        onSquarePressOut={firstOut}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
        trackPress
      />,
    );
    const retainedSignal = currentSignalHandler();

    await act(() => {
      retainedSignal(pressSignal({ gestureToken: 83, type: 'press-start' }));
    });
    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onSquarePressIn={onSquarePressIn}
        onSquarePressOut={replacementOut}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
        trackPress
      />,
    );
    await act(() => {
      retainedSignal(pressSignal({ gestureToken: 83, type: 'press-end' }));
      retainedSignal(pressSignal({ gestureToken: 84, type: 'press-start' }));
    });

    expect(firstOut).not.toHaveBeenCalled();
    expect(replacementOut).toHaveBeenCalledTimes(1);
    expect(onSquarePressIn).toHaveBeenCalledTimes(2);

    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onSquarePressIn={onSquarePressIn}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
        trackPress
      />,
    );
    await act(() => {
      retainedSignal(pressSignal({ gestureToken: 84, type: 'press-end' }));
      retainedSignal(pressSignal({ gestureToken: 85, type: 'press-start' }));
    });
    await result.unmount();

    expect(firstOut).not.toHaveBeenCalled();
    expect(replacementOut).toHaveBeenCalledTimes(1);
    expect(onSquarePressIn).toHaveBeenCalledTimes(3);
  });

  it('closes an active press before a drag takeover observes its start', async () => {
    const events: string[] = [];
    await render(
      <BoardInteractionController
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={() => {
          events.push('drag-start');
          return true;
        }}
        onSquarePressIn={() => events.push('press-in')}
        onSquarePressOut={() => events.push('press-out')}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
        trackPress
      />,
    );
    const signal = currentSignalHandler();

    await act(() => {
      signal(pressSignal({ gestureToken: 86, type: 'press-start' }));
      signal(dragSignal({ gestureToken: 87, type: 'drag-start' }));
    });

    expect(events).toEqual(['press-in', 'press-out', 'drag-start']);
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
          return false;
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
    const retainedPresentation = jest
      .mocked(BoardGestureLayer)
      .mock.calls.at(-1)?.[0].presentation;
    if (retainedPresentation === undefined) {
      throw new Error('Expected the retained gesture presentation.');
    }

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
    retainedPresentation.phase.value =
      INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL;
    retainedPresentation.sourceSquare.value = 'a2';
    retainedPresentation.targetSquare.value = 'b1';
    await act(() => {
      retainedSignal(
        dragSignal({
          gestureToken: 1,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });
    expect(retainedPresentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.IDLE,
    );

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

  it('[PARITY-BEHAVIOR-B21] routes one accepted drag start to the current callback and rejects duplicate, stale, and denied starts', async () => {
    const staleStart = jest.fn(() => true);
    const currentStart = jest.fn(() => true);
    const allowDrag = jest.fn(() => true);
    const result = await render(
      <BoardInteractionController
        boardId="race-board"
        canDragPiece={allowDrag}
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={staleStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    const retainedSignal = currentSignalHandler();

    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        canDragPiece={allowDrag}
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={currentStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    await act(() => {
      retainedSignal(dragSignal({ gestureToken: 91, type: 'drag-start' }));
      retainedSignal(dragSignal({ gestureToken: 91, type: 'drag-start' }));
    });

    expect(staleStart).not.toHaveBeenCalled();
    expect(currentStart).toHaveBeenCalledTimes(1);
    expect(currentStart).toHaveBeenCalledWith({
      basePositionRevision: 9,
      boardId: 'race-board',
      piece: { id: 'pawn', pieceType: 'wP' },
      source: { kind: 'board', square: 'a2' },
    });

    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        canDragPiece={allowDrag}
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={currentStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(10)}
      />,
    );
    await act(() => {
      retainedSignal(
        dragSignal({
          gestureToken: 92,
          positionRevision: 9,
          type: 'drag-start',
        }),
      );
    });

    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        canDragPiece={() => false}
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={currentStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(10)}
      />,
    );
    await act(() => {
      retainedSignal(
        dragSignal({
          gestureToken: 93,
          positionRevision: 10,
          type: 'drag-start',
        }),
      );
    });

    expect(currentStart).toHaveBeenCalledTimes(1);
  });

  it('cancels an active drag when activation distance changes and ignores its retained terminal', async () => {
    const onCandidate = jest.fn();
    const onPieceDragStart = jest.fn(() => true);
    const result = await render(
      <BoardInteractionController
        activationDistance={4}
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onCandidate={onCandidate}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    const retainedSignal = currentSignalHandler();

    await act(() => {
      retainedSignal(dragSignal({ gestureToken: 94, type: 'drag-start' }));
    });
    expect(onPieceDragStart).toHaveBeenCalledTimes(1);

    await result.rerender(
      <BoardInteractionController
        activationDistance={16}
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onCandidate={onCandidate}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );

    const latestLayer = jest.mocked(BoardGestureLayer).mock.calls.at(-1)?.[0];
    expect(latestLayer?.activationDistance).toBe(16);
    await act(() => {
      retainedSignal(
        dragSignal({
          gestureToken: 94,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
    });

    expect(onCandidate).not.toHaveBeenCalled();
    expect(onPieceDragStart).toHaveBeenCalledTimes(1);
  });

  it('publishes board-local bounds and cancels only an active pan when the policy changes', async () => {
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const onCandidate = jest.fn();
    function RuntimeProbe(): null {
      runtime.current = useChessboardProvider().runtime;
      return null;
    }
    const result = await render(
      <ChessboardProvider>
        <RuntimeProbe />
        <BoardInteractionController
          allowDragOffBoard={false}
          boardId="race-board"
          dragEnabled
          geometry={geometry(5)}
          onCandidate={onCandidate}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(9)}
        />
      </ChessboardProvider>,
    );
    const retainedSignal = currentSignalHandler();

    await act(() => {
      retainedSignal(
        dragSignal({
          allowDragOffBoard: false,
          gestureToken: 96,
          type: 'drag-start',
        }),
      );
    });
    expect(runtime.current?.drag.getSnapshot().active?.bounds).toEqual({
      height: 200,
      kind: 'gesture',
      width: 200,
    });

    await result.rerender(
      <ChessboardProvider>
        <RuntimeProbe />
        <BoardInteractionController
          allowDragOffBoard
          boardId="race-board"
          dragEnabled
          geometry={geometry(5)}
          onCandidate={onCandidate}
          pieceRenderers={{}}
          pieceStyle={{}}
          position={controlledPosition(9)}
        />
      </ChessboardProvider>,
    );

    expect(runtime.current?.drag.getSnapshot().active).toBeNull();
    await act(() => {
      retainedSignal(
        dragSignal({
          allowDragOffBoard: false,
          gestureToken: 96,
          targetSquare: 'b1',
          type: 'drag-end',
        }),
      );
      currentSignalHandler()(
        dragSignal({
          allowDragOffBoardGeneration: 1,
          gestureToken: 97,
          type: 'drag-start',
        }),
      );
    });
    expect(onCandidate).not.toHaveBeenCalled();
    expect(runtime.current?.drag.getSnapshot().active?.bounds).toBeNull();
  });

  it('rejects a queued drag start captured before an overlay-policy commit', async () => {
    const onPieceDragStart = jest.fn(() => true);
    const result = await render(
      <BoardInteractionController
        allowDragOffBoard={false}
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    const retainedSignal = currentSignalHandler();

    await result.rerender(
      <BoardInteractionController
        allowDragOffBoard
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    await act(() => {
      retainedSignal(
        dragSignal({
          allowDragOffBoard: false,
          gestureToken: 98,
          type: 'drag-start',
        }),
      );
    });

    expect(onPieceDragStart).not.toHaveBeenCalled();
    expect(
      result.queryAllByTestId(
        'chessboard-native:race-board:provider-drag-overlay',
        { includeHiddenElements: true },
      ),
    ).toEqual([]);
  });

  it('rejects an ABA-stale queued drag start after the overlay policy returns to its captured value', async () => {
    const onPieceDragStart = jest.fn(() => true);
    const result = await render(
      <BoardInteractionController
        allowDragOffBoard={false}
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    const retainedSignal = currentSignalHandler();

    await result.rerender(
      <BoardInteractionController
        allowDragOffBoard
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    await result.rerender(
      <BoardInteractionController
        allowDragOffBoard={false}
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    await act(() => {
      retainedSignal(
        dragSignal({
          allowDragOffBoard: false,
          allowDragOffBoardGeneration: 0,
          gestureToken: 99,
          type: 'drag-start',
        }),
      );
    });

    expect(onPieceDragStart).not.toHaveBeenCalled();
    expect(
      result.queryAllByTestId(
        'chessboard-native:race-board:provider-drag-overlay',
        { includeHiddenElements: true },
      ),
    ).toEqual([]);

    await act(() => {
      currentSignalHandler()(
        dragSignal({
          allowDragOffBoard: false,
          allowDragOffBoardGeneration: 2,
          gestureToken: 100,
          type: 'drag-start',
        }),
      );
    });
    expect(onPieceDragStart).toHaveBeenCalledTimes(1);
  });

  it('rejects a queued drag start from the gesture generation replaced by an activation-distance commit', async () => {
    const onPieceDragStart = jest.fn(() => true);
    const result = await render(
      <BoardInteractionController
        activationDistance={4}
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    const retainedSignal = currentSignalHandler();

    await result.rerender(
      <BoardInteractionController
        activationDistance={16}
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    await act(() => {
      retainedSignal(dragSignal({ gestureToken: 95, type: 'drag-start' }));
    });

    expect(onPieceDragStart).not.toHaveBeenCalled();
    expect(
      result.queryAllByTestId(
        'chessboard-native:race-board:provider-drag-overlay',
        { includeHiddenElements: true },
      ),
    ).toEqual([]);
  });

  it('rejects a queued drag start after drag permission is disabled and re-enabled with otherwise identical revisions', async () => {
    const onPieceDragStart = jest.fn(() => true);
    const result = await render(
      <BoardInteractionController
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    const retainedSignal = currentSignalHandler();

    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        geometry={geometry(5)}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    await result.rerender(
      <BoardInteractionController
        boardId="race-board"
        dragEnabled
        geometry={geometry(5)}
        onPieceDragStart={onPieceDragStart}
        pieceRenderers={{}}
        pieceStyle={{}}
        position={controlledPosition(9)}
      />,
    );
    await act(() => {
      retainedSignal(dragSignal({ gestureToken: 96, type: 'drag-start' }));
    });

    expect(onPieceDragStart).not.toHaveBeenCalled();
    expect(
      result.queryAllByTestId(
        'chessboard-native:race-board:provider-drag-overlay',
        { includeHiddenElements: true },
      ),
    ).toEqual([]);
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
    const currentSignal = currentSignalHandler();
    await act(() => {
      retainedSignal(tapSignal({ gestureToken: 51, selectionRevision: 3 }));
      currentSignal(tapSignal({ gestureToken: 52, selectionRevision: 4 }));
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
