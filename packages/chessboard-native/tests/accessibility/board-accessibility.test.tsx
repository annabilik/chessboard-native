import { act, fireEvent, render } from '@testing-library/react-native';
import { StrictMode } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import type { TestInstance } from 'test-renderer';

import {
  Chessboard,
  type ChessboardAccessibilityAction,
  type ChessboardError,
  type ChessboardErrorContext,
} from '../../src/index';
import { ChessboardRuntime } from '../../src/Chessboard';

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected Chessboard to render one native root.');
  }
  return result.root;
}

function actionNames(root: TestInstance): string[] {
  const value = root.props['accessibilityActions'] as
    readonly Readonly<{ name: string }>[] | undefined;
  return value?.map(({ name }) => name) ?? [];
}

function actionLabels(root: TestInstance): string[] {
  const value = root.props['accessibilityActions'] as
    readonly Readonly<{ label?: string }>[] | undefined;
  return (
    value?.flatMap(({ label }) => (label === undefined ? [] : [label])) ?? []
  );
}

async function accessibilityAction(
  root: TestInstance,
  actionName: string,
): Promise<void> {
  await fireEvent(root, 'accessibilityAction', {
    nativeEvent: { actionName },
  });
}

describe('single-control board accessibility', () => {
  it('exposes one adjustable control and navigates before visual measurement', async () => {
    const result = await render(
      <Chessboard
        boardId="accessible-board"
        position="8/8/8/8/8/8/8/8"
        reduceMotion="never"
      />,
    );
    const root = rootOf(result);

    expect(root).toHaveProp('accessible', true);
    expect(root).toHaveProp('accessibilityRole', 'adjustable');
    expect(root).toHaveProp('importantForAccessibility', 'yes');
    expect(root).toHaveProp('pointerEvents', 'box-none');
    expect(root).toHaveProp(
      'accessibilityLabel',
      'Chessboard, white orientation',
    );
    expect(root).toHaveProp('accessibilityValue', {
      max: 63,
      min: 0,
      now: 0,
      text: 'a8, empty',
    });
    expect(actionNames(root)).toEqual(
      Platform.OS === 'android'
        ? ['increment', 'move-cursor-right', 'move-cursor-down']
        : ['move-cursor-right', 'move-cursor-down'],
    );
    expect(
      root.queryAll((node) => node.props['accessibilityRole'] === 'adjustable'),
    ).toHaveLength(0);

    const handleAction = root.props['onAccessibilityAction'] as (
      event: Readonly<{ nativeEvent: Readonly<{ actionName: string }> }>,
    ) => void;
    await act(() => {
      handleAction({ nativeEvent: { actionName: 'increment' } });
      handleAction({ nativeEvent: { actionName: 'increment' } });
    });
    expect(rootOf(result)).toHaveProp('accessibilityValue', {
      max: 63,
      min: 0,
      now: 2,
      text: 'c8, empty',
    });

    await accessibilityAction(rootOf(result), 'move-cursor-down');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 10, text: 'c7, empty' }),
    );

    await accessibilityAction(rootOf(result), 'activate');
    await accessibilityAction(rootOf(result), 'remove-piece');
    await accessibilityAction(rootOf(result), 'unknown-action');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 10, text: 'c7, empty' }),
    );
  });

  it('announces the committed cursor value after Android adjustable and custom actions', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    const result = await render(
      <Chessboard
        boardId="talkback-feedback"
        position="8/8/8/8/8/8/8/8"
        reduceMotion="never"
      />,
    );
    const root = rootOf(result);
    expect(announce).not.toHaveBeenCalled();
    expect(actionNames(root)).toContain('increment');

    await accessibilityAction(root, 'increment');
    expect(announce).toHaveBeenLastCalledWith('b8, empty');

    await accessibilityAction(rootOf(result), 'move-cursor-right');
    expect(announce).toHaveBeenLastCalledWith('c8, empty');
    expect(announce).toHaveBeenCalledTimes(2);

    await accessibilityAction(rootOf(result), 'activate');
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('keeps the canonical cursor while current position, selection, and orientation refresh its value', async () => {
    const formatSquareValue = jest.fn(
      (context: {
        square: string;
        piece: Readonly<{ pieceType: string }> | null;
        isSelected: boolean;
        isDestination: boolean;
        isDisabled: boolean;
      }) =>
        [
          context.square,
          context.piece?.pieceType ?? 'empty',
          context.isSelected,
          context.isDestination,
          context.isDisabled,
        ].join(':'),
    );
    const formatActionLabel = jest.fn(
      (context: { action: ChessboardAccessibilityAction; square: string }) =>
        `${context.action} from ${context.square}`,
    );
    const result = await render(
      <Chessboard
        accessibility={{
          boardHint: 'Choose a square.',
          boardLabel: 'Localized analysis board',
          formatActionLabel,
          formatSquareValue,
        }}
        boardId="context-board"
        position={{ e4: { pieceType: 'wN' } }}
        reduceMotion="always"
        selection={{
          destinationSquares: ['e4'],
          disabledSquares: ['e4'],
          selectedSquare: 'e4',
        }}
      />,
    );
    const firstRoot = rootOf(result);

    expect(firstRoot).toHaveProp(
      'accessibilityLabel',
      'Localized analysis board',
    );
    expect(firstRoot).toHaveProp('accessibilityHint', 'Choose a square.');
    expect(firstRoot.props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 36, text: 'e4:wN:true:true:true' }),
    );
    expect(actionLabels(firstRoot)).toEqual([
      'move-cursor-left from e4',
      'move-cursor-right from e4',
      'move-cursor-up from e4',
      'move-cursor-down from e4',
    ]);

    await result.rerender(
      <Chessboard
        accessibility={{
          boardHint: 'Choose a square.',
          boardLabel: 'Localized analysis board',
          formatActionLabel,
          formatSquareValue,
        }}
        boardId="context-board"
        orientation="black"
        position={{ e4: { pieceType: 'bQ' }, h1: { pieceType: 'wK' } }}
        reduceMotion="never"
        selection={{ destinationSquares: ['h1'], selectedSquare: 'h1' }}
      />,
    );

    expect(rootOf(result)).toBe(firstRoot);
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 27, text: 'e4:bQ:false:false:false' }),
    );
    expect(formatSquareValue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        boardId: 'context-board',
        orientation: 'black',
        piece: { pieceType: 'bQ' },
        square: 'e4',
      }),
    );
  });

  it('keeps the host and cursor stable across reduced-motion policy changes', async () => {
    const remove = jest.fn();
    const addEventListener = jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove } as never);
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValue(new Promise<boolean>(() => undefined));
    const result = await render(
      <Chessboard
        boardId="motion-policy"
        position="8/8/8/8/8/8/8/8"
        reduceMotion="never"
      />,
    );
    const host = rootOf(result);
    await accessibilityAction(host, 'increment');
    expect(host.props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 1, text: 'b8, empty' }),
    );

    await result.rerender(
      <Chessboard
        boardId="motion-policy"
        position="8/8/8/8/8/8/8/8"
        reduceMotion="system"
      />,
    );
    expect(rootOf(result)).toBe(host);
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 1, text: 'b8, empty' }),
    );
    expect(addEventListener).toHaveBeenCalledTimes(1);

    await result.rerender(
      <Chessboard
        boardId="motion-policy"
        position="8/8/8/8/8/8/8/8"
        reduceMotion="always"
      />,
    );
    expect(rootOf(result)).toBe(host);
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 1, text: 'b8, empty' }),
    );
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('repairs empty or duplicate custom action labels deterministically', async () => {
    const labels = [
      ' Move cursor right ',
      'Move cursor right',
      '',
      'Move cursor up',
    ];
    const formatActionLabel = jest.fn(() => labels.shift() ?? 'same');
    const result = await render(
      <Chessboard
        accessibility={{ formatActionLabel }}
        boardId="action-labels"
        position={{ e4: { pieceType: 'wP' } }}
        reduceMotion="never"
        selection={{ selectedSquare: 'e4' }}
      />,
    );
    const actions = actionLabels(rootOf(result));

    expect(actions.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toHaveLength(4);
  });

  it('falls back to the complete default value for an empty custom square value', async () => {
    const result = await render(
      <Chessboard
        accessibility={{ formatSquareValue: () => '   ' }}
        boardId="empty-value"
        position={{ e4: { pieceType: 'wN' } }}
        reduceMotion="never"
        selection={{ destinationSquares: ['e4'], selectedSquare: 'e4' }}
      />,
    );

    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({
        now: 36,
        text: 'e4, white knight; selected; possible destination',
      }),
    );
  });

  it('keeps disabled boards discoverable but exposes no actions', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const result = await render(
      <ChessboardRuntime
        boardId="disabled-board"
        development={false}
        onError={onError}
        position="not/fen"
        reduceMotion="never"
      />,
    );
    const root = rootOf(result);

    expect(root).toHaveProp('accessible', true);
    expect(root).toHaveProp('accessibilityRole', 'adjustable');
    expect(root).toHaveProp('accessibilityState', { disabled: true });
    expect(root).toHaveProp('accessibilityActions', []);
    expect(root.props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'a8, empty; disabled' }),
    );

    await accessibilityAction(root, 'increment');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 0, text: 'a8, empty; disabled' }),
    );
  });

  it('keeps mounted board cursor and announcement histories independent', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    const result = await render(
      <View>
        <Chessboard
          accessibility={{
            announcement: { id: 'shared-id', message: 'Board ready' },
          }}
          boardId="first-cursor"
          dimensions={{ columns: 2, rows: 2 }}
          position={{}}
          reduceMotion="never"
        />
        <Chessboard
          accessibility={{
            announcement: { id: 'shared-id', message: 'Board ready' },
          }}
          boardId="second-cursor"
          dimensions={{ columns: 2, rows: 2 }}
          position={{}}
          reduceMotion="never"
        />
      </View>,
    );
    expect(announce).toHaveBeenCalledTimes(2);
    const boards = rootOf(result).queryAll(
      (node) => node.props['accessibilityRole'] === 'adjustable',
    );
    expect(boards).toHaveLength(2);

    const first = boards[0];
    const second = boards[1];
    if (first === undefined || second === undefined) {
      throw new Error('Expected two accessible board controls.');
    }
    await accessibilityAction(first, 'increment');
    await accessibilityAction(first, 'increment');

    expect(first.props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 2, text: 'a1, empty' }),
    );
    expect(second.props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 0, text: 'a2, empty' }),
    );
  });

  it('announces each correlation ID once per mounted board, including Strict Mode replay', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    const first = await render(
      <StrictMode>
        <Chessboard
          accessibility={{
            announcement: { id: 'outcome-1', message: 'Move rejected' },
          }}
          boardId="announcement-board"
          position={{}}
          reduceMotion="never"
        />
      </StrictMode>,
    );
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith('Move rejected', {
      queue: true,
    });

    await first.rerender(
      <StrictMode>
        <Chessboard
          accessibility={{
            announcement: { id: 'outcome-1', message: 'Changed text' },
          }}
          boardId="announcement-board"
          position={{}}
          reduceMotion="never"
        />
      </StrictMode>,
    );
    expect(announce).toHaveBeenCalledTimes(1);

    await first.rerender(
      <StrictMode>
        <Chessboard
          accessibility={{}}
          boardId="announcement-board"
          position={{}}
          reduceMotion="never"
        />
      </StrictMode>,
    );
    await first.rerender(
      <StrictMode>
        <Chessboard
          accessibility={{
            announcement: { id: 'outcome-1', message: 'Move rejected' },
          }}
          boardId="announcement-board"
          position={{}}
          reduceMotion="never"
        />
      </StrictMode>,
    );
    expect(announce).toHaveBeenCalledTimes(1);

    await first.rerender(
      <StrictMode>
        <Chessboard
          accessibility={{
            announcement: { id: 'outcome-2', message: 'Move rejected' },
          }}
          boardId="announcement-board"
          position={{}}
          reduceMotion="never"
        />
      </StrictMode>,
    );
    expect(announce).toHaveBeenCalledTimes(2);

    await first.unmount();
    await render(
      <Chessboard
        accessibility={{
          announcement: { id: 'outcome-2', message: 'Move rejected' },
        }}
        boardId="announcement-board"
        position={{}}
        reduceMotion="never"
      />,
    );
    expect(announce).toHaveBeenCalledTimes(3);
  });

  it('ignores empty announcement IDs and messages', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    const result = await render(
      <Chessboard
        accessibility={{ announcement: { id: ' ', message: 'Ignored' } }}
        boardId="empty-announcement"
        position={{}}
        reduceMotion="never"
      />,
    );
    await result.rerender(
      <Chessboard
        accessibility={{ announcement: { id: 'valid', message: '   ' } }}
        boardId="empty-announcement"
        position={{}}
        reduceMotion="never"
      />,
    );

    expect(announce).not.toHaveBeenCalled();
  });
});
