import { act, fireEvent, render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { TestInstance } from 'test-renderer';

import { ChessboardRuntime } from '../../src/Chessboard';
import type {
  AnnotationOperation,
  ControlledAnnotations,
  ControlledPosition,
  OnMoveRequest,
} from '../../src/public-types';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

const EMPTY_ANNOTATIONS: ControlledAnnotations = Object.freeze({
  revision: 7,
  value: Object.freeze([]),
});

const POSITION: ControlledPosition = Object.freeze({
  revision: 5,
  value: Object.freeze({}),
});

const ARROW_TOOL = Object.freeze({
  color: '#ef4444',
  opacity: 0.7,
  type: 'arrow' as const,
  width: 20,
});

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected one mounted board root.');
  }
  return result.root;
}

async function measure(root: TestInstance): Promise<void> {
  await fireEvent(root, 'layout', {
    nativeEvent: {
      layout: { height: 200, width: 200, x: 0, y: 0 },
    },
  });
}

async function tap(
  boardId: string,
  point: Readonly<{ readonly x: number; readonly y: number }>,
): Promise<void> {
  const gesture = getByGestureTestId(getBoardGestureTestIds(boardId).tap);
  await act(() => {
    fireGestureHandler(gesture, [
      { state: State.BEGAN, ...point },
      { state: State.END, ...point },
    ]);
  });
}

async function draw(
  boardId: string,
  path: 'longPress' | 'twoFinger',
  from = Object.freeze({ x: 25, y: 25 }),
  to = Object.freeze({ x: 135, y: 135 }),
): Promise<void> {
  const gesture = getByGestureTestId(getBoardGestureTestIds(boardId)[path]);
  if (path === 'twoFinger') {
    const callbacks = gestureCallbacks(gesture);
    const handlerTag = (gesture as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;
    await act(() => {
      callbacks.onTouchesDown?.(
        {
          allTouches: [
            { x: from.x - 5, y: from.y - 5 },
            { x: from.x + 5, y: from.y + 5 },
          ],
        },
        { fail: jest.fn() },
      );
      callbacks.onBegin?.({ handlerTag, ...from });
      callbacks.onStart?.({ handlerTag, ...from });
      callbacks.onUpdate?.({ handlerTag, numberOfPointers: 2, ...to });
      callbacks.onTouchesUp?.(
        {
          allTouches: [
            { x: to.x - 5, y: to.y - 5 },
            { x: to.x + 5, y: to.y + 5 },
          ],
          numberOfTouches: 1,
        },
        { fail: jest.fn() },
      );
      callbacks.onFinalize?.({ handlerTag, ...to }, false);
    });
    return;
  }

  await act(() => {
    fireGestureHandler(gesture, [
      { state: State.BEGAN, ...from },
      {
        state: State.ACTIVE,
        x: from.x + 10,
        y: from.y,
      },
      { state: State.ACTIVE, ...to },
      { state: State.END, ...to },
    ]);
  });
}

function toggle(
  operation: Readonly<AnnotationOperation> | undefined,
): Extract<AnnotationOperation, { readonly type: 'toggle' }> {
  if (operation?.type !== 'toggle') {
    throw new Error('Expected one toggle annotation operation.');
  }
  return operation;
}

function nodes(root: TestInstance, testID: string): TestInstance[] {
  return root.queryAll((node) => node.props['testID'] === testID);
}

interface GestureCallbacks {
  readonly onBegin?: (event: Readonly<Record<string, unknown>>) => void;
  readonly onEnd?: (
    event: Readonly<Record<string, unknown>>,
    success: boolean,
  ) => void;
  readonly onFinalize?: (
    event: Readonly<Record<string, unknown>>,
    success: boolean,
  ) => void;
  readonly onStart?: (event: Readonly<Record<string, unknown>>) => void;
  readonly onTouchesDown?: (
    event: Readonly<{
      allTouches: readonly Readonly<Record<string, unknown>>[];
    }>,
    manager: Readonly<{ fail: () => void }>,
  ) => void;
  readonly onTouchesUp?: (
    event: Readonly<{
      allTouches: readonly Readonly<Record<string, unknown>>[];
      numberOfTouches: number;
    }>,
    manager: Readonly<{ fail: () => void }>,
  ) => void;
  readonly onUpdate?: (event: Readonly<Record<string, unknown>>) => void;
}

function gestureCallbacks(gesture: unknown): Readonly<GestureCallbacks> {
  return (gesture as Readonly<{ handlers: Readonly<GestureCallbacks> }>)
    .handlers;
}

describe('controlled native annotation gestures', () => {
  it('[PARITY-OPTION-ALLOW-DRAWING-ARROWS] gates the single native plane on a tool, controlled annotations, and a committed callback', async () => {
    const boardId = 'annotation-gate';
    const operations: Readonly<AnnotationOperation>[] = [];
    const result = await render(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={ARROW_TOOL}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={POSITION}
      />,
    );
    await measure(rootOf(result));

    const ids = getBoardGestureTestIds(boardId);
    expect(getByGestureTestId(ids.longPress)).toBeDefined();
    expect(getByGestureTestId(ids.twoFinger)).toBeDefined();
    expect(getByGestureTestId(ids.tap)).toBeDefined();

    await result.rerender(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={ARROW_TOOL}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        position={POSITION}
      />,
    );

    expect(() => getByGestureTestId(ids.longPress)).toThrow();
    expect(() => getByGestureTestId(ids.twoFinger)).toThrow();
    expect(() => getByGestureTestId(ids.tap)).toThrow();
    expect(operations).toEqual([]);
    expect(EMPTY_ANNOTATIONS.value).toEqual([]);
  });

  it('[PARITY-BEHAVIOR-B35] produces one equivalent controlled toggle from explicit, long-press, and two-finger arrow paths', async () => {
    const boardId = 'three-annotation-paths';
    const operations: Readonly<AnnotationOperation>[] = [];
    const result = await render(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={ARROW_TOOL}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={POSITION}
      />,
    );
    await measure(rootOf(result));

    await tap(boardId, { x: 25, y: 25 });
    expect(nodes(rootOf(result), 'annotation-draft:border')).toHaveLength(1);
    expect(operations).toEqual([]);
    await tap(boardId, { x: 135, y: 135 });
    expect(nodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
    expect(nodes(rootOf(result), 'annotation-draft:shaft')).toEqual([]);

    await draw(boardId, 'longPress');
    await draw(boardId, 'twoFinger');

    expect(operations).toHaveLength(3);
    for (const operation of operations) {
      const current = toggle(operation);
      expect(current).toEqual({
        annotation: {
          color: '#ef4444',
          from: 'a2',
          opacity: 0.7,
          to: 'b1',
          type: 'arrow',
          width: 20,
        },
        annotationId: current.annotationId,
        baseAnnotationRevision: 7,
        boardId,
        input: 'touch',
        matchingIdsAtBase: [],
        operationId: current.operationId,
        type: 'toggle',
      });
      expect(Object.isFrozen(current)).toBe(true);
      expect(Object.isFrozen(current.annotation)).toBe(true);
    }
    expect(new Set(operations.map(({ operationId }) => operationId)).size).toBe(
      3,
    );
    expect(
      new Set(operations.map((operation) => toggle(operation).annotationId))
        .size,
    ).toBe(3);
    expect(EMPTY_ANNOTATIONS.revision).toBe(7);
    expect(EMPTY_ANNOTATIONS.value).toEqual([]);
    expect(nodes(rootOf(result), 'annotation:')).toEqual([]);
  });

  it('routes a square tool tap exclusively before clear and square activation callbacks', async () => {
    const boardId = 'exclusive-square-tool';
    const operations: Readonly<AnnotationOperation>[] = [];
    const onSquareActivate = jest.fn();
    const annotations: ControlledAnnotations = Object.freeze({
      revision: 9,
      value: Object.freeze([
        Object.freeze({
          color: '#22c55e',
          id: 'matching-square',
          square: 'b2',
          type: 'square' as const,
        }),
      ]),
    });
    const result = await render(
      <ChessboardRuntime
        annotationPolicies={{ clearOnBoardPress: true }}
        annotations={annotations}
        annotationTool={{ color: '#2563eb', shape: 'dot', type: 'square' }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        onSquareActivate={onSquareActivate}
        position={POSITION}
      />,
    );
    await measure(rootOf(result));
    await tap(boardId, { x: 125, y: 25 });

    const operation = toggle(operations[0]);
    expect(operations).toHaveLength(1);
    expect(operation.annotation).toEqual({
      color: '#2563eb',
      shape: 'dot',
      square: 'b2',
      type: 'square',
    });
    expect(operation.matchingIdsAtBase).toEqual(['matching-square']);
    expect(onSquareActivate).not.toHaveBeenCalled();
    expect(annotations.value).toHaveLength(1);
  });

  it('cancels an armed arrow on semantic tool, annotation, and callback changes while equal tool rerenders preserve it', async () => {
    const boardId = 'annotation-invalidation';
    const onAnnotationOperation = jest.fn();
    const result = await render(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={ARROW_TOOL}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={onAnnotationOperation}
        position={POSITION}
      />,
    );
    await measure(rootOf(result));
    await tap(boardId, { x: 25, y: 25 });
    expect(nodes(rootOf(result), 'annotation-draft:border')).toHaveLength(1);

    await result.rerender(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={{ ...ARROW_TOOL }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={onAnnotationOperation}
        position={POSITION}
      />,
    );
    expect(nodes(rootOf(result), 'annotation-draft:border')).toHaveLength(1);

    await result.rerender(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={{ ...ARROW_TOOL, color: '#3b82f6' }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={onAnnotationOperation}
        position={POSITION}
      />,
    );
    expect(nodes(rootOf(result), 'annotation-draft:border')).toEqual([]);

    await tap(boardId, { x: 25, y: 25 });
    expect(nodes(rootOf(result), 'annotation-draft:border')).toHaveLength(1);
    await result.rerender(
      <ChessboardRuntime
        annotations={{ revision: 8, value: [] }}
        annotationTool={{ ...ARROW_TOOL, color: '#3b82f6' }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={onAnnotationOperation}
        position={POSITION}
      />,
    );
    expect(nodes(rootOf(result), 'annotation-draft:border')).toEqual([]);

    await tap(boardId, { x: 25, y: 25 });
    expect(nodes(rootOf(result), 'annotation-draft:border')).toHaveLength(1);
    await result.rerender(
      <ChessboardRuntime
        annotations={{ revision: 8, value: [] }}
        annotationTool={{ ...ARROW_TOOL, color: '#3b82f6' }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        position={POSITION}
      />,
    );
    expect(nodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
    expect(onAnnotationOperation).not.toHaveBeenCalled();
  });

  it('finishes against the latest committed callback and makes a removed-handler terminal inert', async () => {
    const boardId = 'annotation-callback-race';
    const first = jest.fn();
    const second = jest.fn();
    const result = await render(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={ARROW_TOOL}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={first}
        position={POSITION}
      />,
    );
    await measure(rootOf(result));
    const longPress = getByGestureTestId(
      getBoardGestureTestIds(boardId).longPress,
    );
    const callbacks = gestureCallbacks(longPress);
    const handlerTag = (
      longPress as unknown as Readonly<{ handlerTag: number }>
    ).handlerTag;

    await act(() => {
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onStart?.({ handlerTag, x: 25, y: 25 });
    });
    await result.rerender(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={{ ...ARROW_TOOL }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={second}
        position={POSITION}
      />,
    );
    await act(() => {
      callbacks.onEnd?.({ handlerTag, x: 135, y: 135 }, true);
      callbacks.onFinalize?.({ handlerTag, x: 135, y: 135 }, true);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    const currentLongPress = getByGestureTestId(
      getBoardGestureTestIds(boardId).longPress,
    );
    const retained = gestureCallbacks(currentLongPress);
    const currentTag = (
      currentLongPress as unknown as Readonly<{ handlerTag: number }>
    ).handlerTag;
    await act(() => {
      retained.onBegin?.({ handlerTag: currentTag, x: 25, y: 25 });
      retained.onStart?.({ handlerTag: currentTag, x: 25, y: 25 });
    });
    await result.rerender(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={ARROW_TOOL}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        position={POSITION}
      />,
    );
    await act(() => {
      retained.onEnd?.({ handlerTag: currentTag, x: 135, y: 135 }, true);
      retained.onFinalize?.({ handlerTag: currentTag, x: 135, y: 135 }, true);
    });
    expect(second).toHaveBeenCalledTimes(1);
    expect(nodes(rootOf(result), 'annotation-draft:shaft')).toEqual([]);
  });

  it('keeps quick one-finger piece dragging available and cancels an armed annotation before the move request', async () => {
    const boardId = 'annotation-piece-drag';
    const onAnnotationOperation = jest.fn();
    const onMoveRequest: OnMoveRequest = jest.fn(() => ({
      status: 'rejected',
    }));
    const occupied: ControlledPosition = Object.freeze({
      revision: 6,
      value: Object.freeze({
        a2: Object.freeze({ id: 'pawn', pieceType: 'wP' }),
      }),
    });
    const result = await render(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={ARROW_TOOL}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={onAnnotationOperation}
        onMoveRequest={onMoveRequest}
        position={occupied}
      />,
    );
    await measure(rootOf(result));
    await tap(boardId, { x: 25, y: 25 });
    expect(nodes(rootOf(result), 'annotation-draft:border')).toHaveLength(1);

    const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
    await act(() => {
      fireGestureHandler(pan, [
        { state: State.BEGAN, x: 25, y: 25 },
        { state: State.ACTIVE, x: 35, y: 25 },
        { state: State.END, x: 135, y: 135 },
      ]);
    });

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    const requestContext = jest.mocked(onMoveRequest).mock.calls[0]?.[1];
    if (requestContext === undefined) {
      throw new Error('Expected one move request context.');
    }
    expect(requestContext.signal.aborted).toBe(false);
    expect(onMoveRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        basePositionRevision: 6,
        boardId,
        input: 'drag',
        source: { kind: 'board', square: 'a2' },
        targetSquare: 'b1',
      }),
      requestContext,
    );
    expect(onAnnotationOperation).not.toHaveBeenCalled();
    expect(nodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
  });
});
