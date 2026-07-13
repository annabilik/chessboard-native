import { act, fireEvent, render } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import {
  Chessboard,
  type OnMoveRequest,
  type SquareActivationIntent,
} from '../../src';

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected Chessboard to render one native root.');
  }
  return result.root;
}

function actionNames(root: TestInstance): string[] {
  const actions = root.props['accessibilityActions'] as
    readonly Readonly<{ name: string }>[] | undefined;
  return actions?.map(({ name }) => name) ?? [];
}

async function accessibilityAction(
  root: TestInstance,
  actionName: string,
): Promise<void> {
  await fireEvent(root, 'accessibilityAction', {
    nativeEvent: { actionName },
  });
}

async function flushDecisions(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('controlled square activation accessibility integration', () => {
  it('emits callback-owned activation for occupied and empty cursor squares', async () => {
    const onSquareActivate = jest.fn<
      undefined,
      [Readonly<SquareActivationIntent>]
    >();
    const result = await render(
      <Chessboard
        boardId="accessible-activation"
        dimensions={{ columns: 2, rows: 2 }}
        onSquareActivate={onSquareActivate}
        position={{
          revision: 11,
          value: { a2: { id: 'pawn', pieceType: 'wP' } },
        }}
        reduceMotion="never"
      />,
    );

    expect(actionNames(rootOf(result))).toContain('activate');
    await accessibilityAction(rootOf(result), 'activate');
    await accessibilityAction(rootOf(result), 'move-cursor-right');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'b2, empty' }),
    );
    expect(actionNames(rootOf(result))).toContain('activate');
    await accessibilityAction(rootOf(result), 'activate');

    expect(onSquareActivate).toHaveBeenCalledTimes(2);
    const occupiedActivation = onSquareActivate.mock.calls[0]?.[0];
    const emptyActivation = onSquareActivate.mock.calls[1]?.[0];
    if (occupiedActivation === undefined || emptyActivation === undefined) {
      throw new Error('Expected occupied and empty activation intents.');
    }
    expect(occupiedActivation).toEqual({
      action: 'activate',
      basePositionRevision: 11,
      baseSelectionRevision: null,
      boardId: 'accessible-activation',
      input: 'accessibility',
      intentId: occupiedActivation.intentId,
      isDestination: false,
      piece: { id: 'pawn', pieceType: 'wP' },
      selectedSquare: null,
      square: 'a2',
    });
    expect(emptyActivation).toEqual({
      action: 'activate',
      basePositionRevision: 11,
      baseSelectionRevision: null,
      boardId: 'accessible-activation',
      input: 'accessibility',
      intentId: emptyActivation.intentId,
      isDestination: false,
      piece: null,
      selectedSquare: null,
      square: 'b2',
    });
    expect(occupiedActivation.intentId).toMatch(/^activation:/);
    expect(emptyActivation.intentId).toMatch(/^activation:/);
    expect(occupiedActivation.intentId).not.toBe(emptyActivation.intentId);
  });

  it('routes a controlled destination only to the move-request callback', async () => {
    const onMoveRequest = jest.fn<
      ReturnType<OnMoveRequest>,
      Parameters<OnMoveRequest>
    >(() => ({ status: 'rejected' }));
    const onSquareActivate = jest.fn<
      undefined,
      [Readonly<SquareActivationIntent>]
    >();
    const result = await render(
      <Chessboard
        boardId="accessible-destination"
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        onSquareActivate={onSquareActivate}
        position={{
          revision: 15,
          value: { a2: { id: 'pawn', pieceType: 'wP' } },
        }}
        reduceMotion="never"
        selection={{
          destinationSquares: ['b2'],
          revision: 8,
          selectedSquare: 'a2',
        }}
      />,
    );

    await accessibilityAction(rootOf(result), 'move-cursor-right');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({
        text: 'b2, empty; possible destination',
      }),
    );
    await accessibilityAction(rootOf(result), 'activate');
    await flushDecisions();

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    const moveIntent = onMoveRequest.mock.calls[0]?.[0];
    if (moveIntent === undefined) {
      throw new Error('Expected one accessible destination move.');
    }
    expect(moveIntent).toEqual({
      basePositionRevision: 15,
      boardId: 'accessible-destination',
      input: 'accessibility',
      intentId: moveIntent.intentId,
      piece: { id: 'pawn', pieceType: 'wP' },
      source: { kind: 'board', square: 'a2' },
      targetSquare: 'b2',
    });
    expect(moveIntent.intentId).toMatch(/^move:/);
    expect(onSquareActivate).not.toHaveBeenCalled();
  });

  it('keeps current-square removal on the move-request path in activation mode', async () => {
    const onMoveRequest = jest.fn<
      ReturnType<OnMoveRequest>,
      Parameters<OnMoveRequest>
    >(() => ({ status: 'rejected' }));
    const onSquareActivate = jest.fn<
      undefined,
      [Readonly<SquareActivationIntent>]
    >();
    const result = await render(
      <Chessboard
        boardId="accessible-activation-removal"
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        onSquareActivate={onSquareActivate}
        position={{
          revision: 16,
          value: { a2: { id: 'pawn', pieceType: 'wP' } },
        }}
        reduceMotion="never"
      />,
    );

    expect(actionNames(rootOf(result))).toContain('remove-piece');
    await accessibilityAction(rootOf(result), 'remove-piece');
    await flushDecisions();

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    const intent = onMoveRequest.mock.calls[0]?.[0];
    if (intent === undefined) {
      throw new Error('Expected one current-square removal request.');
    }
    expect(intent).toEqual({
      basePositionRevision: 16,
      boardId: 'accessible-activation-removal',
      input: 'accessibility',
      intentId: intent.intentId,
      piece: { id: 'pawn', pieceType: 'wP' },
      source: { kind: 'board', square: 'a2' },
      targetSquare: null,
    });
    expect(onSquareActivate).not.toHaveBeenCalled();
  });

  it('offers explicit clearing for a disabled selected square while omitting ordinary activation and removal', async () => {
    const onMoveRequest = jest.fn<
      ReturnType<OnMoveRequest>,
      Parameters<OnMoveRequest>
    >(() => ({ status: 'rejected' }));
    const onSquareActivate = jest.fn<
      undefined,
      [Readonly<SquareActivationIntent>]
    >();
    const result = await render(
      <Chessboard
        boardId="accessible-disabled-selection"
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        onSquareActivate={onSquareActivate}
        position={{
          revision: 18,
          value: { a2: { id: 'pawn', pieceType: 'wP' } },
        }}
        reduceMotion="never"
        selection={{
          destinationSquares: ['a2'],
          disabledSquares: ['a2'],
          revision: 23,
          selectedSquare: 'a2',
        }}
      />,
    );

    expect(actionNames(rootOf(result))).toContain('clear-selection');
    expect(actionNames(rootOf(result))).not.toContain('activate');
    expect(actionNames(rootOf(result))).not.toContain('remove-piece');

    // Even a stale native dispatch for an action that is no longer advertised
    // must respect the same disabled-square gate.
    await accessibilityAction(rootOf(result), 'activate');
    await accessibilityAction(rootOf(result), 'remove-piece');
    await flushDecisions();
    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(onSquareActivate).not.toHaveBeenCalled();

    await accessibilityAction(rootOf(result), 'clear-selection');
    expect(onSquareActivate).toHaveBeenCalledTimes(1);
    const clearIntent = onSquareActivate.mock.calls[0]?.[0];
    if (clearIntent === undefined) {
      throw new Error('Expected one explicit clear-selection intent.');
    }
    expect(clearIntent).toEqual({
      action: 'clear-selection',
      basePositionRevision: 18,
      baseSelectionRevision: 23,
      boardId: 'accessible-disabled-selection',
      input: 'accessibility',
      intentId: clearIntent.intentId,
      isDestination: true,
      piece: { id: 'pawn', pieceType: 'wP' },
      selectedSquare: 'a2',
      square: 'a2',
    });
    expect(clearIntent.intentId).toMatch(/^activation:/);
    expect(onMoveRequest).not.toHaveBeenCalled();
  });

  it('preserves the callback-absent transient source, target, and removal flow', async () => {
    const onMoveRequest = jest.fn<
      ReturnType<OnMoveRequest>,
      Parameters<OnMoveRequest>
    >(() => ({ status: 'rejected' }));
    const result = await render(
      <Chessboard
        boardId="accessible-pr18-regression"
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        position={{
          revision: 4,
          value: { a2: { id: 'pawn', pieceType: 'wP' } },
        }}
        reduceMotion="never"
      />,
    );

    expect(actionNames(rootOf(result))).toEqual(
      expect.arrayContaining(['activate', 'remove-piece']),
    );
    await accessibilityAction(rootOf(result), 'activate');
    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({
        text: 'a2, white pawn; pending move source',
      }),
    );

    await accessibilityAction(rootOf(result), 'move-cursor-right');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'b2, empty; pending move target' }),
    );
    await accessibilityAction(rootOf(result), 'activate');
    await flushDecisions();

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    const targetIntent = onMoveRequest.mock.calls[0]?.[0];
    if (targetIntent === undefined) {
      throw new Error('Expected the callback-absent target request.');
    }
    expect(targetIntent).toEqual({
      basePositionRevision: 4,
      boardId: 'accessible-pr18-regression',
      input: 'accessibility',
      intentId: targetIntent.intentId,
      piece: { id: 'pawn', pieceType: 'wP' },
      source: { kind: 'board', square: 'a2' },
      targetSquare: 'b2',
    });

    await accessibilityAction(rootOf(result), 'move-cursor-left');
    expect(actionNames(rootOf(result))).toContain('remove-piece');
    await accessibilityAction(rootOf(result), 'remove-piece');
    await flushDecisions();

    expect(onMoveRequest).toHaveBeenCalledTimes(2);
    const removalIntent = onMoveRequest.mock.calls[1]?.[0];
    if (removalIntent === undefined) {
      throw new Error('Expected the callback-absent removal request.');
    }
    expect(removalIntent).toEqual({
      basePositionRevision: 4,
      boardId: 'accessible-pr18-regression',
      input: 'accessibility',
      intentId: removalIntent.intentId,
      piece: { id: 'pawn', pieceType: 'wP' },
      source: { kind: 'board', square: 'a2' },
      targetSquare: null,
    });
    expect(targetIntent.intentId).not.toBe(removalIntent.intentId);
  });

  it('omits and rejects callback-absent move actions on a disabled source square', async () => {
    const onMoveRequest = jest.fn<
      ReturnType<OnMoveRequest>,
      Parameters<OnMoveRequest>
    >(() => ({ status: 'rejected' }));
    const result = await render(
      <Chessboard
        boardId="accessible-disabled-fallback-source"
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        position={{
          revision: 20,
          value: { a2: { id: 'pawn', pieceType: 'wP' } },
        }}
        reduceMotion="never"
        selection={{
          disabledSquares: ['a2'],
          revision: 24,
          selectedSquare: null,
        }}
      />,
    );

    expect(actionNames(rootOf(result))).not.toContain('activate');
    expect(actionNames(rootOf(result))).not.toContain('remove-piece');
    await accessibilityAction(rootOf(result), 'activate');
    await accessibilityAction(rootOf(result), 'remove-piece');
    await flushDecisions();

    expect(onMoveRequest).not.toHaveBeenCalled();
  });

  it('keeps a callback-absent disabled target unavailable after selecting an enabled source', async () => {
    const onMoveRequest = jest.fn<
      ReturnType<OnMoveRequest>,
      Parameters<OnMoveRequest>
    >(() => ({ status: 'rejected' }));
    const result = await render(
      <Chessboard
        boardId="accessible-disabled-fallback-target"
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        position={{
          revision: 21,
          value: { a2: { id: 'pawn', pieceType: 'wP' } },
        }}
        reduceMotion="never"
        selection={{
          disabledSquares: ['b2'],
          revision: 25,
          selectedSquare: null,
        }}
      />,
    );

    await accessibilityAction(rootOf(result), 'activate');
    await accessibilityAction(rootOf(result), 'move-cursor-right');
    expect(actionNames(rootOf(result))).not.toContain('activate');
    expect(actionNames(rootOf(result))).toEqual(
      expect.arrayContaining(['cancel-move', 'remove-piece']),
    );

    await accessibilityAction(rootOf(result), 'activate');
    await flushDecisions();
    expect(onMoveRequest).not.toHaveBeenCalled();
  });
});
