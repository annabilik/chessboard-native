import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import type { TestInstance } from 'test-renderer';

import { defaultAnnotationStyle } from '../../src/annotation-style';
import { ChessboardRuntime } from '../../src/Chessboard';
import {
  Chessboard,
  type PieceRenderer,
  type PieceRenderers,
} from '../../src/index';

const Token: PieceRenderer = ({ square }) => (
  <View testID={`piece:${square ?? 'spare'}`} />
);

const tokenRenderers = Object.freeze({ token: Token }) satisfies PieceRenderers;

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected a rendered root.');
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
  const style: unknown = node.props['style'];
  return style === undefined || style === null ? {} : StyleSheet.flatten(style);
}

function annotationNodes(root: TestInstance): TestInstance[] {
  return root.queryAll((node) => {
    const testID: unknown = node.props['testID'];
    return typeof testID === 'string' && testID.startsWith('annotation:');
  });
}

function boardHosts(root: TestInstance): TestInstance[] {
  return root.queryAll(
    (node) =>
      node.props['collapsable'] === false &&
      typeof node.props['onLayout'] === 'function',
  );
}

function nodesByTestId(root: TestInstance, testID: string): TestInstance[] {
  return root.queryAll((node) => node.props['testID'] === testID);
}

function requiredNodeByTestId(
  root: TestInstance,
  testID: string,
): TestInstance {
  const matches = nodesByTestId(root, testID);
  expect(matches).toHaveLength(1);
  const match = matches[0];
  if (match === undefined) {
    throw new Error(`Expected a node with testID ${testID}.`);
  }
  return match;
}

function requiredAncestorWithZIndex(
  node: TestInstance,
  zIndex: number,
): TestInstance {
  let current = node.parent;
  while (current !== null) {
    if (flattenedStyle(current).zIndex === zIndex) {
      return current;
    }
    current = current.parent;
  }
  throw new Error(`Expected an ancestor with zIndex ${String(zIndex)}.`);
}

describe('controlled annotation rendering', () => {
  it('[PARITY-OPTION-ARROWS] renders only the latest controlled annotation collection', async () => {
    const result = await render(
      <Chessboard
        annotations={{
          revision: 1,
          value: [
            {
              color: '#ff0000',
              from: 'a1',
              id: 'first',
              to: 'h8',
              type: 'arrow',
            },
          ],
        }}
        boardId="controlled-annotations"
        position="8/8/8/8/8/8/8/8"
      />,
    );
    await measure(rootOf(result), 320, 320);
    expect(
      requiredNodeByTestId(rootOf(result), 'annotation:first:shaft'),
    ).toBeTruthy();
    expect(
      requiredNodeByTestId(rootOf(result), 'annotation:first:head'),
    ).toBeTruthy();

    await result.rerender(
      <Chessboard
        annotations={{
          revision: 2,
          value: [
            {
              color: '#00ff00',
              id: 'second',
              shape: 'dot',
              square: 'e4',
              type: 'square',
            },
          ],
        }}
        boardId="controlled-annotations"
        position="8/8/8/8/8/8/8/8"
      />,
    );

    expect(nodesByTestId(rootOf(result), 'annotation:first:shaft')).toEqual([]);
    expect(nodesByTestId(rootOf(result), 'annotation:first:head')).toEqual([]);
    expect(
      requiredNodeByTestId(rootOf(result), 'annotation:second:dot'),
    ).toBeTruthy();
    expect(annotationNodes(rootOf(result))).toHaveLength(1);
  });

  it('[PARITY-OPTION-ARROW-OPTIONS] applies one whole annotation style value', async () => {
    const result = await render(
      <Chessboard
        annotations={[
          {
            color: '#7a22cc',
            from: 'a1',
            id: 'styled',
            to: 'h1',
            type: 'arrow',
          },
        ]}
        annotationStyle={{
          ...defaultAnnotationStyle,
          arrowStartOffset: 0.25,
          arrowWidthDenominator: 10,
          opacity: 0.3,
        }}
        boardId="styled-annotation"
        position="8/8/8/8/8/8/8/8"
      />,
    );
    await measure(rootOf(result), 320, 320);
    const shaft = requiredNodeByTestId(
      rootOf(result),
      'annotation:styled:shaft',
    );

    expect(shaft).toHaveProp('opacity', 0.3);
    expect(shaft).toHaveProp('strokeWidth', 25.6);
    expect(shaft.props['d']).toEqual(expect.stringMatching(/^M192 1920 L/));
  });

  it('[PARITY-BEHAVIOR-B44] keeps explicit heads marker-free across fixed visual layers', async () => {
    const result = await render(
      <Chessboard
        annotations={[
          {
            color: 'rgba(255,0,0,0.25)',
            id: 'fill',
            square: 'd4',
            type: 'square',
          },
          {
            color: '#ee7700',
            from: 'a1',
            id: 'below',
            layer: 'belowPieces',
            opacity: 0.2,
            to: 'h8',
            type: 'arrow',
            width: 17,
          },
          {
            color: '#2255dd',
            from: 'b1',
            id: 'above',
            to: 'c3',
            type: 'arrow',
          },
        ]}
        boardId="layered-annotations"
        pieceRenderers={tokenRenderers}
        position={{ d4: { pieceType: 'token' } }}
      />,
    );
    await measure(rootOf(result), 320, 320);

    const belowShaft = requiredNodeByTestId(
      rootOf(result),
      'annotation:below:shaft',
    );
    const aboveShaft = requiredNodeByTestId(
      rootOf(result),
      'annotation:above:shaft',
    );
    const belowHead = requiredNodeByTestId(
      rootOf(result),
      'annotation:below:head',
    );
    expect(belowShaft).toHaveProp('opacity', 0.2);
    expect(belowShaft).toHaveProp('strokeWidth', 17);
    expect(belowShaft.props).not.toHaveProperty('markerEnd');
    expect(belowHead.props).not.toHaveProperty('id');
    expect(aboveShaft.props).not.toHaveProperty('markerEnd');

    const belowLayer = requiredAncestorWithZIndex(belowShaft, 10);
    const aboveLayer = requiredAncestorWithZIndex(aboveShaft, 30);
    expect(flattenedStyle(belowLayer).zIndex).toBe(10);
    expect(flattenedStyle(aboveLayer).zIndex).toBe(30);
    expect(belowLayer).toHaveProp('accessibilityElementsHidden', true);
    expect(belowLayer).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    expect(belowLayer).toHaveProp('pointerEvents', 'none');

    const piece = requiredNodeByTestId(rootOf(result), 'piece:d4');
    const piecePlane = requiredAncestorWithZIndex(piece, 20);
    expect(flattenedStyle(piecePlane).zIndex).toBe(20);
    expect(
      rootOf(result).queryAll((node) => flattenedStyle(node).zIndex === 40),
    ).toHaveLength(1);
  });

  it('isolates identical annotation IDs across simultaneous boards', async () => {
    const shared = [
      { color: '#ff0', from: 'a1', id: 'same-id', to: 'b2', type: 'arrow' },
    ] as const;
    const result = await render(
      <View>
        <Chessboard
          annotations={shared}
          boardId="annotation-first"
          dimensions={{ columns: 2, rows: 2 }}
          position={{}}
        />
        <Chessboard
          annotations={shared}
          boardId="annotation-second"
          dimensions={{ columns: 2, rows: 2 }}
          orientation="black"
          position={{}}
        />
      </View>,
    );
    const hosts = boardHosts(rootOf(result));
    expect(hosts).toHaveLength(2);
    const first = hosts[0];
    const second = hosts[1];
    if (first === undefined || second === undefined) {
      throw new Error('Expected two board hosts.');
    }
    await measure(first, 120, 120);
    await measure(second, 160, 160);

    const shafts = nodesByTestId(rootOf(result), 'annotation:same-id:shaft');
    const heads = nodesByTestId(rootOf(result), 'annotation:same-id:head');
    expect(shafts).toHaveLength(2);
    expect(heads).toHaveLength(2);
    expect(shafts[0]?.props['d']).not.toBe(shafts[1]?.props['d']);
    for (const node of [...shafts, ...heads]) {
      expect(node.props).not.toHaveProperty('id');
      expect(node.props).not.toHaveProperty('markerEnd');
    }
  });

  it('renders no invalid annotation fallback while preserving valid pieces', async () => {
    const logError = jest.fn();
    const result = await render(
      <ChessboardRuntime
        annotations={[
          {
            color: '#f00',
            from: 'a1',
            id: '',
            to: 'b2',
            type: 'arrow',
          },
        ]}
        boardId="invalid-annotations"
        development={false}
        logError={logError}
        pieceRenderers={tokenRenderers}
        position={{ a1: { pieceType: 'token' } }}
      />,
    );
    await measure(rootOf(result), 160, 160);

    expect(annotationNodes(rootOf(result))).toEqual([]);
    expect(requiredNodeByTestId(rootOf(result), 'piece:a1')).toBeTruthy();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
