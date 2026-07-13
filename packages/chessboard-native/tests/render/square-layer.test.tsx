import { render } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { TestInstance } from 'test-renderer';

import type { NormalizedControlledValue } from '../../src/internal/controlled-domain';
import type { PlainSelection } from '../../src/public-types';
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
          layout={layout}
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
        layout={layout}
        selection={selection(Object.freeze({ selectedSquare: 'a1' }), 1)}
      />,
    );

    await result.rerender(
      <SquareLayer
        layout={layout}
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

    await result.rerender(<SquareLayer layout={layout} selection={null} />);
    expect(
      squarePaints(rootOf(result)).every(
        (paint) => flattenedStyle(paint).boxShadow === undefined,
      ),
    ).toBe(true);
  });
});
