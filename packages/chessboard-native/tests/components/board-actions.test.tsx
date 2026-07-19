import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef, type RefObject } from 'react';
import { View } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { TestInstance } from 'test-renderer';

import {
  ChessboardProvider,
  SparePiece,
  type ChessboardActions,
  type MoveDecision,
  type MoveIntent,
  type MoveOutcomeAccessibilityContext,
  type OnMoveRequest,
} from '../../src';
import { ChessboardRuntime } from '../../src/Chessboard';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';
import { getSparePieceGestureTestId } from '../../src/render/spare-piece-gesture-layer';

const BOARD_SIZE = 200;
const START = Object.freeze({ x: 25, y: 25 });
const TARGET = Object.freeze({ x: 135, y: 135 });

interface PanCallbacks {
  readonly onBegin?: (event: Readonly<Record<string, unknown>>) => void;
  readonly onFinalize?: (
    event: Readonly<Record<string, unknown>>,
    success: boolean,
  ) => void;
  readonly onEnd?: (
    event: Readonly<Record<string, unknown>>,
    success: boolean,
  ) => void;
  readonly onStart?: (event: Readonly<Record<string, unknown>>) => void;
}

interface MeasureInWindowView {
  readonly measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
}

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected one rendered root.');
  }
  return result.root;
}

async function measure(root: TestInstance): Promise<void> {
  await fireEvent(root, 'layout', {
    nativeEvent: {
      layout: {
        height: BOARD_SIZE,
        width: BOARD_SIZE,
        x: 0,
        y: 0,
      },
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

function requiredActions(
  ref: RefObject<ChessboardActions | null>,
): Readonly<ChessboardActions> {
  const actions = ref.current;
  if (actions === null) {
    throw new Error('Expected committed chessboard actions.');
  }
  return actions;
}

async function cancelMove(
  actions: Readonly<ChessboardActions>,
): Promise<boolean> {
  let cancelled = false;
  await act(() => {
    cancelled = actions.cancelMove();
  });
  return cancelled;
}

function panCallbacks(boardId: string): Readonly<{
  callbacks: Readonly<PanCallbacks>;
  handlerTag: number;
}> {
  const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
  return Object.freeze({
    callbacks: (
      pan as unknown as Readonly<{ handlers: Readonly<PanCallbacks> }>
    ).handlers,
    handlerTag: (pan as Readonly<{ handlerTag: number }>).handlerTag,
  });
}

async function startDrag(boardId: string): Promise<
  Readonly<{
    callbacks: Readonly<PanCallbacks>;
    handlerTag: number;
  }>
> {
  const pan = panCallbacks(boardId);
  await act(() => {
    pan.callbacks.onBegin?.({ handlerTag: pan.handlerTag, ...START });
    pan.callbacks.onStart?.({
      handlerTag: pan.handlerTag,
      x: START.x + 10,
      y: START.y,
    });
  });
  return pan;
}

async function drag(boardId: string): Promise<void> {
  const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
  await act(() => {
    fireGestureHandler(pan, [
      { state: State.BEGAN, ...START },
      { state: State.ACTIVE, x: START.x + 10, y: START.y },
      { state: State.ACTIVE, ...TARGET },
      { state: State.END, ...TARGET },
    ]);
  });
}

async function flushPromiseJobs(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('public ChessboardActions', () => {
  it('cancels staged accessibility and pending request work exactly once', async () => {
    let resolveDecision: ((decision: MoveDecision) => void) | undefined;
    const decision = new Promise<MoveDecision>((resolve) => {
      resolveDecision = resolve;
    });
    let signal: AbortSignal | undefined;
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    const actionsRef = createRef<ChessboardActions>();
    const onMoveRequest: OnMoveRequest = jest.fn((_intent, context) => {
      signal = context.signal;
      return decision;
    });
    const result = await render(
      <ChessboardRuntime
        accessibility={{
          formatMoveOutcome: (context) => {
            outcomes.push(context);
            return null;
          },
        }}
        actionsRef={actionsRef}
        boardId="cancel-accessibility"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        interactionPermissions={{ accessibility: true, drag: false }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        position={{
          revision: 4,
          value: { a2: { id: 'pawn', pieceType: 'wP' } },
        }}
      />,
    );
    const actions = requiredActions(actionsRef);
    expect(Object.isFrozen(actions)).toBe(true);
    expect(await cancelMove(actions)).toBe(false);

    await accessibilityAction(rootOf(result), 'activate');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({
        text: 'a2, white pawn; pending move source',
      }),
    );
    expect(await cancelMove(actions)).toBe(true);
    expect(await cancelMove(actions)).toBe(false);
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'a2, white pawn' }),
    );

    await accessibilityAction(rootOf(result), 'activate');
    await accessibilityAction(rootOf(result), 'move-cursor-right');
    await accessibilityAction(rootOf(result), 'activate');
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);

    expect(await cancelMove(actions)).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(await cancelMove(actions)).toBe(false);
    expect(outcomes).toEqual([
      expect.objectContaining({ outcome: 'cancelled', reason: 'user' }),
    ]);

    resolveDecision?.({ status: 'accepted' });
    await flushPromiseJobs();
    expect(outcomes).toHaveLength(1);
  });

  it('[PARITY-BEHAVIOR-B24] cancels an active native drag and rejects its stale terminal', async () => {
    const boardId = 'cancel-native-drag';
    const actionsRef = createRef<ChessboardActions>();
    const onMoveRequest: OnMoveRequest = jest.fn(() => ({
      status: 'rejected',
    }));
    const result = await render(
      <ChessboardRuntime
        actionsRef={actionsRef}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        position={{
          revision: 8,
          value: { a2: { id: 'pawn', pieceType: 'wP' } },
        }}
      />,
    );
    await measure(rootOf(result));
    const activePan = await startDrag(boardId);

    expect(await cancelMove(requiredActions(actionsRef))).toBe(true);
    expect(await cancelMove(requiredActions(actionsRef))).toBe(false);
    await act(() => {
      activePan.callbacks.onFinalize?.(
        { handlerTag: activePan.handlerTag, ...TARGET },
        true,
      );
    });
    expect(onMoveRequest).not.toHaveBeenCalled();

    await drag(boardId);
    await flushPromiseJobs();
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
  });

  it('cancels an accepted request while it awaits a controlled commit', async () => {
    const boardId = 'cancel-awaiting-commit';
    const actionsRef = createRef<ChessboardActions>();
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    let acceptedIntent: MoveIntent | undefined;
    let signal: AbortSignal | undefined;
    const onMoveRequest: OnMoveRequest = (intent, context) => {
      acceptedIntent = intent;
      signal = context.signal;
      return { status: 'accepted' };
    };
    const result = await render(
      <ChessboardRuntime
        accessibility={{
          formatMoveOutcome: (context) => {
            outcomes.push(context);
            return null;
          },
        }}
        actionsRef={actionsRef}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        position={{
          revision: 4,
          value: { a2: { id: 'pawn', pieceType: 'wP' } },
        }}
      />,
    );
    await measure(rootOf(result));
    await drag(boardId);
    await flushPromiseJobs();
    const intent = acceptedIntent;
    if (intent === undefined) {
      throw new Error('Expected one accepted move intent.');
    }
    expect(signal?.aborted).toBe(false);

    expect(await cancelMove(requiredActions(actionsRef))).toBe(true);
    // The callback has already completed; its retired decision signal is not
    // reused as the awaiting-commit cancellation channel.
    expect(signal?.aborted).toBe(false);
    expect(outcomes).toEqual([
      expect.objectContaining({ outcome: 'cancelled', reason: 'user' }),
    ]);

    await result.rerender(
      <ChessboardRuntime
        accessibility={{
          formatMoveOutcome: (context) => {
            outcomes.push(context);
            return null;
          },
        }}
        actionsRef={actionsRef}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        position={{
          committedIntentId: intent.intentId,
          revision: 5,
          value: { b1: { id: 'pawn', pieceType: 'wP' } },
        }}
      />,
    );
    await flushPromiseJobs();
    expect(outcomes).toHaveLength(1);
    expect(await cancelMove(requiredActions(actionsRef))).toBe(false);
  });

  it('makes a retained unmounted handle inert against a same-id remount', async () => {
    const boardId = 'retained-action-handle';
    const oldRef = createRef<ChessboardActions>();
    const first = await render(
      <ChessboardRuntime
        actionsRef={oldRef}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={() => ({ status: 'rejected' })}
        position={{ a2: { pieceType: 'wP' } }}
      />,
    );
    const retained = requiredActions(oldRef);
    await first.unmount();
    expect(oldRef.current).toBeNull();

    const currentRef = createRef<ChessboardActions>();
    const currentRequest: OnMoveRequest = jest.fn(() => ({
      status: 'rejected',
    }));
    const second = await render(
      <ChessboardRuntime
        actionsRef={currentRef}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={currentRequest}
        position={{ a2: { pieceType: 'wP' } }}
      />,
    );
    await measure(rootOf(second));
    const activePan = await startDrag(boardId);

    expect(await cancelMove(retained)).toBe(false);
    expect(await cancelMove(requiredActions(currentRef))).toBe(true);
    await act(() => {
      activePan.callbacks.onFinalize?.(
        { handlerTag: activePan.handlerTag, ...TARGET },
        true,
      );
    });
    expect(currentRequest).not.toHaveBeenCalled();
  });

  it('cancels a provider spare selection targeted to this board', async () => {
    const actionsRef = createRef<ChessboardActions>();
    const result = await render(
      <ChessboardProvider>
        <ChessboardRuntime
          actionsRef={actionsRef}
          boardId="spare-target"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={() => ({ status: 'rejected' })}
          position={{}}
        />
        <SparePiece
          piece={{ pieceType: 'wN' }}
          spareId="palette-knight"
          targetBoardId="spare-target"
        />
      </ChessboardProvider>,
    );
    const spare = result.getByLabelText('white knight spare');
    await fireEvent.press(spare);
    expect(spare).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );

    expect(await cancelMove(requiredActions(actionsRef))).toBe(true);
    expect(result.getByLabelText('white knight spare')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: false }),
    );
    expect(await cancelMove(requiredActions(actionsRef))).toBe(false);
  });

  it('cancels a targeted spare while release verification is pending', async () => {
    const prototype = (View as unknown as { prototype: MeasureInWindowView })
      .prototype;
    const measureInWindow = jest
      .spyOn(prototype, 'measureInWindow')
      .mockImplementation((callback) => {
        callback(100, 200, BOARD_SIZE, BOARD_SIZE);
      });
    const actionsRef = createRef<ChessboardActions>();
    const onMoveRequest: OnMoveRequest = jest.fn(() => ({
      status: 'rejected',
    }));
    const result = await render(
      <ChessboardProvider>
        <ChessboardRuntime
          accessibility={{ boardLabel: 'spare action target' }}
          actionsRef={actionsRef}
          boardId="spare-action-target"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={onMoveRequest}
          position={{}}
        />
        <SparePiece
          piece={{ pieceType: 'wN' }}
          spareId="action-knight"
          targetBoardId="spare-action-target"
        />
      </ChessboardProvider>,
    );
    await measure(
      result.getByRole('adjustable', { name: 'spare action target' }),
    );
    const pan = getByGestureTestId(getSparePieceGestureTestId('action-knight'));
    const callbacks = (
      pan as unknown as Readonly<{ handlers: Readonly<PanCallbacks> }>
    ).handlers;
    await act(() => {
      callbacks.onBegin?.({ absoluteX: 124, absoluteY: 224, x: 24, y: 24 });
      callbacks.onStart?.({ absoluteX: 136, absoluteY: 224, x: 36, y: 24 });
    });

    let finishMeasurement:
      | ((x: number, y: number, width: number, height: number) => void)
      | undefined;
    measureInWindow.mockImplementation((callback) => {
      finishMeasurement = callback;
    });
    await act(() => {
      const event = {
        absoluteX: 125,
        absoluteY: 225,
        x: 125,
        y: 225,
      };
      callbacks.onEnd?.(event, true);
      callbacks.onFinalize?.(event, true);
    });
    await flushPromiseJobs();
    expect(finishMeasurement).toEqual(expect.any(Function));

    expect(await cancelMove(requiredActions(actionsRef))).toBe(true);
    finishMeasurement?.(100, 200, BOARD_SIZE, BOARD_SIZE);
    await flushPromiseJobs();
    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(await cancelMove(requiredActions(actionsRef))).toBe(false);
  });
});
