import { render } from '@testing-library/react-native';
import { forwardRef, memo, useState, type ReactElement } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { TestInstance } from 'test-renderer';

import type { NormalizedControlledValue } from '../../src/internal/controlled-domain';
import type {
  PieceRenderer,
  PieceRendererProps,
  PieceRenderers,
  PositionObject,
} from '../../src/public-types';
import { createBoardSurfaceLayout } from '../../src/render/board-layout';
import {
  createBoardPieceLayouts,
  PieceLayer,
  resolvePieceRenderer,
} from '../../src/render/piece-layer';

const EMPTY_STYLE: Readonly<ViewStyle> = Object.freeze({});

function currentPosition(
  value: PositionObject,
  revision = 0,
): NormalizedControlledValue<PositionObject> {
  return Object.freeze({ revision, tier: 'envelope', value });
}

function frozenPosition(
  entries: Readonly<
    Record<string, Readonly<{ id?: string; pieceType: string }>>
  >,
): PositionObject {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(entries).map(([square, piece]) => [
        square,
        Object.freeze({ ...piece }),
      ]),
    ),
  );
}

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected PieceLayer to render one native root.');
  }
  return result.root;
}

function nodeByTestId(root: TestInstance, testID: string): TestInstance | null {
  return root.queryAll((node) => node.props['testID'] === testID).at(0) ?? null;
}

describe('measured piece projection', () => {
  it('centers pieces in fractional cells and preserves canonical identity across orientation', () => {
    const dimensions = { columns: 3, rows: 2 };
    const size = { height: 200, width: 301 };
    const position = frozenPosition({
      a1: { id: 'white-king', pieceType: 'wK' },
      c2: { pieceType: 'custom:dragon' },
    });
    const white = createBoardPieceLayouts(
      createBoardSurfaceLayout(size, dimensions, 'white'),
      position,
    );
    const black = createBoardPieceLayouts(
      createBoardSurfaceLayout(size, dimensions, 'black'),
      position,
    );

    const whiteA1 = white.find(({ square }) => square === 'a1');
    const blackA1 = black.find(({ square }) => square === 'a1');
    expect(whiteA1).toEqual(
      expect.objectContaining({
        key: 'id:white-king',
        size: 100,
        square: 'a1',
      }),
    );
    expect(blackA1).toEqual(
      expect.objectContaining({
        key: 'id:white-king',
        size: 100,
        square: 'a1',
      }),
    );
    expect(whiteA1?.rect.left).toBeCloseTo(1 / 6, 12);
    expect(whiteA1?.rect.top).toBe(100);
    expect(blackA1?.rect.left).toBeCloseTo(200 + 5 / 6, 12);
    expect(blackA1?.rect.top).toBe(0);
    expect(white.find(({ square }) => square === 'c2')?.key).toBe('square:c2');
    expect(white.map(({ square }) => square)).toEqual(['c2', 'a1']);
    expect(black.map(({ square }) => square)).toEqual(['a1', 'c2']);
  });

  it('returns an immutable empty projection for unavailable or empty positions', () => {
    const layout = createBoardSurfaceLayout(
      { height: 80, width: 80 },
      { columns: 1, rows: 1 },
      'white',
    );
    const unavailable = createBoardPieceLayouts(layout, null);
    const empty = createBoardPieceLayouts(layout, Object.freeze({}));

    expect(unavailable).toEqual([]);
    expect(empty).toBe(unavailable);
    expect(Object.isFrozen(empty)).toBe(true);
  });
});

describe('piece renderer resolution and composition', () => {
  it('[PARITY-OPTION-PIECES] uses a supplied renderer map as a whole replacement', async () => {
    const calls: PieceRendererProps[] = [];
    const CustomPawn: PieceRenderer = (props) => {
      calls.push(props);
      return <View testID={`custom-${props.square}`} />;
    };
    const inheritedKing: PieceRenderer = () => <View testID="inherited-king" />;
    const renderers = Object.assign(
      Object.create({ bK: inheritedKing }) as Record<string, PieceRenderer>,
      { wP: CustomPawn },
    );
    const layout = createBoardSurfaceLayout(
      { height: 100, width: 200 },
      { columns: 2, rows: 1 },
      'white',
    );
    const result = await render(
      <PieceLayer
        boardId="replacement"
        layout={layout}
        pieceRenderers={renderers}
        position={currentPosition(
          frozenPosition({
            a1: { pieceType: 'wP' },
            b1: { pieceType: 'bK' },
          }),
        )}
        style={EMPTY_STYLE}
      />,
    );

    expect(nodeByTestId(rootOf(result), 'custom-a1')).not.toBeNull();
    expect(nodeByTestId(rootOf(result), 'inherited-king')).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.piece.pieceType).toBe('wP');
  });

  it('[PARITY-BEHAVIOR-B48] renders hooks-capable custom artwork inside a visual-only measured wrapper', async () => {
    const calls: PieceRendererProps[] = [];
    function HookRenderer(props: PieceRendererProps): ReactElement {
      const [mountToken] = useState('mounted');
      calls.push(props);
      return <View testID={`${mountToken}-${props.square}`} />;
    }
    const renderers = Object.create(null) as Record<string, PieceRenderer>;
    Object.defineProperty(renderers, '__proto__', {
      enumerable: true,
      value: HookRenderer,
    });
    const layout = createBoardSurfaceLayout(
      { height: 200, width: 300 },
      { columns: 3, rows: 2 },
      'black',
    );
    const resolvedStyle = Object.freeze<ViewStyle>({
      aspectRatio: 8,
      bottom: 999,
      boxSizing: 'content-box',
      display: 'contents',
      height: 999,
      inset: 999,
      left: 999,
      margin: 999,
      marginBlock: 999,
      marginInlineEnd: 999,
      maxHeight: 1,
      maxWidth: 1,
      minHeight: 999,
      minWidth: 999,
      opacity: 0.4,
      pointerEvents: 'auto',
      position: 'relative',
      right: 999,
      top: 999,
      transform: [{ scale: 8 }],
      transformOrigin: 'left top',
      width: 999,
    });
    const result = await render(
      <PieceLayer
        boardId="custom-board"
        layout={layout}
        pieceRenderers={renderers}
        position={currentPosition(
          frozenPosition({ a1: { pieceType: '__proto__' } }),
        )}
        style={resolvedStyle}
      />,
    );

    const custom = nodeByTestId(rootOf(result), 'mounted-a1');
    if (custom === null) {
      throw new Error('Expected custom renderer output.');
    }
    const pieceHost = custom.parent;
    if (pieceHost === null) {
      throw new Error('Expected a board-owned piece host.');
    }
    const hostStyle = StyleSheet.flatten<ViewStyle>(
      pieceHost.props['style'] as StyleProp<ViewStyle>,
    );
    expect(hostStyle).toEqual(
      expect.objectContaining({
        aspectRatio: undefined,
        bottom: undefined,
        boxSizing: 'border-box',
        display: 'flex',
        height: 100,
        inset: undefined,
        left: 200,
        margin: 0,
        marginBlock: 0,
        marginInlineEnd: 0,
        maxHeight: undefined,
        maxWidth: undefined,
        minHeight: undefined,
        minWidth: undefined,
        opacity: 0.4,
        pointerEvents: 'none',
        position: 'absolute',
        right: undefined,
        top: 0,
        transform: undefined,
        transformOrigin: undefined,
        width: 100,
      }),
    );
    expect(pieceHost).toHaveProp('accessible', false);
    expect(pieceHost).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    expect(pieceHost).toHaveProp('pointerEvents', 'none');
    expect(rootOf(result)).toHaveProp('accessibilityElementsHidden', true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        boardId: 'custom-board',
        size: 100,
        square: 'a1',
        state: {
          isDragging: false,
          isGhost: false,
          isPending: false,
          isPressed: false,
          isTransitioning: false,
        },
      }),
    );
    expect(calls[0]?.style).toBe(resolvedStyle);
    expect(calls[0]?.style.display).toBe('contents');
    expect(calls[0]?.style.pointerEvents).toBe('auto');
  });

  it('accepts memoized and forwarded custom piece components', async () => {
    const MemoPiece = memo(function MemoPiece({
      square,
    }: PieceRendererProps): ReactElement {
      return <View testID={`memo-${square}`} />;
    });
    const ForwardedPiece = forwardRef<unknown, PieceRendererProps>(
      function ForwardedPiece({ square }, ref): ReactElement {
        void ref;
        return <View testID={`forwarded-${square}`} />;
      },
    );
    const renderers = Object.freeze({
      forwarded: ForwardedPiece,
      memo: MemoPiece,
    }) satisfies PieceRenderers;
    const layout = createBoardSurfaceLayout(
      { height: 80, width: 160 },
      { columns: 2, rows: 1 },
      'white',
    );
    const result = await render(
      <PieceLayer
        boardId="component-types"
        layout={layout}
        pieceRenderers={renderers}
        position={currentPosition(
          frozenPosition({
            a1: { pieceType: 'memo' },
            b1: { pieceType: 'forwarded' },
          }),
        )}
        style={EMPTY_STYLE}
      />,
    );

    expect(resolvePieceRenderer(renderers, 'memo')).toBe(MemoPiece);
    expect(resolvePieceRenderer(renderers, 'forwarded')).toBe(ForwardedPiece);
    expect(nodeByTestId(rootOf(result), 'memo-a1')).not.toBeNull();
    expect(nodeByTestId(rootOf(result), 'forwarded-b1')).not.toBeNull();
  });

  it('resolves exact own open-vocabulary keys and rejects unsafe lookups', () => {
    const Renderer: PieceRenderer = () => null;
    const renderers = Object.create({ inherited: Renderer }) as Record<
      string,
      PieceRenderer
    >;
    renderers[''] = Renderer;
    renderers['馬'] = Renderer;
    Object.defineProperty(renderers, '__proto__', { value: Renderer });

    expect(resolvePieceRenderer(renderers, '')).toBe(Renderer);
    expect(resolvePieceRenderer(renderers, '馬')).toBe(Renderer);
    expect(resolvePieceRenderer(renderers, '__proto__')).toBe(Renderer);
    expect(resolvePieceRenderer(renderers, 'inherited')).toBeNull();
    expect(resolvePieceRenderer(renderers, 'toString')).toBeNull();
    expect(
      resolvePieceRenderer(
        Object.defineProperty({}, 'broken', {
          get: () => {
            throw new Error('getter failed');
          },
        }) as PieceRenderers,
        'broken',
      ),
    ).toBeNull();
  });

  it('memoizes semantic no-ops but clears and renders the latest revision', async () => {
    const calls: string[] = [];
    const Renderer: PieceRenderer = ({ square }) => {
      calls.push(square);
      return <View testID={`latest-${square}`} />;
    };
    const renderers = Object.freeze({ token: Renderer });
    const layout = createBoardSurfaceLayout(
      { height: 80, width: 160 },
      { columns: 2, rows: 1 },
      'white',
    );
    const first = currentPosition(
      frozenPosition({ a1: { pieceType: 'token' } }),
      4,
    );
    const result = await render(
      <PieceLayer
        boardId="memo"
        layout={layout}
        pieceRenderers={renderers}
        position={first}
        style={EMPTY_STYLE}
      />,
    );
    expect(calls).toEqual(['a1']);

    await result.rerender(
      <PieceLayer
        boardId="memo"
        layout={layout}
        pieceRenderers={renderers}
        position={currentPosition(
          frozenPosition({ a1: { pieceType: 'token' } }),
          4,
        )}
        style={EMPTY_STYLE}
      />,
    );
    expect(calls).toEqual(['a1']);

    await result.rerender(
      <PieceLayer
        boardId="memo"
        layout={layout}
        pieceRenderers={renderers}
        position={null}
        style={EMPTY_STYLE}
      />,
    );
    expect(nodeByTestId(rootOf(result), 'latest-a1')).toBeNull();

    await result.rerender(
      <PieceLayer
        boardId="memo"
        layout={layout}
        pieceRenderers={renderers}
        position={currentPosition(
          frozenPosition({ b1: { pieceType: 'token' } }),
          5,
        )}
        style={EMPTY_STYLE}
      />,
    );
    expect(nodeByTestId(rootOf(result), 'latest-b1')).not.toBeNull();
    expect(calls).toEqual(['a1', 'b1']);
  });
});
