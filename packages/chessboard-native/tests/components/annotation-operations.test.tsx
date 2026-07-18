import { act, fireEvent, render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { TestInstance } from 'test-renderer';

import { ChessboardRuntime } from '../../src/Chessboard';
import { ChessboardProvider } from '../../src/ChessboardProvider';
import type {
  AnnotationOperation,
  ControlledAnnotations,
  ControlledPosition,
  OnMoveRequest,
} from '../../src/public-types';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

const SIZE = 200;
const POINT = Object.freeze({ x: 25, y: 25 });
const DRAG_TARGET = Object.freeze({ x: 135, y: 135 });

const ANNOTATIONS: ControlledAnnotations = Object.freeze({
  revision: 7,
  value: Object.freeze([
    Object.freeze({
      color: '#f00',
      from: 'a1',
      id: 'first',
      to: 'b2',
      type: 'arrow' as const,
    }),
    Object.freeze({
      color: '#0f0',
      id: 'second',
      square: 'b1',
      type: 'square' as const,
    }),
  ]),
});

function position(revision: number, occupied = false): ControlledPosition {
  return Object.freeze({
    revision,
    value: occupied
      ? Object.freeze({ a1: Object.freeze({ pieceType: 'token' }) })
      : Object.freeze({}),
  });
}

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected a rendered board root.');
  }
  return result.root;
}

async function measure(root: TestInstance): Promise<void> {
  await fireEvent(root, 'layout', {
    nativeEvent: {
      layout: { height: SIZE, width: SIZE, x: 0, y: 0 },
    },
  });
}

async function tap(boardId: string): Promise<void> {
  const gesture = getByGestureTestId(getBoardGestureTestIds(boardId).tap);
  await act(() => {
    fireGestureHandler(gesture, [
      { state: State.BEGAN, ...POINT },
      { state: State.END, ...POINT },
    ]);
  });
}

async function drag(boardId: string): Promise<void> {
  const gesture = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
  await act(() => {
    fireGestureHandler(gesture, [
      { state: State.BEGAN, ...POINT },
      { state: State.ACTIVE, x: POINT.x + 10, y: POINT.y },
      { state: State.ACTIVE, ...DRAG_TARGET },
      { state: State.END, ...DRAG_TARGET },
    ]);
  });
}

function clearOperation(
  operation: Readonly<AnnotationOperation> | undefined,
): Extract<AnnotationOperation, { readonly type: 'clear' }> {
  if (operation?.type !== 'clear') {
    throw new Error('Expected a clear annotation operation.');
  }
  return operation;
}

describe('controlled annotation operations', () => {
  it('[PARITY-OPTION-CLEAR-ARROWS-ON-CLICK] exposes board-press clearing only as an explicit callback policy', async () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const boardId = 'press-policy';
    const result = await render(
      <ChessboardRuntime
        annotationPolicies={{ clearOnBoardPress: true }}
        annotations={ANNOTATIONS}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={position(3)}
      />,
    );
    await measure(rootOf(result));
    await tap(boardId);

    const operation = clearOperation(operations[0]);
    expect(operation).toEqual({
      annotationIdsAtBase: ['first', 'second'],
      baseAnnotationRevision: 7,
      boardId,
      input: 'touch',
      operationId: operation.operationId,
      reason: 'board-press',
      type: 'clear',
    });
    expect(Object.isFrozen(operation)).toBe(true);
    expect(Object.isFrozen(operation.annotationIdsAtBase)).toBe(true);
    expect(ANNOTATIONS.value).toHaveLength(2);

    await result.rerender(
      <ChessboardRuntime
        annotationPolicies={{ clearOnBoardPress: true }}
        annotations={ANNOTATIONS}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        position={position(3)}
      />,
    );
    expect(() =>
      getByGestureTestId(getBoardGestureTestIds(boardId).tap),
    ).toThrow();
  });

  it('reads the latest annotation revision and IDs when a board press terminates', async () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const boardId = 'current-press-snapshot';
    const currentPosition = position(3);
    const result = await render(
      <ChessboardRuntime
        annotationPolicies={{ clearOnBoardPress: true }}
        annotations={ANNOTATIONS}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={currentPosition}
      />,
    );
    await measure(rootOf(result));

    const latest: ControlledAnnotations = Object.freeze({
      revision: 8,
      value: Object.freeze([
        Object.freeze({
          color: '#00f',
          id: 'latest',
          square: 'a2',
          type: 'square' as const,
        }),
      ]),
    });
    await result.rerender(
      <ChessboardRuntime
        annotationPolicies={{ clearOnBoardPress: true }}
        annotations={latest}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={currentPosition}
      />,
    );
    await tap(boardId);

    const operation = clearOperation(operations[0]);
    expect(operation.baseAnnotationRevision).toBe(8);
    expect(operation.annotationIdsAtBase).toEqual(['latest']);
  });

  it('[PARITY-BEHAVIOR-B39] emits a captured clear before coexisting square activation and never commits it', async () => {
    const order: string[] = [];
    const operations: Readonly<AnnotationOperation>[] = [];
    const boardId = 'press-order';
    const result = await render(
      <ChessboardRuntime
        annotationPolicies={{ clearOnBoardPress: true }}
        annotations={ANNOTATIONS}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => {
          operations.push(operation);
          order.push('annotation');
          throw new Error('ignored observer failure');
        }}
        onSquareActivate={() => order.push('square')}
        position={position(4)}
      />,
    );
    await measure(rootOf(result));
    await tap(boardId);

    expect(order).toEqual(['annotation', 'square']);
    expect(clearOperation(operations[0]).annotationIdsAtBase).toEqual([
      'first',
      'second',
    ]);
    expect(
      rootOf(result).queryAll(
        (node) => node.props['testID'] === 'annotation:first:shaft',
      ),
    ).toHaveLength(1);
    expect(ANNOTATIONS.revision).toBe(7);
  });

  it('does not cancel a pending move when only annotation clear availability changes', async () => {
    const boardId = 'annotation-availability-pending-move';
    let decisionSignal: AbortSignal | undefined;
    const onMoveRequest: OnMoveRequest = jest.fn((_intent, { signal }) => {
      decisionSignal = signal;
      return new Promise(() => undefined);
    });
    const currentPosition: ControlledPosition = Object.freeze({
      revision: 6,
      value: Object.freeze({
        a2: Object.freeze({ id: 'moving', pieceType: 'wP' }),
      }),
    });
    const onAnnotationOperation = jest.fn();
    const result = await render(
      <ChessboardRuntime
        annotationPolicies={{ clearOnBoardPress: true }}
        annotations={ANNOTATIONS}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onAnnotationOperation={onAnnotationOperation}
        onMoveRequest={onMoveRequest}
        position={currentPosition}
      />,
    );
    await measure(rootOf(result));
    await drag(boardId);
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(decisionSignal?.aborted).toBe(false);

    await result.rerender(
      <ChessboardRuntime
        annotationPolicies={{ clearOnBoardPress: true }}
        annotations={{ revision: 8, value: [] }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onAnnotationOperation={onAnnotationOperation}
        onMoveRequest={onMoveRequest}
        position={currentPosition}
      />,
    );

    expect(decisionSignal?.aborted).toBe(false);
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    await result.unmount();
    expect(decisionSignal?.aborted).toBe(true);
  });

  it('[PARITY-OPTION-CLEAR-ARROWS-ON-POSITION-CHANGE] skips the initial commit and requests one clear from the later commit snapshot', async () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const boardId = 'position-policy';
    const result = await render(
      <ChessboardRuntime
        annotationPolicies={{ clearOnPositionChange: true }}
        annotations={ANNOTATIONS}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={position(10)}
      />,
    );
    expect(operations).toEqual([]);

    const retained = ANNOTATIONS.value.at(1);
    if (retained === undefined) {
      throw new Error('Expected the retained annotation fixture.');
    }
    const currentAnnotations: ControlledAnnotations = Object.freeze({
      revision: 8,
      value: Object.freeze([
        retained,
        Object.freeze({
          color: '#00f',
          id: 'concurrent',
          square: 'a2',
          type: 'square' as const,
        }),
      ]),
    });
    await result.rerender(
      <ChessboardRuntime
        annotationPolicies={{ clearOnPositionChange: true }}
        annotations={currentAnnotations}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={position(11, true)}
      />,
    );

    const operation = clearOperation(operations[0]);
    expect(operation.baseAnnotationRevision).toBe(8);
    expect(operation.annotationIdsAtBase).toEqual(['second', 'concurrent']);
    expect(operation.input).toBe('policy');
    expect(operation.reason).toBe('position-change');
    expect(operations).toHaveLength(1);

    await result.rerender(
      <ChessboardRuntime
        annotationPolicies={{ clearOnPositionChange: true }}
        annotations={currentAnnotations}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(next) => operations.push(next)}
        position={position(11, true)}
      />,
    );
    expect(operations).toHaveLength(1);
  });

  it('[PARITY-BEHAVIOR-B40] keeps position clearing independent from board-press policy and tracks changes while disabled', async () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const boardId = 'independent-policy';
    const onOperation = (operation: Readonly<AnnotationOperation>): void => {
      operations.push(operation);
    };
    const result = await render(
      <ChessboardRuntime
        annotations={ANNOTATIONS}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={onOperation}
        position={position(20)}
      />,
    );
    await measure(rootOf(result));

    await result.rerender(
      <ChessboardRuntime
        annotations={ANNOTATIONS}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={onOperation}
        position={position(21, true)}
      />,
    );
    await result.rerender(
      <ChessboardRuntime
        annotationPolicies={{ clearOnPositionChange: true }}
        annotations={ANNOTATIONS}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={onOperation}
        position={position(21, true)}
      />,
    );
    expect(operations).toEqual([]);

    await result.rerender(
      <ChessboardRuntime
        annotationPolicies={{ clearOnPositionChange: true }}
        annotations={ANNOTATIONS}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={onOperation}
        position={position(22)}
      />,
    );
    expect(operations).toHaveLength(1);
    expect(clearOperation(operations[0]).reason).toBe('position-change');
    expect(() =>
      getByGestureTestId(getBoardGestureTestIds(boardId).tap),
    ).toThrow();
  });

  it('prevents an unregistered duplicate board from emitting a clear for the registered owner store', async () => {
    const registered: Readonly<AnnotationOperation>[] = [];
    const duplicate: Readonly<AnnotationOperation>[] = [];
    const boardId = 'duplicate-policy-board';
    const duplicateLog = jest.fn();
    const result = await render(
      <ChessboardProvider>
        <ChessboardRuntime
          annotationPolicies={{ clearOnPositionChange: true }}
          annotations={ANNOTATIONS}
          boardId={boardId}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onAnnotationOperation={(operation) => registered.push(operation)}
          position={position(30)}
        />
        <ChessboardRuntime
          annotationPolicies={{ clearOnPositionChange: true }}
          annotations={ANNOTATIONS}
          boardId={boardId}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          logError={duplicateLog}
          onAnnotationOperation={(operation) => duplicate.push(operation)}
          position={position(30)}
        />
      </ChessboardProvider>,
    );
    expect(duplicateLog).toHaveBeenCalledTimes(1);

    await result.rerender(
      <ChessboardProvider>
        <ChessboardRuntime
          annotationPolicies={{ clearOnPositionChange: true }}
          annotations={ANNOTATIONS}
          boardId={boardId}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onAnnotationOperation={(operation) => registered.push(operation)}
          position={position(31, true)}
        />
        <ChessboardRuntime
          annotationPolicies={{ clearOnPositionChange: true }}
          annotations={ANNOTATIONS}
          boardId={boardId}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          logError={duplicateLog}
          onAnnotationOperation={(operation) => duplicate.push(operation)}
          position={position(31, true)}
        />
      </ChessboardProvider>,
    );

    expect(registered).toHaveLength(1);
    expect(clearOperation(registered[0]).reason).toBe('position-change');
    expect(duplicate).toEqual([]);
  });

  it('[CBN-CONTRACT-004-CALLBACK-NONCOMMITTING] derives plain revisions while empty collections remain inert', async () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const annotation = Object.freeze({
      color: '#f0f',
      id: 'plain',
      square: 'a1',
      type: 'square' as const,
    });
    const result = await render(
      <ChessboardRuntime
        annotationPolicies={{ clearOnPositionChange: true }}
        annotations={[annotation]}
        boardId="plain-policy"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={{}}
      />,
    );
    await result.rerender(
      <ChessboardRuntime
        annotationPolicies={{ clearOnPositionChange: true }}
        annotations={[annotation]}
        boardId="plain-policy"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={{ a1: { pieceType: 'token' } }}
      />,
    );
    expect(clearOperation(operations[0]).baseAnnotationRevision).toBe(0);

    await result.rerender(
      <ChessboardRuntime
        annotationPolicies={{ clearOnPositionChange: true }}
        annotations={[]}
        boardId="plain-policy"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={{}}
      />,
    );
    expect(operations).toHaveLength(1);
  });
});
