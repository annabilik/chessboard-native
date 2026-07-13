import { act, fireEvent, render } from '@testing-library/react-native';
import {
  startTransition,
  StrictMode,
  Suspense,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { TestInstance } from 'test-renderer';

import {
  Chessboard,
  type ChessboardError,
  type ChessboardErrorContext,
} from '../../src/index';
import { ChessboardRuntime } from '../../src/Chessboard';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

const SQUARE_COLORS = new Set(['#B58863', '#F0D9B5']);

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

function flattenedStyle(node: TestInstance): ViewStyle {
  return StyleSheet.flatten(node.props['style'] as StyleProp<ViewStyle>);
}

function squareNodes(root: TestInstance): TestInstance[] {
  const paints = root.queryAll((node) => {
    const backgroundColor = flattenedStyle(node).backgroundColor;
    return (
      typeof backgroundColor === 'string' && SQUARE_COLORS.has(backgroundColor)
    );
  });

  return paints.map((paint) => {
    if (paint.parent === null) {
      throw new Error('Expected square paint inside a measured frame.');
    }
    return paint.parent;
  });
}

function notationNodes(root: TestInstance): TestInstance[] {
  return root.queryAll((node) => node.props['allowFontScaling'] === false);
}

function flattenedTextStyle(node: TestInstance): TextStyle {
  return StyleSheet.flatten(node.props['style'] as StyleProp<TextStyle>);
}

function notationValues(root: TestInstance): string[] {
  return notationNodes(root).map((node) => {
    const value = node.props['children'] as unknown;
    if (typeof value !== 'string') {
      throw new TypeError('Expected one string notation child.');
    }
    return value;
  });
}

function requiredNode(
  nodes: readonly TestInstance[],
  index: number,
): TestInstance {
  const node = nodes.at(index);
  if (node === undefined) {
    throw new RangeError(`Expected rendered node at index ${String(index)}.`);
  }
  return node;
}

describe('Chessboard controlled boundary', () => {
  it('renders one responsive adjustable host with decorative visual layers', async () => {
    const result = await render(
      <Chessboard boardId="diagram" position="8/8/8/8/8/8/8/8" />,
    );

    expect(result.container.children).toHaveLength(1);
    const root = rootOf(result);
    expect(root).toHaveProp('accessibilityState', { disabled: false });
    expect(root).toHaveProp('accessibilityRole', 'adjustable');
    expect(root).toHaveProp('accessible', true);
    expect(root).toHaveProp('collapsable', false);
    expect(root).toHaveProp('importantForAccessibility', 'yes');
    expect(root).toHaveProp('pointerEvents', 'box-none');
    expect(root).toHaveStyle({ aspectRatio: 1, width: '100%' });
    expect(squareNodes(root)).toEqual([]);

    await measure(root, 320, 320);
    expect(squareNodes(root)).toHaveLength(64);
    const visualLayers = root.queryAll(
      (node) => node.props['accessibilityElementsHidden'] === true,
    );
    expect(visualLayers).toHaveLength(4);
    const visualLayer = requiredNode(visualLayers, 0);
    expect(visualLayer).toHaveProp('accessible', false);
    expect(visualLayer).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    const gesturePlane = root.queryAll(
      (node) =>
        node.props['testID'] === getBoardGestureTestIds('diagram').plane,
    );
    expect(gesturePlane).toHaveLength(1);
    expect(requiredNode(gesturePlane, 0)).toHaveProp('pointerEvents', 'none');
  });

  it('[PARITY-OPTION-CHESSBOARD-ROWS] renders supported row counts with width-derived height', async () => {
    const result = await render(
      <Chessboard
        boardId="rows"
        dimensions={{ columns: 3, rows: 5 }}
        position={{}}
      />,
    );
    const root = rootOf(result);
    expect(root).toHaveStyle({ aspectRatio: 3 / 5, width: '100%' });

    await measure(root, 300, 500);
    const squares = squareNodes(root);
    expect(squares).toHaveLength(15);
    expect(flattenedStyle(requiredNode(squares, 0))).toEqual(
      expect.objectContaining({ height: 100, left: 0, top: 0, width: 100 }),
    );
    expect(flattenedStyle(requiredNode(squares, -1))).toEqual(
      expect.objectContaining({
        height: 100,
        left: 200,
        top: 400,
        width: 100,
      }),
    );
  });

  it('[PARITY-OPTION-CHESSBOARD-COLUMNS] renders supported column counts with width-derived cells', async () => {
    const result = await render(
      <Chessboard
        boardId="columns"
        dimensions={{ columns: 10, rows: 4 }}
        position={{}}
      />,
    );
    const root = rootOf(result);
    expect(root).toHaveStyle({ aspectRatio: 10 / 4, width: '100%' });

    await measure(root, 250, 100);
    const squares = squareNodes(root);
    expect(squares).toHaveLength(40);
    expect(
      squares.every((square) => {
        const style = flattenedStyle(square);
        return style.width === 25 && style.height === 25;
      }),
    ).toBe(true);
  });

  it('applies orientation immediately without waiting for another measurement', async () => {
    const result = await render(
      <Chessboard
        boardId="orientation"
        dimensions={{ columns: 3, rows: 2 }}
        position={{}}
      />,
    );
    const root = rootOf(result);
    await measure(root, 300, 200);
    expect(notationValues(root)).toEqual(['2', '1', 'a', 'b', 'c']);

    await result.rerender(
      <Chessboard
        boardId="orientation"
        dimensions={{ columns: 3, rows: 2 }}
        orientation="black"
        position={{}}
      />,
    );
    expect(notationValues(rootOf(result))).toEqual(['1', '2', 'c', 'b', 'a']);
  });

  it('[PARITY-OPTION-SHOW-NOTATION] defaults notation on and hides it declaratively', async () => {
    const result = await render(
      <Chessboard boardId="notation" position="8/8/8/8/8/8/8/8" />,
    );
    await measure(rootOf(result), 320, 320);
    expect(notationNodes(rootOf(result))).toHaveLength(16);

    await result.rerender(
      <Chessboard
        boardId="notation"
        position="8/8/8/8/8/8/8/8"
        showNotation={false}
      />,
    );
    expect(notationNodes(rootOf(result))).toEqual([]);
    expect(squareNodes(rootOf(result))).toHaveLength(64);
  });

  it('scales notation typography and insets inside narrow variant cells', async () => {
    const result = await render(
      <Chessboard
        boardId="narrow-notation"
        dimensions={{ columns: 26, rows: 1 }}
        position={{}}
      />,
    );
    await measure(rootOf(result), 26, 1);
    const notation = notationNodes(rootOf(result));
    expect(notation).toHaveLength(27);
    expect(flattenedTextStyle(requiredNode(notation, 0))).toEqual(
      expect.objectContaining({ fontSize: 0.325, left: 0.08, top: 0.08 }),
    );
    expect(flattenedTextStyle(requiredNode(notation, 1))).toEqual(
      expect.objectContaining({ bottom: 0.04, fontSize: 0.325, right: 0.1 }),
    );
  });

  it('remeasures independently and clears stale geometry at zero size or dimension changes', async () => {
    const result = await render(
      <Chessboard
        boardId="resize"
        dimensions={{ columns: 3, rows: 2 }}
        position={{}}
      />,
    );
    await measure(rootOf(result), 300.5, 200.25);
    const firstSquareStyle = flattenedStyle(
      requiredNode(squareNodes(rootOf(result)), 0),
    );
    expect(firstSquareStyle.height).toBeCloseTo(100.125, 12);
    expect(firstSquareStyle.width).toBeCloseTo(300.5 / 3, 12);

    await measure(rootOf(result), 0, 0);
    expect(squareNodes(rootOf(result))).toEqual([]);

    await measure(rootOf(result), 150, 100);
    expect(squareNodes(rootOf(result))).toHaveLength(6);
    await result.rerender(
      <Chessboard
        boardId="resize"
        dimensions={{ columns: 4, rows: 2 }}
        position={{}}
      />,
    );
    expect(squareNodes(rootOf(result))).toEqual([]);
    expect(rootOf(result)).toHaveStyle({ aspectRatio: 2 });
    await measure(rootOf(result), 200, 100);
    expect(squareNodes(rootOf(result))).toHaveLength(8);
  });

  it('reprojects same-aspect dimension changes without requiring another layout event', async () => {
    const result = await render(
      <Chessboard boardId="same-aspect" position="8/8/8/8/8/8/8/8" />,
    );
    await measure(rootOf(result), 320, 320);
    expect(squareNodes(rootOf(result))).toHaveLength(64);

    await result.rerender(
      <Chessboard
        boardId="same-aspect"
        dimensions={{ columns: 4, rows: 4 }}
        position={{}}
      />,
    );
    const squares = squareNodes(rootOf(result));
    expect(squares).toHaveLength(16);
    expect(flattenedStyle(requiredNode(squares, 0))).toEqual(
      expect.objectContaining({ height: 80, width: 80 }),
    );
    expect(notationNodes(rootOf(result))).toHaveLength(8);
  });

  it('keeps every square and notation label visual-only', async () => {
    const result = await render(
      <Chessboard boardId="decorative" position="8/8/8/8/8/8/8/8" />,
    );
    await measure(rootOf(result), 320, 320);

    for (const node of [
      ...squareNodes(rootOf(result)),
      ...notationNodes(rootOf(result)),
    ]) {
      expect(node).toHaveProp('accessible', false);
      expect(node).toHaveProp('pointerEvents', 'none');
      expect(node.props).not.toHaveProperty('onPress');
    }
  });

  it('measures simultaneous boards independently', async () => {
    const result = await render(
      <View>
        <Chessboard
          boardId="first"
          dimensions={{ columns: 3, rows: 2 }}
          position={{}}
        />
        <Chessboard
          boardId="second"
          dimensions={{ columns: 2, rows: 4 }}
          orientation="black"
          position={{}}
        />
      </View>,
    );
    const hosts = rootOf(result).queryAll(
      (node) =>
        node.props['collapsable'] === false &&
        typeof node.props['onLayout'] === 'function',
    );
    expect(hosts).toHaveLength(2);

    const first = requiredNode(hosts, 0);
    const second = requiredNode(hosts, 1);
    await measure(first, 150, 100);
    await measure(second, 80, 160);
    expect(squareNodes(first)).toHaveLength(6);
    expect(squareNodes(second)).toHaveLength(8);
    expect(notationValues(first)).toEqual(['2', '1', 'a', 'b', 'c']);
    expect(notationValues(second)).toEqual(['1', '2', '3', '4', 'b', 'a']);
  });

  it('renders domain-correct disabled surfaces without retaining stale geometry', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const invalidPosition = await render(
      <ChessboardRuntime
        boardId="invalid-position"
        development={false}
        dimensions={{ columns: 3, rows: 2 }}
        onError={onError}
        position={{ A1: { pieceType: 'wR' } }}
      />,
    );
    await measure(rootOf(invalidPosition), 300, 200);
    expect(squareNodes(rootOf(invalidPosition))).toHaveLength(6);
    expect(rootOf(invalidPosition)).toHaveProp('accessibilityState', {
      disabled: true,
    });

    const invalidDimensions = await render(
      <ChessboardRuntime
        boardId="invalid-dimensions"
        development={false}
        dimensions={{ columns: 0, rows: 2 }}
        onError={onError}
        position={{}}
      />,
    );
    expect(rootOf(invalidDimensions)).toHaveStyle({ aspectRatio: 1 });
    await measure(rootOf(invalidDimensions), 200, 200);
    expect(squareNodes(rootOf(invalidDimensions))).toEqual([]);
    expect(rootOf(invalidDimensions)).toHaveProp('accessibilityState', {
      disabled: true,
    });
  });

  it('reports an invalid production render once across Strict Mode replay, rerenders, and handler changes', async () => {
    const firstHandler = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const secondHandler = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const result = await render(
      <StrictMode>
        <ChessboardRuntime
          boardId="analysis"
          development={false}
          onError={firstHandler}
          position={{ revision: 1, value: 'not/fen' }}
        />
      </StrictMode>,
    );

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(firstHandler.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        code: 'INVALID_FEN',
        domain: 'position',
        revision: 1,
      }),
    );
    expect(result.root).toHaveProp('accessibilityState', { disabled: true });

    await result.rerender(
      <StrictMode>
        <ChessboardRuntime
          boardId="analysis"
          development={false}
          onError={secondHandler}
          position={{ revision: 1, value: 'still/not/fen' }}
        />
      </StrictMode>,
    );
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).not.toHaveBeenCalled();

    await result.rerender(
      <StrictMode>
        <ChessboardRuntime
          boardId="analysis"
          development={false}
          onError={secondHandler}
          position={{ revision: 2, value: 'still/not/fen' }}
        />
      </StrictMode>,
    );
    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler.mock.calls[0]?.[0].revision).toBe(2);
  });

  it('logs once after commit when no production handler exists', async () => {
    const logError = jest.fn<undefined, [ChessboardError]>();
    const result = await render(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        logError={logError}
        position="not/fen"
      />,
    );
    expect(logError).toHaveBeenCalledTimes(1);

    await result.rerender(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        logError={logError}
        position="still/not/fen"
      />,
    );
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('enforces mounted tier stability through the public component runtime', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const result = await render(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        onError={onError}
        position={{ e4: { pieceType: 'wP' } }}
      />,
    );

    await result.rerender(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        onError={onError}
        position={{ revision: 1, value: { e4: { pieceType: 'wP' } } }}
      />,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].code).toBe(
      'POSITION_CONTROL_TIER_CHANGED',
    );
    expect(result.root).toHaveProp('accessibilityState', { disabled: true });
  });

  it('resets report and tier lifetimes after unmount', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const first = await render(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        onError={onError}
        position={{ revision: 2, value: 'not/fen' }}
      />,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    await first.unmount();

    const second = await render(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        onError={onError}
        position="not/fen"
      />,
    );
    expect(onError).toHaveBeenCalledTimes(2);
    await second.unmount();
  });

  it('does not commit correlation metadata from an abandoned concurrent render', async () => {
    type Scenario = 'initial' | 'suspended' | 'urgent' | 'invalid';
    const never = new Promise<never>(() => undefined);
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    let updateScenario: Dispatch<SetStateAction<Scenario>> = () => {
      throw new Error('Concurrent harness did not render.');
    };

    function SuspendAfterBoard({ scenario }: { scenario: Scenario }) {
      if (scenario === 'suspended') {
        // React Suspense uses thrown thenables to abandon this candidate.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw never;
      }
      return null;
    }

    function ConcurrentHarness() {
      const [scenario, setScenario] = useState<Scenario>('initial');
      updateScenario = setScenario;
      const position =
        scenario === 'initial'
          ? {}
          : scenario === 'suspended'
            ? { a1: { pieceType: 'wR' } }
            : scenario === 'urgent'
              ? { b1: { pieceType: 'wN' } }
              : 'not/fen';

      return (
        <Suspense fallback={null}>
          <ChessboardRuntime
            boardId="concurrent"
            development={false}
            onError={onError}
            position={position}
          />
          <SuspendAfterBoard scenario={scenario} />
        </Suspense>
      );
    }

    await render(<ConcurrentHarness />);
    const setScenario: Dispatch<SetStateAction<Scenario>> = updateScenario;

    await act(() => {
      startTransition(() => {
        setScenario('suspended');
      });
    });
    await act(() => {
      setScenario('urgent');
    });
    await act(() => {
      setScenario('invalid');
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ code: 'INVALID_FEN', revision: 2 }),
    );
  });

  it('throws typed errors during development without reporting them', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();

    await expect(
      render(
        <ChessboardRuntime
          boardId="analysis"
          development
          onError={onError}
          position="not/fen"
        />,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'INVALID_FEN', name: 'ChessboardError' }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports an invalid runtime orientation and renders no projected squares', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const result = await render(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        dimensions={{ columns: 3, rows: 2 }}
        onError={onError}
        orientation={'sideways' as never}
        position={{}}
      />,
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INVALID_ORIENTATION',
        domain: 'dimensions',
      }),
      expect.objectContaining({ domain: 'dimensions', revision: null }),
    );
    expect(rootOf(result)).toHaveStyle({ aspectRatio: 3 / 2 });
    await measure(rootOf(result), 300, 200);
    expect(squareNodes(rootOf(result))).toEqual([]);
    expect(rootOf(result)).toHaveProp('accessibilityState', { disabled: true });
  });
});
