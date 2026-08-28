import { act, fireEvent, render } from '@testing-library/react-native';
import {
  startTransition,
  StrictMode,
  Suspense,
  useState,
  type ReactElement,
} from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { TestInstance } from 'test-renderer';

import { ChessboardRuntime } from '../../src/Chessboard';
import type {
  CanDragPiece,
  MoveDecision,
  MoveIntent,
  MoveOutcomeAccessibilityContext,
  OnMoveRequest,
  PieceRendererProps,
  PieceRenderers,
  PositionObject,
} from '../../src';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

const BOARD_SIZE = 200;
const START = Object.freeze({ x: 25, y: 25 });
const BOTTOM_RIGHT = Object.freeze({ x: 135, y: 135 });
const OFF_BOARD = Object.freeze({ x: 225, y: 50 });

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected ChessboardRuntime to render one native root.');
  }
  return result.root;
}

async function measure(root: TestInstance): Promise<void> {
  await fireEvent(root, 'layout', {
    nativeEvent: {
      layout: { height: BOARD_SIZE, width: BOARD_SIZE, x: 0, y: 0 },
    },
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

async function flushAnimationFrame(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      }),
  );
}

async function flushRetirementFrames(): Promise<void> {
  await flushAnimationFrame();
  await flushAnimationFrame();
}

async function drag(
  boardId: string,
  target: Readonly<{ x: number; y: number }>,
): Promise<void> {
  await dragFrom(boardId, START, target);
}

async function dragFrom(
  boardId: string,
  source: Readonly<{ x: number; y: number }>,
  target: Readonly<{ x: number; y: number }>,
): Promise<void> {
  const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
  await act(() => {
    fireGestureHandler(pan, [
      { state: State.BEGAN, ...source },
      { state: State.ACTIVE, x: source.x + 10, y: source.y },
      { state: State.ACTIVE, ...target },
      { state: State.END, ...target },
    ]);
  });
  await flushRetirementFrames();
}

async function flushDecisions(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function gesturePlanes(root: TestInstance): TestInstance[] {
  return root.queryAll(
    (node) =>
      node.props['accessibilityElementsHidden'] === true &&
      node.props['accessible'] === false &&
      node.props['collapsable'] === false &&
      node.props['importantForAccessibility'] === 'no-hide-descendants' &&
      node.props['pointerEvents'] === 'auto',
  );
}

function visualKind(props: PieceRendererProps): string {
  if (props.state.isDragging) {
    return 'drag';
  }
  if (props.state.isPending && props.state.isGhost) {
    return 'pending-source';
  }
  if (props.state.isGhost) {
    return 'source-ghost';
  }
  if (props.state.isPending) {
    return 'pending-target';
  }
  return 'static';
}

interface PanCallbacks {
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
}

function panCallbacks(pan: unknown): Readonly<PanCallbacks> {
  return (pan as Readonly<{ handlers: Readonly<PanCallbacks> }>).handlers;
}

function pieceProbe(props: PieceRendererProps): ReactElement {
  return (
    <View
      testID={`move-piece:${visualKind(props)}:${props.square ?? 'spare'}:${props.piece.pieceType}`}
    />
  );
}

const PIECE_RENDERERS = Object.freeze({
  token: pieceProbe,
}) satisfies PieceRenderers;

function nodesByTestId(root: TestInstance, testID: string): TestInstance[] {
  return root.queryAll((node) => node.props['testID'] === testID);
}

function containsInstance(root: TestInstance, target: TestInstance): boolean {
  return root === target || root.queryAll((node) => node === target).length > 0;
}

function hiddenNodesByTestId(
  result: Awaited<ReturnType<typeof render>>,
  testID: string,
): TestInstance[] {
  return result.queryAllByTestId(testID, { includeHiddenElements: true });
}

function animatedStyle(node: TestInstance): Readonly<Record<string, unknown>> {
  const animated: unknown = node.props['jestAnimatedStyle'];
  if (typeof animated !== 'object' || animated === null) {
    throw new Error('Expected a Reanimated Jest style.');
  }
  const value = (animated as Readonly<Record<string, unknown>>)['value'];
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected a Reanimated Jest style value.');
  }
  return value as Readonly<Record<string, unknown>>;
}

function nativeStyle(node: TestInstance): Readonly<ViewStyle> {
  return StyleSheet.flatten<ViewStyle>(
    node.props['style'] as StyleProp<ViewStyle>,
  );
}

function expectOneVisual(
  root: TestInstance,
  kind: string,
  square: string,
): void {
  expect(
    nodesByTestId(root, `move-piece:${kind}:${square}:token`),
  ).toHaveLength(1);
}

function expectNoVisual(
  root: TestInstance,
  kind: string,
  square: string,
): void {
  expect(nodesByTestId(root, `move-piece:${kind}:${square}:token`)).toEqual([]);
}

describe('public controlled move requests', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[PARITY-OPTION-ALLOW-DRAGGING] mounts no gesture plane without a callback and honors the declarative drag gate', async () => {
    const boardId = 'allow-dragging';
    const position = Object.freeze({
      revision: 7,
      value: Object.freeze({
        a2: Object.freeze({ id: 'piece', pieceType: 'token' }),
      }),
    });
    const onMoveRequest: OnMoveRequest = jest.fn(() => ({
      status: 'rejected',
    }));
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        pieceRenderers={PIECE_RENDERERS}
        position={position}
      />,
    );
    await measure(rootOf(result));

    expect(gesturePlanes(rootOf(result))).toEqual([]);
    expect(() =>
      getByGestureTestId(getBoardGestureTestIds(boardId).pan),
    ).toThrow();

    await result.rerender(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        interactionPermissions={{ drag: false }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={position}
      />,
    );
    expect(gesturePlanes(rootOf(result))).toEqual([]);
    expect(() =>
      getByGestureTestId(getBoardGestureTestIds(boardId).pan),
    ).toThrow();

    await result.rerender(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        interactionPermissions={{ accessibility: true, drag: true }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={position}
      />,
    );
    expect(gesturePlanes(rootOf(result))).toHaveLength(1);
    expect(
      getByGestureTestId(getBoardGestureTestIds(boardId).pan),
    ).toBeDefined();
  });

  it('[PARITY-OPTION-CAN-DRAG-PIECE] evaluates the current source context and fails closed for false or throwing permission callbacks', async () => {
    for (const fixture of [
      {
        boardId: 'piece-gate-false',
        canDragPiece: jest.fn<
          ReturnType<CanDragPiece>,
          Parameters<CanDragPiece>
        >(() => false),
      },
      {
        boardId: 'piece-gate-throws',
        canDragPiece: jest.fn<
          ReturnType<CanDragPiece>,
          Parameters<CanDragPiece>
        >(() => {
          throw new Error('hostile drag gate');
        }),
      },
    ] as const) {
      const onMoveRequest: OnMoveRequest = jest.fn(() => ({
        status: 'accepted',
      }));
      const result = await render(
        <ChessboardRuntime
          boardId={fixture.boardId}
          canDragPiece={fixture.canDragPiece}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={onMoveRequest}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 11,
            value: { a2: { id: 'guarded', pieceType: 'token' } },
          }}
        />,
      );
      await measure(rootOf(result));
      expect(fixture.canDragPiece).toHaveBeenCalledWith({
        basePositionRevision: 11,
        boardId: fixture.boardId,
        piece: { id: 'guarded', pieceType: 'token' },
        source: { kind: 'board', square: 'a2' },
      });

      await drag(fixture.boardId, BOTTOM_RIGHT);
      await flushDecisions();
      expect(onMoveRequest).not.toHaveBeenCalled();
      await result.unmount();
    }
  });

  it('[PARITY-BEHAVIOR-B49] forwards a promotion-candidate intent without applying chess rules or choosing a promotion', async () => {
    const boardId = 'rules-free';
    const intents: MoveIntent[] = [];
    const onMoveRequest: OnMoveRequest = (intent) => {
      intents.push(intent);
      return { status: 'rejected' };
    };
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 8, rows: 8 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={{ wP: pieceProbe }}
        position={{
          revision: 3,
          value: { a7: { id: 'promotion-candidate', pieceType: 'wP' } },
        }}
      />,
    );
    await measure(rootOf(result));
    await dragFrom(boardId, { x: 12.5, y: 37.5 }, { x: 37.5, y: 12.5 });
    await flushDecisions();

    expect(intents).toHaveLength(1);
    const intent = intents[0];
    if (intent === undefined) {
      throw new Error('Expected one rules-free drag intent.');
    }
    expect(typeof intent.intentId).toBe('string');
    expect(intent).toEqual({
      basePositionRevision: 3,
      boardId,
      input: 'drag',
      intentId: intent.intentId,
      piece: { id: 'promotion-candidate', pieceType: 'wP' },
      source: { kind: 'board', square: 'a7' },
      targetSquare: 'b8',
    });
    expect(intent).not.toHaveProperty('promotion');
  });

  it('[PARITY-BEHAVIOR-B23] preserves a null target for an off-board drag through the public callback', async () => {
    const boardId = 'off-board';
    const intents: MoveIntent[] = [];
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={(intent) => {
          intents.push(intent);
          return { status: 'rejected' };
        }}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 4,
          value: { a2: { pieceType: 'token' } },
        }}
      />,
    );
    await measure(rootOf(result));
    await drag(boardId, OFF_BOARD);
    await flushDecisions();

    expect(intents).toHaveLength(1);
    expect(intents[0]).toEqual(
      expect.objectContaining({
        basePositionRevision: 4,
        boardId,
        input: 'drag',
        source: { kind: 'board', square: 'a2' },
        targetSquare: null,
      }),
    );
  });

  it('[PARITY-BEHAVIOR-B11] never mutates position optimistically and hands a matching controlled commit off at the pending target', async () => {
    const boardId = 'controlled-commit';
    const activeProviderOverlayTestId = `chessboard-native:${boardId}:provider-drag-overlay`;
    const retiringProviderOverlayTestId = `chessboard-native:${boardId}:provider-drag-retiring-overlay`;
    const value: PositionObject = Object.freeze({
      a2: Object.freeze({ id: 'controlled', pieceType: 'token' }),
    });
    const position = Object.freeze({ revision: 20, value });
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    const accessibility = Object.freeze({
      formatMoveOutcome: (context: MoveOutcomeAccessibilityContext): null => {
        outcomes.push(context);
        return null;
      },
    });
    let acceptedIntent: MoveIntent | undefined;
    const onMoveRequest = jest.fn<
      ReturnType<OnMoveRequest>,
      Parameters<OnMoveRequest>
    >((intent, { signal }) => {
      expect(signal.aborted).toBe(false);
      acceptedIntent = intent;
      return { status: 'accepted' };
    });
    const result = await render(
      <ChessboardRuntime
        accessibility={accessibility}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={position}
        reduceMotion="never"
        transitionDurationMs={1_000}
      />,
    );
    const board = rootOf(result);
    await measure(board);
    expectOneVisual(board, 'static', 'a2');

    const initialPan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
    const initialHandlerTag = (
      initialPan as unknown as Readonly<{ handlerTag: number }>
    ).handlerTag;
    const initialCallbacks = panCallbacks(initialPan);
    await act(() => {
      initialCallbacks.onBegin?.({
        absoluteX: START.x,
        absoluteY: START.y,
        handlerTag: initialHandlerTag,
        ...START,
      });
      initialCallbacks.onStart?.({
        absoluteX: BOTTOM_RIGHT.x,
        absoluteY: BOTTOM_RIGHT.y,
        handlerTag: initialHandlerTag,
        ...BOTTOM_RIGHT,
      });
    });
    await flushDecisions();
    const initialActiveOverlays = hiddenNodesByTestId(
      result,
      activeProviderOverlayTestId,
    );
    expect(initialActiveOverlays).toHaveLength(1);
    const initialActiveOverlay = initialActiveOverlays[0];
    if (initialActiveOverlay === undefined) {
      throw new Error('Expected one active provider overlay.');
    }
    const activeOverlayStyles: unknown = initialActiveOverlay.props['style'];
    if (!Array.isArray(activeOverlayStyles)) {
      throw new Error('Expected the active provider overlay style chain.');
    }
    const attachedAnimatedStyle: unknown = activeOverlayStyles.at(-1);
    const retirementFrames: ((timestamp: number) => void)[] = [];
    const retirementFrameSpy = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        retirementFrames.push(callback);
        return retirementFrames.length;
      });
    await act(() => {
      const terminalEvent = {
        absoluteX: BOTTOM_RIGHT.x,
        absoluteY: BOTTOM_RIGHT.y,
        handlerTag: initialHandlerTag,
        ...BOTTOM_RIGHT,
      };
      initialCallbacks.onEnd?.(terminalEvent, true);
      initialCallbacks.onFinalize?.(terminalEvent, true);
    });
    await flushDecisions();
    const releasedOverlays = hiddenNodesByTestId(
      result,
      retiringProviderOverlayTestId,
    );
    expect(releasedOverlays).toHaveLength(1);
    const releasedOverlay = releasedOverlays[0];
    if (releasedOverlay === undefined) {
      throw new Error('Expected one retiring provider overlay.');
    }
    expect(releasedOverlay).toBe(initialActiveOverlay);
    expect(releasedOverlay).toHaveProp('accessibilityElementsHidden', true);
    expect(releasedOverlay).toHaveProp('accessible', false);
    expect(releasedOverlay).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    expect(releasedOverlay).toHaveProp('pointerEvents', 'none');
    expect(releasedOverlay.props['style']).not.toContain(attachedAnimatedStyle);
    expect(nativeStyle(releasedOverlay)).toEqual(
      expect.objectContaining({ opacity: 0 }),
    );
    expect(hiddenNodesByTestId(result, activeProviderOverlayTestId)).toEqual(
      [],
    );
    expect(nodesByTestId(releasedOverlay, 'move-piece:drag:a2:token')).toEqual(
      [],
    );

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    const intent = acceptedIntent;
    if (intent === undefined) {
      throw new Error('Expected the drag to invoke onMoveRequest.');
    }

    expect(value).toEqual({
      a2: { id: 'controlled', pieceType: 'token' },
    });
    expect(position.value).toBe(value);
    expectOneVisual(board, 'pending-source', 'a2');
    expectOneVisual(board, 'pending-target', 'b1');
    expectNoVisual(board, 'static', 'b1');

    expect(retirementFrames).toHaveLength(1);
    retirementFrameSpy.mockRestore();
    jest.useFakeTimers();
    await result.rerender(
      <ChessboardRuntime
        accessibility={accessibility}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          committedIntentId: intent.intentId,
          revision: 21,
          value: { b1: { id: 'controlled', pieceType: 'token' } },
        }}
        reduceMotion="never"
        transitionDurationMs={1_000}
      />,
    );

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
    const committedOutcome = outcomes[0];
    if (committedOutcome === undefined) {
      throw new Error('Expected one correlated committed outcome.');
    }
    expect(committedOutcome.intent.intentId).toBe(intent.intentId);
    expect(committedOutcome.outcome).toBe('committed');
    expect(
      hiddenNodesByTestId(result, retiringProviderOverlayTestId),
    ).toHaveLength(1);

    expectNoVisual(board, 'pending-source', 'a2');
    expectOneVisual(board, 'pending-target', 'b1');
    expectOneVisual(board, 'static', 'b1');
    const canonical = nodesByTestId(board, 'move-piece:static:b1:token')[0];
    const pending = nodesByTestId(
      board,
      'move-piece:pending-target:b1:token',
    )[0];
    if (
      canonical?.parent === null ||
      canonical?.parent === undefined ||
      pending?.parent?.parent === null ||
      pending?.parent?.parent === undefined
    ) {
      throw new Error('Expected canonical and pending animated hosts.');
    }
    const pendingHandoffHost = pending.parent.parent;
    const canonicalStyle = animatedStyle(canonical.parent);
    const pendingStyle = animatedStyle(pendingHandoffHost);
    expect(canonicalStyle['transform']).toBeUndefined();
    expect(pendingStyle['transform']).toBeUndefined();
    expect(pendingStyle['opacity']).toBe(1);
    expect(pendingHandoffHost).toHaveProp('accessible', false);
    expect(pendingHandoffHost).toHaveProp('pointerEvents', 'none');

    await act(() => {
      // The first frame is a mount/presentation barrier. The detached provider
      // host must survive it so Fabric can consume the quiescent commit before
      // a later frame removes the native view.
      const firstFrame = retirementFrames.shift();
      if (firstFrame === undefined) {
        throw new Error('Expected the first provider retirement frame.');
      }
      firstFrame(16);
    });
    await flushDecisions();
    expect(hiddenNodesByTestId(result, activeProviderOverlayTestId)).toEqual(
      [],
    );
    const firstFrameRetiringOverlays = hiddenNodesByTestId(
      result,
      retiringProviderOverlayTestId,
    );
    expect(firstFrameRetiringOverlays).toHaveLength(1);
    expect(firstFrameRetiringOverlays[0]).toBe(releasedOverlay);
    expect(
      hiddenNodesByTestId(result, 'chessboard-native:provider-drag-host'),
    ).toHaveLength(1);

    await act(() => {
      jest.advanceTimersByTime(17);
    });
    await flushDecisions();
    expect(hiddenNodesByTestId(result, activeProviderOverlayTestId)).toEqual(
      [],
    );
    expect(hiddenNodesByTestId(result, retiringProviderOverlayTestId)).toEqual(
      [],
    );
    expect(
      hiddenNodesByTestId(result, 'chessboard-native:provider-drag-host'),
    ).toEqual([]);
    const startedCanonical = nodesByTestId(
      board,
      'move-piece:static:b1:token',
    )[0];
    const startedPending = nodesByTestId(
      board,
      'move-piece:pending-target:b1:token',
    )[0];
    if (
      startedCanonical?.parent === null ||
      startedCanonical?.parent === undefined ||
      startedPending?.parent?.parent === null ||
      startedPending?.parent?.parent === undefined
    ) {
      throw new Error('Expected both actors at the start of the crossfade.');
    }
    expect(
      Number(animatedStyle(startedCanonical.parent)['opacity']),
    ).toBeLessThan(0.05);
    expect(
      Number(animatedStyle(startedPending.parent.parent)['opacity']),
    ).toBeGreaterThan(0.95);

    await act(() => {
      jest.advanceTimersByTime(483);
    });
    const midpointCanonical = nodesByTestId(
      board,
      'move-piece:static:b1:token',
    )[0];
    const midpointPending = nodesByTestId(
      board,
      'move-piece:pending-target:b1:token',
    )[0];
    if (
      midpointCanonical?.parent === null ||
      midpointCanonical?.parent === undefined ||
      midpointPending?.parent?.parent === null ||
      midpointPending?.parent?.parent === undefined
    ) {
      throw new Error('Expected both actors throughout the crossfade.');
    }
    expect(animatedStyle(midpointCanonical.parent)['opacity']).toBeCloseTo(0.5);
    expect(animatedStyle(midpointPending.parent.parent)['opacity']).toBeCloseTo(
      0.5,
    );

    await act(async () => {
      // Cross the 1,000 ms deadline by a full mock animation frame. At the
      // exact boundary Reanimated may publish the final value before its
      // scheduleOnRN completion has cleared the mounted transition.
      await jest.advanceTimersByTimeAsync(517);
    });
    await flushDecisions();
    expectNoVisual(board, 'pending-target', 'b1');
    expect(containsInstance(board, pendingHandoffHost)).toBe(true);
    expect(pendingHandoffHost.children).toEqual([]);
    expect(nativeStyle(pendingHandoffHost)).toEqual(
      expect.objectContaining({ opacity: 0 }),
    );
    const settledCanonical = nodesByTestId(
      board,
      'move-piece:static:b1:token',
    )[0];
    if (
      settledCanonical?.parent === null ||
      settledCanonical?.parent === undefined
    ) {
      throw new Error('Expected the settled canonical actor.');
    }
    const settledStyle = nativeStyle(settledCanonical.parent);
    expect(settledStyle.opacity).toBe(1);
    expect(settledStyle.transform).toBeUndefined();

    await act(() => {
      jest.advanceTimersByTime(34);
    });
    expect(containsInstance(board, pendingHandoffHost)).toBe(false);
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
  });

  it('cancels pending work when a second drag starts and renders one active source ghost plus overlay', async () => {
    const boardId = 'second-drag-replaces';
    let decisionSignal: AbortSignal | undefined;
    const onMoveRequest: OnMoveRequest = jest.fn((_intent, { signal }) => {
      decisionSignal = signal;
      return new Promise(() => undefined);
    });
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 12,
          value: { a2: { id: 'replaceable', pieceType: 'token' } },
        }}
      />,
    );
    const board = rootOf(result);
    await measure(board);
    await drag(boardId, BOTTOM_RIGHT);
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(decisionSignal?.aborted).toBe(false);
    expectOneVisual(board, 'pending-source', 'a2');
    expectOneVisual(board, 'pending-target', 'b1');

    const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
    const handlerTag = (pan as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;
    const callbacks = panCallbacks(pan);
    await act(() => {
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onStart?.({ handlerTag, x: 35, y: 25 });
    });

    expect(decisionSignal?.aborted).toBe(true);
    expectNoVisual(board, 'pending-target', 'b1');
    expectOneVisual(board, 'source-ghost', 'a2');
    expect(
      result.queryAllByTestId('move-piece:drag:a2:token', {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);
    expectNoVisual(board, 'static', 'a2');

    await act(() => {
      callbacks.onFinalize?.({ handlerTag, x: 35, y: 25 }, false);
    });
    await flushRetirementFrames();
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expectOneVisual(board, 'static', 'a2');
    expectNoVisual(board, 'source-ghost', 'a2');
    expect(
      result.queryAllByTestId('move-piece:drag:a2:token', {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
  });

  it('clears a captured accessibility source when a physical drag starts and cancels', async () => {
    const boardId = 'drag-clears-accessibility-source';
    const onMoveRequest: OnMoveRequest = jest.fn(() => ({
      status: 'rejected',
    }));
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 14,
          value: { a2: { id: 'captured', pieceType: 'token' } },
        }}
      />,
    );
    const root = rootOf(result);
    await measure(root);
    await accessibilityAction(root, 'activate');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({
        text: 'a2, token piece; pending move source',
      }),
    );

    const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
    const handlerTag = (pan as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;
    const callbacks = panCallbacks(pan);
    await act(() => {
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onStart?.({ handlerTag, x: 35, y: 25 });
      callbacks.onFinalize?.({ handlerTag, x: 35, y: 25 }, false);
    });
    await flushRetirementFrames();

    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'a2, token piece' }),
    );
    expect(
      (
        rootOf(result).props['accessibilityActions'] as readonly Readonly<{
          name: string;
        }>[]
      ).some(({ name }) => name === 'cancel-move'),
    ).toBe(false);
    expect(onMoveRequest).not.toHaveBeenCalled();
  });

  it('cancels an accepted plain-tier request when a newer uncorrelated controlled value arrives', async () => {
    const boardId = 'plain-position-change';
    const onMoveRequest: OnMoveRequest = jest.fn(() => ({
      status: 'accepted',
    }));
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{ a2: { id: 'plain', pieceType: 'token' } }}
      />,
    );
    await measure(rootOf(result));
    await drag(boardId, BOTTOM_RIGHT);
    await flushDecisions();
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expectOneVisual(rootOf(result), 'pending-target', 'b1');

    await result.rerender(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{ b2: { id: 'plain', pieceType: 'token' } }}
      />,
    );

    expectNoVisual(rootOf(result), 'pending-target', 'b1');
    expectOneVisual(rootOf(result), 'static', 'b2');
  });

  it('keeps the mounted executor live through React StrictMode effect replay', async () => {
    const boardId = 'strict-runtime';
    const onMoveRequest: OnMoveRequest = jest.fn(() => ({
      status: 'rejected',
    }));
    const result = await render(
      <StrictMode>
        <ChessboardRuntime
          boardId={boardId}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          interactionPermissions={{ accessibility: true, drag: false }}
          onMoveRequest={onMoveRequest}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 1,
            value: { a2: { pieceType: 'token' } },
          }}
        />
      </StrictMode>,
    );
    const root = rootOf(result);
    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'move-cursor-right' },
    });
    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    await flushDecisions();

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending executor live when a timeout-changing concurrent render is abandoned', async () => {
    interface HarnessState {
      readonly mode: 'committed' | 'suspended';
      readonly version: number;
    }

    const boardId = 'abandoned-runtime-render';
    const never = new Promise<never>(() => undefined);
    const decision = new Promise<MoveDecision>(() => undefined);
    let decisionSignal: AbortSignal | undefined;
    let updateHarness: ((next: HarnessState) => void) | undefined;
    const onMoveRequest: OnMoveRequest = jest.fn((_intent, { signal }) => {
      decisionSignal = signal;
      return decision;
    });
    const position = Object.freeze({
      revision: 12,
      value: Object.freeze({
        a2: Object.freeze({ id: 'stable', pieceType: 'token' }),
      }),
    });

    function SuspendForever(): ReactElement {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Suspense uses thrown thenables as its render protocol.
      throw never;
    }

    function ConcurrentHarness(): ReactElement {
      const [state, setState] = useState<HarnessState>({
        mode: 'committed',
        version: 0,
      });
      updateHarness = (next) => {
        setState(next);
      };
      const shouldSuspend = state.mode === 'suspended';
      return (
        <Suspense fallback={<View testID="abandoned-runtime-fallback" />}>
          <ChessboardRuntime
            boardId={boardId}
            development={false}
            dimensions={{ columns: 2, rows: 2 }}
            moveRequestTimeouts={
              shouldSuspend
                ? { commitMs: 50_000, decisionMs: 50_000 }
                : { commitMs: 60_000, decisionMs: 60_000 }
            }
            onMoveRequest={onMoveRequest}
            pieceRenderers={PIECE_RENDERERS}
            position={position}
          />
          {shouldSuspend ? <SuspendForever /> : null}
        </Suspense>
      );
    }

    const result = await render(<ConcurrentHarness />);
    await measure(rootOf(result));
    await drag(boardId, BOTTOM_RIGHT);
    expect(decisionSignal?.aborted).toBe(false);
    expectOneVisual(rootOf(result), 'pending-target', 'b1');

    const update = updateHarness;
    if (update === undefined) {
      throw new Error('Expected the concurrent harness state setter.');
    }
    await act(() => {
      startTransition(() => {
        update({ mode: 'suspended', version: 1 });
      });
    });
    expect(
      nodesByTestId(rootOf(result), 'abandoned-runtime-fallback'),
    ).toHaveLength(0);
    expect(decisionSignal?.aborted).toBe(false);

    await act(() => {
      update({ mode: 'committed', version: 2 });
    });
    await flushDecisions();

    expect(decisionSignal?.aborted).toBe(false);
    expectOneVisual(rootOf(result), 'pending-target', 'b1');
    expect(onMoveRequest).toHaveBeenCalledTimes(1);

    await result.unmount();
    expect(decisionSignal?.aborted).toBe(true);
  });

  it('never reuses an intent ID when timeout reconfiguration replaces the executor', async () => {
    const boardId = 'timeout-reconfiguration';
    const intents: MoveIntent[] = [];
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    const onMoveRequest: OnMoveRequest = (intent) => {
      intents.push(intent);
      return { status: 'accepted' };
    };
    const formatMoveOutcome = (
      context: MoveOutcomeAccessibilityContext,
    ): null => {
      outcomes.push(context);
      return null;
    };
    const originalPosition = {
      revision: 30,
      value: { a2: { id: 'stable', pieceType: 'token' } },
    } as const;
    const result = await render(
      <ChessboardRuntime
        accessibility={{ formatMoveOutcome }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={originalPosition}
      />,
    );
    await measure(rootOf(result));
    await drag(boardId, BOTTOM_RIGHT);
    await flushDecisions();

    await result.rerender(
      <ChessboardRuntime
        accessibility={{ formatMoveOutcome }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 50_000, decisionMs: 50_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={originalPosition}
      />,
    );
    await flushDecisions();
    await drag(boardId, BOTTOM_RIGHT);
    await flushDecisions();

    expect(intents).toHaveLength(2);
    const first = intents[0];
    const second = intents[1];
    if (first === undefined || second === undefined) {
      throw new Error('Expected one intent from each executor generation.');
    }
    expect(second.intentId).not.toBe(first.intentId);

    await result.rerender(
      <ChessboardRuntime
        accessibility={{ formatMoveOutcome }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 50_000, decisionMs: 50_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          committedIntentId: first.intentId,
          revision: 31,
          value: originalPosition.value,
        }}
      />,
    );

    expect(outcomes).toHaveLength(1);
    const outcome = outcomes[0];
    if (outcome === undefined) {
      throw new Error(
        'Expected the replacement executor to cancel its intent.',
      );
    }
    expect(outcome.intent.intentId).toBe(second.intentId);
    expect(outcome.outcome).toBe('cancelled');
    expect(outcome.reason).toBe('position-change');
  });

  it('aborts a pending public request immediately on unmount and ignores its late decision', async () => {
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    let decisionSignal: AbortSignal | undefined;
    let resolveDecision: ((decision: MoveDecision) => void) | undefined;
    const decision = new Promise<MoveDecision>((resolve) => {
      resolveDecision = resolve;
    });
    const result = await render(
      <ChessboardRuntime
        accessibility={{
          formatMoveOutcome: (context) => {
            outcomes.push(context);
            return null;
          },
        }}
        boardId="unmount-request"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={(_intent, { signal }) => {
          decisionSignal = signal;
          return decision;
        }}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 2,
          value: { a2: { pieceType: 'token' } },
        }}
      />,
    );
    await measure(rootOf(result));
    await drag('unmount-request', BOTTOM_RIGHT);
    expect(decisionSignal?.aborted).toBe(false);

    await result.unmount();
    expect(decisionSignal?.aborted).toBe(true);
    resolveDecision?.({ status: 'accepted' });
    await flushDecisions();
    expect(outcomes).toEqual([]);
  });

  it('keeps two mounted interactive boards and their intent identities isolated', async () => {
    const firstIntents: MoveIntent[] = [];
    const secondIntents: MoveIntent[] = [];
    const result = await render(
      <View>
        <ChessboardRuntime
          boardId="isolated-first"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={(intent) => {
            firstIntents.push(intent);
            return { status: 'rejected' };
          }}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 5,
            value: { a2: { pieceType: 'token' } },
          }}
        />
        <ChessboardRuntime
          boardId="isolated-second"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={(intent) => {
            secondIntents.push(intent);
            return { status: 'rejected' };
          }}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 5,
            value: { a2: { pieceType: 'token' } },
          }}
        />
      </View>,
    );
    const boards = rootOf(result).queryAll(
      (node) => node.props['accessibilityRole'] === 'adjustable',
    );
    expect(boards).toHaveLength(2);
    const firstBoard = boards[0];
    const secondBoard = boards[1];
    if (firstBoard === undefined || secondBoard === undefined) {
      throw new Error('Expected two interactive board hosts.');
    }
    await measure(firstBoard);
    await measure(secondBoard);
    await drag('isolated-first', BOTTOM_RIGHT);
    await drag('isolated-second', BOTTOM_RIGHT);
    await flushDecisions();

    expect(firstIntents).toHaveLength(1);
    expect(secondIntents).toHaveLength(1);
    expect(firstIntents[0]?.boardId).toBe('isolated-first');
    expect(secondIntents[0]?.boardId).toBe('isolated-second');
    expect(firstIntents[0]?.intentId).not.toBe(secondIntents[0]?.intentId);
  });
});
