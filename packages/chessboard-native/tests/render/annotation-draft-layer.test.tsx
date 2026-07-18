import { render } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { defaultAnnotationStyle } from '../../src/annotation-style';
import { computeAnnotationGeometry } from '../../src/render/annotation-geometry';
import { AnnotationLayer } from '../../src/render/annotation-layer';

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected AnnotationLayer to render one native root.');
  }
  return result.root;
}

function nodeByTestId(root: TestInstance, testID: string): TestInstance {
  const matches = root.queryAll((node) => node.props['testID'] === testID);
  expect(matches).toHaveLength(1);
  const match = matches[0];
  if (match === undefined) {
    throw new Error(`Expected a node with testID ${testID}.`);
  }
  return match;
}

describe('transient annotation layer', () => {
  it('[PARITY-BEHAVIOR-B34] keeps consumer ID "draft" distinct from the mounted private active arrow', async () => {
    const geometry = computeAnnotationGeometry({
      annotations: [
        {
          color: '#f00',
          from: 'e2',
          id: 'draft',
          to: 'e4',
          type: 'arrow',
        },
      ],
      dimensions: { columns: 8, rows: 8 },
      draft: {
        color: '#0f0',
        from: 'd2',
        to: 'e4',
        type: 'arrow',
      },
      orientation: 'white',
      style: defaultAnnotationStyle,
    });
    const result = await render(
      <AnnotationLayer geometry={geometry} layer="abovePieces" />,
    );
    const root = rootOf(result);

    expect(nodeByTestId(root, 'annotation:draft:shaft')).toHaveProp(
      'opacity',
      0.65,
    );
    expect(nodeByTestId(root, 'annotation:draft:head')).toHaveProp(
      'opacity',
      0.65,
    );
    expect(
      nodeByTestId(root, 'annotation-draft:shaft').props['strokeWidth'],
    ).toBeCloseTo(46.08, 12);
    expect(nodeByTestId(root, 'annotation-draft:head')).toHaveProp(
      'opacity',
      0.5,
    );

    const pointerless = root.queryAll(
      (node) => node.props['pointerEvents'] === 'none',
    );
    expect(root).toHaveProp('pointerEvents', 'none');
    expect(pointerless).toHaveLength(1);
    for (const node of [root, ...pointerless]) {
      expect(node).toHaveProp('accessible', false);
      expect(node).toHaveProp('accessibilityElementsHidden', true);
      expect(node).toHaveProp(
        'importantForAccessibility',
        'no-hide-descendants',
      );
    }
  });

  it('applies active opacity to every square draft shape', async () => {
    const shapes = ['fill', 'circle', 'dot', 'border'] as const;

    for (const shape of shapes) {
      const geometry = computeAnnotationGeometry({
        annotations: [],
        dimensions: { columns: 8, rows: 8 },
        draft: { color: '#0f0', shape, square: 'e4', type: 'square' },
        orientation: 'white',
        style: { ...defaultAnnotationStyle, activeOpacity: 0.37 },
      });
      const result = await render(
        <AnnotationLayer geometry={geometry} layer="belowPieces" />,
      );

      expect(
        nodeByTestId(rootOf(result), `annotation-draft:${shape}`),
      ).toHaveProp('opacity', 0.37);
      await result.unmount();
    }
  });
});
