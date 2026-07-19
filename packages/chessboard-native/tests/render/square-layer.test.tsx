import { render } from '@testing-library/react-native';
import { useState, type ReactElement } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { TestInstance } from 'test-renderer';

import type { NormalizedControlledValue } from '../../src/internal/controlled-domain';
import type {
  PlainSelection,
  PositionObject,
  SquareRendererProps,
} from '../../src/public-types';
import { createBoardSurfaceLayout } from '../../src/render/board-layout';
import { SquareLayer } from '../../src/render/square-layer';

const DESTINATION_SHADOW = 'inset 0 0 0 3px rgba(76, 175, 80, 0.9)';
const SELECTED_SHADOW = 'inset 0 0 0 3px rgba(255, 170, 0, 0.95)';

function selection(
  value: Readonly<PlainSelection>,
  revision: number,
): NormalizedControlledValue<Readonly<PlainSelection>> {
  return Object.freeze({ revision, tier: 'envelope', value });
}

function position(
  value: PositionObject,
  revision: number,
): NormalizedControlledValue<PositionObject> {
  return Object.freeze({ revision, tier: 'envelope', value });
}

function flattenedStyle(node: TestInstance): ViewStyle {
  return StyleSheet.flatten(node.props['style'] as StyleProp<ViewStyle>);
}

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected SquareLayer to render one native root.');
  }
  return result.root;
}

function squarePaints(root: TestInstance): TestInstance[] {
  return root.queryAll((node) => {
    const backgroundColor = flattenedStyle(node).backgroundColor;
    return backgroundColor === '#B58863' || backgroundColor === '#F0D9B5';
  });
}

function requiredNode(
  nodes: readonly TestInstance[],
  index: number,
): TestInstance {
  const node = nodes.at(index);
  if (node === undefined) {
    throw new RangeError(`Expected square paint at index ${String(index)}.`);
  }
  return node;
}

describe('controlled selection square presentation', () => {
  it('projects canonical selected, destination, and disabled squares in either orientation', async () => {
    for (const orientation of ['white', 'black'] as const) {
      const layout = createBoardSurfaceLayout(
        { height: 200, width: 200 },
        { columns: 2, rows: 2 },
        orientation,
      );
      const result = await render(
        <SquareLayer
          boardId="selection"
          layout={layout}
          position={null}
          selection={selection(
            Object.freeze({
              destinationSquares: Object.freeze(['a1', 'b2']),
              disabledSquares: Object.freeze(['b2']),
              selectedSquare: 'a1',
            }),
            4,
          )}
        />,
      );
      const paints = squarePaints(rootOf(result));
      expect(paints).toHaveLength(4);

      for (const [index, cell] of layout.cells.entries()) {
        const style = flattenedStyle(requiredNode(paints, index));
        if (cell.square === 'a1') {
          expect(style.boxShadow).toBe(SELECTED_SHADOW);
          expect(style.opacity).toBeUndefined();
        } else if (cell.square === 'b2') {
          expect(style.boxShadow).toBe(DESTINATION_SHADOW);
          expect(style.opacity).toBe(0.45);
        } else {
          expect(style.boxShadow).toBeUndefined();
          expect(style.opacity).toBeUndefined();
        }
      }
    }
  });

  it('renders only the latest controlled selection without retaining an older projection', async () => {
    const layout = createBoardSurfaceLayout(
      { height: 200, width: 200 },
      { columns: 2, rows: 2 },
      'white',
    );
    const result = await render(
      <SquareLayer
        boardId="latest-selection"
        layout={layout}
        position={null}
        selection={selection(Object.freeze({ selectedSquare: 'a1' }), 1)}
      />,
    );

    await result.rerender(
      <SquareLayer
        boardId="latest-selection"
        layout={layout}
        position={null}
        selection={selection(
          Object.freeze({
            destinationSquares: Object.freeze(['b2']),
            selectedSquare: null,
          }),
          2,
        )}
      />,
    );

    const paints = squarePaints(rootOf(result));
    for (const [index, cell] of layout.cells.entries()) {
      const style = flattenedStyle(requiredNode(paints, index));
      expect(style.boxShadow).toBe(
        cell.square === 'b2' ? DESTINATION_SHADOW : undefined,
      );
    }

    await result.rerender(
      <SquareLayer
        boardId="latest-selection"
        layout={layout}
        position={null}
        selection={null}
      />,
    );
    expect(
      squarePaints(rootOf(result)).every(
        (paint) => flattenedStyle(paint).boxShadow === undefined,
      ),
    ).toBe(true);
  });

  it('[PARITY-OPTION-SQUARE-RENDERER] invokes hook-capable visual renderers with latest frozen square context inside structural wrappers', async () => {
    const whiteLayout = createBoardSurfaceLayout(
      { height: 200, width: 200 },
      { columns: 2, rows: 2 },
      'white',
    );
    const blackLayout = createBoardSurfaceLayout(
      { height: 200, width: 200 },
      { columns: 2, rows: 2 },
      'black',
    );
    const observed = new Map<string, SquareRendererProps>();
    let mounts = 0;

    function HookSquare(props: SquareRendererProps): ReactElement {
      const [mount] = useState(() => {
        mounts += 1;
        return mounts;
      });
      observed.set(props.square, props);
      return (
        <View
          accessible
          onTouchStart={() => undefined}
          testID={`custom-square:${props.square}:${String(mount)}`}
        />
      );
    }

    const firstPosition = position(
      Object.freeze({
        a1: Object.freeze({ id: 'first', pieceType: 'token' }),
      }),
      1,
    );
    const result = await render(
      <SquareLayer
        boardId="custom-squares"
        dropTargetSquare="b2"
        layout={whiteLayout}
        pendingSourceSquare="a1"
        pendingTargetSquare="b2"
        position={firstPosition}
        pressedSquare="a2"
        renderSquare={HookSquare}
        selection={selection(
          Object.freeze({
            destinationSquares: Object.freeze(['b2']),
            disabledSquares: Object.freeze(['a2']),
            selectedSquare: 'a1',
          }),
          1,
        )}
        styles={{ dropTarget: { opacity: 0.8 } }}
      />,
    );

    expect(mounts).toBe(4);
    expect(observed.size).toBe(4);
    expect(observed.get('a1')).toEqual(
      expect.objectContaining({
        boardId: 'custom-squares',
        piece: { id: 'first', pieceType: 'token' },
        size: 100,
        square: 'a1',
        state: {
          isDestination: false,
          isDisabled: false,
          isDropTarget: false,
          isPendingSource: true,
          isPendingTarget: false,
          isPressed: false,
          isSelected: true,
        },
      }),
    );
    expect(observed.get('b2')?.state).toEqual({
      isDestination: true,
      isDisabled: false,
      isDropTarget: true,
      isPendingSource: false,
      isPendingTarget: true,
      isPressed: false,
      isSelected: false,
    });
    expect(observed.get('a2')?.state).toEqual(
      expect.objectContaining({ isDisabled: true, isPressed: true }),
    );
    for (const props of observed.values()) {
      expect(Object.isFrozen(props)).toBe(true);
      expect(Object.isFrozen(props.state)).toBe(true);
      expect(Object.isFrozen(props.style)).toBe(true);
    }

    const customA1 = rootOf(result).queryAll(
      (node) =>
        typeof node.props['testID'] === 'string' &&
        node.props['testID'].startsWith('custom-square:a1:'),
    )[0];
    if (customA1 === undefined) {
      throw new Error('Expected custom a1 square content.');
    }
    const paint = customA1.parent;
    if (paint === null) {
      throw new Error('Expected custom square content inside owned paint.');
    }
    expect(paint).toHaveProp('accessible', false);
    expect(paint).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    expect(paint).toHaveProp('pointerEvents', 'none');
    expect(flattenedStyle(paint)).toEqual(
      expect.objectContaining({
        bottom: 0,
        pointerEvents: 'none',
        position: 'absolute',
      }),
    );
    expect(customA1.props['style']).toBeUndefined();

    observed.clear();
    await result.rerender(
      <SquareLayer
        boardId="custom-squares"
        layout={blackLayout}
        position={position(
          Object.freeze({
            b1: Object.freeze({ id: 'second', pieceType: 'token' }),
          }),
          2,
        )}
        renderSquare={HookSquare}
        selection={null}
      />,
    );

    expect(mounts).toBe(4);
    expect(observed.get('a1')?.piece).toBeNull();
    expect(observed.get('b1')?.piece).toEqual({
      id: 'second',
      pieceType: 'token',
    });
    expect(
      [...observed.values()].every((props) =>
        Object.values(props.state).every((flag) => flag === false),
      ),
    ).toBe(true);
  });

  it('[PARITY-BEHAVIOR-B47] keeps resolved fallback paint when a custom renderer returns null', async () => {
    const layout = createBoardSurfaceLayout(
      { height: 80, width: 80 },
      { columns: 1, rows: 1 },
      'white',
    );
    const calls: SquareRendererProps[] = [];
    const result = await render(
      <SquareLayer
        boardId="null-renderer"
        layout={layout}
        position={position(Object.freeze({}), 1)}
        renderSquare={(props) => {
          calls.push(props);
          return null;
        }}
        selection={null}
        squareStyles={{ a1: { backgroundColor: '#abcdef' } }}
      />,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.style.backgroundColor).toBe('#abcdef');
    expect(
      rootOf(result).queryAll(
        (node) => flattenedStyle(node).backgroundColor === '#abcdef',
      ),
    ).toHaveLength(1);
  });
});
