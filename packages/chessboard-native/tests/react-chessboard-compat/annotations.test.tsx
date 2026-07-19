import { act, fireEvent, render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { TestInstance } from 'test-renderer';

import type { AnnotationOperation } from '../../src/public-types';
import {
  createReactChessboardProps,
  mapReactChessboardArrows,
} from '../../src/react-chessboard-compat/adapter';
import {
  Chessboard,
  type ReactChessboardArrow,
  type ReactChessboardOptions,
} from '../../src/react-chessboard-compat';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

type ArrowChange = Parameters<
  NonNullable<ReactChessboardOptions['onArrowsChange']>
>[0];

const EMPTY_POSITION = '8/8/8/8/8/8/8/8';

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected a rendered compatibility board root.');
  }
  return result.root;
}

async function measure(root: TestInstance): Promise<void> {
  await fireEvent(root, 'layout', {
    nativeEvent: {
      layout: { height: 320, width: 320, x: 0, y: 0 },
    },
  });
}

async function tap(boardId: string): Promise<void> {
  const gesture = getByGestureTestId(getBoardGestureTestIds(boardId).tap);
  await act(() => {
    fireGestureHandler(gesture, [
      { state: State.BEGAN, x: 20, y: 20 },
      { state: State.END, x: 20, y: 20 },
    ]);
  });
}

function arrowShafts(root: TestInstance): TestInstance[] {
  return root.queryAll((node) => {
    const testID: unknown = node.props['testID'];
    return typeof testID === 'string' && testID.endsWith(':shaft');
  });
}

function operationHandler(
  options: Readonly<ReactChessboardOptions>,
): NonNullable<
  ReturnType<typeof createReactChessboardProps>['onAnnotationOperation']
> {
  const handler = createReactChessboardProps(options).onAnnotationOperation;
  if (handler === undefined) {
    throw new Error('Expected the compatibility adapter to expose a handler.');
  }
  return handler;
}

describe('react-chessboard compatibility annotations', () => {
  it('[PARITY-OPTION-ON-ARROWS-CHANGE] emits one immutable full-list candidate for each controlled arrow operation', () => {
    const delimiterArrow = Object.freeze({
      color: '#ff0000',
      endSquare: 'c',
      startSquare: 'a|1:b',
    });
    const otherDelimiterArrow = Object.freeze({
      color: '#ff0000',
      endSquare: 'b|1:c',
      startSquare: 'a',
    });
    const duplicate = Object.freeze({ ...delimiterArrow });
    const identityInputs = Object.freeze([
      delimiterArrow,
      otherDelimiterArrow,
      duplicate,
    ]);

    const entries = mapReactChessboardArrows(identityInputs);
    const repeated = mapReactChessboardArrows(identityInputs);
    const reordered = mapReactChessboardArrows(
      Object.freeze([otherDelimiterArrow, duplicate, delimiterArrow]),
    );
    const ids = entries.map((entry) => entry.annotation.id);

    expect(new Set(ids).size).toBe(identityInputs.length);
    expect(repeated.map((entry) => entry.annotation.id)).toEqual(ids);
    expect(reordered.map((entry) => entry.annotation.id)).toEqual([
      ids[1],
      ids[0],
      ids[2],
    ]);
    expect(ids[0]).toEqual(expect.stringMatching(/:0$/u));
    expect(ids[2]).toEqual(expect.stringMatching(/:1$/u));
    expect(Object.isFrozen(entries)).toBe(true);
    for (const [index, entry] of entries.entries()) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.annotation)).toBe(true);
      expect(Object.isFrozen(entry.arrow)).toBe(true);
      expect(entry.arrow).not.toBe(identityInputs[index]);
    }

    const first = Object.freeze({
      color: '#cc0000',
      endSquare: 'b2',
      startSquare: 'a1',
    });
    const second = Object.freeze({
      color: '#0000cc',
      endSquare: 'f3',
      startSquare: 'g1',
    });
    const controlled = Object.freeze([first, second]);
    const controlledEntries = mapReactChessboardArrows(controlled);
    const proposals: ArrowChange[] = [];
    const options = Object.freeze({
      arrows: controlled,
      id: 'compatibility-operations',
      onArrowsChange: (candidate: ArrowChange) => proposals.push(candidate),
      position: EMPTY_POSITION,
    }) satisfies Readonly<ReactChessboardOptions>;
    const handleOperation = operationHandler(options);
    const add = Object.freeze({
      annotation: Object.freeze({
        color: '#00aa00',
        from: 'b1',
        to: 'c3',
        type: 'arrow' as const,
      }),
      annotationId: 'compatibility-add',
      baseAnnotationRevision: 0,
      boardId: options.id,
      input: 'touch' as const,
      operationId: 'add-operation',
      type: 'add' as const,
    }) satisfies Readonly<AnnotationOperation>;
    const toggle = Object.freeze({
      annotation: Object.freeze({
        color: first.color,
        from: first.startSquare,
        to: first.endSquare,
        type: 'arrow' as const,
      }),
      annotationId: 'unused-toggle-id',
      baseAnnotationRevision: 0,
      boardId: options.id,
      input: 'touch' as const,
      matchingIdsAtBase: Object.freeze([
        controlledEntries[0]?.annotation.id ?? 'missing-id',
      ]),
      operationId: 'toggle-operation',
      type: 'toggle' as const,
    }) satisfies Readonly<AnnotationOperation>;
    const clear = Object.freeze({
      annotationIdsAtBase: Object.freeze(
        controlledEntries.map((entry) => entry.annotation.id),
      ),
      baseAnnotationRevision: 0,
      boardId: options.id,
      input: 'policy' as const,
      operationId: 'clear-operation',
      reason: 'consumer-action' as const,
      type: 'clear' as const,
    }) satisfies Readonly<AnnotationOperation>;

    expect(proposals).toEqual([]);
    handleOperation(add);
    expect(proposals).toHaveLength(1);
    handleOperation(toggle);
    expect(proposals).toHaveLength(2);
    handleOperation(clear);
    expect(proposals).toHaveLength(3);

    expect(proposals.map((proposal) => proposal.arrows)).toEqual([
      [first, second, { color: '#00aa00', endSquare: 'c3', startSquare: 'b1' }],
      [second],
      [],
    ]);
    for (const proposal of proposals) {
      expect(Object.isFrozen(proposal)).toBe(true);
      expect(Object.isFrozen(proposal.arrows)).toBe(true);
      expect(proposal.arrows.every(Object.isFrozen)).toBe(true);
    }
    expect(proposals[0]?.arrows[0]).not.toBe(first);
    expect(proposals[0]?.arrows[1]).not.toBe(second);
    expect(controlled).toEqual([first, second]);
  });

  it('[PARITY-BEHAVIOR-B38] waits for controlled feedback before rendering one arrow-clear proposal', async () => {
    const boardId = 'compatibility-controlled-lifecycle';
    const initialArrow = Object.freeze({
      color: '#dd5500',
      endSquare: 'h8',
      startSquare: 'a1',
    }) satisfies Readonly<ReactChessboardArrow>;
    const initialArrows = Object.freeze([initialArrow]);
    const proposals: ArrowChange[] = [];
    const onArrowsChange = (candidate: ArrowChange): void => {
      proposals.push(candidate);
    };
    const result = await render(
      <Chessboard
        options={{
          allowDrawingArrows: false,
          arrows: initialArrows,
          id: boardId,
          onArrowsChange,
          position: EMPTY_POSITION,
        }}
      />,
    );

    expect(proposals).toEqual([]);
    await measure(rootOf(result));
    expect(arrowShafts(rootOf(result))).toHaveLength(1);

    await tap(boardId);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.arrows).toEqual([]);
    expect(Object.isFrozen(proposals[0])).toBe(true);
    expect(Object.isFrozen(proposals[0]?.arrows)).toBe(true);
    expect(arrowShafts(rootOf(result))).toHaveLength(1);

    await result.rerender(
      <Chessboard
        options={{
          allowDrawingArrows: false,
          arrows: proposals[0]?.arrows ?? initialArrows,
          id: boardId,
          onArrowsChange,
          position: EMPTY_POSITION,
        }}
      />,
    );

    expect(proposals).toHaveLength(1);
    expect(arrowShafts(rootOf(result))).toEqual([]);
    expect(initialArrows).toEqual([initialArrow]);
  });
});
