import { act, fireEvent, render } from '@testing-library/react-native';
import { View, type ViewStyle } from 'react-native';
import type { TestInstance } from 'test-renderer';

import {
  ChessboardProvider,
  type PieceRenderer,
  type PieceRendererProps,
} from '../../src';
import { ChessboardRuntime } from '../../src/Chessboard';

const EMPTY_STYLE: Readonly<ViewStyle> = Object.freeze({});

const Probe: PieceRenderer = (props: PieceRendererProps) => (
  <View
    testID={`${props.boardId}:${props.piece.id ?? props.piece.pieceType}:${props.square ?? 'spare'}:${props.state.isTransitioning ? 'transition' : 'static'}`}
  />
);

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  return result.container;
}

function boardHosts(root: TestInstance): readonly TestInstance[] {
  const isBoardHost = (node: TestInstance): boolean =>
    node.props['collapsable'] === false &&
    typeof node.props['onLayout'] === 'function';
  return [...(isBoardHost(root) ? [root] : []), ...root.queryAll(isBoardHost)];
}

async function measure(
  host: TestInstance,
  width: number,
  height: number,
): Promise<void> {
  await fireEvent(host, 'layout', {
    nativeEvent: { layout: { height, width, x: 0, y: 0 } },
  });
}

function hasNode(root: TestInstance, testID: string): boolean {
  return root.queryAll((node) => node.props['testID'] === testID).length > 0;
}

function requiredNode(root: TestInstance, testID: string): TestInstance {
  const node =
    root.queryAll((candidate) => candidate.props['testID'] === testID).at(0) ??
    null;
  if (node === null) {
    throw new Error(`Expected ${testID}.`);
  }
  return node;
}

function requiredParent(node: TestInstance): TestInstance {
  if (node.parent === null) {
    throw new Error('Expected one animated piece host.');
  }
  return node.parent;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function animatedStyle(node: TestInstance): Readonly<ViewStyle> {
  const props: unknown = node.props;
  if (!isRecord(props)) {
    throw new Error('Expected test-renderer props.');
  }
  const animated = props['jestAnimatedStyle'];
  if (!isRecord(animated)) {
    throw new Error('Expected a Reanimated Jest style.');
  }
  const value = animated['value'];
  if (!isRecord(value)) {
    throw new Error('Expected a Reanimated Jest style value.');
  }
  return value;
}

describe('controlled mounted transitions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('[PARITY-OPTION-ANIMATION-DURATION-IN-MS] animates an ordinary capture from the exact current revision pair', async () => {
    const result = await render(
      <ChessboardRuntime
        boardId="capture"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        pieceRenderers={{ token: Probe }}
        position={{
          revision: 1,
          value: {
            a1: { id: 'runner', pieceType: 'token' },
            b1: { id: 'captured', pieceType: 'token' },
          },
        }}
        reduceMotion="never"
        styles={{ piece: EMPTY_STYLE }}
      />,
    );
    const host = boardHosts(rootOf(result))[0];
    if (host === undefined) {
      throw new Error('Expected one board host.');
    }
    await measure(host, 200, 100);

    await result.rerender(
      <ChessboardRuntime
        boardId="capture"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        pieceRenderers={{ token: Probe }}
        position={{
          revision: 2,
          value: {
            b1: { id: 'runner', pieceType: 'token' },
          },
        }}
        reduceMotion="never"
        styles={{ piece: EMPTY_STYLE }}
      />,
    );
    const root = rootOf(result);
    expect(hasNode(root, 'capture:runner:a1:transition')).toBe(false);
    expect(hasNode(root, 'capture:runner:b1:transition')).toBe(true);
    expect(hasNode(root, 'capture:captured:b1:transition')).toBe(true);
    const initialCapturedStyle = animatedStyle(
      requiredParent(requiredNode(root, 'capture:captured:b1:transition')),
    );
    expect(initialCapturedStyle.opacity).toBe(1);

    await act(() => {
      jest.advanceTimersByTime(160);
    });
    const midCapturedStyle = animatedStyle(
      requiredParent(requiredNode(root, 'capture:captured:b1:transition')),
    );
    expect(midCapturedStyle.opacity).not.toBe(1);
    expect(midCapturedStyle.opacity).not.toBe(0);

    await act(() => {
      jest.advanceTimersByTime(160);
    });
    expect(hasNode(root, 'capture:runner:b1:static')).toBe(true);
    expect(hasNode(root, 'capture:captured:b1:transition')).toBe(false);
  });

  it('animates changed plain positions with board-derived revisions', async () => {
    const result = await render(
      <ChessboardRuntime
        boardId="plain"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        pieceRenderers={{ token: Probe }}
        position={{ a1: { id: 'runner', pieceType: 'token' } }}
        reduceMotion="never"
      />,
    );
    const host = boardHosts(rootOf(result))[0];
    if (host === undefined) {
      throw new Error('Expected one board host.');
    }
    await measure(host, 200, 100);
    await result.rerender(
      <ChessboardRuntime
        boardId="plain"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        pieceRenderers={{ token: Probe }}
        position={{ b1: { id: 'runner', pieceType: 'token' } }}
        reduceMotion="never"
      />,
    );

    expect(hasNode(rootOf(result), 'plain:runner:b1:transition')).toBe(true);
  });

  it('[CBN-CONTRACT-014-MULTIBOARD-ISOLATION] isolates snap and animated policies for simultaneous boards', async () => {
    const initial = {
      revision: 1,
      value: { a1: { id: 'runner', pieceType: 'token' } },
    } as const;
    const next = {
      revision: 2,
      value: { b1: { id: 'runner', pieceType: 'token' } },
    } as const;
    const result = await render(
      <ChessboardProvider>
        <ChessboardRuntime
          boardId="snap-board"
          development={false}
          dimensions={{ columns: 2, rows: 1 }}
          pieceRenderers={{ token: Probe }}
          position={initial}
          reduceMotion="never"
          transitionDurationMs={0}
        />
        <ChessboardRuntime
          boardId="animated-board"
          development={false}
          dimensions={{ columns: 2, rows: 1 }}
          pieceRenderers={{ token: Probe }}
          position={initial}
          reduceMotion="never"
          transitionDurationMs={1_000}
        />
      </ChessboardProvider>,
    );
    const hosts = boardHosts(rootOf(result));
    if (hosts[0] === undefined || hosts[1] === undefined) {
      throw new Error('Expected two board hosts.');
    }
    await measure(hosts[0], 200, 100);
    await measure(hosts[1], 200, 100);

    await result.rerender(
      <ChessboardProvider>
        <ChessboardRuntime
          boardId="snap-board"
          development={false}
          dimensions={{ columns: 2, rows: 1 }}
          pieceRenderers={{ token: Probe }}
          position={next}
          reduceMotion="never"
          transitionDurationMs={0}
        />
        <ChessboardRuntime
          boardId="animated-board"
          development={false}
          dimensions={{ columns: 2, rows: 1 }}
          pieceRenderers={{ token: Probe }}
          position={next}
          reduceMotion="never"
          transitionDurationMs={1_000}
        />
      </ChessboardProvider>,
    );
    const root = rootOf(result);
    expect(hasNode(root, 'snap-board:runner:b1:static')).toBe(true);
    expect(hasNode(root, 'snap-board:runner:b1:transition')).toBe(false);
    expect(hasNode(root, 'animated-board:runner:b1:transition')).toBe(true);

    await act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(hasNode(root, 'snap-board:runner:b1:static')).toBe(true);
    expect(hasNode(root, 'animated-board:runner:b1:transition')).toBe(true);
  });

  it('[CBN-CONTRACT-006-LATEST-PROP-WINS] exposes C immediately and stale A-B completion cannot restore B', async () => {
    const renderBoard = (revision: number, square: 'a1' | 'b1' | 'c1') => (
      <ChessboardRuntime
        boardId="latest"
        development={false}
        dimensions={{ columns: 3, rows: 1 }}
        pieceRenderers={{ token: Probe }}
        position={{
          revision,
          value: { [square]: { id: 'runner', pieceType: 'token' } },
        }}
        reduceMotion="never"
        transitionDurationMs={1_000}
      />
    );
    const result = await render(renderBoard(1, 'a1'));
    const host = boardHosts(rootOf(result))[0];
    if (host === undefined) {
      throw new Error('Expected one board host.');
    }
    await measure(host, 300, 100);
    await result.rerender(renderBoard(2, 'b1'));
    expect(hasNode(rootOf(result), 'latest:runner:b1:transition')).toBe(true);

    await act(() => {
      jest.advanceTimersByTime(600);
    });
    await result.rerender(renderBoard(3, 'c1'));
    expect(hasNode(rootOf(result), 'latest:runner:a1:transition')).toBe(false);
    expect(hasNode(rootOf(result), 'latest:runner:b1:transition')).toBe(false);
    expect(hasNode(rootOf(result), 'latest:runner:c1:transition')).toBe(true);

    await act(() => {
      jest.advanceTimersByTime(420);
    });
    expect(hasNode(rootOf(result), 'latest:runner:c1:transition')).toBe(true);

    await act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(hasNode(rootOf(result), 'latest:runner:c1:static')).toBe(true);
    expect(hasNode(rootOf(result), 'latest:runner:b1:static')).toBe(false);
  });

  it('keeps the current actor mounted across orientation and resize rebases', async () => {
    const renderBoard = (orientation: 'white' | 'black', revision: number) => (
      <ChessboardRuntime
        boardId="geometry-continuity"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        orientation={orientation}
        pieceRenderers={{ token: Probe }}
        position={{
          revision,
          value: {
            [revision === 1 ? 'a1' : 'b1']: {
              id: 'runner',
              pieceType: 'token',
            },
          },
        }}
        reduceMotion="never"
        transitionDurationMs={1_000}
      />
    );
    const result = await render(renderBoard('white', 1));
    const host = boardHosts(rootOf(result))[0];
    if (host === undefined) {
      throw new Error('Expected one board host.');
    }
    await measure(host, 200, 100);
    await result.rerender(renderBoard('white', 2));
    await act(() => {
      jest.advanceTimersByTime(300);
    });
    await result.rerender(renderBoard('black', 2));
    expect(
      hasNode(rootOf(result), 'geometry-continuity:runner:b1:transition'),
    ).toBe(true);

    await measure(host, 300, 150);
    expect(
      hasNode(rootOf(result), 'geometry-continuity:runner:b1:transition'),
    ).toBe(true);

    await act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(
      hasNode(rootOf(result), 'geometry-continuity:runner:b1:static'),
    ).toBe(true);
  });

  it('mounts explicit promotion as detached source artwork plus the authoritative target renderer', async () => {
    const result = await render(
      <ChessboardRuntime
        boardId="promotion"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        pieceRenderers={{ pawn: Probe, queen: Probe }}
        position={{
          revision: 1,
          value: { a1: { id: 'actor', pieceType: 'pawn' } },
        }}
        reduceMotion="never"
        transitionDurationMs={1_000}
      />,
    );
    const host = boardHosts(rootOf(result))[0];
    if (host === undefined) {
      throw new Error('Expected one board host.');
    }
    await measure(host, 200, 100);
    await result.rerender(
      <ChessboardRuntime
        boardId="promotion"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        pieceRenderers={{ pawn: Probe, queen: Probe }}
        position={{
          revision: 2,
          transition: {
            from: 'a1',
            fromRevision: 1,
            promotion: 'queen',
            to: 'b1',
            toRevision: 2,
          },
          value: { b1: { id: 'actor', pieceType: 'queen' } },
        }}
        reduceMotion="never"
        transitionDurationMs={1_000}
      />,
    );

    const root = rootOf(result);
    expect(hasNode(root, 'promotion:actor:a1:transition')).toBe(true);
    expect(hasNode(root, 'promotion:actor:b1:transition')).toBe(true);
    await act(() => {
      jest.advanceTimersByTime(500);
    });
    const oldStyle = animatedStyle(
      requiredParent(requiredNode(root, 'promotion:actor:a1:transition')),
    );
    const currentStyle = animatedStyle(
      requiredParent(requiredNode(root, 'promotion:actor:b1:transition')),
    );
    expect(Number(oldStyle.opacity)).toBeCloseTo(Number(currentStyle.opacity));
    expect(oldStyle.transform).toEqual([{ translateX: 50 }, { translateY: 0 }]);
    expect(currentStyle.transform).toEqual([
      { translateX: -50 },
      { translateY: 0 },
    ]);

    await act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(hasNode(root, 'promotion:actor:a1:transition')).toBe(false);
    expect(hasNode(root, 'promotion:actor:b1:static')).toBe(true);
  });

  it('runs castling and off-target capture actors from the same board-local clock', async () => {
    const result = await render(
      <ChessboardRuntime
        boardId="special"
        development={false}
        dimensions={{ columns: 4, rows: 2 }}
        pieceRenderers={{ token: Probe }}
        position={{
          revision: 1,
          value: {
            a1: { id: 'king', pieceType: 'token' },
            b2: { id: 'victim', pieceType: 'token' },
            d1: { id: 'rook', pieceType: 'token' },
          },
        }}
        reduceMotion="never"
        transitionDurationMs={1_000}
      />,
    );
    const host = boardHosts(rootOf(result))[0];
    if (host === undefined) {
      throw new Error('Expected one board host.');
    }
    await measure(host, 400, 200);
    await result.rerender(
      <ChessboardRuntime
        boardId="special"
        development={false}
        dimensions={{ columns: 4, rows: 2 }}
        pieceRenderers={{ token: Probe }}
        position={{
          revision: 2,
          transition: {
            capturedSquare: 'b2',
            from: 'a1',
            fromRevision: 1,
            rookMove: { from: 'd1', to: 'b1' },
            to: 'c1',
            toRevision: 2,
          },
          value: {
            b1: { id: 'rook', pieceType: 'token' },
            c1: { id: 'king', pieceType: 'token' },
          },
        }}
        reduceMotion="never"
        transitionDurationMs={1_000}
      />,
    );

    const root = rootOf(result);
    expect(hasNode(root, 'special:king:c1:transition')).toBe(true);
    expect(hasNode(root, 'special:rook:b1:transition')).toBe(true);
    expect(hasNode(root, 'special:victim:b2:transition')).toBe(true);
    await act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(
      animatedStyle(
        requiredParent(requiredNode(root, 'special:king:c1:transition')),
      ).transform,
    ).toEqual([{ translateX: -100 }, { translateY: 0 }]);
    expect(
      animatedStyle(
        requiredParent(requiredNode(root, 'special:rook:b1:transition')),
      ).transform,
    ).toEqual([{ translateX: 100 }, { translateY: 0 }]);
    expect(
      animatedStyle(
        requiredParent(requiredNode(root, 'special:victim:b2:transition')),
      ).opacity,
    ).toBeCloseTo(0.5);
    await act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(hasNode(root, 'special:king:c1:static')).toBe(true);
    expect(hasNode(root, 'special:rook:b1:static')).toBe(true);
    expect(hasNode(root, 'special:victim:b2:transition')).toBe(false);
  });

  it('[CBN-CONTRACT-017-REDUCED-MOTION] snaps every current actor when motion is reduced', async () => {
    const result = await render(
      <ChessboardRuntime
        boardId="reduced"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        pieceRenderers={{ pawn: Probe, queen: Probe }}
        position={{
          revision: 1,
          value: {
            a1: { id: 'runner', pieceType: 'pawn' },
            b1: { id: 'victim', pieceType: 'pawn' },
          },
        }}
        reduceMotion="always"
      />,
    );
    const host = boardHosts(rootOf(result))[0];
    if (host === undefined) {
      throw new Error('Expected one board host.');
    }
    await measure(host, 200, 100);
    await result.rerender(
      <ChessboardRuntime
        boardId="reduced"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        pieceRenderers={{ pawn: Probe, queen: Probe }}
        position={{
          revision: 2,
          transition: {
            capturedSquare: 'b1',
            from: 'a1',
            fromRevision: 1,
            promotion: 'queen',
            to: 'b1',
            toRevision: 2,
          },
          value: { b1: { id: 'runner', pieceType: 'queen' } },
        }}
        reduceMotion="always"
      />,
    );

    expect(hasNode(rootOf(result), 'reduced:runner:b1:static')).toBe(true);
    expect(hasNode(rootOf(result), 'reduced:runner:a1:transition')).toBe(false);
    expect(hasNode(rootOf(result), 'reduced:victim:b1:transition')).toBe(false);
    expect(hasNode(rootOf(result), 'reduced:runner:b1:transition')).toBe(false);
  });

  it('clears every transient actor when the latest controlled position is invalid', async () => {
    const result = await render(
      <ChessboardRuntime
        boardId="invalid-latest"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        logError={jest.fn()}
        pieceRenderers={{ token: Probe }}
        position={{
          revision: 1,
          value: { a1: { id: 'runner', pieceType: 'token' } },
        }}
        reduceMotion="never"
      />,
    );
    const host = boardHosts(rootOf(result))[0];
    if (host === undefined) {
      throw new Error('Expected one board host.');
    }
    await measure(host, 200, 100);
    await result.rerender(
      <ChessboardRuntime
        boardId="invalid-latest"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        logError={jest.fn()}
        pieceRenderers={{ token: Probe }}
        position={{
          revision: 2,
          value: { b1: { id: 'runner', pieceType: 'token' } },
        }}
        reduceMotion="never"
      />,
    );
    expect(hasNode(rootOf(result), 'invalid-latest:runner:b1:transition')).toBe(
      true,
    );

    await result.rerender(
      <ChessboardRuntime
        boardId="invalid-latest"
        development={false}
        dimensions={{ columns: 2, rows: 1 }}
        logError={jest.fn()}
        pieceRenderers={{ token: Probe }}
        position={{ revision: 3, value: { z9: { pieceType: 'token' } } }}
        reduceMotion="never"
      />,
    );
    expect(
      rootOf(result).queryAll((node) =>
        String(node.props['testID'] ?? '').startsWith('invalid-latest:'),
      ),
    ).toEqual([]);
  });

  it('reports stale transition hints once after commit and rejects malformed durations', async () => {
    const logTransitionWarning = jest.fn<undefined, [string]>();
    const result = await render(
      <ChessboardRuntime
        boardId="warning"
        development
        dimensions={{ columns: 2, rows: 1 }}
        logTransitionWarning={logTransitionWarning}
        pieceRenderers={{ token: Probe }}
        position={{
          revision: 1,
          value: { a1: { id: 'runner', pieceType: 'token' } },
        }}
        reduceMotion="always"
      />,
    );
    const host = boardHosts(rootOf(result))[0];
    if (host === undefined) {
      throw new Error('Expected one board host.');
    }
    await measure(host, 200, 100);
    const stale = (
      <ChessboardRuntime
        boardId="warning"
        development
        dimensions={{ columns: 2, rows: 1 }}
        logTransitionWarning={logTransitionWarning}
        pieceRenderers={{ token: Probe }}
        position={{
          revision: 2,
          transition: {
            from: 'a1',
            fromRevision: 0,
            to: 'b1',
            toRevision: 2,
          },
          value: { b1: { id: 'runner', pieceType: 'token' } },
        }}
        reduceMotion="always"
      />
    );
    await result.rerender(stale);
    expect(logTransitionWarning).toHaveBeenCalledTimes(1);
    await result.rerender(stale);
    expect(logTransitionWarning).toHaveBeenCalledTimes(1);

    await expect(
      render(
        <ChessboardRuntime
          boardId="duration-error"
          development={false}
          position={{}}
          transitionDurationMs={-1}
        />,
      ),
    ).rejects.toThrow(
      'Chessboard transitionDurationMs must be a finite non-negative number.',
    );
  });
});
