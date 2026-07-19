import { act, fireEvent, render } from '@testing-library/react-native';
import { StrictMode } from 'react';
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
  AnnotationTool,
  ControlledAnnotations,
  ControlledPosition,
  OnMoveRequest,
} from '../../src/public-types';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

const POSITION: ControlledPosition = Object.freeze({
  revision: 5,
  value: Object.freeze({}),
});

const EMPTY_ANNOTATIONS: ControlledAnnotations = Object.freeze({
  revision: 7,
  value: Object.freeze([]),
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

function actionNames(root: TestInstance): string[] {
  const actions = root.props['accessibilityActions'] as
    readonly Readonly<{ name: string }>[] | undefined;
  return actions?.map(({ name }) => name) ?? [];
}

function actionLabels(root: TestInstance): string[] {
  const actions = root.props['accessibilityActions'] as
    readonly Readonly<{ label?: string }>[] | undefined;
  return (
    actions?.flatMap(({ label }) => (label === undefined ? [] : [label])) ?? []
  );
}

async function measure(
  root: TestInstance,
  width = 200,
  height = 200,
): Promise<void> {
  await fireEvent(root, 'layout', {
    nativeEvent: {
      layout: { height, width, x: 0, y: 0 },
    },
  });
}

type AccessibilityActionHandler = (event: {
  readonly nativeEvent: { readonly actionName: string };
}) => void;

function actionHandler(root: TestInstance): AccessibilityActionHandler {
  return root.props['onAccessibilityAction'] as AccessibilityActionHandler;
}

async function invokeAction(
  handler: AccessibilityActionHandler,
  actionName: string,
): Promise<void> {
  await act(() => {
    handler({ nativeEvent: { actionName } });
  });
}

async function accessibilityAction(
  root: TestInstance,
  actionName: string,
): Promise<void> {
  await fireEvent(root, 'accessibilityAction', {
    nativeEvent: { actionName },
  });
}

async function touchTap(
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

function toggle(
  operation: Readonly<AnnotationOperation> | undefined,
): Extract<AnnotationOperation, { readonly type: 'toggle' }> {
  if (operation?.type !== 'toggle') {
    throw new Error('Expected one toggle annotation operation.');
  }
  return operation;
}

function draftNodes(root: TestInstance, testID: string): TestInstance[] {
  return root.queryAll((node) => node.props['testID'] === testID);
}

describe('accessible controlled annotation actions', () => {
  it('[PARITY-BEHAVIOR-B50] exposes one exclusive arrow lifecycle and emits one immutable controlled toggle', async () => {
    const boardId = 'accessible-arrow';
    const operations: Readonly<AnnotationOperation>[] = [];
    const onMoveRequest = jest.fn();
    const onSquareActivate = jest.fn();
    const result = await render(
      <StrictMode>
        <ChessboardRuntime
          accessibility={{
            formatActionLabel: ({ action }) => `Localized ${action}`,
          }}
          annotationPolicies={{ clearOnBoardPress: true }}
          annotations={EMPTY_ANNOTATIONS}
          annotationTool={ARROW_TOOL}
          boardId={boardId}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onAnnotationOperation={(operation) => operations.push(operation)}
          onMoveRequest={onMoveRequest}
          onSquareActivate={onSquareActivate}
          position={POSITION}
        />
      </StrictMode>,
    );

    expect(actionNames(rootOf(result))).not.toContain('start-arrow');
    await measure(rootOf(result));

    expect(actionNames(rootOf(result))).toEqual(
      expect.arrayContaining([
        'move-cursor-right',
        'move-cursor-down',
        'start-arrow',
      ]),
    );
    expect(actionNames(rootOf(result))).not.toEqual(
      expect.arrayContaining(['activate', 'clear-selection', 'remove-piece']),
    );
    expect(actionLabels(rootOf(result))).toContain('Localized start-arrow');

    await accessibilityAction(rootOf(result), 'start-arrow');
    expect(operations).toEqual([]);
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toHaveLength(
      1,
    );
    expect(actionNames(rootOf(result))).toContain('cancel-annotation');
    expect(actionNames(rootOf(result))).not.toContain('finish-arrow');

    await accessibilityAction(rootOf(result), 'move-cursor-right');
    expect(actionNames(rootOf(result))).toEqual(
      expect.arrayContaining(['finish-arrow', 'cancel-annotation']),
    );
    await accessibilityAction(rootOf(result), 'finish-arrow');

    expect(operations).toHaveLength(1);
    const operation = toggle(operations[0]);
    expect(operation).toEqual({
      annotation: {
        color: '#ef4444',
        from: 'a2',
        opacity: 0.7,
        to: 'b2',
        type: 'arrow',
        width: 20,
      },
      annotationId: operation.annotationId,
      baseAnnotationRevision: 7,
      boardId,
      input: 'accessibility',
      matchingIdsAtBase: [],
      operationId: operation.operationId,
      type: 'toggle',
    });
    expect(Object.isFrozen(operation)).toBe(true);
    expect(Object.isFrozen(operation.annotation)).toBe(true);
    expect(Object.isFrozen(operation.matchingIdsAtBase)).toBe(true);
    expect(EMPTY_ANNOTATIONS.value).toEqual([]);
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
    expect(draftNodes(rootOf(result), 'annotation-draft:shaft')).toEqual([]);
    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(onSquareActivate).not.toHaveBeenCalled();
  });

  it('fails closed when one committed native handler repeats start and finish actions', async () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const result = await render(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={ARROW_TOOL}
        boardId="duplicate-accessibility-actions"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={POSITION}
      />,
    );
    await measure(rootOf(result));

    const start = actionHandler(rootOf(result));
    await act(() => {
      start({ nativeEvent: { actionName: 'start-arrow' } });
      start({ nativeEvent: { actionName: 'start-arrow' } });
    });
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toHaveLength(
      1,
    );
    expect(operations).toEqual([]);

    await accessibilityAction(rootOf(result), 'move-cursor-right');
    const finish = actionHandler(rootOf(result));
    await act(() => {
      finish({ nativeEvent: { actionName: 'finish-arrow' } });
      finish({ nativeEvent: { actionName: 'finish-arrow' } });
    });

    expect(operations).toHaveLength(1);
    expect(toggle(operations[0]).annotation).toMatchObject({
      from: 'a2',
      to: 'b2',
      type: 'arrow',
    });
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
    expect(actionNames(rootOf(result))).toContain('start-arrow');
    expect(actionNames(rootOf(result))).not.toContain('cancel-annotation');

    await accessibilityAction(rootOf(result), 'start-arrow');
    const staleCancel = actionHandler(rootOf(result));
    await accessibilityAction(rootOf(result), 'cancel-annotation');
    await accessibilityAction(rootOf(result), 'start-arrow');
    await invokeAction(staleCancel, 'cancel-annotation');
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toHaveLength(
      1,
    );
    await accessibilityAction(rootOf(result), 'cancel-annotation');
  });

  it('toggles a square despite selection disabled state and reports current matching IDs', async () => {
    const boardId = 'accessible-square';
    const operations: Readonly<AnnotationOperation>[] = [];
    const annotations: ControlledAnnotations = Object.freeze({
      revision: 12,
      value: Object.freeze([
        Object.freeze({
          color: '#2563eb',
          id: 'matching-square',
          shape: 'dot',
          square: 'a2',
          type: 'square' as const,
        }),
      ]),
    });
    const result = await render(
      <ChessboardRuntime
        annotations={annotations}
        annotationTool={{ color: '#2563eb', shape: 'dot', type: 'square' }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={POSITION}
        selection={{ disabledSquares: ['a2'], selectedSquare: 'a2' }}
      />,
    );
    await measure(rootOf(result));

    expect(actionNames(rootOf(result))).toContain('toggle-square-annotation');
    expect(actionNames(rootOf(result))).not.toContain('activate');
    await accessibilityAction(rootOf(result), 'toggle-square-annotation');

    const operation = toggle(operations[0]);
    expect(operations).toHaveLength(1);
    expect(operation.annotation).toEqual({
      color: '#2563eb',
      shape: 'dot',
      square: 'a2',
      type: 'square',
    });
    expect(operation.baseAnnotationRevision).toBe(12);
    expect(operation.input).toBe('accessibility');
    expect(operation.matchingIdsAtBase).toEqual(['matching-square']);
    expect(annotations.value).toHaveLength(1);
  });

  it('cancels locally, preserves semantic-equal tools, and fails closed across controlled revisions and handler removal', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const boardId = 'accessible-invalidation';
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
    await accessibilityAction(rootOf(result), 'start-arrow');

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
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toHaveLength(
      1,
    );
    await accessibilityAction(rootOf(result), 'move-cursor-right');
    await accessibilityAction(rootOf(result), 'finish-arrow');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    await accessibilityAction(rootOf(result), 'start-arrow');
    await accessibilityAction(rootOf(result), 'cancel-annotation');
    expect(second).toHaveBeenCalledTimes(1);
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toEqual([]);

    await accessibilityAction(rootOf(result), 'start-arrow');
    await result.rerender(
      <ChessboardRuntime
        annotations={{ revision: 8, value: [] }}
        annotationTool={ARROW_TOOL}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={second}
        position={POSITION}
      />,
    );
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
    await accessibilityAction(rootOf(result), 'finish-arrow');
    expect(second).toHaveBeenCalledTimes(1);

    await accessibilityAction(rootOf(result), 'start-arrow');
    await result.rerender(
      <ChessboardRuntime
        annotations={{ revision: 8, value: [] }}
        annotationTool={ARROW_TOOL}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        position={POSITION}
      />,
    );
    expect(actionNames(rootOf(result))).not.toContain('start-arrow');
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
    await accessibilityAction(rootOf(result), 'finish-arrow');
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('invalidates an armed arrow across position, semantic tool, and board identity changes', async () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const renderBoard = (
      boardId: string,
      position: ControlledPosition,
      annotationTool: Readonly<Exclude<AnnotationTool, null>>,
    ) => (
      <ChessboardRuntime
        key={boardId}
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={annotationTool}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={(operation) => operations.push(operation)}
        position={position}
      />
    );
    const result = await render(
      renderBoard('accessible-snapshot-a', POSITION, ARROW_TOOL),
    );
    await measure(rootOf(result));

    await accessibilityAction(rootOf(result), 'start-arrow');
    await accessibilityAction(rootOf(result), 'move-cursor-right');
    const beforePositionChange = actionHandler(rootOf(result));
    const nextPosition = Object.freeze({
      revision: 6,
      value: POSITION.value,
    });
    await result.rerender(
      renderBoard('accessible-snapshot-a', nextPosition, ARROW_TOOL),
    );
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
    await invokeAction(beforePositionChange, 'finish-arrow');

    await accessibilityAction(rootOf(result), 'start-arrow');
    await accessibilityAction(rootOf(result), 'move-cursor-left');
    const beforeToolChange = actionHandler(rootOf(result));
    const nextTool = Object.freeze({ ...ARROW_TOOL, color: '#22c55e' });
    await result.rerender(
      renderBoard('accessible-snapshot-a', nextPosition, nextTool),
    );
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
    await invokeAction(beforeToolChange, 'finish-arrow');

    await accessibilityAction(rootOf(result), 'start-arrow');
    await accessibilityAction(rootOf(result), 'move-cursor-right');
    const beforeBoardChange = actionHandler(rootOf(result));
    await result.rerender(
      renderBoard('accessible-snapshot-b', nextPosition, nextTool),
    );
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
    await invokeAction(beforeBoardChange, 'finish-arrow');

    expect(operations).toEqual([]);
  });

  it('invalidates armed arrows across measured and provider geometry revisions', async () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const tree = (geometryRevision: number) => (
      <ChessboardProvider geometryRevision={geometryRevision}>
        <ChessboardRuntime
          annotations={EMPTY_ANNOTATIONS}
          annotationTool={ARROW_TOOL}
          boardId="accessible-geometry"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onAnnotationOperation={(operation) => operations.push(operation)}
          position={POSITION}
        />
      </ChessboardProvider>
    );
    const result = await render(tree(1));
    await measure(rootOf(result));

    await accessibilityAction(rootOf(result), 'start-arrow');
    await accessibilityAction(rootOf(result), 'move-cursor-right');
    const beforeMeasuredGeometryChange = actionHandler(rootOf(result));
    await measure(rootOf(result), 240, 200);
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
    await invokeAction(beforeMeasuredGeometryChange, 'finish-arrow');

    await accessibilityAction(rootOf(result), 'start-arrow');
    await accessibilityAction(rootOf(result), 'move-cursor-left');
    const beforeProviderGeometryChange = actionHandler(rootOf(result));
    await result.rerender(tree(2));
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toEqual([]);
    await invokeAction(beforeProviderGeometryChange, 'finish-arrow');

    expect(operations).toEqual([]);
  });

  it('shares one transient session between accessibility and touch input', async () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const boardId = 'shared-annotation-session';
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

    await accessibilityAction(rootOf(result), 'start-arrow');
    await touchTap(boardId, { x: 125, y: 25 });
    expect(operations).toHaveLength(1);
    expect(toggle(operations[0]).annotation).toEqual({
      color: '#ef4444',
      from: 'a2',
      opacity: 0.7,
      to: 'b2',
      type: 'arrow',
      width: 20,
    });
    expect(toggle(operations[0]).input).toBe('touch');
    expect(draftNodes(rootOf(result), 'annotation-draft:border')).toEqual([]);

    await touchTap(boardId, { x: 25, y: 25 });
    await accessibilityAction(rootOf(result), 'move-cursor-left');
    await accessibilityAction(rootOf(result), 'move-cursor-right');
    await accessibilityAction(rootOf(result), 'finish-arrow');
    expect(operations).toHaveLength(2);
    expect(toggle(operations[1]).input).toBe('accessibility');
  });

  it('keeps pending-move cancellation ahead of a newly enabled annotation tool', async () => {
    const position: ControlledPosition = Object.freeze({
      revision: 9,
      value: Object.freeze({
        a2: Object.freeze({ id: 'pawn', pieceType: 'wP' }),
      }),
    });
    let signal: AbortSignal | undefined;
    const onMoveRequest: OnMoveRequest = jest.fn((_intent, context) => {
      signal = context.signal;
      return new Promise(() => undefined);
    });
    const boardId = 'pending-move-annotation-precedence';
    const result = await render(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onAnnotationOperation={jest.fn()}
        onMoveRequest={onMoveRequest}
        position={position}
      />,
    );
    await measure(rootOf(result));
    await accessibilityAction(rootOf(result), 'activate');
    await accessibilityAction(rootOf(result), 'move-cursor-right');
    await accessibilityAction(rootOf(result), 'activate');
    await act(async () => Promise.resolve());
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);

    await result.rerender(
      <ChessboardRuntime
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={ARROW_TOOL}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onAnnotationOperation={jest.fn()}
        onMoveRequest={onMoveRequest}
        position={position}
      />,
    );

    expect(actionNames(rootOf(result))).toContain('cancel-move');
    expect(actionNames(rootOf(result))).not.toContain('start-arrow');
    await accessibilityAction(rootOf(result), 'cancel-move');
    expect(signal?.aborted).toBe(true);
  });

  it('repairs duplicate custom labels for annotation actions with stable fallbacks', async () => {
    const result = await render(
      <ChessboardRuntime
        accessibility={{ formatActionLabel: () => 'same label' }}
        annotations={EMPTY_ANNOTATIONS}
        annotationTool={ARROW_TOOL}
        boardId="annotation-label-fallback"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onAnnotationOperation={jest.fn()}
        position={POSITION}
      />,
    );
    await measure(rootOf(result));

    expect(actionLabels(rootOf(result))).toEqual([
      'same label',
      'Move cursor down',
      'Start arrow',
    ]);
  });
});
