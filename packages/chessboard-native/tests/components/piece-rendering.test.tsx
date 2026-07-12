import { fireEvent, render } from '@testing-library/react-native';
import { useState, type ReactElement } from 'react';
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
  type PieceRendererProps,
  type PieceRenderers,
} from '../../src';
import { ChessboardRuntime } from '../../src/Chessboard';

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

function flattenedViewStyle(node: TestInstance): ViewStyle {
  const style = StyleSheet.flatten(
    node.props['style'] as StyleProp<ViewStyle>,
  ) as ViewStyle | undefined;
  return style ?? {};
}

function flattenedTextStyle(node: TestInstance): TextStyle {
  return StyleSheet.flatten(node.props['style'] as StyleProp<TextStyle>);
}

function nodeByTestId(root: TestInstance, testID: string): TestInstance | null {
  const matches = root.queryAll((node) => node.props['testID'] === testID);
  if (matches.length > 1) {
    throw new Error(`Expected at most one node with testID ${testID}.`);
  }
  return matches[0] ?? null;
}

function requiredNodeByTestId(
  root: TestInstance,
  testID: string,
): TestInstance {
  const node = nodeByTestId(root, testID);
  if (node === null) {
    throw new Error(`Expected one node with testID ${testID}.`);
  }
  return node;
}

function measuredPieceHost(node: TestInstance): TestInstance {
  let current: TestInstance | null = node;

  while (current !== null) {
    const style = flattenedViewStyle(current);
    if (
      style.position === 'absolute' &&
      typeof style.left === 'number' &&
      typeof style.top === 'number' &&
      typeof style.width === 'number' &&
      typeof style.height === 'number'
    ) {
      return current;
    }
    current = current.parent;
  }

  throw new Error('Expected a measured board-owned piece host.');
}

function pieceProbe(props: PieceRendererProps): ReactElement {
  return <View testID={`piece:${props.square}:${props.piece.pieceType}`} />;
}

const tokenRenderers = Object.freeze({
  token: pieceProbe,
}) satisfies PieceRenderers;

describe('controlled piece rendering', () => {
  it('[PARITY-OPTION-POSITION] renders FEN and open object positions from the current prop', async () => {
    const fen = await render(
      <Chessboard
        boardId="fen-position"
        position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
      />,
    );
    await measure(rootOf(fen), 320, 320);
    expect(
      rootOf(fen).queryAll(
        (node) =>
          node.props['minX'] === 0 &&
          node.props['minY'] === 0 &&
          node.props['vbWidth'] === 100 &&
          node.props['vbHeight'] === 100,
      ),
    ).toHaveLength(32);

    const object = await render(
      <Chessboard
        boardId="object-position"
        dimensions={{ columns: 5, rows: 3 }}
        pieceRenderers={tokenRenderers}
        position={{ c2: { id: 'guide', pieceType: 'token' } }}
      />,
    );
    await measure(rootOf(object), 250, 150);
    expect(nodeByTestId(rootOf(object), 'piece:c2:token')).not.toBeNull();
  });

  it('[PARITY-BEHAVIOR-B07] replaces A with B immediately and never falls back after invalid C', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const result = await render(
      <ChessboardRuntime
        boardId="latest-position"
        development={false}
        onError={onError}
        pieceRenderers={tokenRenderers}
        position={{ a1: { pieceType: 'token' } }}
      />,
    );
    await measure(rootOf(result), 320, 320);
    expect(nodeByTestId(rootOf(result), 'piece:a1:token')).not.toBeNull();

    await result.rerender(
      <ChessboardRuntime
        boardId="latest-position"
        development={false}
        onError={onError}
        pieceRenderers={tokenRenderers}
        position={{ b2: { pieceType: 'token' } }}
      />,
    );
    expect(nodeByTestId(rootOf(result), 'piece:a1:token')).toBeNull();
    expect(nodeByTestId(rootOf(result), 'piece:b2:token')).not.toBeNull();

    await result.rerender(
      <ChessboardRuntime
        boardId="latest-position"
        development={false}
        onError={onError}
        pieceRenderers={tokenRenderers}
        position={{ B2: { pieceType: 'token' } }}
      />,
    );
    expect(nodeByTestId(rootOf(result), 'piece:b2:token')).toBeNull();
    expect(rootOf(result)).toHaveProp('accessibilityState', { disabled: true });
  });

  it('keeps valid current pieces visible when annotation and selection domains fail', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const result = await render(
      <ChessboardRuntime
        annotations={[
          {
            color: '#ff0000',
            id: 'outside-board',
            square: 'z99',
            type: 'square',
          },
        ]}
        boardId="isolated-domain-errors"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onError={onError}
        pieceRenderers={tokenRenderers}
        position={{ a1: { pieceType: 'token' } }}
        selection={{ selectedSquare: 'z99' }}
      />,
    );
    await measure(rootOf(result), 200, 200);

    expect(nodeByTestId(rootOf(result), 'piece:a1:token')).not.toBeNull();
    expect(rootOf(result)).toHaveProp('accessibilityState', {
      disabled: false,
    });
    expect(onError.mock.calls.map(([error]) => error.domain).sort()).toEqual([
      'annotations',
      'selection',
    ]);
  });

  it('projects one canonical square into both orientations with no position rewrite', async () => {
    const result = await render(
      <Chessboard
        boardId="piece-orientation"
        dimensions={{ columns: 2, rows: 2 }}
        pieceRenderers={tokenRenderers}
        position={{ a1: { pieceType: 'token' } }}
      />,
    );
    await measure(rootOf(result), 200, 200);
    expect(
      flattenedViewStyle(
        measuredPieceHost(
          requiredNodeByTestId(rootOf(result), 'piece:a1:token'),
        ),
      ),
    ).toEqual(
      expect.objectContaining({ height: 100, left: 0, top: 100, width: 100 }),
    );

    await result.rerender(
      <Chessboard
        boardId="piece-orientation"
        dimensions={{ columns: 2, rows: 2 }}
        orientation="black"
        pieceRenderers={tokenRenderers}
        position={{ a1: { pieceType: 'token' } }}
      />,
    );
    expect(
      flattenedViewStyle(
        measuredPieceHost(
          requiredNodeByTestId(rootOf(result), 'piece:a1:token'),
        ),
      ),
    ).toEqual(
      expect.objectContaining({ height: 100, left: 100, top: 0, width: 100 }),
    );
  });

  it('invokes custom renderers as components with frozen static context and board-owned styling', async () => {
    let observed: PieceRendererProps | null = null;

    function HookRenderer(props: PieceRendererProps): ReactElement {
      const [marker] = useState('hook-ok');
      observed = props;
      return <View accessible onTouchStart={() => undefined} testID={marker} />;
    }

    const result = await render(
      <Chessboard
        boardId="renderer-contract"
        dimensions={{ columns: 3, rows: 2 }}
        pieceRenderers={{ fairy: HookRenderer }}
        position={{ b1: { id: 'fairy-1', pieceType: 'fairy' } }}
        styles={{ piece: { backgroundColor: '#445566' } }}
        theme={{ piece: { opacity: 0.8 } }}
      />,
    );
    await measure(rootOf(result), 300, 200);
    const customContent = requiredNodeByTestId(rootOf(result), 'hook-ok');
    const host = measuredPieceHost(customContent);
    const captured = observed as PieceRendererProps | null;

    expect(captured).not.toBeNull();
    expect(captured).toEqual(
      expect.objectContaining({
        boardId: 'renderer-contract',
        piece: { id: 'fairy-1', pieceType: 'fairy' },
        size: 100,
        square: 'b1',
        state: {
          isDragging: false,
          isGhost: false,
          isPending: false,
          isPressed: false,
          isTransitioning: false,
        },
      }),
    );
    if (captured === null) {
      throw new Error('Expected renderer context.');
    }
    expect(captured.style).toEqual(
      expect.objectContaining({
        backgroundColor: '#445566',
        opacity: 0.8,
      }),
    );
    expect(Object.isFrozen(captured.style)).toBe(true);
    expect(flattenedViewStyle(host)).toEqual(
      expect.objectContaining({
        backgroundColor: '#445566',
        height: 100,
        opacity: 0.8,
        width: 100,
      }),
    );
    expect(host).toHaveProp('accessibilityElementsHidden', true);
    expect(host).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    expect(host).toHaveProp('pointerEvents', 'none');
    expect(customContent).toHaveProp('accessible', true);
  });

  it('[PARITY-BEHAVIOR-B46] keeps oriented notation and applies contrast then axis overrides', async () => {
    const result = await render(
      <Chessboard
        boardId="notation-styles"
        dimensions={{ columns: 2, rows: 2 }}
        orientation="black"
        position={{}}
        styles={{
          fileNotation: { color: '#ff00ff', fontSize: 9, right: 7 },
          rankNotation: { fontSize: 10, top: 6 },
        }}
        theme={{
          darkSquareNotation: { color: '#101010' },
          lightSquareNotation: { color: '#fefefe' },
        }}
      />,
    );
    await measure(rootOf(result), 200, 200);
    const labels = rootOf(result).queryAll(
      (node) => node.props['allowFontScaling'] === false,
    );

    expect(
      labels.map((label) => {
        const child: unknown = label.props['children'];
        if (typeof child !== 'string') {
          throw new TypeError('Expected one string notation label.');
        }
        return child;
      }),
    ).toEqual(['1', '2', 'b', 'a']);
    const rankLabel = labels[0];
    const fileLabel = labels[2];
    if (rankLabel === undefined || fileLabel === undefined) {
      throw new Error('Expected oriented rank and file notation.');
    }
    const rankStyle = flattenedTextStyle(rankLabel);
    const fileStyle = flattenedTextStyle(fileLabel);
    expect(rankStyle).toEqual(
      expect.objectContaining({ color: '#fefefe', fontSize: 10, top: 6 }),
    );
    expect(fileStyle).toEqual(
      expect.objectContaining({ color: '#ff00ff', fontSize: 9, right: 7 }),
    );
  });

  it('wires canonical square precedence without yielding measured geometry', async () => {
    const result = await render(
      <Chessboard
        boardId="styled-squares"
        dimensions={{ columns: 2, rows: 2 }}
        orientation="black"
        position={{}}
        squareStyles={{
          a1: {
            backgroundColor: '#ffcc00',
            boxSizing: 'content-box',
            height: 1,
            inset: 12,
            marginInlineStart: 12,
            maxWidth: 1,
            minHeight: 999,
            position: 'relative',
            width: 1,
          },
        }}
        styles={{
          board: {
            backgroundColor: '#202020',
            borderRadius: 6,
            borderWidth: 8,
            boxSizing: 'content-box',
            paddingLeft: 24,
            transform: [{ scale: 2 }],
            transformOrigin: 'left top',
            width: 24,
          },
          square: { borderWidth: 2 },
        }}
        theme={{
          darkSquare: { backgroundColor: '#303030' },
          lightSquare: { backgroundColor: '#e0e0e0' },
        }}
      />,
    );
    const root = rootOf(result);
    expect(flattenedViewStyle(root)).toEqual(
      expect.objectContaining({
        aspectRatio: 1,
        backgroundColor: '#202020',
        borderRadius: 6,
        padding: 0,
        width: '100%',
      }),
    );
    expect(flattenedViewStyle(root).paddingLeft).toBeUndefined();
    expect(flattenedViewStyle(root).borderWidth).toBeUndefined();
    expect(flattenedViewStyle(root).boxSizing).toBeUndefined();
    expect(flattenedViewStyle(root).transform).toBeUndefined();
    expect(flattenedViewStyle(root).transformOrigin).toBeUndefined();
    await measure(root, 200, 200);

    const highlighted = root.queryAll(
      (node) => flattenedViewStyle(node).backgroundColor === '#ffcc00',
    );
    expect(highlighted).toHaveLength(1);
    const highlightedSquare = highlighted[0];
    if (highlightedSquare === undefined) {
      throw new Error('Expected one canonical square override.');
    }
    expect(flattenedViewStyle(highlightedSquare)).toEqual(
      expect.objectContaining({
        borderWidth: 2,
        boxSizing: 'border-box',
        inset: undefined,
        marginInlineStart: 0,
        maxWidth: undefined,
        minHeight: undefined,
        position: 'absolute',
      }),
    );
    const squareFrame = highlightedSquare.parent;
    if (squareFrame === null) {
      throw new Error('Expected highlighted paint inside a measured frame.');
    }
    expect(flattenedViewStyle(squareFrame)).toEqual(
      expect.objectContaining({
        height: 100,
        left: 100,
        position: 'absolute',
        top: 0,
        width: 100,
      }),
    );
  });

  it('renders square paint before the piece plane and isolates simultaneous boards', async () => {
    const result = await render(
      <View>
        <Chessboard
          boardId="layer-first"
          dimensions={{ columns: 1, rows: 1 }}
          pieceRenderers={tokenRenderers}
          position={{ a1: { pieceType: 'token' } }}
        />
        <Chessboard
          boardId="layer-second"
          dimensions={{ columns: 1, rows: 1 }}
          pieceRenderers={{ other: pieceProbe }}
          position={{ a1: { pieceType: 'other' } }}
        />
      </View>,
    );
    const hosts = rootOf(result).queryAll(
      (node) =>
        node.props['collapsable'] === false &&
        typeof node.props['onLayout'] === 'function',
    );
    expect(hosts).toHaveLength(2);
    const firstHost = hosts[0];
    const secondHost = hosts[1];
    if (firstHost === undefined || secondHost === undefined) {
      throw new Error('Expected two measured board hosts.');
    }
    await measure(firstHost, 80, 80);
    await measure(secondHost, 120, 120);

    expect(
      flattenedViewStyle(
        measuredPieceHost(
          requiredNodeByTestId(rootOf(result), 'piece:a1:token'),
        ),
      ).width,
    ).toBe(80);
    expect(
      flattenedViewStyle(
        measuredPieceHost(
          requiredNodeByTestId(rootOf(result), 'piece:a1:other'),
        ),
      ).width,
    ).toBe(120);

    const firstVisualPlanes = firstHost.queryAll(
      (node) => node.props['accessibilityElementsHidden'] === true,
    );
    const squarePlaneIndex = firstVisualPlanes.findIndex(
      (plane) =>
        plane.queryAll(
          (node) => flattenedViewStyle(node).backgroundColor === '#B58863',
        ).length > 0,
    );
    const piecePlaneIndex = firstVisualPlanes.findIndex(
      (plane) =>
        plane.queryAll((node) => node.props['testID'] === 'piece:a1:token')
          .length > 0,
    );
    expect(squarePlaneIndex).toBeGreaterThanOrEqual(0);
    expect(piecePlaneIndex).toBeGreaterThan(squarePlaneIndex);
  });
});
